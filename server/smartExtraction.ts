import { db } from './db';
import { eq } from 'drizzle-orm';
import {
  contractReviewDocuments,
  contractClauses,
  contractDefinitions
} from '@shared/schema';
import { ObjectStorageService } from './objectStorage';
import { extractTextFromPDF } from './semanticSearch';
import { createAIProvider } from './aiProviders';
import { AIProgressTracker } from './aiProgressTracker';

// TWO-STAGE COUNTED BATCHING STRATEGY (Architect-recommended)
// Stage 1: Inventory pass - count definitions and clauses
// Stage 2: Adaptive extraction - extract in safe batches (~70 items = ~6k tokens)

interface InventoryResult {
  definitionCount: number;
  clauseCount: number;
}

// Stage 1: Ask Claude to count definitions and clauses (like web interface)
async function runInventoryPass(fullText: string): Promise<InventoryResult> {
  console.log('[SMART] Stage 1: Running inventory pass to count metadata...');
  
  const aiProvider = createAIProvider('anthropic');
  
  try {
    const result = await aiProvider.createCompletion([
      {
        role: 'user',
        content: `Count the defined terms and clause headings in this contract.

CONTRACT TEXT:
${fullText}

Please analyze this contract and provide:
1. Total number of defined terms (look in definitions section and throughout the contract)
2. Total number of clause headings (look in table of contents or scan for numbered headings)

Return ONLY a JSON object in this format (no markdown):
{
  "definitionCount": 253,
  "clauseCount": 444
}

Be accurate - count ALL definitions and ALL clause headings.`
      }
    ], {
      model: 'claude-sonnet-4-20250514',
      maxTokens: 500,  // Small response
      temperature: 0
    });
    
    // Parse the counts
    let jsonStr = result.content.trim();
    jsonStr = jsonStr.replace(/```json\s*/i, '').replace(/```\s*/i, '').replace(/```$/i, '');
    
    const data = JSON.parse(jsonStr);
    console.log(`[SMART] Inventory complete: ${data.definitionCount} definitions, ${data.clauseCount} clauses`);
    
    return {
      definitionCount: data.definitionCount || 0,
      clauseCount: data.clauseCount || 0
    };
  } catch (error: any) {
    console.error('[SMART] Inventory pass failed:', error.message);
    // Return conservative estimates if inventory fails
    return { definitionCount: 250, clauseCount: 400 };
  }
}

// Helper: Extract just the Definitions section from contract
function extractDefinitionsSection(fullText: string): { section: string; found: boolean } {
  // Try multiple patterns for finding definitions section
  // NOTE: Using [\s\S] instead of /s flag for ES5 compatibility
  const patterns = [
    /(?:^|\n)(1\.?\s+definitions?\s+and\s+interpretations?[\s\S]*?)(?=\n\d+\.?\s+[A-Z])/i,
    /(?:^|\n)(1\.?\s+definitions?[\s\S]*?)(?=\n\d+\.?\s+[A-Z])/i,
    /(?:^|\n)(definitions?\s+and\s+interpretations?[\s\S]*?)(?=\n[A-Z][A-Z\s]+\n)/i,
  ];
  
  for (const pattern of patterns) {
    const match = fullText.match(pattern);
    if (match && match[1].length > 500) {  // Must be substantial
      console.log(`[SMART] Found definitions section: ${match[1].length} chars`);
      return { section: match[1], found: true };
    }
  }
  
  // Fallback: take first 50k chars (usually contains definitions)
  console.log(`[SMART] Using fallback: first 50k chars`);
  return { section: fullText.substring(0, 50000), found: false };
}

// Stage 2: Extract definitions using continuation-based batching
// KEY FIX: Extract DEFINITIONS SECTION FIRST to avoid context saturation
async function extractDefinitionsBatched(fullText: string, estimatedCount: number): Promise<any[]> {
  console.log(`[SMART] Stage 2: Extracting ALL definitions (estimated: ${estimatedCount})...`);
  
  // CRITICAL: Extract just the definitions section (not full 480k contract)
  const { section: defsText, found: foundSection } = extractDefinitionsSection(fullText);
  console.log(`[SMART] Using ${foundSection ? 'targeted' : 'fallback'} definitions text: ${defsText.length} chars`);
  
  const aiProvider = createAIProvider('anthropic');
  const allDefinitions: any[] = [];
  const seenTerms = new Set<string>();
  let lastTerm: string | null = null;
  let batchNum = 0;
  const maxBatches = 15;  // Safety limit
  
  // Continue extracting until we get an empty response
  while (batchNum < maxBatches) {
    batchNum++;
    
    const isFirstBatch = batchNum === 1;
    const prompt = isFirstBatch
      ? `Extract ALL defined terms from this contract's definitions section.

DEFINITIONS SECTION:
${defsText}

Extract EVERY defined term in the above text. These are terms that are explicitly defined with their meanings.

Return ONLY a JSON array:
[
  {"term": "Works", "definition": "brief definition (max 50 words)", "scopeRef": "1.1", "pageIndex": 0}
]

REQUIREMENTS:
- Extract ALL defined terms
- Keep definitions VERY concise (max 50 words)
- Set pageIndex to 0
- Return ONLY JSON array - no markdown, no explanation
- If you hit output limit, stop mid-array (we'll continue in next request)`
      : `Continue extracting defined terms, starting AFTER the term "${lastTerm}".

DEFINITIONS SECTION:
${defsText}

You previously extracted definitions up to and including "${lastTerm}". Now extract ALL REMAINING definitions that come AFTER "${lastTerm}".

Return ONLY a JSON array (same format as before). If there are no more definitions, return an empty array: []`;
    
    console.log(`[SMART] Batch ${batchNum}: ${isFirstBatch ? 'Extracting ALL definitions' : `Continuing after "${lastTerm}"`}...`);
    
    try {
      const result = await aiProvider.createCompletion([
        { role: 'user', content: prompt }
      ], {
        model: 'claude-sonnet-4-20250514',
        maxTokens: 8000,
        temperature: 0
      });
      
      const parsed = parseJsonArray(result.content);
      
      // If parse failed and this is first batch, retry once
      if (parsed.length === 0 && isFirstBatch) {
        console.warn(`[SMART] First batch returned empty, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;  // Retry same batch
      }
      
      // Deduplicate and add new items
      let newItemsCount = 0;
      for (const def of parsed) {
        const termLower = def.term?.toLowerCase() || '';
        if (termLower && !seenTerms.has(termLower)) {
          seenTerms.add(termLower);
          allDefinitions.push(def);
          lastTerm = def.term;  // Track last term for continuation
          newItemsCount++;
        }
      }
      
      console.log(`[SMART] Batch ${batchNum}: ${newItemsCount} new definitions (total: ${allDefinitions.length})`);
      
      // Stop if we got no new items (but not on first batch retry)
      if (newItemsCount === 0) {
        console.log(`[SMART] No more definitions found, stopping extraction`);
        break;
      }
      
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 300));
      
    } catch (error: any) {
      console.error(`[SMART] Batch ${batchNum} failed:`, error.message);
      throw new Error(`Definition extraction failed at batch ${batchNum}: ${error.message}`);
    }
  }
  
  console.log(`[SMART] Extracted ${allDefinitions.length} total unique definitions`);
  return allDefinitions;
}

// Stage 2: Extract clauses using continuation-based batching
// Mimics web interface: ask for ALL, then ask for "the rest after ref X" if truncated
async function extractClausesBatched(fullText: string, estimatedCount: number): Promise<any[]> {
  console.log(`[SMART] Stage 2: Extracting ALL clauses (estimated: ${estimatedCount})...`);
  
  const aiProvider = createAIProvider('anthropic');
  const allClauses: any[] = [];
  const seenRefs = new Set<string>();
  let lastRef: string | null = null;
  let batchNum = 0;
  const maxBatches = 15;  // Safety limit
  
  // Continue extracting until we get an empty response
  while (batchNum < maxBatches) {
    batchNum++;
    
    const isFirstBatch = batchNum === 1;
    const prompt = isFirstBatch
      ? `Extract ALL clause headings from this contract's Table of Contents.

CONTRACT TEXT:
${fullText}

Find the TABLE OF CONTENTS and extract EVERY clause heading listed in it.

Return ONLY a JSON array:
[
  {"ref": "1", "number": "1", "heading": "Definitions", "pageIndex": 0},
  {"ref": "1.1", "number": "1.1", "heading": "Interpretation", "pageIndex": 0}
]

REQUIREMENTS:
- Extract ALL clause headings from the TOC
- Include all hierarchy levels (1, 1.1, 1.1.1, etc.)
- Set pageIndex to 0
- Return ONLY JSON array - no markdown, no explanation
- If you hit output limit, stop mid-array (we'll continue in next request)`
      : `Continue extracting clause headings from this contract's Table of Contents, starting AFTER clause ref "${lastRef}".

CONTRACT TEXT:
${fullText}

You previously extracted clauses up to and including ref "${lastRef}". Now extract ALL REMAINING clauses that come AFTER "${lastRef}" in the Table of Contents.

Return ONLY a JSON array (same format as before). If there are no more clauses, return an empty array: []`;
    
    console.log(`[SMART] Batch ${batchNum}: ${isFirstBatch ? 'Extracting ALL clauses' : `Continuing after ref "${lastRef}"`}...`);
    
    try {
      const result = await aiProvider.createCompletion([
        { role: 'user', content: prompt }
      ], {
        model: 'claude-sonnet-4-20250514',
        maxTokens: 8000,
        temperature: 0
      });
      
      const parsed = parseJsonArray(result.content);
      
      // Deduplicate and add new items
      let newItemsCount = 0;
      for (const clause of parsed) {
        const ref = clause.ref || '';
        if (ref && !seenRefs.has(ref)) {
          seenRefs.add(ref);
          allClauses.push(clause);
          lastRef = clause.ref;  // Track last ref for continuation
          newItemsCount++;
        }
      }
      
      console.log(`[SMART] Batch ${batchNum}: ${newItemsCount} new clauses (total: ${allClauses.length})`);
      
      // Stop if we got no new items
      if (newItemsCount === 0) {
        console.log(`[SMART] No more clauses found, stopping extraction`);
        break;
      }
      
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 300));
      
    } catch (error: any) {
      console.error(`[SMART] Batch ${batchNum} failed:`, error.message);
      throw new Error(`Clause extraction failed at batch ${batchNum}: ${error.message}`);
    }
  }
  
  console.log(`[SMART] Extracted ${allClauses.length} total unique clauses`);
  return allClauses;
}

function parseJsonArray(content: string): any[] {
  try {
    let jsonStr = content.trim();
    
    // Remove markdown
    jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
    
    // Extract array
    const startIdx = jsonStr.indexOf('[');
    if (startIdx === -1) {
      console.warn('[SMART] No JSON array start found');
      return [];
    }
    
    const endIdx = jsonStr.lastIndexOf(']');
    
    // If no closing ], the response was truncated - try to repair it
    if (endIdx === -1) {
      console.warn('[SMART] Truncated JSON detected (no closing ]), attempting repair...');
      
      // Extract from [ to end of string
      jsonStr = jsonStr.substring(startIdx);
      
      // Try to find the last complete object by looking for },
      const lastCompleteObject = jsonStr.lastIndexOf('},{');
      if (lastCompleteObject > 0) {
        // Truncate to last complete object and close the array
        jsonStr = jsonStr.substring(0, lastCompleteObject + 1) + ']';
        console.log('[SMART] Repaired truncated JSON');
      } else {
        // Maybe just one complete object - look for single }
        const lastBrace = jsonStr.lastIndexOf('}');
        if (lastBrace > 0) {
          jsonStr = jsonStr.substring(0, lastBrace + 1) + ']';
          console.log('[SMART] Repaired truncated JSON (single object)');
        } else {
          console.error('[SMART] Cannot repair truncated JSON - no complete objects found');
          return [];
        }
      }
    } else {
      // Normal case - valid array with closing ]
      jsonStr = jsonStr.substring(startIdx, endIdx + 1);
    }
    
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) {
      console.error('[SMART] Parsed value is not an array');
      return [];
    }
    
    return parsed;
    
  } catch (error: any) {
    console.error('[SMART] JSON parse error:', error.message);
    return [];
  }
}

export async function smartExtractMetadata(revisionId: string, progressTracker?: AIProgressTracker) {
  console.log('[SMART] Starting simple text-based extraction for revision:', revisionId);
  
  // Declare interval variables at function scope for cleanup
  let phase2ProgressInterval: NodeJS.Timeout | undefined;
  let phase3ProgressInterval: NodeJS.Timeout | undefined;
  
  try {
    // Phase 0: Download PDF (10%)
    progressTracker?.updatePhase(0, 'Downloading contract PDF...');
    
    const [revision] = await db
      .select()
      .from(contractReviewDocuments)
      .where(eq(contractReviewDocuments.id, revisionId))
      .limit(1);

    if (!revision || !revision.clientContractFileKey) {
      throw new Error('Revision or file not found');
    }

    const objectStorage = new ObjectStorageService();
    const pdfBuffer = await objectStorage.downloadFile(revision.clientContractFileKey);
    console.log(`[SMART] Downloaded PDF: ${pdfBuffer.length} bytes`);

    // Phase 1: Extract text from PDF
    progressTracker?.updatePhase(1, 'Extracting text from contract...');
    const fullText = await extractTextFromPDF(pdfBuffer);
    console.log(`[SMART] Extracted ${fullText.length} characters from PDF`);

    // Phase 2: Use AI to extract ALL clause headings from TOC (40%)
    progressTracker?.updatePhase(2, 'Analyzing Table of Contents...', 0);
    console.log('[SMART] Using AI to extract ALL clause headings from Table of Contents...');
    
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      throw new Error('ANTHROPIC_API_KEY not found');
    }
    const anthropic = new (await import('@anthropic-ai/sdk')).default({ apiKey: anthropicKey });
    
    // Extract TOC section (first 100k chars should contain full TOC)
    const tocSection = fullText.substring(0, Math.min(100000, fullText.length));
    
    // Start time-based progress simulation for Phase 2
    // Estimate: ~400 clauses, ~20 seconds total
    const estimatedClauseCount = 400;
    const estimatedDuration = 20000; // 20 seconds
    const phase2StartTime = Date.now();
    let phase2Stopped = false;
    
    phase2ProgressInterval = setInterval(() => {
      if (phase2Stopped) return;
      const elapsed = Date.now() - phase2StartTime;
      const progressPct = Math.min(95, (elapsed / estimatedDuration) * 100);
      const estimatedExtracted = Math.floor((progressPct / 100) * estimatedClauseCount);
      progressTracker?.updatePhase(2, `Extracting clause headings (${estimatedExtracted}/${estimatedClauseCount} estimated)...`, progressPct);
    }, 1000); // Update every second
    
    let clausesResponse: Awaited<ReturnType<typeof anthropic.messages.create>>;
    
    try {
      console.log(`[SMART] Starting clauses AI extraction from ${tocSection.length} chars...`);
      
      clausesResponse = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 16000,
        temperature: 0,
        messages: [{
          role: 'user',
          content: `Extract EVERY clause/section heading from this contract's Table of Contents.

CONTRACT TABLE OF CONTENTS:
${tocSection}

Return a JSON array with ALL headings you find. Format:
[
  {"number": "1", "heading": "Definitions and interpretations", "pageIndex": 3},
  {"number": "1.1", "heading": "Definitions", "pageIndex": 3},
  {"number": "1.2", "heading": "Interpretation", "pageIndex": 40},
  {"number": "Schedule 1", "heading": "Contract Details", "pageIndex": 198}
]

CRITICAL REQUIREMENTS:
- Extract EVERY SINGLE heading from the TOC - no matter how many there are
- Include main sections (1, 2, 3...), sub-sections (1.1, 1.2, 2.1...), and ALL schedules
- Use actual clause numbers from the TOC when visible
- If clause numbers aren't visible, infer them from the structure/hierarchy
- Include accurate page numbers from TOC
- Return ONLY valid JSON array, no markdown, no explanation`
        }]
      }, {
        timeout: 300000, // 5 minutes timeout
        maxRetries: 0 // Don't retry on timeout
      });
      
      console.log(`[SMART] Clauses extraction succeeded: ${clausesResponse.usage.input_tokens} input tokens, ${clausesResponse.usage.output_tokens} output tokens`);
      
    } catch (error: any) {
      // Stop the progress simulation
      phase2Stopped = true;
      clearInterval(phase2ProgressInterval);
      
      // Distinguish error types for better diagnosis
      const errorMsg = error.message?.toLowerCase() || '';
      if (error.name === 'TimeoutError' || errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
        console.error('[SMART] AI timeout: Clauses extraction timed out after 5 minutes');
        throw new Error('Clauses extraction timed out after 5 minutes - Table of Contents may be too large');
      } else {
        console.error('[SMART] Clauses AI call failed:', error.message);
        throw new Error(`Failed to extract clauses: ${error.message}`);
      }
    }

    const clausesText = clausesResponse.content.find(b => b.type === 'text' && 'text' in b)?.text || '';
    
    // Stop the progress simulation
    phase2Stopped = true;
    clearInterval(phase2ProgressInterval);
    
    // Parse JSON response
    let clauses: any[] = [];
    try {
      // Remove markdown code fences if present
      const cleanText = clausesText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      clauses = JSON.parse(cleanText);
    } catch (e) {
      console.error('[SMART] Failed to parse AI response, trying to extract JSON...');
      const jsonMatch = clausesText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        clauses = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Could not parse AI response as JSON');
      }
    }
    
    // Transform to our format
    const formattedClauses = clauses.map((c: any) => ({
      ref: c.number || '',
      number: c.number || '',
      heading: c.heading || '',
      pageIndex: c.pageIndex || 0
    }));
    
    // Update with actual count and complete Phase 2
    progressTracker?.updatePhase(2, `Extracted ${formattedClauses.length} clause headings`, 100);
    console.log(`[SMART] AI extracted ${formattedClauses.length} clauses (used ${clausesResponse.usage.output_tokens} tokens)`);
    
    // Phase 3: Use AI to extract ALL definitions with preserved formatting (30%)
    progressTracker?.updatePhase(3, 'Analyzing Definitions section...', 0);
    console.log('[SMART] Using AI to extract ALL definitions from Definitions section...');
    
    // Intelligently locate the Definitions section using the TOC
    // Find "Definitions" clause and the next clause to determine page range
    const definitionsClauseIndex = formattedClauses.findIndex(c => 
      c.heading && /^definitions$/i.test(c.heading.trim())
    );
    
    let definitionsSection: string;
    let startPage = 0;
    let endPage = 0;
    
    if (definitionsClauseIndex >= 0) {
      const definitionsClause = formattedClauses[definitionsClauseIndex];
      startPage = definitionsClause.pageIndex;
      
      // Find the next clause to determine where definitions end
      const nextClause = formattedClauses[definitionsClauseIndex + 1];
      if (nextClause) {
        endPage = nextClause.pageIndex;
        console.log(`[SMART] Found Definitions section: pages ${startPage} to ${endPage} (${endPage - startPage} pages)`);
      } else {
        // If no next clause, assume definitions span ~36 pages (typical)
        endPage = startPage + 36;
        console.log(`[SMART] Found Definitions at page ${startPage}, no next clause, assuming ${endPage - startPage} pages`);
      }
      
      // Log the page range - no arbitrary limits
      console.log(`[SMART] Will extract definitions from ${endPage - startPage} pages (${startPage}-${endPage})`);
      
      // Extract text from those specific pages using PDF.js
      console.log(`[SMART] Extracting text from pages ${startPage} to ${endPage}...`);
      
      const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
      // Convert Node.js Buffer to Uint8Array for PDF.js
      const loadingTask = getDocument({ data: new Uint8Array(pdfBuffer) });
      const pdf = await loadingTask.promise;
      
      let definitionsText = '';
      for (let pageNum = startPage; pageNum <= Math.min(endPage, pdf.numPages); pageNum++) {
        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();
        const pageText = content.items.map((item: any) => item.str).join(' ');
        definitionsText += pageText + '\n\n';
      }
      
      definitionsSection = definitionsText;
      console.log(`[SMART] Extracted ${definitionsSection.length} chars from ${endPage - startPage} pages of definitions`);
    } else {
      // Fallback: use first 100k chars
      definitionsSection = fullText.substring(0, Math.min(100000, fullText.length));
      console.log(`[SMART] Definitions clause not found in TOC, using first 100k chars as fallback`);
    }
    
    // Determine if we need to chunk (if definitions section is > 30k chars, chunk it)
    const needsChunking = definitionsSection.length > 30000;
    const totalPages = endPage - startPage;
    
    // Start time-based progress simulation for Phase 3
    // Estimate: ~60 definitions, ~15 seconds total per chunk
    const estimatedDefinitionCount = 60;
    const estimatedDefDuration = needsChunking ? 30000 : 15000; // 30s for chunked, 15s for single
    const phase3StartTime = Date.now();
    let phase3Stopped = false;
    
    phase3ProgressInterval = setInterval(() => {
      if (phase3Stopped) return;
      const elapsed = Date.now() - phase3StartTime;
      const progressPct = Math.min(95, (elapsed / estimatedDefDuration) * 100);
      const estimatedExtracted = Math.floor((progressPct / 100) * estimatedDefinitionCount);
      progressTracker?.updatePhase(3, `Extracting definitions (${estimatedExtracted}/${estimatedDefinitionCount} estimated)...`, progressPct);
    }, 1000); // Update every second
    
    let allDefinitions: any[] = [];
    
    if (needsChunking) {
      // Process in chunks of ~15 pages each
      const chunkSize = 15;
      const chunks = Math.ceil(totalPages / chunkSize);
      console.log(`[SMART] Definitions section is large (${definitionsSection.length} chars), processing in ${chunks} chunks of ~${chunkSize} pages each`);
      
      for (let chunkIdx = 0; chunkIdx < chunks; chunkIdx++) {
        const chunkStartPage = startPage + (chunkIdx * chunkSize);
        const chunkEndPage = Math.min(startPage + ((chunkIdx + 1) * chunkSize), endPage);
        
        // Extract text for this chunk
        const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const loadingTask = getDocument({ data: new Uint8Array(pdfBuffer) });
        const pdf = await loadingTask.promise;
        
        let chunkText = '';
        for (let pageNum = chunkStartPage; pageNum <= Math.min(chunkEndPage, pdf.numPages); pageNum++) {
          const page = await pdf.getPage(pageNum);
          const content = await page.getTextContent();
          const pageText = content.items.map((item: any) => item.str).join(' ');
          chunkText += pageText + '\n\n';
        }
        
        console.log(`[SMART] Processing chunk ${chunkIdx + 1}/${chunks}: pages ${chunkStartPage}-${chunkEndPage} (${chunkText.length} chars)`);
        progressTracker?.updatePhase(3, `Extracting definitions (chunk ${chunkIdx + 1}/${chunks})...`, (chunkIdx / chunks) * 90);
        
        try {
          const chunkResponse = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 16000,
            temperature: 0,
            messages: [{
              role: 'user',
              content: `Extract ALL defined terms from this chunk of the Definitions section (pages ${chunkStartPage}-${chunkEndPage}).

DEFINITIONS TEXT:
${chunkText}

Return ONLY a valid JSON array with ALL definitions:
[
  {
    "term": "Government Agency",
    "definition": "means any ministry...",
    "scopeRef": "1.1",
    "pageIndex": ${chunkStartPage}
  }
]

CRITICAL FORMATTING RULES:
1. Extract EVERY defined term
2. In the "definition" field, insert a newline (\\n) BEFORE each clause marker: (a), (b), (c), (i), (ii), (iii), (1), (2), etc.
3. Also insert \\n before any prelude words like "means:", "includes:", "for any:"
4. Example: "Affiliate: means\\n(a) in relation to the Contractor, any person that:\\n(i) is directly or indirectly Controlled..."
5. Return ONLY valid JSON array - no markdown, no explanation`
            }]
          }, {
            timeout: 300000,
            maxRetries: 0
          });
          
          const textBlock = chunkResponse.content.find((b: any) => b.type === 'text');
          const responseText = textBlock && 'text' in textBlock ? textBlock.text : '';
          
          // Parse chunk response
          const cleanText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const chunkDefs = JSON.parse(cleanText);
          allDefinitions.push(...chunkDefs);
          
          console.log(`[SMART] Chunk ${chunkIdx + 1}/${chunks} extracted ${chunkDefs.length} definitions (${chunkResponse.usage.output_tokens} tokens)`);
          
        } catch (chunkError: any) {
          console.error(`[SMART] Chunk ${chunkIdx + 1} failed: ${chunkError.message}`);
          // Continue with other chunks
        }
      }
      
      phase3Stopped = true;
      clearInterval(phase3ProgressInterval);
      console.log(`[SMART] Chunked extraction complete: ${allDefinitions.length} total definitions from ${chunks} chunks`);
      
    } else {
      // Single extraction for smaller sections
      try {
        console.log(`[SMART] Starting single-pass definitions extraction from ${definitionsSection.length} chars...`);
        
        const singleResponse = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 16000,
          temperature: 0,
          messages: [{
            role: 'user',
            content: `Extract ALL defined terms from this Definitions section (pages ${startPage}-${endPage}).

DEFINITIONS TEXT:
${definitionsSection}

Return ONLY a valid JSON array with ALL definitions:
[
  {
    "term": "Government Agency",
    "definition": "means any ministry...",
    "scopeRef": "1.1",
    "pageIndex": ${startPage}
  }
]

CRITICAL FORMATTING RULES:
1. Extract EVERY defined term
2. In the "definition" field, insert a newline (\\n) BEFORE each clause marker: (a), (b), (c), (i), (ii), (iii), (1), (2), etc.
3. Also insert \\n before any prelude words like "means:", "includes:", "for any:"
4. Example: "Affiliate: means\\n(a) in relation to the Contractor, any person that:\\n(i) is directly or indirectly Controlled..."
5. Return ONLY valid JSON array - no markdown, no explanation`
          }]
        }, {
          timeout: 300000,
          maxRetries: 0
        });
        
        const textBlock = singleResponse.content.find((b: any) => b.type === 'text');
        const responseText = textBlock && 'text' in textBlock ? textBlock.text : '';
        
        // Parse response
        const cleanText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        allDefinitions = JSON.parse(cleanText);
        
        phase3Stopped = true;
        clearInterval(phase3ProgressInterval);
        console.log(`[SMART] Single-pass extraction complete: ${allDefinitions.length} definitions (${singleResponse.usage.output_tokens} tokens)`);
        
      } catch (error: any) {
        phase3Stopped = true;
        clearInterval(phase3ProgressInterval);
        
        const errorMsg = error.message?.toLowerCase() || '';
        if (error.name === 'TimeoutError' || errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
          console.error('[SMART] AI timeout: Definitions extraction timed out');
          throw new Error('Definitions extraction timed out - definitions section may be too large');
        } else {
          console.error('[SMART] Definitions extraction failed:', error.message);
          throw new Error(`Failed to extract definitions: ${error.message}`);
        }
      }
    }
    
    // Transform to our format
    const formattedDefinitions = allDefinitions.map((d: any) => ({
      term: d.term || '',
      definition: d.definition || '',
      scopeRef: d.scopeRef || '1.1',
      pageIndex: d.pageIndex || startPage
    }));
    
    // Update with actual count and complete Phase 3
    progressTracker?.updatePhase(3, `Extracted ${formattedDefinitions.length} definitions`, 100);
    console.log(`[SMART] AI extracted ${formattedDefinitions.length} definitions`);
    console.log(`[SMART] Extraction complete: ${formattedClauses.length} clauses, ${formattedDefinitions.length} definitions`);

    // Phase 4: Save to database (10%)
    progressTracker?.updatePhase(4, 'Saving extracted metadata...', 0);
    await db.transaction(async (tx) => {
      // Delete existing
      await tx.delete(contractClauses).where(eq(contractClauses.revisionId, revisionId));
      await tx.delete(contractDefinitions).where(eq(contractDefinitions.revisionId, revisionId));

      progressTracker?.updatePhase(4, 'Saving definitions and clauses...', 50);

      // Insert clauses
      if (formattedClauses.length > 0) {
        await tx.insert(contractClauses).values(
          formattedClauses.map((c: any) => ({
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
      if (formattedDefinitions.length > 0) {
        await tx.insert(contractDefinitions).values(
          formattedDefinitions.map((d: any) => ({
            revisionId,
            term: d.term || '',
            definition: d.definition || '',
            scopeRef: d.scopeRef || '1.1',
            pageIndex: d.pageIndex || 0
          }))
        );
      }
    });

    progressTracker?.updatePhase(4, 'Metadata saved successfully', 100);
    console.log('[SMART] Database save complete, marking as completed');
    progressTracker?.complete();
    
    return {
      clauseCount: formattedClauses.length,
      definitionCount: formattedDefinitions.length
    };
  } catch (error: any) {
    console.error('[SMART] Extraction failed:', error);
    progressTracker?.error(error.message || 'Failed to extract metadata');
    
    // Clean up any running intervals
    try {
      if (typeof phase2ProgressInterval !== 'undefined') {
        clearInterval(phase2ProgressInterval);
      }
      if (typeof phase3ProgressInterval !== 'undefined') {
        clearInterval(phase3ProgressInterval);
      }
    } catch (e) {
      // Ignore cleanup errors
    }
    
    throw error;
  }
}

// Ensure intervals are cleaned up even on error
process.on('unhandledRejection', () => {
  // Intervals will be cleaned up by Node.js on process exit
});
