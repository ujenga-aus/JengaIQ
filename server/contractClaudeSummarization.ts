/**
 * Claude Summarization Service for Contract Chunks
 * 
 * Processes contract text chunks with Claude to extract:
 * - Clause summaries
 * - Defined terms
 * - Cross-references
 * - Risks
 * 
 * Returns structured JSON for storage in contract_text_chunks.summary_json
 */

import { createAIProvider } from './aiProviders';
import type { ContractChunk } from './contractParsingChunking';

export interface ClauseSummary {
  clauseNumber: string;      // e.g., "1.2.3"
  heading: string;           // Clause heading
  summary: string;           // Brief summary
  keyPoints: string[];       // Key points
}

export interface DefinedTerm {
  term: string;              // The term being defined
  definition: string;        // The definition
  clauseRef: string;         // Clause reference where defined
}

export interface CrossReference {
  fromClause: string;        // Source clause
  toClause: string;          // Referenced clause
  context: string;           // Context of reference
}

export interface RiskItem {
  description: string;       // Risk description
  clauseRef: string;         // Related clause
  severity: 'low' | 'medium' | 'high';
  category: string;          // e.g., "payment", "delay", "liability"
}

export interface ChunkSummaryResult {
  chunkId: string;           // For tracking
  pageRange: string;         // e.g., "15-20"
  summaries: ClauseSummary[];
  definitions: DefinedTerm[];
  crossRefs: CrossReference[];
  risks: RiskItem[];
  tokensUsed: number;
}

/**
 * Build the prompt for Claude to analyze a contract chunk
 */
function buildClaudePrompt(chunkText: string, chunkIndex: number, pageRange: string): string {
  return `You are a construction contract lawyer analyzing a section of a construction contract.

**Your Task:**
Analyze the following contract excerpt and extract structured information in JSON format.

**Contract Excerpt (Chunk ${chunkIndex}, Pages ${pageRange}):**
${chunkText}

**Required Analysis:**
1. **Clause Summaries**: For each numbered clause (e.g., 1.2.3, 2.1), extract:
   - clauseNumber
   - heading (if present)
   - summary (1-2 sentences)
   - keyPoints (array of important points)

2. **Defined Terms**: Extract all defined terms with:
   - term (the defined term)
   - definition (the definition text)
   - clauseRef (clause number where defined)

3. **Cross-References**: Identify references to other clauses:
   - fromClause (current clause number)
   - toClause (referenced clause number)
   - context (why it's referenced)

4. **Risks**: Identify potential risks or obligations:
   - description (what the risk is)
   - clauseRef (related clause)
   - severity (low/medium/high)
   - category (payment/delay/liability/indemnity/warranty/termination/insurance/other)

**Important Rules:**
- Only extract information explicitly stated in the text
- Do not invent or assume clauses not in this excerpt
- Preserve exact clause numbers as written
- If a section has no items for a category, return an empty array

**Output Format:**
Return ONLY a valid JSON object with this exact structure:
{
  "summaries": [
    {
      "clauseNumber": "1.2",
      "heading": "Payment Terms",
      "summary": "Brief summary here",
      "keyPoints": ["Point 1", "Point 2"]
    }
  ],
  "definitions": [
    {
      "term": "Contract Price",
      "definition": "The definition text",
      "clauseRef": "1.1"
    }
  ],
  "crossRefs": [
    {
      "fromClause": "3.2",
      "toClause": "1.5",
      "context": "Payment terms reference"
    }
  ],
  "risks": [
    {
      "description": "Risk description",
      "clauseRef": "2.3",
      "severity": "medium",
      "category": "payment"
    }
  ]
}`;
}

/**
 * Summarize a contract chunk using Claude
 * 
 * @param chunk - The chunk to analyze
 * @param chunkIndex - Sequential chunk index
 * @param pageRange - Page range string (e.g., "15-20")
 * @returns Structured summary result
 */
