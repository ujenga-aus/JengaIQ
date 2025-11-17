console.log('!!!!!!!! CONTRACT METADATA EXTRACTION MODULE LOADED !!!!!!!!');

import { db } from "./db";
import { 
  contractReviewDocuments,
  contractClauses,
  contractDefinitions,
  contractSearchIndex,
  companies,
  projects,
  businessUnits,
  aiUsageLogs
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { ObjectStorageService } from "./objectStorage";
import { extractTextFromPDF } from "./semanticSearch";
import Anthropic from "@anthropic-ai/sdk";
import { paginateContractText, PageBasedChunk } from "./contractChunking";

export interface ContractMetadata {
  clauses: Array<{
    ref: string;
    number: string;
    heading: string;
    pageIndex: number;
    bbox?: { x: number; y: number; w: number; h: number } | null;
  }>;
  definitions: Array<{
    term: string;
    definition: string;
    scopeRef: string;
    pageIndex: number;
  }>;
  searchTokens: Array<{
    pageIndex: number;
    tokens: string;
  }>;
}

/**
 * AI-identified pointers to clauses and definitions (before verbatim extraction)
 */
export interface MetadataPointers {
  clauses: Array<{
    number: string;
    pageIndex: number;
    searchContext: string;
  }>;
  definitions: Array<{
    term: string;
    pageIndex: number;
    searchContext: string;
    scopeRef: string;
  }>;
}

/**
 * Result from AI extraction including pointers and token usage
 */
export interface MetadataExtractionResult {
  pointers: MetadataPointers;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
  };
}

/**
 * Extract verbatim definition text from PDF using AI's search context pointer
 * Preserves all formatting, newlines, and paragraph structure
 */
function extractVerbatimDefinition(fullText: string, term: string, pageIndex: number, searchContext: string): string {
  console.log(`[VerbatimExtract] Extracting definition for "${term}" on page ${pageIndex}`);
  
  // Find the page in the extracted text (format: "--- Page X ---")
  const pageMarker = `--- Page ${pageIndex} ---`;
  let pageStart = fullText.indexOf(pageMarker);
  
  // Find the next page marker to limit search area
  let pageEnd = fullText.length;
  if (pageStart >= 0) {
    const nextPageMarker = fullText.indexOf(`--- Page ${pageIndex + 1} ---`, pageStart + 1);
    if (nextPageMarker >= 0) {
      pageEnd = nextPageMarker;
    }
  } else {
    console.warn(`[VerbatimExtract] Page marker not found for page ${pageIndex}, searching full text`);
    pageStart = 0;
  }
  
  // Get the page text window
  const searchArea = fullText.substring(pageStart, pageEnd);
  
  // Try case-insensitive search with normalized whitespace
  const normalizedSearch = searchContext.replace(/\s+/g, ' ').trim().toLowerCase();
  const normalizedArea = searchArea.replace(/\s+/g, ' ').toLowerCase();
  
  let contextIndex = normalizedArea.indexOf(normalizedSearch);
  
  if (contextIndex === -1) {
    // Try without normalization (exact match)
    contextIndex = searchArea.toLowerCase().indexOf(searchContext.toLowerCase());
  }
  
  if (contextIndex === -1) {
    console.warn(`[VerbatimExtract] Search context not found for "${term}": "${searchContext}"`);
    console.warn(`[VerbatimExtract] Tried within page ${pageIndex} window (${searchArea.length} chars)`);
    return `[Definition not found in PDF for: ${term}]`;
  }
  
  // Find the corresponding position in the original (non-normalized) text
  let originalIndex = 0;
  let normalizedCount = 0;
  for (let i = 0; i < searchArea.length && normalizedCount < contextIndex; i++) {
    const char = searchArea[i];
    // Count non-whitespace or first whitespace in a sequence
    if (char.trim().length > 0 || (i > 0 && searchArea[i - 1].trim().length > 0)) {
      normalizedCount++;
    }
    originalIndex = i;
  }
  
  const absoluteStart = pageStart + originalIndex;
  
  // Extract from search context forward
  let extractedText = fullText.substring(absoluteStart);
  
  // Enhanced boundary detection - find where this definition ends
  const endPatterns = [
    /\n"?[A-Z][A-Za-z\s&]+"?\s+means\s/i,  // Next definition (quoted or not)
    /\n\d+\.\d+(\.\d+)?\s+[A-Z]/,          // Next numbered clause (e.g., "8.3", "8.3.1")
    /\n[A-Z]+\s+\d+\s*-/,                   // Schedule headers (e.g., "SCHEDULE 1 -")
    /\n--- Page \d+ ---/,                   // Next page marker
    /\n\n\n/,                               // Triple newline (major section break)
  ];
  
  let endIndex = Math.min(extractedText.length, 5000); // Safety limit: max 5000 chars
  
  for (const pattern of endPatterns) {
    const match = extractedText.match(pattern);
    if (match && match.index && match.index > 50) { // Must be at least 50 chars away
      endIndex = Math.min(endIndex, match.index);
    }
  }
  
  // Extract the definition (keeping all newlines and formatting)
  let definition = extractedText.substring(0, endIndex).trim();
  
  // Clean up any trailing artifacts
  definition = definition.replace(/\n--- Page \d+ ---$/, '').trim();
  
  console.log(`[VerbatimExtract] Extracted ${definition.length} chars for "${term}"`);
  
  return definition;
}

/**
 * Extract verbatim clause heading from PDF using AI's search context
 */
function extractVerbatimHeading(fullText: string, clauseNumber: string, pageIndex: number, searchContext: string): string {
  console.log(`[VerbatimExtract] Extracting heading for clause "${clauseNumber}" on page ${pageIndex}`);
  
  // Find the page in the extracted text
  const pageMarker = `--- Page ${pageIndex} ---`;
  let pageStart = fullText.indexOf(pageMarker);
  
  // Find page window
  let pageEnd = fullText.length;
  if (pageStart >= 0) {
    const nextPageMarker = fullText.indexOf(`--- Page ${pageIndex + 1} ---`, pageStart + 1);
    if (nextPageMarker >= 0) {
      pageEnd = nextPageMarker;
    }
  } else {
    console.warn(`[VerbatimExtract] Page marker not found for page ${pageIndex}, searching full text`);
    pageStart = 0;
  }
  
  const searchArea = fullText.substring(pageStart, pageEnd);
  
  // Try case-insensitive search
  let contextIndex = searchArea.toLowerCase().indexOf(searchContext.toLowerCase());
  
  if (contextIndex === -1) {
    console.warn(`[VerbatimExtract] Heading search context not found: "${searchContext}"`);
    console.warn(`[VerbatimExtract] Tried within page ${pageIndex} window (${searchArea.length} chars)`);
    return searchContext; // Fall back to AI's provided heading
  }
  
  // Extract just the heading (usually one line)
  const startPos = pageStart + contextIndex;
  const headingText = fullText.substring(startPos);
  const newlineIndex = headingText.indexOf('\n');
  
  const heading = newlineIndex >= 0 ? headingText.substring(0, newlineIndex).trim() : headingText.substring(0, 200).trim();
  
  console.log(`[VerbatimExtract] Extracted heading: "${heading}"`);
  
  return heading;
}

