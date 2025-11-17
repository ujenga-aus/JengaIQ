import { SharePointService } from './sharepoint';
import { extractTextFromPDF } from './semanticSearch';
import { db } from './db';
import { projects, projectSharePointSettings, risks, riskRegisterRevisions } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { createAIProvider, getModelString } from './aiProviders';

interface AIRiskItem {
  title: string;
  description: string;
  potentialCauses: string;
  potentialImpacts: string;
  existingControls: string;
  p10: string;
  p50: string;
  p90: string;
  probability: string;
  riskType: 'threat' | 'opportunity';
}

// Calculate simple text similarity for duplicate detection
function calculateTextSimilarity(text1: string, text2: string): number {
  if (!text1 || !text2) return 0;
  
  // Normalize text: lowercase and remove extra whitespace
  const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
  const norm1 = normalize(text1);
  const norm2 = normalize(text2);
  
  // Exact match
  if (norm1 === norm2) return 1.0;
  
  // Check if one contains the other (substring match)
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    return 0.85;
  }
  
  // Simple word overlap similarity
  const words1 = new Set(norm1.split(' ').filter(w => w.length > 3));
  const words2 = new Set(norm2.split(' ').filter(w => w.length > 3));
  
  if (words1.size === 0 || words2.size === 0) return 0;
  
  const intersection = new Set(Array.from(words1).filter(x => words2.has(x)));
  const union = new Set(Array.from(words1).concat(Array.from(words2)));
  
  return intersection.size / union.size;
}

// Check if an AI-generated risk is a duplicate of an existing risk
function isDuplicate(
  aiRisk: AIRiskItem,
  existingRisks: Array<{ title: string; description: string | null }>
): boolean {
  // Lower threshold for better paraphrase detection
  const SIMILARITY_THRESHOLD = 0.5;
  
  for (const existing of existingRisks) {
    // Check title similarity
    const titleSimilarity = calculateTextSimilarity(aiRisk.title, existing.title);
    
    if (titleSimilarity > SIMILARITY_THRESHOLD) {
      return true;
    }
    
    // Check description similarity if both exist
    if (aiRisk.description && existing.description) {
      const descSimilarity = calculateTextSimilarity(
        aiRisk.description,
        existing.description
      );
      
      if (descSimilarity > SIMILARITY_THRESHOLD) {
        return true;
      }
    }
    
    // Additional check: if titles are very short, be more strict
    const aiWords = aiRisk.title.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const existingWords = existing.title.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    
    if (aiWords.length <= 4 && existingWords.length <= 4) {
      // For short titles, check if they share 2+ key words
      const commonWords = aiWords.filter(w => existingWords.includes(w));
      if (commonWords.length >= 2) {
        return true;
      }
    }
  }
  
  return false;
}

// Deduplicate within the AI-generated results (intra-batch deduplication)
function deduplicateAIResults(risks: AIRiskItem[]): AIRiskItem[] {
  const unique: AIRiskItem[] = [];
  
  for (const risk of risks) {
    // Check if this risk is similar to any already in the unique list
    const isSimilarToExisting = unique.some(existing => {
      const titleSim = calculateTextSimilarity(risk.title, existing.title);
      const descSim = risk.description && existing.description
        ? calculateTextSimilarity(risk.description, existing.description)
        : 0;
      
      return titleSim > 0.5 || descSim > 0.5;
    });
    
    if (!isSimilarToExisting) {
      unique.push(risk);
    } else {
      console.log(`[AI Risk Analysis] Filtered intra-batch duplicate: ${risk.title}`);
    }
  }
  
  return unique;
}

// Extract text from document buffer based on file type
async function extractTextFromDocument(buffer: Buffer, fileName: string): Promise<string> {
  const fileExtension = fileName.toLowerCase().split('.').pop();
  
  if (fileExtension === 'pdf') {
    return await extractTextFromPDF(buffer);
  } else if (fileExtension === 'doc' || fileExtension === 'docx') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } else {
    throw new Error(`Unsupported file format: ${fileExtension}`);
  }
}

// Download and extract text from a SharePoint document
async function getDocumentText(
  siteUrl: string,
  filePath: string
): Promise<{ text: string; fileName: string }> {
  const sharePointService = new SharePointService();
  
  // Parse the file path to get folder and file name
  const pathParts = filePath.split('/');
  const fileName = pathParts[pathParts.length - 1];
  const folderPath = pathParts.slice(0, -1).join('/') || '/';
  
  // For now, we'll need to list files in the folder and find the one matching the name
  // This is a simplified version - in production, you'd want more robust file matching
  const fileBuffer = await sharePointService.downloadFileByPath(siteUrl, filePath);
  const text = await extractTextFromDocument(fileBuffer, fileName);
  
  return { text, fileName };
}

