/**
 * Contract document chunking utilities for AI analysis
 * Splits large contracts into manageable chunks to stay within OpenAI token limits
 */

export interface ContractChunk {
  text: string;
  startIndex: number;
  endIndex: number;
  chunkNumber: number;
}

/**
 * Splits a contract document into chunks of approximately maxChars characters
 * Tries to split on natural boundaries (paragraphs, sections)
 */
export function chunkContract(contractText: string, maxChars: number = 15000): ContractChunk[] {
  const chunks: ContractChunk[] = [];
  
  if (contractText.length <= maxChars) {
    return [{
      text: contractText,
      startIndex: 0,
      endIndex: contractText.length,
      chunkNumber: 1
    }];
  }
  
  let currentIndex = 0;
  let chunkNumber = 1;
  
  while (currentIndex < contractText.length) {
    let endIndex = Math.min(currentIndex + maxChars, contractText.length);
    
    // If not at the end, try to find a natural break point
    if (endIndex < contractText.length) {
      // Look for paragraph breaks in the last 1000 chars
      const searchStart = Math.max(currentIndex, endIndex - 1000);
      const searchText = contractText.substring(searchStart, endIndex);
      
      // Try to find natural breakpoints (in order of preference)
      const breakPoints = [
        searchText.lastIndexOf('\n\n'),  // Double newline (paragraph)
        searchText.lastIndexOf('\n'),     // Single newline
        searchText.lastIndexOf('. '),     // End of sentence
        searchText.lastIndexOf(' '),      // Any space
      ];
      
      for (const breakPoint of breakPoints) {
        if (breakPoint > searchText.length / 2) {  // Don't break too early
          endIndex = searchStart + breakPoint + (breakPoint === searchText.lastIndexOf('\n\n') ? 2 : 1);
          break;
        }
      }
    }
    
    chunks.push({
      text: contractText.substring(currentIndex, endIndex).trim(),
      startIndex: currentIndex,
      endIndex,
      chunkNumber: chunkNumber++
    });
    
    currentIndex = endIndex;
  }
  
  return chunks;
}

/**
 * Finds the most relevant chunks for a given query (clause reference or risk item)
 * Returns top N chunks based on keyword matching
 */
export function findRelevantChunks(
  chunks: ContractChunk[], 
  query: string, 
  topN: number = 3
): ContractChunk[] {
  if (chunks.length <= topN) {
    return chunks;
  }
  
  // Extract potential clause numbers and keywords from query
  const clauseMatches = query.match(/\b(\d+\.?\d*)\b/g) || [];
  const keywords = query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3)  // Only words longer than 3 chars
    .filter(word => !['this', 'that', 'with', 'from', 'have', 'been', 'will'].includes(word));
  
  // Score each chunk based on relevance
  const scoredChunks = chunks.map(chunk => {
    let score = 0;
    const lowerText = chunk.text.toLowerCase();
    
    // Heavily weight clause number matches
    for (const clause of clauseMatches) {
      const clauseRegex = new RegExp(`\\b${clause.replace('.', '\\.')}\\b`, 'gi');
      const matches = lowerText.match(clauseRegex);
      if (matches) {
        score += matches.length * 50;  // High weight for clause matches
      }
    }
    
    // Weight keyword matches
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const matches = lowerText.match(regex);
      if (matches) {
        score += matches.length * 2;
      }
    }
    
    return { chunk, score };
  });
  
  // Sort by score and return top N
  scoredChunks.sort((a, b) => b.score - a.score);
  
  // If top chunks have very low scores, return the first chunks instead
  // (contract introductions often contain important definitions)
  if (scoredChunks[0].score < 5) {
    return chunks.slice(0, topN);
  }
  
  return scoredChunks.slice(0, topN).map(sc => sc.chunk);
}

/**
 * Estimates token count (rough approximation: 1 token ≈ 4 characters)
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Combines relevant chunks into a single text, adding separators
 */
export function combineChunks(chunks: ContractChunk[]): string {
  if (chunks.length === 0) return '';
  if (chunks.length === 1) return chunks[0].text;
  
  return chunks
    .map((chunk, idx) => `=== Contract Section ${chunk.chunkNumber} ===\n${chunk.text}`)
    .join('\n\n');
}

/**
 * Page-based contract chunk for metadata extraction
 */
export interface PageBasedChunk {
  chunkId: number;
  startPage: number;
  endPage: number;
  text: string;
  pageCount: number;
}

/**
 * Split contract text into overlapping page-based chunks using page markers
 * Designed for AI metadata extraction to stay within Claude's 8192 token output limit
 * 
 * @param contractText Full extracted contract text with "--- Page X ---" markers
 * @param chunkSize Pages per chunk (default: 20)
 * @param overlap Pages to overlap between chunks to avoid boundary misses (default: 1)
 * @returns Array of chunks with metadata
 */
export function paginateContractText(
  contractText: string,
  chunkSize: number = 20,
  overlap: number = 1
): PageBasedChunk[] {
  console.log(`[Chunking] Starting pagination with chunk size ${chunkSize} pages, overlap ${overlap} pages`);
  
  // Find all page markers
  const pageMarkerRegex = /--- Page (\d+) ---/g;
  const pageMarkers: Array<{ page: number; index: number }> = [];
  let match;
  
  while ((match = pageMarkerRegex.exec(contractText)) !== null) {
    pageMarkers.push({
      page: parseInt(match[1]),
      index: match.index
    });
  }
  
  if (pageMarkers.length === 0) {
    console.warn(`[Chunking] No page markers found - using entire text as single chunk`);
    return [{
      chunkId: 0,
      startPage: 0,
      endPage: 0,
      text: contractText,
      pageCount: 1
    }];
  }
  
  console.log(`[Chunking] Found ${pageMarkers.length} page markers (pages ${pageMarkers[0].page} to ${pageMarkers[pageMarkers.length - 1].page})`);
  
  const chunks: PageBasedChunk[] = [];
  let chunkId = 0;
  let currentStartPage = pageMarkers[0].page;
  
  while (currentStartPage <= pageMarkers[pageMarkers.length - 1].page) {
    const endPage = Math.min(
      currentStartPage + chunkSize - 1,
      pageMarkers[pageMarkers.length - 1].page
    );
    
    // Find start and end indices
    const startMarker = pageMarkers.find(m => m.page === currentStartPage);
    const endMarker = pageMarkers.find(m => m.page === endPage + 1); // Next page marker (or undefined for last chunk)
    
    if (!startMarker) {
      console.warn(`[Chunking] Could not find marker for page ${currentStartPage}, skipping`);
      currentStartPage += chunkSize - overlap;
      continue;
    }
    
    const startIndex = startMarker.index;
    const endIndex = endMarker ? endMarker.index : contractText.length;
    
    const chunkText = contractText.substring(startIndex, endIndex);
    
    chunks.push({
      chunkId,
      startPage: currentStartPage,
      endPage,
      text: chunkText,
      pageCount: endPage - currentStartPage + 1
    });
    
    console.log(`[Chunking] Created chunk ${chunkId}: pages ${currentStartPage}-${endPage} (${chunkText.length} chars)`);
    
    chunkId++;
    currentStartPage += chunkSize - overlap; // Move forward with overlap
  }
  
  console.log(`[Chunking] Created ${chunks.length} chunks total`);
  return chunks;
}
