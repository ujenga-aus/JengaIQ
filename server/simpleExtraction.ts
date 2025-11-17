import { db } from './db';
import { eq } from 'drizzle-orm';
import {
  contractReviewDocuments,
  contractClauses,
  contractDefinitions,
  contractSearchIndex
} from '@shared/schema';
import { ObjectStorageService } from './objectStorage';
import { extractTextFromPDF } from './semanticSearch';
import { createAIProvider } from './aiProviders';

export async function simpleExtractMetadata(revisionId: string) {
  console.log('[SIMPLE] Starting extraction for revision:', revisionId);
  console.log('[SIMPLE] API Key check:', {
    hasKey: !!process.env.ANTHROPIC_API_KEY,
    keyLength: process.env.ANTHROPIC_API_KEY?.length || 0,
    keyPrefix: process.env.ANTHROPIC_API_KEY?.substring(0, 10) || 'MISSING'
  });
  
  // Get revision
  const [revision] = await db
    .select()
    .from(contractReviewDocuments)
    .where(eq(contractReviewDocuments.id, revisionId))
    .limit(1);

  if (!revision || !revision.clientContractFileKey) {
    throw new Error('Revision or file not found');
  }

  console.log('[SIMPLE] Downloading PDF...');
  const objectStorage = new ObjectStorageService();
  const pdfBuffer = await objectStorage.downloadFile(revision.clientContractFileKey);

  console.log('[SIMPLE] Extracting text from PDF...');
  const fullText = await extractTextFromPDF(pdfBuffer);
  const textLength = fullText.length;
  console.log('[SIMPLE] Extracted', textLength, 'characters');

  // Truncate to 150k chars for AI
  const truncatedText = fullText.substring(0, 150000);
  
  console.log('[SIMPLE] Calling Claude API...');
  
  // Use the same working AI provider that contract review uses
  const aiProvider = createAIProvider('anthropic');
  
  console.log('[SIMPLE] Making AI call...');
  const result = await aiProvider.createCompletion([
    {
      role: 'user',
      content: `You are analyzing a construction contract. Extract ALL clause headings and ALL defined terms comprehensively.

CONTRACT TEXT (first 150k chars):
${truncatedText}

TASK:
1. Find the TABLE OF CONTENTS or equivalent section listing all clauses
2. Extract EVERY clause heading (not just main ones - include all levels: 1, 1.1, 1.1.1, etc.)
3. Find the DEFINITIONS section (usually near the start of the contract)
4. Extract EVERY defined term with its full definition

Return ONLY a JSON object in this exact format (no markdown, no explanation, no commentary):
{
  "clauses": [
    {"ref": "1", "number": "1", "heading": "Interpretation", "pageIndex": 0},
    {"ref": "1.1", "number": "1.1", "heading": "Definitions", "pageIndex": 0}
  ],
  "definitions": [
    {"term": "Works", "definition": "the construction works described in Appendix A", "scopeRef": "1.1", "pageIndex": 0},
    {"term": "Contract", "definition": "this agreement including all schedules", "scopeRef": "1.1", "pageIndex": 0}
  ]
}

CRITICAL REQUIREMENTS:
- Extract ALL clauses (aim for 100+ if available), not just top-level
- Extract ALL definitions (aim for 50+ if available), not just key terms
- Set all pageIndex values to 0
- Return pure JSON only - no backticks, no markdown, no explanatory text
- Ensure valid JSON syntax (proper quotes, no trailing commas)`
    }
  ], {
    model: 'claude-sonnet-4-20250514',
    maxTokens: 8192,
    temperature: 0
  });

  console.log('[SIMPLE] AI call successful');
  console.log('[SIMPLE] Response length:', result.content.length);
  console.log('[SIMPLE] RAW RESPONSE (first 1000 chars):', result.content.substring(0, 1000));
  console.log('[SIMPLE] RAW RESPONSE (last 500 chars):', result.content.substring(Math.max(0, result.content.length - 500)));
  
  // Try to extract JSON from response
  let jsonStr = result.content.trim();
  
  // Remove markdown code blocks if present
  if (jsonStr.includes('```')) {
    console.log('[SIMPLE] Found markdown code blocks, extracting...');
    jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
  }
  
  // Find JSON object boundaries
  const startIdx = jsonStr.indexOf('{');
  let endIdx = jsonStr.lastIndexOf('}');
  
  if (startIdx === -1 || endIdx === -1) {
    console.error('[SIMPLE] No JSON object found in response');
    console.error('[SIMPLE] Full response:', result.content);
    throw new Error('No JSON object found in AI response');
  }
  
  jsonStr = jsonStr.substring(startIdx, endIdx + 1);
  console.log('[SIMPLE] Extracted JSON length:', jsonStr.length);
  
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
    console.log('[SIMPLE] JSON parsed successfully');
    console.log('[SIMPLE] Parsed object keys:', Object.keys(parsed));
  } catch (parseError: any) {
    console.warn('[SIMPLE] JSON parse error (likely truncated):', parseError.message);
    console.warn('[SIMPLE] Attempting to repair truncated JSON...');
    
    // Strategy: Find the last complete object by looking for "},{"
    // This ensures we don't cut in the middle of an object
    let repairedJson = jsonStr;
    
    // Try to find the last complete object separator
    const lastObjectSeparator = jsonStr.lastIndexOf('},{');
    if (lastObjectSeparator > 0) {
      // Truncate right after the last complete object (after the "}")
      repairedJson = jsonStr.substring(0, lastObjectSeparator + 1);
      console.log('[SIMPLE] Truncated at last complete object separator');
    } else {
      // Fallback: try to find last complete closing brace
      const lastCloseBrace = jsonStr.lastIndexOf('}');
      if (lastCloseBrace > 0) {
        repairedJson = jsonStr.substring(0, lastCloseBrace + 1);
        console.log('[SIMPLE] Truncated at last closing brace');
      }
    }
    
    // Count opening brackets/braces to determine what needs closing
    const openCurly = (repairedJson.match(/{/g) || []).length;
    const closeCurly = (repairedJson.match(/}/g) || []).length;
    const openSquare = (repairedJson.match(/\[/g) || []).length;
    const closeSquare = (repairedJson.match(/\]/g) || []).length;
    
    // Close missing brackets
    for (let i = 0; i < (openSquare - closeSquare); i++) {
      repairedJson += ']';
    }
    for (let i = 0; i < (openCurly - closeCurly); i++) {
      repairedJson += '}';
    }
    
    console.log('[SIMPLE] Repaired JSON length:', repairedJson.length);
    
    try {
      parsed = JSON.parse(repairedJson);
      console.log('[SIMPLE] Repaired JSON parsed successfully!');
      console.log('[SIMPLE] Recovered partial extraction due to token limit');
    } catch (repairError: any) {
      console.error('[SIMPLE] Failed to repair JSON:', repairError.message);
      console.error('[SIMPLE] Failed JSON (first 500 chars):', jsonStr.substring(0, 500));
      console.error('[SIMPLE] Failed JSON (last 500 chars):', jsonStr.substring(Math.max(0, jsonStr.length - 500)));
      throw new Error(`JSON parse failed even after repair attempt: ${repairError.message}`);
    }
  }
  
  const uniqueClauses = parsed.clauses || [];
  const uniqueDefinitions = parsed.definitions || [];
  console.log('[SIMPLE] Extracted arrays:', uniqueClauses.length, 'clauses,', uniqueDefinitions.length, 'definitions');
  
  // Log sample data
  if (uniqueClauses.length > 0) {
    console.log('[SIMPLE] Sample clause:', uniqueClauses[0]);
  }
  if (uniqueDefinitions.length > 0) {
    console.log('[SIMPLE] Sample definition:', uniqueDefinitions[0]);
  }

  console.log(`[SIMPLE] Extracted: ${uniqueClauses.length} clauses, ${uniqueDefinitions.length} definitions`);

  // Save to database
  console.log('[SIMPLE] Saving to database...');
  await db.transaction(async (tx) => {
    // Delete existing
    await tx.delete(contractClauses).where(eq(contractClauses.revisionId, revisionId));
    await tx.delete(contractDefinitions).where(eq(contractDefinitions.revisionId, revisionId));

    // Insert clauses
    if (uniqueClauses.length > 0) {
      await tx.insert(contractClauses).values(
        uniqueClauses.map((c: any) => ({
          revisionId,
          ref: c.ref || '',
          number: c.number || '',
          heading: c.heading || '',
          pageIndex: c.pageIndex || 0,
          bbox: null
        }))
      );
    }

    // Insert definitions
    if (uniqueDefinitions.length > 0) {
      await tx.insert(contractDefinitions).values(
        uniqueDefinitions.map((d: any) => ({
          revisionId,
          term: d.term || '',
          definition: d.definition || '',
          scopeRef: d.scopeRef || '',
          pageIndex: d.pageIndex || 0
        }))
      );
    }
  });

  console.log('[SIMPLE] Complete!');
  return {
    clauseCount: uniqueClauses.length,
    definitionCount: uniqueDefinitions.length
  };
}