/**
 * Hydrate metadata pointers with verbatim text extraction
 * Takes AI-identified pointers and extracts full text from contract
 * 
 * @param contractText Full extracted contract text
 * @param pointers AI-identified clause and definition pointers
 * @returns Full metadata with verbatim text
 */
function hydrateMetadataFromPointers(
  contractText: string,
  pointers: {
    clauses: Array<{ number: string; pageIndex: number; searchContext: string }>;
    definitions: Array<{ term: string; pageIndex: number; searchContext: string; scopeRef: string }>;
  }
): ContractMetadata {
  console.log(`[Hydration] Extracting verbatim text for ${pointers.clauses.length} clauses and ${pointers.definitions.length} definitions`);
  
  // Extract verbatim headings for clauses
  const clauses = pointers.clauses.map((c) => {
    const heading = extractVerbatimHeading(
      contractText,
      c.number,
      c.pageIndex,
      c.searchContext
    );
    
    return {
      ref: `clause-${c.number}`,
      number: c.number,
      heading,
      pageIndex: c.pageIndex,
      bbox: null
    };
  });
  
  // Extract verbatim definitions
  const definitions = pointers.definitions.map((d) => {
    const definition = extractVerbatimDefinition(
      contractText,
      d.term,
      d.pageIndex,
      d.searchContext
    );
    
    return {
      term: d.term,
      definition,
      scopeRef: d.scopeRef || 'General',
      pageIndex: d.pageIndex
    };
  });
  
  console.log(`[Hydration] Verbatim extraction complete: ${clauses.length} clauses, ${definitions.length} definitions`);
  
  return {
    clauses,
    definitions,
    searchTokens: [] // Will be populated by caller
  };
}

/**
 * Extract contract metadata (clauses, definitions, search index) from a PDF
 * using AI-powered analysis with Anthropic Claude Sonnet 4
 */
export async function extractContractMetadata(revisionId: string, progressTracker?: any): Promise<ContractMetadata> {
  console.log(`[ContractMetadata] Starting extraction for revision ${revisionId}`);
  
  // 1. Get the contract revision and associated company settings
  const [revision] = await db
    .select()
    .from(contractReviewDocuments)
    .where(eq(contractReviewDocuments.id, revisionId))
    .limit(1);

  if (!revision || !revision.clientContractFileKey) {
    throw new Error('Revision not found or has no contract file');
  }

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, revision.projectId))
    .limit(1);

  if (!project || !project.businessUnitId) {
    throw new Error('Project not found or has no business unit');
  }

  const [businessUnit] = await db
    .select()
    .from(businessUnits)
    .where(eq(businessUnits.id, project.businessUnitId))
    .limit(1);

  if (!businessUnit) {
    throw new Error('Business unit not found');
  }

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, businessUnit.companyId))
    .limit(1);

  if (!company) {
    throw new Error('Company not found');
  }

  // 2. Download PDF from object storage
  const objectStorage = new ObjectStorageService();
  const file = await objectStorage.getObjectEntityFile(revision.clientContractFileKey);
  const [pdfBuffer] = await file.download();

  // 3. Send PDF to Claude API with prompt caching (90% cost reduction)
  console.log(`[ContractMetadata] Sending PDF to Claude API with prompt caching`);
  const { metadata, extractedText } = await extractMetadataWithClaude(pdfBuffer, progressTracker);

  console.log(`[ContractMetadata] Extraction complete: ${metadata.clauses.length} clauses, ${metadata.definitions.length} definitions`);
  
  // 4. Generate search tokens from extracted text (reuse already-extracted text)
  metadata.searchTokens = generateSearchTokens(extractedText);
  
  return metadata;
}

/**
 * Quick page count from extracted text
 */
function countPagesFromText(extractedText: string): number {
  const pageMarkerRegex = /--- Page (\d+) ---/g;
  const pageMatches = Array.from(extractedText.matchAll(pageMarkerRegex));
  
  if (pageMatches.length > 0) {
    return parseInt(pageMatches[pageMatches.length - 1][1]);
  }
  
  // Estimate if no markers (fallback)
  return Math.ceil(extractedText.length / 3000);
}

/**
 * Extract metadata using Claude API with prompt caching (90% cost reduction)
 * Uses dual-path approach:
 * - PDFs ≤ 100 pages: Send as document (PDF vision API)
 * - PDFs > 100 pages: Extract text first (Claude's PDF limit)
 * Returns both metadata and extracted text (for search tokens)
 */