export interface AIRiskAnalysisResult {
  risks: AIRiskItem[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// Generate AI risk analysis using the provided instructions
export async function analyzeProjectRisks(
  projectId: string,
  aiModel: string = 'gpt-4o',
  operationId?: string
): Promise<AIRiskAnalysisResult> {
  // Initialize progress tracker if operationId provided
  let progressTracker: any = null;
  if (operationId) {
    const { AIProgressTracker } = await import('./aiProgressTracker');
    progressTracker = new AIProgressTracker(operationId, [
      { name: 'Connecting to SharePoint', weight: 10 },
      { name: 'Fetching contract documents', weight: 20 },
      { name: 'Analyzing with AI', weight: 50 },
      { name: 'Processing results', weight: 15 },
      { name: 'Complete', weight: 5 }
    ]);
  }

  try {
    if (progressTracker) progressTracker.updatePhase(0);

    // Fetch project data
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));
    
    if (!project) {
      throw new Error('Project not found');
    }
    
    if (!project.contractDocumentPath || !project.contractSpecificationPath) {
      throw new Error('Contract document path and specification path must be configured');
    }
    
    // Get SharePoint settings for the project
    const [settings] = await db
      .select()
      .from(projectSharePointSettings)
      .where(eq(projectSharePointSettings.projectId, projectId));
    
    if (!settings?.sharePointSiteUrl) {
      throw new Error('SharePoint site URL not configured for this project');
    }
    
    if (progressTracker) progressTracker.updatePhase(1, 'Downloading contract documents');
    
    // Download and extract text from contract and specifications
    const contractDoc = await getDocumentText(
      settings.sharePointSiteUrl,
      project.contractDocumentPath
    );
    
    if (progressTracker) progressTracker.updateStep('Downloading specification documents');
    
    const specDoc = await getDocumentText(
      settings.sharePointSiteUrl,
      project.contractSpecificationPath
    );
    
    if (progressTracker) progressTracker.updatePhase(2, 'Analyzing documents with AI');
    
    // Get existing risks for duplicate detection - use active revision
    const { and } = await import('drizzle-orm');
    const [activeRevision] = await db
      .select({ id: riskRegisterRevisions.id })
      .from(riskRegisterRevisions)
      .where(
        and(
          eq(riskRegisterRevisions.projectId, projectId),
          eq(riskRegisterRevisions.status, 'active')
        )
      )
      .limit(1);
    
    // Get all risks from the active revision for duplicate checking
    const existingRisks = activeRevision
      ? await db
          .select({
            title: risks.title,
            description: risks.description,
          })
          .from(risks)
          .where(eq(risks.revisionId, activeRevision.id))
      : [];
    
    // Prepare the AI prompt
    const existingRiskSummary = existingRisks.length > 0
      ? `\n\nEXISTING RISKS IN REGISTER (DO NOT DUPLICATE THESE):\n${existingRisks.map(r => `- ${r.title}: ${r.description?.substring(0, 100) || 'No description'}...`).join('\n')}`
      : '';
    
    const prompt = `${getAIInstructions()}

PROJECT CONTEXT:
Project Name: ${project.name}
Project Revenue: ${project.projectRevenue || 'Not specified'}
Project Gross Margin: ${project.projectProfit || 'Not specified'}
Client: ${project.client || 'Not specified'}

CONTRACT DOCUMENT:
${contractDoc.text.substring(0, 50000)} ${contractDoc.text.length > 50000 ? '... [truncated]' : ''}

SPECIFICATION DOCUMENT:
${specDoc.text.substring(0, 50000)} ${specDoc.text.length > 50000 ? '... [truncated]' : ''}
${existingRiskSummary}

IMPORTANT: 
1. Always include specific references (page numbers, clause numbers, section references) from the documents in your descriptions
2. DO NOT include any risks that are already in the existing register (listed above)
3. Remove or merge any duplicate/similar items
4. Only include material, high-level risks and opportunities

Please provide your analysis in JSON format as an array of risk items. Each item must have these exact fields:
- title (string, starting with [Risk] or [Opportunity])
- description (string, using CEI logic: Cause → Event → Impact, with document references)
- potentialCauses (string, bullet points or short list)
- potentialImpacts (string, noting cost/time/quality/legal)
- existingControls (string, what's already in place)
- p10 (string, e.g., "0.2% TPV" or "$100,000")
- p50 (string)
- p90 (string)
- probability (string, 0-1 range, e.g., "0.50")
- riskType (either "threat" or "opportunity")

Return ONLY the JSON array, no other text.`;

    // Call AI API using provider abstraction
    const actualModel = getModelString(aiModel);
    const aiProvider = createAIProvider(actualModel);
    
    const completion = await aiProvider.createCompletion(
      [
        {
          role: 'system',
          content: `You are a senior construction risk manager analyzing project documents to identify risks and opportunities.

WRITING STYLE:
- Be CONCISE and DIRECT. State facts, not opinions about your process.
- NO verbose phrases like: "After a thorough review", "It is important to note", "Upon careful consideration"
- NO hedging language like: "appears to", "seems to", "may indicate", "could suggest"
- State findings directly without preamble or unnecessary qualifiers.`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      {
        model: actualModel,
        temperature: 0.3,
        maxTokens: 4000
      }
    );
    
    const content = completion.content || '[]';
    
    // Extract usage information
    const usage = {
      promptTokens: completion.usage.inputTokens,
      completionTokens: completion.usage.outputTokens,
      totalTokens: completion.usage.totalTokens
    };
    
    if (progressTracker) progressTracker.updatePhase(3, 'Processing AI results');
    
    // Parse JSON response
    let riskItems: AIRiskItem[];
    try {
      // Remove markdown code blocks if present
      const jsonContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      riskItems = JSON.parse(jsonContent);
    } catch (error) {
      console.error('Failed to parse AI response:', content);
      throw new Error('Failed to parse AI response as JSON');
    }
    
    console.log(`[AI Risk Analysis] AI generated ${riskItems.length} risks`);
    
    // Step 1: Deduplicate within AI results (intra-batch)
    const deduplicatedResults = deduplicateAIResults(riskItems);
    console.log(`[AI Risk Analysis] After intra-batch deduplication: ${deduplicatedResults.length} risks`);
    
    // Step 2: Filter out duplicates against existing risks
    const filteredRisks = deduplicatedResults.filter(aiRisk => {
      const isDupe = isDuplicate(aiRisk, existingRisks);
      if (isDupe) {
        console.log(`[AI Risk Analysis] Filtered duplicate against existing: ${aiRisk.title}`);
      }
      return !isDupe;
    });
    
    console.log(`[AI Risk Analysis] Final result: ${filteredRisks.length} unique risks after all filtering`);
    
    if (progressTracker) progressTracker.complete();
    
    return {
      risks: filteredRisks,
      usage
    };
  } catch (error) {
    if (progressTracker) {
      progressTracker.error(error instanceof Error ? error.message : 'Unknown error occurred');
    }
    throw error;
  }
}

function getAIInstructions(): string {
  return `AI Risk & Opportunity Manager — High-Level Register with P10/P50/P90

Role
You're a senior construction risk manager. Read the scope pack (contract, specs, drawings, scope notes) and produce a high-level register of risks and opportunities. Aggregate similar items. No micro items.

Contract mode
Decide if the contract is Design & Construct (D&C).
- If D&C: include design and construction items.
- If not: include construction items only; note any design dependencies as assumptions.

What to include
- Risks = potential downside (cost/time/quality/legal).
- Opportunities = potential upside (cost/time savings, scope efficiencies, commercial gains).
- Keep items material and outcome-oriented. Merge duplicates.

How to write each item
- Use CEI logic inside Description: Cause → Event → Impact.
- Make the Title concise and descriptive. DO NOT prepend [Risk] or [Opportunity] to the title - the system will automatically assign R# or O# prefixes based on type.
- Add clause/spec/drawing refs inside Description where they matter.

Probability and contingency
- Probability: 0–1. If you map Likelihood 1–5, use 1→0.05, 2→0.15, 3→0.30, 4→0.50, 5→0.70.
- P10/P50/P90 per item as $ or % of Total Project Value (TPV):
  - For risks: show positive costs (exposure).
  - For opportunities: show negative costs (savings) or label as credit.
- Pick a simple approach:
  - Heuristic bands tied to severity (Minor 0.1–0.3% TPV, Moderate 0.3–1%, Major 1–3%, Severe 3–7%). Use low/mid/high points for P10/50/90.
  - Or a triangular range (Min, ML, Max) and set: P10 ≈ low end, P50 ≈ ML, P90 ≈ high end.
- Be explicit whether P10/50/90 are conditional on occurrence (default) or already probability-weighted.

Generic baseline (use only if relevant)
- Risks: latent conditions, third-party approvals, long-lead/price volatility, live-ops interfaces, design coordination gaps (if D&C), commissioning shortfalls, scope ambiguity, weather windows, statutory/code shifts, info timing (RFI/IFC), subcontractor capacity, LD exposure.
- Opportunities: VE/alternate materials, package re-scoping, early procurement to lock prices, design standardisation, construction methodology optimisations, combining workfaces/shifts, commercial clarifications that transfer scope/cost, programme resequencing to reduce prelims.`;
}

/**
 * Chat-based risk development for interactive risk list building
 */
export async function chatRiskDevelopment(
  projectId: string,
  messages: Array<{ role: 'user' | 'assistant', content: string }>,
  aiModel: string
): Promise<{ message: string; risks: AIRiskItem[]; usage: any }> {
  console.log('[AI Risk Chat] Processing chat for project:', projectId);
  
  // Get project context
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  
  if (!project) {
    throw new Error('Project not found');
  }
  
  // Get the actual model string
  const actualModel = getModelString(aiModel);
  console.log(`[AI Risk Chat] Using model: ${actualModel} (from ${aiModel})`);
  
  // Create system prompt for chat
  const systemPrompt = `You are an expert construction risk manager helping develop a risk register interactively.

PROJECT CONTEXT:
- Project: ${project.name}
- Client: ${project.client || 'N/A'}

WRITING STYLE:
- Be CONCISE and DIRECT. State facts without preamble.
- NO verbose phrases like: "After a thorough review", "It is important to note", "Upon careful consideration"
- NO hedging language like: "appears to", "seems to", "may indicate", "could suggest"
- Get straight to the point. Every sentence must add value.

Your role is to:
1. Have a natural conversation about construction risks and opportunities
2. Generate risks/opportunities when requested (both contract-based and generic items)
3. Provide P10/P50/P90 values and probability estimates
4. Use CEI logic (Cause-Event-Impact) in descriptions

When the user asks for risks or opportunities, respond with:
1. A conversational message explaining what you're providing
2. A JSON array of risks in this exact format (wrapped in <risks>...</risks> tags):

<risks>
[
  {
    "title": "Concise descriptive title (DO NOT prepend [Risk] or [Opportunity] - system assigns R# or O# automatically)",
    "description": "CEI logic: Cause → Event → Impact",
    "potentialCauses": "Detailed causes",
    "potentialImpacts": "Detailed impacts",
    "existingControls": "Current controls or mitigations",
    "p10": "10000",
    "p50": "25000",
    "p90": "50000",
    "probability": "0.3",
    "riskType": "threat" or "opportunity"
  }
]
</risks>

IMPORTANT: DO NOT include [Risk] or [Opportunity] prefixes in titles. The system automatically assigns R001, R002, O001, O002 etc. based on riskType.

For generic risks (not from contract documents):
- Use common construction risks/opportunities relevant to the project type
- Be realistic with P10/P50/P90 values based on project scale
- Include practical CEI logic

If the user is just chatting or asking questions, respond normally without the <risks> tags.`;

  // Call AI provider
  const aiProvider = createAIProvider(actualModel);
  const completion = await aiProvider.createCompletion(
    [
      { role: 'system', content: systemPrompt },
      ...messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))
    ],
    {
      model: actualModel,
      temperature: 0.7,
      maxTokens: 4000
    }
  );
  
  const content = completion.content || '';
  
  // Extract usage information
  const usage = {
    promptTokens: completion.usage.inputTokens,
    completionTokens: completion.usage.outputTokens,
    totalTokens: completion.usage.totalTokens
  };
  
  // Parse response for risks
  let risks: AIRiskItem[] = [];
  let message = content;
  
  // Check if response contains risks
  const risksMatch = content.match(/<risks>([\s\S]*?)<\/risks>/);
  if (risksMatch) {
    try {
      const jsonContent = risksMatch[1].trim()
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      risks = JSON.parse(jsonContent);
      console.log(`[AI Risk Chat] Extracted ${risks.length} risks from response`);
      
      // Remove the <risks> tags from the message
      message = content.replace(/<risks>[\s\S]*?<\/risks>/, '').trim();
    } catch (error) {
      console.error('[AI Risk Chat] Failed to parse risks from response:', error);
    }
  }
  
  return {
    message,
    risks,
    usage
  };
}