export async function summarizeChunk(
  chunk: ContractChunk,
  chunkIndex: number,
  pageRange: string
): Promise<ChunkSummaryResult> {
  console.log(`[ClaudeSummarization] Summarizing chunk ${chunkIndex} (pages ${pageRange}, ${chunk.rawText.length} chars)...`);
  
  try {
    // Get Anthropic provider
    const aiProvider = createAIProvider('claude-sonnet-4-20250514');
    
    // Build prompt
    const prompt = buildClaudePrompt(chunk.rawText, chunkIndex, pageRange);
    
    // Call Claude with structured prompt
    const result = await aiProvider.createCompletion([
      {
        role: 'system',
        content: 'You are a construction contract lawyer specializing in contract analysis. You extract structured information from contracts with precision and accuracy.'
      },
      {
        role: 'user',
        content: prompt
      }
    ], {
      model: 'claude-sonnet-4-20250514',
      maxTokens: 16000,
      temperature: 0, // Deterministic for consistency
    });
    
    console.log(`[ClaudeSummarization] Received response (${result.usage?.totalTokens || 0} tokens)`);
    
    // Parse JSON response
    let parsedData: any;
    try {
      // Remove markdown code fences if present
      const cleanContent = result.content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      parsedData = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('[ClaudeSummarization] Failed to parse JSON response:', parseError);
      console.error('[ClaudeSummarization] Raw response:', result.content);
      
      // Try to extract JSON from response
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Could not extract valid JSON from Claude response');
      }
    }
    
    // Validate and structure the result
    const summaryResult: ChunkSummaryResult = {
      chunkId: `chunk-${chunkIndex}`,
      pageRange,
      summaries: Array.isArray(parsedData.summaries) ? parsedData.summaries : [],
      definitions: Array.isArray(parsedData.definitions) ? parsedData.definitions : [],
      crossRefs: Array.isArray(parsedData.crossRefs) ? parsedData.crossRefs : [],
      risks: Array.isArray(parsedData.risks) ? parsedData.risks : [],
      tokensUsed: result.usage?.totalTokens || 0
    };
    
    console.log(`[ClaudeSummarization] Chunk ${chunkIndex} analysis complete:`);
    console.log(`  - ${summaryResult.summaries.length} clause summaries`);
    console.log(`  - ${summaryResult.definitions.length} definitions`);
    console.log(`  - ${summaryResult.crossRefs.length} cross-references`);
    console.log(`  - ${summaryResult.risks.length} risks`);
    console.log(`  - ${summaryResult.tokensUsed} tokens used`);
    
    return summaryResult;
    
  } catch (error) {
    console.error(`[ClaudeSummarization] Error summarizing chunk ${chunkIndex}:`, error);
    throw new Error(`Failed to summarize chunk ${chunkIndex}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Batch summarize multiple chunks with progress tracking
 * 
 * @param chunks - Array of chunks to summarize
 * @param progressCallback - Called after each chunk with (completed, total)
 * @returns Array of summary results
 */
export async function summarizeChunks(
  chunks: ContractChunk[],
  progressCallback?: (completed: number, total: number) => void
): Promise<ChunkSummaryResult[]> {
  console.log(`[ClaudeSummarization] Starting batch summarization of ${chunks.length} chunks...`);
  
  const results: ChunkSummaryResult[] = [];
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const pageRange = `${chunk.startPage}-${chunk.endPage}`;
    
    try {
      const result = await summarizeChunk(chunk, i + 1, pageRange);
      results.push(result);
      
      // Call progress callback
      if (progressCallback) {
        progressCallback(i + 1, chunks.length);
      }
      
      // Small delay to avoid rate limits
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
    } catch (error) {
      console.error(`[ClaudeSummarization] Failed to summarize chunk ${i + 1}:`, error);
      // Propagate error up to pipeline so job can be marked as failed
      throw new Error(`Batch summarization failed at chunk ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  const totalTokens = results.reduce((sum, r) => sum + r.tokensUsed, 0);
  console.log(`[ClaudeSummarization] Batch complete: ${chunks.length} chunks, ${totalTokens} total tokens`);
  
  return results;
}