async function extractMetadataWithClaude(pdfBuffer: Buffer, progressTracker?: any): Promise<{ metadata: ContractMetadata; extractedText: string }> {
  console.log(`[ContractMetadata] Initializing Claude API`);
  
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  // Validate PDF size (Anthropic has 20 MB limit)
  const pdfSizeMB = pdfBuffer.length / (1024 * 1024);
  if (pdfSizeMB > 20) {
    throw new Error(`PDF size (${pdfSizeMB.toFixed(1)} MB) exceeds Anthropic's 20 MB limit. Please use a smaller contract.`);
  }
  console.log(`[ContractMetadata] PDF size: ${pdfSizeMB.toFixed(2)} MB`);

  // Upfront page detection to avoid wasted vision API calls
  console.log(`[ContractMetadata] Extracting text to determine page count...`);
  const extractedText = await extractTextFromPDF(pdfBuffer);
  const pageCount = countPagesFromText(extractedText);
  
  if (pageCount > 100) {
    console.log(`[ContractMetadata] PDF has ${pageCount} pages (>100) - routing directly to chunked text extraction`);
    const result = await extractMetadataWithClaudeTextChunked(extractedText, anthropic, pageCount, progressTracker);
    return { metadata: result.metadata, extractedText };
  } else {
    console.log(`[ContractMetadata] PDF has ${pageCount} pages (≤100) - using vision API`);
  }

  // Convert PDF to base64 for document API
  console.log(`[ContractMetadata] Converting PDF to base64 for Claude vision API`);
  const base64Data = pdfBuffer.toString('base64');
  console.log(`[ContractMetadata] Converted PDF to base64 (${base64Data.length} chars)`);

  // Retry logic for API failures
  let lastError: any;
  const MAX_RETRIES = 3;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 1) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        console.log(`[ContractMetadata] Retry attempt ${attempt}/${MAX_RETRIES} after ${backoffMs}ms`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }

      console.log(`[ContractMetadata] Sending request to Claude API with prompt caching (attempt ${attempt}/${MAX_RETRIES})`);
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8000, // Claude Sonnet 4 max output tokens for comprehensive extraction
      system: [
        {
          type: "text",
          text: "You are a construction contract analysis expert. Extract ALL defined terms and numbered clause headings from the provided contract with exact accuracy. Pay special attention to Australian Standard contracts (AS4000, AS4300, AS4902, AS4917).",
          cache_control: { type: "ephemeral" } // Cache system prompt
        }
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64Data,
              },
              cache_control: { type: "ephemeral" } // Cache the PDF (90% cost reduction!)
            },
            {
              type: "text",
              text: `Analyse this construction contract and identify ALL defined terms and numbered clause headings.

IMPORTANT: Do NOT extract the full definition text. Instead, provide just enough information to LOCATE each item in the PDF:

For each defined term, provide:
- term: the exact term as it appears (e.g., "Contract Sum", "Superintendent")
- pageIndex: page number where the definition appears
- searchContext: a unique 10-20 word phrase from the start of the definition that will help locate it (e.g., "Contract Sum\" means the sum stated in Item 7 of Schedule")
- scopeRef: scope reference if mentioned (e.g., "GC", "Schedule 1", "Part A") or "General"

For each numbered heading, provide:
- number: the clause number (e.g., "1.2", "8.3.1")
- pageIndex: page number where found
- searchContext: the full heading text as it appears (e.g., "8.3 Payment Claims")

Return ONLY valid JSON with this exact structure:
{
  "definitions": [
    {
      "term": "Contract Sum",
      "pageIndex": 5,
      "searchContext": "sum stated in Item 7"
    },
    {
      "term": "Site",
      "pageIndex": 6,
      "searchContext": "land described in Annexure Item",
      "scopeRef": "Schedule 1"
    }
  ],
  "clauses": [
    {
      "number": "1.2",
      "pageIndex": 3,
      "searchContext": "1.2 Contract Documents"
    }
  ]
}

Extract ALL definitions and ALL clause headings. Keep searchContext SHORT (6-8 words). Omit scopeRef unless it's NOT "General". This ensures the response stays well below 8192 tokens even for dense contracts.`
            }
          ]
        }
      ]
    });

    console.log(`[ContractMetadata] Received response from Claude API`);
    console.log(`[ContractMetadata] Usage - Input: ${message.usage.input_tokens}, Output: ${message.usage.output_tokens}`);
    
    // Log cache metrics if available
    if (message.usage.cache_creation_input_tokens) {
      console.log(`[ContractMetadata] Cache creation tokens: ${message.usage.cache_creation_input_tokens}`);
    }
    if (message.usage.cache_read_input_tokens) {
      console.log(`[ContractMetadata] Cache read tokens: ${message.usage.cache_read_input_tokens} (90% savings!)`);
    }
    
    // Parse Claude's response
    const responseText = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    console.log(`[ContractMetadata] Parsing Claude response (${responseText.length} chars)`);
    
    // Extract JSON from response - handle markdown code blocks
    let jsonText = responseText;
    const codeBlockMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1];
    } else {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonText = jsonMatch[0];
      } else {
        throw new Error('Could not find JSON in Claude response');
      }
    }

    // Parse with error handling
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (parseError: any) {
      console.error(`[ContractMetadata] JSON parse error:`, parseError.message);
      console.error(`[ContractMetadata] Response text:`, responseText.substring(0, 500));
      throw new Error(`Failed to parse Claude response as JSON: ${parseError.message}`);
    }

    // Validate response structure
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Claude response is not a valid object');
    }
    if (!Array.isArray(parsed.clauses)) {
      console.warn(`[ContractMetadata] No clauses array in response, using empty array`);
      parsed.clauses = [];
    }
    if (!Array.isArray(parsed.definitions)) {
      console.warn(`[ContractMetadata] No definitions array in response, using empty array`);
      parsed.definitions = [];
    }
    
    console.log(`[ContractMetadata] AI identified ${parsed.clauses.length} clauses and ${parsed.definitions.length} definitions`);
    
    // Warn if response might be truncated
    if (message.stop_reason === 'max_tokens') {
      console.warn(`[ContractMetadata] WARNING: Response hit max_tokens limit - extraction may be incomplete!`);
      console.warn(`[ContractMetadata] Consider implementing chunking for this contract size`);
    }
    
    // Reuse extracted text (already extracted at function start for page detection)
    console.log(`[ContractMetadata] Using precomputed text (${extractedText.length} chars) for verbatim extraction`);
    
    // Transform to our metadata format using verbatim extraction
    console.log(`[ContractMetadata] Extracting verbatim headings for ${parsed.clauses.length} clauses`);
    const clauses = (parsed.clauses || []).map((c: any) => {
      const heading = extractVerbatimHeading(
        extractedText, 
        c.number, 
        c.pageIndex || 0, 
        c.searchContext || c.number
      );
      
      return {
        ref: `clause-${c.number}`,
        number: c.number,
        heading,
        pageIndex: c.pageIndex || 0,
        bbox: null
      };
    });

    console.log(`[ContractMetadata] Extracting verbatim definitions for ${parsed.definitions.length} definitions`);
    const definitions = (parsed.definitions || []).map((d: any) => {
      const definition = extractVerbatimDefinition(
        extractedText,
        d.term,
        d.pageIndex || 0,
        d.searchContext || d.term
      );
      
      return {
        term: d.term,
        definition,
        scopeRef: d.scopeRef || 'General',
        pageIndex: d.pageIndex || 0
      };
    });

    console.log(`[ContractMetadata] Verbatim extraction complete: ${clauses.length} clauses, ${definitions.length} definitions`);

    const metadata: ContractMetadata = {
      clauses,
      definitions,
      searchTokens: [] // Will be populated by caller
    };
    
    return { metadata, extractedText };

    } catch (error: any) {
      lastError = error;
      console.error(`[ContractMetadata] Attempt ${attempt}/${MAX_RETRIES} failed:`, error.message);
      
      // Check for 100-page limit error and fall back to text extraction
      if (error.status === 400 && error.message?.includes('A maximum of 100 PDF pages may be provided')) {
        console.log(`[ContractMetadata] PDF exceeds Claude's 100-page limit - falling back to text extraction`);
        const tempText = await extractTextFromPDF(pdfBuffer);
        
        // Count pages to determine if we need chunked extraction
        const pageMarkerRegex = /--- Page (\d+) ---/g;
        const pageMatches = Array.from(tempText.matchAll(pageMarkerRegex));
        const pageCount = pageMatches.length > 0 ? 
          parseInt(pageMatches[pageMatches.length - 1][1]) : 
          Math.ceil(tempText.length / 3000); // Estimate if no markers
        
        console.log(`[ContractMetadata] Detected ${pageCount} pages in extracted text`);
        
        // Use chunked extraction for large contracts (>120 pages)
        if (pageCount > 120) {
          console.log(`[ContractMetadata] Contract is large (${pageCount} pages) - using chunked extraction`);
          const result = await extractMetadataWithClaudeTextChunked(tempText, anthropic, pageCount, progressTracker);
          return { metadata: result.metadata, extractedText: tempText };
        } else {
          console.log(`[ContractMetadata] Contract is moderate size (${pageCount} pages) - using single-pass extraction`);
          const result = await extractMetadataWithClaudeText(tempText, anthropic, pageCount, progressTracker);
          const metadata = hydrateMetadataFromPointers(tempText, result.pointers);
          return { metadata, extractedText: tempText };
        }
      }
      
      // Check for token limit errors and fall back to chunked extraction
      if (error.message?.includes('maximum output tokens') || error.message?.includes('output limit')) {
        console.log(`[ContractMetadata] Hit token output limit - falling back to chunked extraction`);
        const tempText = await extractTextFromPDF(pdfBuffer);
        
        // Count pages
        const pageMarkerRegex = /--- Page (\d+) ---/g;
        const pageMatches = Array.from(tempText.matchAll(pageMarkerRegex));
        const pageCount = pageMatches.length > 0 ? 
          parseInt(pageMatches[pageMatches.length - 1][1]) : 
          Math.ceil(tempText.length / 3000);
        
        console.log(`[ContractMetadata] Using chunked extraction for ${pageCount}-page contract`);
        const result = await extractMetadataWithClaudeTextChunked(tempText, anthropic, pageCount, progressTracker);
        return { metadata: result.metadata, extractedText: tempText };
      }
      
      // Retry on rate limits and transient errors
      if (error.status === 429 || error.status === 503 || error.status === 504) {
        if (attempt < MAX_RETRIES) {
          continue; // Retry with backoff
        }
      }
      
      // Don't retry on permanent errors
      if (error.status === 400 || error.status === 413 || error.message?.includes('JSON')) {
        break; // Exit retry loop
      }
    }
  }

  // All retries exhausted - provide user-friendly error
  console.error(`[ContractMetadata] All ${MAX_RETRIES} attempts failed`);
  
  if (!lastError) {
    throw new Error('AI extraction failed: No error details available');
  }
  
  if (lastError.status === 429) {
    throw new Error('Rate limit exceeded after multiple retries. Please wait a few minutes and try again.');
  } else if (lastError.status === 413) {
    throw new Error('PDF file too large for processing. Please use a smaller contract.');
  } else if (lastError.status === 400) {
    throw new Error(`Invalid request to Claude API: ${lastError.message}`);
  } else if (lastError.message?.includes('JSON')) {
    throw new Error(`Failed to parse AI response after ${MAX_RETRIES} attempts. The contract may be too large or complex. Please contact support.`);
  }
  
  // Default error case
  throw new Error(`AI extraction failed after ${MAX_RETRIES} attempts: ${lastError.message || 'Unknown error'}`);
}

