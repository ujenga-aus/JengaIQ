// AI-powered Risk Probability Distribution Analyzer
// Analyzes P10/P50/P90 estimates and recommends appropriate probability distribution models

import { createAIProvider, getModelString } from './aiProviders';

export interface RiskData {
  id: string;
  riskNumber: string;
  title: string;
  optimisticP10?: number | null;
  likelyP50?: number | null;
  pessimisticP90?: number | null;
}

export interface DistributionRecommendation {
  riskId: string;
  distributionModel: string;
  confidence: string;
  reasoning: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

/**
 * Analyzes a single risk's three-point estimate and recommends a probability distribution
 */
export async function analyzeRiskDistribution(
  risk: RiskData,
  modelName: string = 'gpt-4o',
  operationId?: string
): Promise<DistributionRecommendation> {
  // Initialize progress tracker if operationId provided
  let progressTracker: any = null;
  if (operationId) {
    const { AIProgressTracker } = await import('./aiProgressTracker');
    progressTracker = new AIProgressTracker(operationId, [
      { name: 'Analyzing risk data', weight: 30 },
      { name: 'Calling AI model', weight: 50 },
      { name: 'Processing recommendation', weight: 20 }
    ]);
  }

  try {
    if (progressTracker) progressTracker.updatePhase(0);

    // Validate input data (allow zero values, only reject null/undefined)
    if (risk.optimisticP10 == null || risk.likelyP50 == null || risk.pessimisticP90 == null) {
      throw new Error('Risk must have P10, P50, and P90 values for distribution analysis');
    }

    const aiProvider = createAIProvider(modelName);
    const model = getModelString(modelName);
    
    if (progressTracker) progressTracker.updatePhase(1);

  const systemPrompt = `You are an expert in quantitative risk analysis and probability distributions for Monte Carlo simulations in construction project risk management.

Your task is to analyze three-point estimates (P10, P50, P90) and recommend the most appropriate probability distribution model.

Available distributions:
- **Triangular**: Simple three-point estimate, linear probability between min-mode-max
- **PERT (Beta-PERT)**: Weighted toward the most likely value, smooth curve, good for expert estimates
- **Normal**: Symmetric bell curve around mean, assumes equal tails
- **Uniform**: Equal probability across the range (rare in risk analysis)
- **Lognormal**: Right-skewed, bounded at zero, good for costs that can't be negative
- **Weibull**: Flexible shape parameter, good for time-based or failure distributions

Consider these factors:
1. Symmetry: Is the P50 centered between P10 and P90, or skewed?
2. Tail behavior: Are extreme values more likely on one side?
3. Natural constraints: Can values go below zero?
4. Expert judgment: PERT is preferred when estimates come from expert judgment
5. Data characteristics: Does the data suggest a specific shape?

Respond in exactly this JSON format:
{
  "distributionModel": "triangular|pert|normal|uniform|lognormal|weibull",
  "confidence": "high|medium|low",
  "reasoning": "Brief 1-2 sentence explanation of why this distribution is best"
}`;

  const userPrompt = `Risk: ${risk.riskNumber} - ${risk.title}

Three-point estimate (dollars):
- Optimistic (P10): $${risk.optimisticP10.toLocaleString()}
- Most Likely (P50): $${risk.likelyP50.toLocaleString()}
- Pessimistic (P90): $${risk.pessimisticP90.toLocaleString()}

Additional analysis:
- Range: $${(risk.pessimisticP90 - risk.optimisticP10).toLocaleString()}
- P50 position: ${((risk.likelyP50 - risk.optimisticP10) / (risk.pessimisticP90 - risk.optimisticP10) * 100).toFixed(1)}% from P10
- Skewness indicator: ${risk.pessimisticP90 - risk.likelyP50 > risk.likelyP50 - risk.optimisticP10 ? 'Right-skewed (larger upper tail)' : risk.pessimisticP90 - risk.likelyP50 < risk.likelyP50 - risk.optimisticP10 ? 'Left-skewed (larger lower tail)' : 'Symmetric'}

Recommend the most appropriate probability distribution.`;

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userPrompt }
  ];

    const completionResult = await aiProvider.createCompletion(messages, {
      model,
      temperature: 0.3, // Lower temperature for more consistent recommendations
      maxTokens: 500
    });

    if (progressTracker) progressTracker.updatePhase(2);

    // Parse JSON response
    let parsedResponse;
    try {
      // Extract JSON from response (handle cases where AI adds explanation around JSON)
      const jsonMatch = completionResult.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      parsedResponse = JSON.parse(jsonMatch[0]);
    } catch (error) {
      console.error('Failed to parse AI response:', completionResult.content);
      throw new Error('AI returned invalid JSON response');
    }

    // Validate response structure
    if (!parsedResponse.distributionModel || !parsedResponse.confidence || !parsedResponse.reasoning) {
      throw new Error('AI response missing required fields');
    }

    if (progressTracker) progressTracker.complete();

    return {
      riskId: risk.id,
      distributionModel: parsedResponse.distributionModel.toLowerCase(),
      confidence: parsedResponse.confidence.toLowerCase(),
      reasoning: parsedResponse.reasoning,
      usage: completionResult.usage
    };
  } catch (error) {
    if (progressTracker) {
      progressTracker.error(error instanceof Error ? error.message : 'Unknown error occurred');
    }
    throw error;
  }
}

/**
 * Analyzes multiple risks in batch and recommends distributions for each
 */
export async function analyzeBulkRiskDistributions(
  risks: RiskData[],
  modelName: string = 'gpt-4o'
): Promise<DistributionRecommendation[]> {
  // Filter risks that have all required values (allow zero values, only reject null/undefined)
  const validRisks = risks.filter(r => r.optimisticP10 != null && r.likelyP50 != null && r.pessimisticP90 != null);
  
  if (validRisks.length === 0) {
    return [];
  }

  // Process in parallel (with reasonable batch size to avoid rate limits)
  const BATCH_SIZE = 5;
  const results: DistributionRecommendation[] = [];
  
  for (let i = 0; i < validRisks.length; i += BATCH_SIZE) {
    const batch = validRisks.slice(i, i + BATCH_SIZE);
    const batchPromises = batch.map(risk => 
      analyzeRiskDistribution(risk, modelName)
        .catch(error => {
          console.error(`Failed to analyze risk ${risk.riskNumber}:`, error);
          return null;
        })
    );
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults.filter((r): r is DistributionRecommendation => r !== null));
    
    // Small delay between batches to avoid rate limits
    if (i + BATCH_SIZE < validRisks.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return results;
}