/**
 * Extract metadata pointers using Claude API with text input (for PDFs > 100 pages)
 * Returns raw pointers only - caller must hydrate with verbatim extraction
 * Uses text extraction + prompt caching for cost efficiency
 */
async function extractMetadataWithClaudeText(
  contractText: string,
  anthropic: Anthropic,
  pageCount: number,
  progressTracker?: any
): Promise<MetadataExtractionResult> {
  console.log(`[ContractMetadata] Extracting from ${pageCount}-page PDF using text method (${contractText.length} characters)`);
  
  // Retry logic for API failures
  let lastError: any;
  const MAX_RETRIES = 3;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 1) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        console.log(`[ContractMetadata] Retry attempt ${attempt}/${MAX_RETRIES} after ${backoffMs}ms`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }

      console.log(`[ContractMetadata] Sending text to Claude API with STREAMING enabled (attempt ${attempt}/${MAX_RETRIES})`);
      console.log(`[ContractMetadata] This may take 2-5 minutes for large contracts - streaming progress will be logged...`);
      
      // Calculate contract statistics for FYI display
      const wordCount = contractText.split(/\s+/).filter(w => w.length > 0).length;
      const lineCount = contractText.split(/\n/).length;
      const characterCount = contractText.length;
      
      // Pass contract stats to progress tracker for user FYI
      if (progressTracker) {
        progressTracker.updatePhase(
          1,
          'Starting AI analysis...',
          10,
          undefined,
          { pageCount, wordCount, lineCount, characterCount }
        );
      }
      
      // Track streaming progress
      let totalChunks = 0;
      let textReceived = 0;
      const startTime = Date.now();
      
      // Use streaming to avoid 10-minute timeout for large contracts
      const stream = await anthropic.messages.stream({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192, // Claude Sonnet 4 max output tokens
        system: [
          {
            type: "text",
            text: "You are a construction contract analysis expert. Extract ALL defined terms and numbered clause headings from the provided contract with exact accuracy. Pay special attention to Australian Standard contracts (AS4000, AS4300, AS4902, AS4917).",
            cache_control: { type: "ephemeral" }
          }
        ],
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: contractText,
                cache_control: { type: "ephemeral" }
              },
              {
                type: "text",
                text: `Analyse this construction contract and identify ALL defined terms and numbered clause headings.

IMPORTANT: Do NOT extract the full definition text. Instead, provide just enough information to LOCATE each item in the PDF:

For each defined term, provide:
- term: the exact term as it appears (e.g., "Contract Sum", "Superintendent")
- pageIndex: estimated page number where found (based on "--- Page X ---" markers in the text)
- searchContext: a SHORT unique phrase (6-8 words max, ~80 chars) from the start of the definition that will help locate it (e.g., "means the sum stated in Item 7")
- scopeRef: ONLY include if NOT "General" (omit this field entirely for General scope to reduce token usage)

For each numbered heading, provide:
- number: the clause number (e.g., "1.2", "8.3.1")
- pageIndex: estimated page number where found (based on "--- Page X ---" markers in the text)
- searchContext: the full heading text as it appears (e.g., "8.3 Payment Claims")

Return ONLY valid JSON with this exact structure:
{
  "definitions": [
    {
      "term": "Contract Sum",
      "pageIndex": 5,
      "searchContext": "sum stated in Item 7"
    },
    {
      "term": "Site",
      "pageIndex": 6,
      "searchContext": "land described in Annexure Item",
      "scopeRef": "Schedule 1"
    }
  ],
  "clauses": [
    {
      "number": "1.2",
      "pageIndex": 3,
      "searchContext": "1.2 Contract Documents"
    }
  ]
}

Extract ALL definitions and ALL clause headings. Keep searchContext SHORT (6-8 words). Omit scopeRef unless it's NOT "General". This ensures the response stays well below 8192 tokens even for dense contracts.`
              }
            ]
          }
        ]
      });

      // Update progress tracker every 2 seconds with live telemetry
      const progressInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const elapsedSec = (elapsed / 1000).toFixed(1);
        console.log(`[ContractMetadata] Streaming... ${elapsedSec}s elapsed, ${totalChunks} chunks, ${textReceived} chars received`);
        
        // Calculate progress percentage - start at 10%, gradually move to 95% over time
        // Use a logarithmic curve so it feels responsive at first, then slows near completion
        const progressWithinPhase = Math.min(95, 10 + Math.log(1 + totalChunks) * 12);
        
        // Update progress tracker with live telemetry
        if (progressTracker) {
          progressTracker.updatePhase(
            1, // Still in "AI Analysis" phase
            `Analysing contract... ${totalChunks} chunks processed`,
            progressWithinPhase,
            {
              chunkCount: totalChunks,
              charCount: textReceived,
              elapsedMs: elapsed
            }
          );
        }
      }, 2000); // Update every 2 seconds for responsive feedback

      // Listen to streaming events
      stream.on('text', (text) => {
        totalChunks++;
        textReceived += text.length;
        if (totalChunks % 50 === 0) {
          console.log(`[ContractMetadata] Received ${totalChunks} chunks (${textReceived} chars)`);
        }
      });

      // Collect streamed response
      const message = await stream.finalMessage();
      clearInterval(progressInterval);
      
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[ContractMetadata] Streaming complete! Total time: ${totalTime}s, ${totalChunks} chunks, ${textReceived} chars`);
      
      console.log(`[ContractMetadata] Received complete streaming response from Claude API`);
      console.log(`[ContractMetadata] Usage - Input: ${message.usage.input_tokens}, Output: ${message.usage.output_tokens}`);
      
      // Log cache metrics
      if (message.usage.cache_creation_input_tokens) {
        console.log(`[ContractMetadata] Cache creation tokens: ${message.usage.cache_creation_input_tokens}`);
      }
      if (message.usage.cache_read_input_tokens) {
        console.log(`[ContractMetadata] Cache read tokens: ${message.usage.cache_read_input_tokens} (90% savings!)`);
      }
      
      // Parse Claude's response
      const responseText = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('\n');

      console.log(`[ContractMetadata] Parsing Claude response (${responseText.length} chars)`);
      
      // Extract JSON from response - handle markdown code blocks
      let jsonText = responseText;
      const codeBlockMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1];
      } else {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonText = jsonMatch[0];
        } else {
          throw new Error('Could not find JSON in Claude response');
        }
      }

      // Parse with error handling
      let parsed;
      try {
        parsed = JSON.parse(jsonText);
      } catch (parseError: any) {
        console.error(`[ContractMetadata] JSON parse error:`, parseError.message);
        console.error(`[ContractMetadata] First 1000 chars of response:`, responseText.substring(0, 1000));
        console.error(`[ContractMetadata] Last 1000 chars of response:`, responseText.substring(Math.max(0, responseText.length - 1000)));
        console.error(`[ContractMetadata] Stop reason:`, message.stop_reason);
        console.error(`[ContractMetadata] Output tokens used:`, message.usage.output_tokens);
        
        // If truncated, provide helpful message
        if (message.stop_reason === 'max_tokens') {
          throw new Error(`Contract too large - AI response exceeded ${message.usage.output_tokens} tokens. Please try a smaller contract or contact support.`);
        }
        
        throw new Error(`Failed to parse AI response as JSON: ${parseError.message}. This may indicate malformed output from the AI.`);
      }

      // Validate response structure
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Claude response is not a valid object');
      }
      if (!Array.isArray(parsed.clauses)) {
        console.warn(`[ContractMetadata] No clauses array in response, using empty array`);
        parsed.clauses = [];
      }
      if (!Array.isArray(parsed.definitions)) {
        console.warn(`[ContractMetadata] No definitions array in response, using empty array`);
        parsed.definitions = [];
      }
      
      console.log(`[ContractMetadata] AI identified ${parsed.clauses.length} clauses and ${parsed.definitions.length} definitions from text`);
      
      // Warn if response might be truncated
      if (message.stop_reason === 'max_tokens') {
        console.warn(`[ContractMetadata] WARNING: Response hit max_tokens limit - extraction may be incomplete!`);
        console.warn(`[ContractMetadata] For very large contracts, some definitions/clauses may be missing`);
      }
      
      // Return raw pointers only (verbatim extraction happens later via hydrateMetadataFromPointers)
      console.log(`[ContractMetadata] Returning ${parsed.clauses.length} clause pointers and ${parsed.definitions.length} definition pointers`);
      
      // Collect token usage for logging
      const usage = {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheCreationTokens: message.usage.cache_creation_input_tokens || 0,
        cacheReadTokens: message.usage.cache_read_input_tokens || 0
      };
      
      return {
        pointers: {
          clauses: (parsed.clauses || []).map((c: any) => ({
            number: c.number,
            pageIndex: c.pageIndex || 0,
            searchContext: c.searchContext || c.number
          })),
          definitions: (parsed.definitions || []).map((d: any) => ({
            term: d.term,
            pageIndex: d.pageIndex || 0,
            searchContext: d.searchContext || d.term,
            scopeRef: d.scopeRef || 'General' // Default to General if omitted
          }))
        },
        usage
      };

    } catch (error: any) {
      lastError = error;
      console.error(`[ContractMetadata] Attempt ${attempt}/${MAX_RETRIES} failed:`, error.message);
      
      // IMMEDIATELY throw max_tokens errors for subdivision to handle - don't retry!
      if (error.message?.includes('exceeded 8192 tokens') || error.message?.includes('exceeded') && error.message?.includes('tokens')) {
        console.log(`[ContractMetadata] max_tokens hit - throwing immediately for subdivision`);
        throw error;
      }
      
      // Retry on rate limits and transient errors
      if (error.status === 429 || error.status === 503 || error.status === 504) {
        if (attempt < MAX_RETRIES) {
          continue;
        }
      }
      
      // Don't retry on permanent errors
      if (error.status === 400 || error.status === 413 || error.message?.includes('JSON')) {
        break;
      }
    }
  }

  // All retries exhausted
  console.error(`[ContractMetadata] All ${MAX_RETRIES} attempts failed`);
  
  if (!lastError) {
    throw new Error('AI extraction failed: No error details available');
  }
  
  if (lastError.status === 429) {
    throw new Error('Rate limit exceeded after multiple retries. Please wait a few minutes and try again.');
  } else if (lastError.status === 413) {
    throw new Error('Contract text too large for processing. Please use a smaller contract.');
  } else if (lastError.status === 400) {
    throw new Error(`Invalid request to Claude API: ${lastError.message}`);
  } else if (lastError.message?.includes('JSON')) {
    throw new Error(`Failed to parse AI response after ${MAX_RETRIES} attempts. The contract may be too complex. Please contact support.`);
  }
  
  throw new Error(`AI extraction failed after ${MAX_RETRIES} attempts: ${lastError.message || 'Unknown error'}`);
}

/**
 * Extract pointers from a chunk with automatic subdivision if it hits max_tokens
 * Recursively splits dense chunks (10 → 5 → 2 pages) until extraction succeeds
 */
async function extractChunkWithSubdivision(
  chunk: PageBasedChunk,
  anthropic: Anthropic,
  progressTracker?: any,
  depth: number = 0
): Promise<{
  results: MetadataExtractionResult[];
  totalClauses: number;
  totalDefinitions: number;
  subdivisions: number;
}> {
  console.log(`[ChunkSubdivision] Attempting extraction for ${chunk.pageCount} pages (depth ${depth})`);
  
  try {
    // Try to extract this chunk
    const result = await extractMetadataWithClaudeText(
      chunk.text,
      anthropic,
      chunk.pageCount,
      progressTracker
    );
    
    // Success! Return the result
    return {
      results: [result],
      totalClauses: result.pointers.clauses.length,
      totalDefinitions: result.pointers.definitions.length,
      subdivisions: 0
    };
    
  } catch (error: any) {
    // Check if this is a max_tokens error
    if (error.message?.includes('exceeded 8192 tokens') || error.message?.includes('max_tokens')) {
      console.log(`[ChunkSubdivision] Chunk too dense (${chunk.pageCount} pages) - subdividing...`);
      
      // Can't subdivide further if chunk is already 1 page
      // For ultra-dense single pages, extract in alphabetical batches
      if (chunk.pageCount <= 1) {
        console.log(`[ChunkSubdivision] Single page ${chunk.startPage} too dense - extracting in alphabetical batches...`);
        
        // Split into A-M and N-Z batches
        const batch1 = await extractMetadataWithClaudeText(
          chunk.text + "\n\nIMPORTANT: Only extract definitions starting with letters A through M.",
          anthropic,
          chunk.pageCount,
          progressTracker
        );
        
        const batch2 = await extractMetadataWithClaudeText(
          chunk.text + "\n\nIMPORTANT: Only extract definitions starting with letters N through Z.",
          anthropic,
          chunk.pageCount,
          progressTracker
        );
        
        // Combine results
        const combinedPointers: MetadataPointers = {
          clauses: [...batch1.pointers.clauses, ...batch2.pointers.clauses],
          definitions: [...batch1.pointers.definitions, ...batch2.pointers.definitions]
        };
        
        const combinedUsage = {
          inputTokens: batch1.usage.inputTokens + batch2.usage.inputTokens,
          outputTokens: batch1.usage.outputTokens + batch2.usage.outputTokens,
          cacheCreationTokens: batch1.usage.cacheCreationTokens + batch2.usage.cacheCreationTokens,
          cacheReadTokens: batch1.usage.cacheReadTokens + batch2.usage.cacheReadTokens
        };
        
        return {
          results: [{ pointers: combinedPointers, usage: combinedUsage }],
          totalClauses: combinedPointers.clauses.length,
          totalDefinitions: combinedPointers.definitions.length,
          subdivisions: 1
        };
      }
      
      // Split chunk in half
      const midPage = chunk.startPage + Math.floor(chunk.pageCount / 2);
      
      const chunk1 = paginateContractText(chunk.text, midPage - chunk.startPage, 0)[0];
      const chunk2Text = chunk.text.substring(chunk.text.indexOf(`--- Page ${midPage} ---`));
      const chunk2 = paginateContractText(chunk2Text, chunk.endPage - midPage + 1, 0)[0];
      
      console.log(`[ChunkSubdivision] Split into: pages ${chunk.startPage}-${midPage - 1} and ${midPage}-${chunk.endPage}`);
      
      // Recursively process each half
      const [result1, result2] = await Promise.all([
        extractChunkWithSubdivision(chunk1, anthropic, progressTracker, depth + 1),
        extractChunkWithSubdivision(chunk2, anthropic, progressTracker, depth + 1)
      ]);
      
      // Combine results
      return {
        results: [...result1.results, ...result2.results],
        totalClauses: result1.totalClauses + result2.totalClauses,
        totalDefinitions: result1.totalDefinitions + result2.totalDefinitions,
        subdivisions: 1 + result1.subdivisions + result2.subdivisions
      };
    }
    
    // Re-throw other errors
    throw error;
  }
}

/**
 * Extract metadata from large contracts using chunked processing
 * Splits contract into page-based chunks to stay within Claude's 8192 token output limit
 * 
 * @param contractText Full extracted contract text with page markers
 * @param anthropic Anthropic client
 * @param pageCount Total number of pages in contract
 * @param progressTracker Optional progress tracker for UI updates
 * @returns Full metadata with verbatim text extracted and aggregated token usage
 */
async function extractMetadataWithClaudeTextChunked(
  contractText: string,
  anthropic: Anthropic,
  pageCount: number,
  progressTracker?: any
): Promise<{ metadata: ContractMetadata; usage: MetadataExtractionResult['usage'] }> {
  console.log(`[ChunkedExtraction] Starting chunked extraction for ${pageCount}-page contract`);
  
  // Step 1: Paginate the contract into chunks (10 pages each with 1-page overlap)
  // 10-page chunks = ~4.5-5k tokens (well under 8192 token output limit)
  // Dynamic subdivision fallback handles anomalously dense sections
  const CHUNK_SIZE_PAGES = 10;
  const chunks = paginateContractText(contractText, CHUNK_SIZE_PAGES, 1);
  console.log(`[ChunkedExtraction] Created ${chunks.length} chunks from ${pageCount} pages (${CHUNK_SIZE_PAGES} pages per chunk)`);
  
  // Step 2: Process each chunk to extract pointers (with dynamic subdivision for dense chunks)
  const allPointers: MetadataPointers[] = [];
  
  // Track aggregated token usage across all chunks
  let totalUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0
  };
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`[ChunkedExtraction] Processing chunk ${i + 1}/${chunks.length} (pages ${chunk.startPage}-${chunk.endPage})`);
    
    // Update progress tracker with chunk info
    if (progressTracker) {
      const chunkProgressPct = Math.floor((i / chunks.length) * 85) + 10; // 10-95% range
      progressTracker.updatePhase(
        1,
        `Analysing chunk ${i + 1}/${chunks.length} (pages ${chunk.startPage}-${chunk.endPage})`,
        chunkProgressPct,
        {
          currentChunk: i + 1,
          totalChunks: chunks.length,
          chunkStartPage: chunk.startPage,
          chunkEndPage: chunk.endPage
        }
      );
    }
    
    // Extract pointers from this chunk with dynamic subdivision
    const result = await extractChunkWithSubdivision(
      chunk,
      anthropic,
      progressTracker
    );
    
    // Aggregate all pointers from this chunk (may be from multiple sub-chunks)
    for (const subResult of result.results) {
      allPointers.push(subResult.pointers);
      
      // Aggregate token usage
      totalUsage.inputTokens += subResult.usage.inputTokens;
      totalUsage.outputTokens += subResult.usage.outputTokens;
      totalUsage.cacheCreationTokens += subResult.usage.cacheCreationTokens;
      totalUsage.cacheReadTokens += subResult.usage.cacheReadTokens;
    }
    
    console.log(`[ChunkedExtraction] Chunk ${i + 1} extracted: ${result.totalClauses} clauses, ${result.totalDefinitions} definitions${result.subdivisions > 0 ? ` (subdivided into ${result.subdivisions + 1} parts)` : ''}`);
  }
  
  console.log(`[ChunkedExtraction] Total usage across all chunks: ${totalUsage.inputTokens} input, ${totalUsage.outputTokens} output, ${totalUsage.cacheReadTokens} cache read`);
  
  // Step 3: Aggregate and deduplicate pointers
  console.log(`[ChunkedExtraction] Aggregating pointers from ${chunks.length} chunks`);
  
  // Deduplicate clauses by clause number (keep earliest page)
  const clauseMap = new Map<string, { number: string; pageIndex: number; searchContext: string }>();
  for (const pointers of allPointers) {
    for (const clause of pointers.clauses) {
      const key = clause.number.toLowerCase();
      const existing = clauseMap.get(key);
      if (!existing || clause.pageIndex < existing.pageIndex) {
        clauseMap.set(key, clause);
      }
    }
  }
  
  // Deduplicate definitions by term+scope (keep earliest page, longest context)
  const definitionMap = new Map<string, { term: string; pageIndex: number; searchContext: string; scopeRef: string }>();
  for (const pointers of allPointers) {
    for (const def of pointers.definitions) {
      const key = `${def.term.toLowerCase()}|${def.scopeRef.toLowerCase()}`;
      const existing = definitionMap.get(key);
      if (!existing || def.pageIndex < existing.pageIndex || (def.pageIndex === existing.pageIndex && def.searchContext.length > existing.searchContext.length)) {
        definitionMap.set(key, def);
      }
    }
  }
  
  const mergedPointers: MetadataPointers = {
    clauses: Array.from(clauseMap.values()).sort((a, b) => {
      const aNum = parseFloat(a.number);
      const bNum = parseFloat(b.number);
      return aNum - bNum;
    }),
    definitions: Array.from(definitionMap.values()).sort((a, b) => a.term.localeCompare(b.term))
  };
  
  console.log(`[ChunkedExtraction] Deduplicated to ${mergedPointers.clauses.length} clauses and ${mergedPointers.definitions.length} definitions`);
  
  // Step 4: Hydrate metadata with verbatim extraction (single pass over full text)
  if (progressTracker) {
    progressTracker.updatePhase(
      1,
      `Extracting verbatim text for ${mergedPointers.definitions.length} definitions...`,
      95,
      { phase: 'verbatim_extraction' }
    );
  }
  
  const metadata = hydrateMetadataFromPointers(contractText, mergedPointers);
  
  console.log(`[ChunkedExtraction] Chunked extraction complete: ${metadata.clauses.length} clauses, ${metadata.definitions.length} definitions`);
  console.log(`[ChunkedExtraction] Returning aggregated usage from ${chunks.length} chunks`);
  
  return { metadata, usage: totalUsage };
}

/**
 * DEPRECATED: Local pattern-based extraction (kept for reference)
 * Now using Claude API with prompt caching for better accuracy and completeness
 */
async function extractMetadataLocally_DEPRECATED(contractText: string): Promise<ContractMetadata> {
  console.log(`[ContractMetadata] Starting local pattern-based extraction`);
  
  // Split into pages (approximate 3000 chars per page for page indexing)
  const charsPerPage = 3000;
  const getPageIndex = (charIndex: number) => Math.floor(charIndex / charsPerPage);

  // Extract definitions using Australian construction contract patterns
  const definitions = extractDefinitions(contractText, getPageIndex);
  console.log(`[ContractMetadata] Found ${definitions.length} definitions using pattern matching`);

  // Extract numbered clause headings
  const clauses = extractClauseHeadings(contractText, getPageIndex);
  console.log(`[ContractMetadata] Found ${clauses.length} clause headings using pattern matching`);

  // Generate search tokens
  const searchTokens = generateSearchTokens(contractText);

  return {
    clauses,
    definitions,
    searchTokens
  };
}

/**
 * Extract definitions using Australian construction contract patterns
 */
function extractDefinitions(text: string, getPageIndex: (index: number) => number): Array<{
  term: string;
  definition: string;
  scopeRef: string;
  pageIndex: number;
}> {
  const definitions: Array<{ term: string; definition: string; scopeRef: string; pageIndex: number }> = [];
  const foundTerms = new Set<string>();

  // CRITICAL: pdf-parse emits Unicode curved quotes, not straight quotes
  // Unicode characters: " = \u201c, " = \u201d, ' = \u2018, ' = \u2019
  // All patterns must explicitly include both straight ("') and curved ("")('')  quotes
  
  // Pattern 1: "Term" means... (most common in AS contracts)
  // Accepts: "Term", "Term", "Term", 'Term', 'Term', 'Term'
  const quotedPattern = /["\u201c\u201d]([^"\u201c\u201d]+)["\u201c\u201d]\s+means\s+([^.\n]+(?:[.\n][^.\n]*?(?:\([a-z0-9]+\)[^.\n]*?)*)*[.;\n]?)/gi;
  let match;
  
  while ((match = quotedPattern.exec(text)) !== null) {
    const term = match[1].trim();
    const definition = match[2].trim();
    
    if (!foundTerms.has(term.toLowerCase()) && definition.length > 5) {
      foundTerms.add(term.toLowerCase());
      definitions.push({
        term,
        definition: formatDefinitionWithNewlines(definition),
        scopeRef: detectScope(text, match.index),
        pageIndex: getPageIndex(match.index)
      });
    }
  }

  // Pattern 2: 'Term' means... (single quotes - common variant)
  // Accepts: 'Term', 'Term', 'Term'
  const singleQuotedPattern = /['\u2018\u2019]([^'\u2018\u2019]+)['\u2018\u2019]\s+means\s+([^.\n]+(?:[.\n][^.\n]*?(?:\([a-z0-9]+\)[^.\n]*?)*)*[.;\n]?)/gi;
  while ((match = singleQuotedPattern.exec(text)) !== null) {
    const term = match[1].trim();
    const definition = match[2].trim();
    
    if (!foundTerms.has(term.toLowerCase()) && definition.length > 5) {
      foundTerms.add(term.toLowerCase());
      definitions.push({
        term,
        definition: formatDefinitionWithNewlines(definition),
        scopeRef: detectScope(text, match.index),
        pageIndex: getPageIndex(match.index)
      });
    }
  }

  // Pattern 3: In this Contract, "Term" means...
  const contextPattern = /In\s+this\s+(?:Contract|Agreement|Document),?\s+["\u201c\u201d'\u2018\u2019]([^"\u201c\u201d'\u2018\u2019]+)["\u201c\u201d'\u2018\u2019]\s+means\s+([^.\n]+[.;\n]?)/gi;
  while ((match = contextPattern.exec(text)) !== null) {
    const term = match[1].trim();
    const definition = match[2].trim();
    
    if (!foundTerms.has(term.toLowerCase()) && definition.length > 5) {
      foundTerms.add(term.toLowerCase());
      definitions.push({
        term,
        definition: formatDefinitionWithNewlines(definition),
        scopeRef: detectScope(text, match.index),
        pageIndex: getPageIndex(match.index)
      });
    }
  }

  // Pattern 4: "Term" has the meaning given in... (cross-reference pattern)
  // IMPORTANT: No trailing period required (many cross-refs are stand-alone lines)
  const crossRefPattern = /["\u201c\u201d'\u2018\u2019]([^"\u201c\u201d'\u2018\u2019]+)["\u201c\u201d'\u2018\u2019]\s+has\s+the\s+meaning\s+given\s+(?:in|to\s+(?:it|that\s+term))\s+(?:in\s+)?([^\n.;]+)/gi;
  while ((match = crossRefPattern.exec(text)) !== null) {
    const term = match[1].trim();
    const definition = `has the meaning given in ${match[2].trim()}`;
    
    if (!foundTerms.has(term.toLowerCase())) {
      foundTerms.add(term.toLowerCase());
      definitions.push({
        term,
        definition: formatDefinitionWithNewlines(definition),
        scopeRef: detectScope(text, match.index),
        pageIndex: getPageIndex(match.index)
      });
    }
  }

  // Pattern 5: CAPITALIZED TERM means... (common in definition sections)
  const capitalPattern = /\b([A-Z][A-Z\s]{2,30})\s+means\s+([^.\n]+(?:[.\n][^.\n]*?(?:\([a-z0-9]+\)[^.\n]*?)*)*[.;\n]?)/g;
  while ((match = capitalPattern.exec(text)) !== null) {
    const term = match[1].trim();
    const definition = match[2].trim();
    
    // Filter out common headings that aren't definitions
    if (!term.match(/^(CLAUSE|SECTION|SCHEDULE|PART|CHAPTER|GENERAL|CONDITIONS|AGREEMENT)$/i) &&
        !foundTerms.has(term.toLowerCase()) && definition.length > 5) {
      foundTerms.add(term.toLowerCase());
      definitions.push({
        term,
        definition: formatDefinitionWithNewlines(definition),
        scopeRef: detectScope(text, match.index),
        pageIndex: getPageIndex(match.index)
      });
    }
  }

  // Pattern 6: Term includes... (alternative definition pattern)
  const includesPattern = /["\u201c\u201d'\u2018\u2019]([^"\u201c\u201d'\u2018\u2019]+)["\u201c\u201d'\u2018\u2019]\s+includes\s+([^.\n]+[.;\n]?)/gi;
  while ((match = includesPattern.exec(text)) !== null) {
    const term = match[1].trim();
    const definition = `includes ${match[2].trim()}`;
    
    if (!foundTerms.has(term.toLowerCase()) && definition.length > 5) {
      foundTerms.add(term.toLowerCase());
      definitions.push({
        term,
        definition: formatDefinitionWithNewlines(definition),
        scopeRef: detectScope(text, match.index),
        pageIndex: getPageIndex(match.index)
      });
    }
  }

  return definitions;
}

/**
 * Format definition with newlines before clause markers for tooltip rendering
 */
function formatDefinitionWithNewlines(definition: string): string {
  return definition
    .replace(/\s+\(([a-z])\)/gi, '\n($1)')
    .replace(/\s+\(([ivxlcdm]+)\)/gi, '\n($1)')
    .replace(/\s+\((\d+)\)/g, '\n($1)');
}

/**
 * Detect scope (GC, Schedule, etc.) from surrounding text
 */
function detectScope(text: string, index: number): string {
  // Look backward up to 500 chars for scope indicators
  const before = text.substring(Math.max(0, index - 500), index);
  
  if (before.match(/Schedule\s+(\d+)/i)) {
    const schedMatch = before.match(/Schedule\s+(\d+)/i);
    return schedMatch ? `Schedule ${schedMatch[1]}` : 'GC';
  }
  
  if (before.match(/General\s+Conditions/i)) {
    return 'GC';
  }
  
  if (before.match(/Part\s+([A-Z0-9]+)/i)) {
    const partMatch = before.match(/Part\s+([A-Z0-9]+)/i);
    return partMatch ? `Part ${partMatch[1]}` : 'GC';
  }
  
  return 'GC';
}

/**
 * Extract numbered clause headings (Australian construction contract format)
 */
function extractClauseHeadings(text: string, getPageIndex: (index: number) => number): Array<{
  ref: string;
  number: string;
  heading: string;
  pageIndex: number;
}> {
  const clauses: Array<{ ref: string; number: string; heading: string; pageIndex: number }> = [];
  const foundNumbers = new Set<string>();

  // Pattern for numbered headings: 1.2.3 HEADING TEXT or 1.2.3 Heading Text
  // Matches: single (1), double (1.2), triple (1.2.3), up to quad level
  // IMPORTANT: Allow leading whitespace (pdf-parse often indents headings)
  const headingPattern = /^\s*(\d+(?:\.\d+){0,3})\s+([A-Z][A-Z\s\-\/]{3,50}|[A-Z][a-z][A-Za-z\s\-\/]{3,50})/gm;
  
  let match;
  while ((match = headingPattern.exec(text)) !== null) {
    const number = match[1];
    const heading = match[2].trim();
    
    // Filter out likely page numbers (single digit followed by short text)
    if (number.length === 1 && heading.length < 10) continue;
    
    // Avoid duplicates
    if (!foundNumbers.has(number)) {
      foundNumbers.add(number);
      
      const ref = detectClauseRef(text, match.index, number);
      
      clauses.push({
        ref,
        number,
        heading,
        pageIndex: getPageIndex(match.index)
      });
    }
  }

  return clauses;
}

/**
 * Detect clause reference (GC, Schedule, etc.) for headings
 */
function detectClauseRef(text: string, index: number, number: string): string {
  const before = text.substring(Math.max(0, index - 300), index);
  
  if (before.match(/Schedule\s+(\d+)/i)) {
    const schedMatch = before.match(/Schedule\s+(\d+)/i);
    return schedMatch ? `Sch ${schedMatch[1]} cl ${number}` : `GC ${number}`;
  }
  
  if (before.match(/General\s+Conditions/i)) {
    return `GC ${number}`;
  }
  
  return `GC ${number}`;
}

/**
 * Generate simple search tokens from contract text (page-by-page)
 */
function generateSearchTokens(text: string): Array<{ pageIndex: number; tokens: string }> {
  // Simple tokenization - split by pages (assume ~3000 chars per page)
  const charsPerPage = 3000;
  const searchTokens: Array<{ pageIndex: number; tokens: string }> = [];
  
  for (let i = 0; i < text.length; i += charsPerPage) {
    const pageText = text.substring(i, i + charsPerPage);
    const tokens = pageText
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2)
      .join(' ');
    
    searchTokens.push({
      pageIndex: Math.floor(i / charsPerPage),
      tokens
    });
  }
  
  return searchTokens;
}

/**
 * Save extracted metadata to database (with transaction for data integrity)
 */
export async function saveContractMetadata(revisionId: string, metadata: ContractMetadata): Promise<void> {
  console.log(`[ContractMetadata] Saving metadata to database for revision ${revisionId}`);
  
  try {
    // Use a transaction to ensure all-or-nothing behavior
    await db.transaction(async (tx) => {
      // Delete existing metadata
      await Promise.all([
        tx.delete(contractClauses).where(eq(contractClauses.revisionId, revisionId)),
        tx.delete(contractDefinitions).where(eq(contractDefinitions.revisionId, revisionId)),
        tx.delete(contractSearchIndex).where(eq(contractSearchIndex.revisionId, revisionId)),
      ]);

      // Insert clauses
      if (metadata.clauses.length > 0) {
        await tx.insert(contractClauses).values(
          metadata.clauses.map(clause => ({
            revisionId,
            ref: clause.ref,
            number: clause.number,
            heading: clause.heading,
            pageIndex: clause.pageIndex,
            bbox: clause.bbox || null,
          }))
        );
      }

      // Insert definitions
      if (metadata.definitions.length > 0) {
        await tx.insert(contractDefinitions).values(
          metadata.definitions.map(def => ({
            revisionId,
            term: def.term,
            definition: def.definition,
            scopeRef: def.scopeRef,
            pageIndex: def.pageIndex,
          }))
        );
      }

      // Insert search tokens
      if (metadata.searchTokens.length > 0) {
        await tx.insert(contractSearchIndex).values(
          metadata.searchTokens.map(token => ({
            revisionId,
            pageIndex: token.pageIndex,
            tokens: token.tokens,
          }))
        );
      }
    });

    console.log(`[ContractMetadata] Metadata saved successfully`);
  } catch (error) {
    console.error('[ContractMetadata] Failed to save metadata:', error);
    throw new Error('Failed to save contract metadata to database');
  }
}

/**
 * Extract and save contract metadata (main entry point)
 */
export async function extractAndSaveContractMetadata(
  revisionId: string, 
  progressTracker?: any
): Promise<ContractMetadata> {
  console.log(`[ContractMetadata] ========== STARTING EXTRACTION ==========`);
  console.log(`[ContractMetadata] extractAndSaveContractMetadata called for revision ${revisionId}`);
  try {
    // Phase 0: Starting extraction (weight: 10)
    progressTracker?.updatePhase(0);
    
    // Phase 1: Extracting metadata with Claude API (weight: 70)
    progressTracker?.updatePhase(1);
    const metadata = await extractContractMetadata(revisionId, progressTracker);
    console.log(`[ContractMetadata] Extraction returned: ${metadata.clauses.length} clauses, ${metadata.definitions.length} definitions`);
    
    // Phase 2: Saving metadata to database (weight: 20)
    progressTracker?.updatePhase(2);
    await saveContractMetadata(revisionId, metadata);
    console.log(`[ContractMetadata] Save complete`);
    
    // Mark complete
    progressTracker?.complete();
    return metadata;
  } catch (error: any) {
    console.error(`[ContractMetadata] ERROR in extractAndSaveContractMetadata:`, error.message);
    console.error(`[ContractMetadata] Full error:`, error);
    progressTracker?.error(error.message || 'Extraction failed');
    throw error;
  }
}
