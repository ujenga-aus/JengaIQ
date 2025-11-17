/**
 * Contract Parsing Chunking Service
 * 
 * Splits logical parts into manageable chunks while:
 * - Preserving TOC and Definitions as complete single chunks (for easy reference)
 * - Respecting clause boundaries (don't split mid-clause)
 * - Targeting 20k-25k character chunks for other sections
 * - Preserving page markers for accurate page tracking
 * - Maintaining sequential chunk indices
 */

import { getPageNumberAtPosition } from './contractTextExtraction';
import type { DetectedPart } from './contractPartDetection';

export interface ContractChunk {
  chunkIndex: number;      // Sequential index within the part (1-based)
  startPage: number;       // First page in chunk
  endPage: number;         // Last page in chunk
  startChar: number;       // Character position in part text
  endChar: number;         // Character position in part text
  rawText: string;         // Actual chunk text
  clauseCount: number;     // Number of clauses detected in chunk
}

const MIN_CHUNK_SIZE = 15000;  // 15k chars minimum
const TARGET_CHUNK_SIZE = 22500; // 22.5k chars target
const MAX_CHUNK_SIZE = 30000;  // 30k chars maximum
const MAX_DEFINITIONS_TOKENS = 150000; // 150k tokens max for single Definitions chunk (safety margin under Claude's 200k limit)

/**
 * Chunk text from a logical part into manageable pieces
 * 
 * @param partText - Text content of the logical part
 * @param fullText - Complete contract text (for page number lookup)
 * @param partStartPosition - Start position of part in full text
 * @returns Array of chunks
 */
export function chunkPartText(
  partText: string,
  fullText: string,
  partStartPosition: number
): ContractChunk[] {
  console.log(`[ParsingChunking] Chunking part text (${partText.length} characters)...`);
  
  // If text is smaller than minimum chunk size, return single chunk
  if (partText.length <= MIN_CHUNK_SIZE) {
    console.log('[ParsingChunking] Part is small, creating single chunk');
    
    const startPage = getPageNumberAtPosition(fullText, partStartPosition);
    const endPage = getPageNumberAtPosition(fullText, partStartPosition + partText.length);
    
    return [{
      chunkIndex: 1,
      startPage,
      endPage,
      startChar: 0,
      endChar: partText.length,
      rawText: partText,
      clauseCount: countClauses(partText)
    }];
  }
  
  // Find all clause boundaries in the text
  const clauseBoundaries = findClauseBoundaries(partText);
  
  console.log(`[ParsingChunking] Found ${clauseBoundaries.length} clause boundaries`);
  
  const chunks: ContractChunk[] = [];
  let chunkStartChar = 0;
  let chunkIndex = 1;
  
  while (chunkStartChar < partText.length) {
    // Find the best split point
    const chunkEndChar = findBestSplitPoint(
      partText,
      chunkStartChar,
      clauseBoundaries
    );
    
    // Extract chunk text
    const chunkText = partText.substring(chunkStartChar, chunkEndChar).trim();
    
    // Calculate page numbers using full text position
    const absoluteStartPos = partStartPosition + chunkStartChar;
    const absoluteEndPos = partStartPosition + chunkEndChar;
    
    const startPage = getPageNumberAtPosition(fullText, absoluteStartPos);
    const endPage = getPageNumberAtPosition(fullText, absoluteEndPos);
    
    chunks.push({
      chunkIndex,
      startPage,
      endPage,
      startChar: chunkStartChar,
      endChar: chunkEndChar,
      rawText: chunkText,
      clauseCount: countClauses(chunkText)
    });
    
    console.log(`[ParsingChunking] Chunk ${chunkIndex}: ${chunkText.length} chars, ${chunks[chunks.length - 1].clauseCount} clauses, pages ${startPage}-${endPage}`);
    
    // Move to next chunk
    chunkStartChar = chunkEndChar;
    chunkIndex++;
  }
  
  console.log(`[ParsingChunking] Created ${chunks.length} chunks`);
  
  return chunks;
}

/**
 * Find all clause boundary positions in text
 * Clause pattern: lines starting with clause numbers like "1.2.3 " or "1) " or "1.1" or "1.1 –"
 */
function findClauseBoundaries(text: string): number[] {
  const boundaries: number[] = [0]; // Start of text is always a boundary
  
  // Clause number pattern (matches start of line)
  // Handles: "1.2.3 ", "1.", "1.1", "1.1 –", "1.1:", etc.
  const clausePattern = /^\d+(\.\d+)*([.):–\-\s]|$)/gm;
  
  let match;
  while ((match = clausePattern.exec(text)) !== null) {
    boundaries.push(match.index);
  }
  
  // End of text is always a boundary
  boundaries.push(text.length);
  
  return boundaries.sort((a, b) => a - b);
}

/**
 * Find the best split point for a chunk, respecting clause boundaries
 * 
 * Strategy:
 * 1. Try to get close to TARGET_CHUNK_SIZE
 * 2. Look for a clause boundary near the target
 * 3. Don't exceed MAX_CHUNK_SIZE
 * 4. Don't go below MIN_CHUNK_SIZE (unless it's the last chunk)
 */
function findBestSplitPoint(
  text: string,
  startChar: number,
  clauseBoundaries: number[]
): number {
  const remainingText = text.length - startChar;
  
  // If remaining text is smaller than max chunk size, take it all
  if (remainingText <= MAX_CHUNK_SIZE) {
    return text.length;
  }
  
  // Find the ideal split point (target size from start)
  const idealSplitPoint = startChar + TARGET_CHUNK_SIZE;
  
  // Find clause boundaries near the ideal split point
  const nearbyBoundaries = clauseBoundaries.filter(boundary => 
    boundary > startChar + MIN_CHUNK_SIZE && // Don't go below minimum
    boundary <= startChar + MAX_CHUNK_SIZE   // Don't exceed maximum
  );
  
  if (nearbyBoundaries.length === 0) {
    // No suitable boundaries found - just split at max size
    console.warn('[ParsingChunking] No clause boundaries found, forcing split at MAX_CHUNK_SIZE');
    return startChar + MAX_CHUNK_SIZE;
  }
  
  // Find the boundary closest to our ideal split point
  let bestBoundary = nearbyBoundaries[0];
  let smallestDistance = Math.abs(idealSplitPoint - bestBoundary);
  
  for (const boundary of nearbyBoundaries) {
    const distance = Math.abs(idealSplitPoint - boundary);
    if (distance < smallestDistance) {
      smallestDistance = distance;
      bestBoundary = boundary;
    }
  }
  
  return bestBoundary;
}

/**
 * Count the number of clauses in text
 */
function countClauses(text: string): number {
  const clausePattern = /^\d+(\.\d+)*([.):–\-\s]|$)/gm;
  const matches = text.match(clausePattern);
  return matches ? matches.length : 0;
}

/**
 * Estimate token count for text
 * Rule of thumb: 1 token ≈ 0.75 words ≈ 4 characters
 * This is a conservative estimate to stay well under Claude's limits
 */
function estimateTokens(text: string): number {
  // Conservative estimate: divide by 3.5 instead of 4 to have safety margin
  return Math.ceil(text.length / 3.5);
}

/**
 * Chunk all detected parts
 * 
 * Special handling for TOC and Definitions:
 * - TOC: Always preserved as single chunk (typically small)
 * - Definitions: Preserved as single chunk if under 150k tokens (safety margin)
 * 
 * @param parts - Array of detected logical parts
 * @param fullText - Complete contract text
 * @returns Map of part index to chunks
 */
export function chunkAllParts(
  parts: DetectedPart[],
  fullText: string
): Map<number, ContractChunk[]> {
  console.log(`[ParsingChunking] Chunking ${parts.length} logical parts...`);
  
  const allChunks = new Map<number, ContractChunk[]>();
  
  for (const part of parts) {
    const partText = fullText.substring(part.startPosition, part.endPosition);
    
    // Special handling for TOC and Definitions
    if (part.type === 'TOC') {
      console.log(`[ParsingChunking] Preserving TOC as single chunk (${partText.length} chars)`);
      const chunks = createSingleChunk(partText, fullText, part.startPosition);
      allChunks.set(part.orderIndex, chunks);
      continue;
    }
    
    if (part.type === 'DEFINITIONS') {
      const estimatedTokens = estimateTokens(partText);
      console.log(`[ParsingChunking] Definitions section: ${partText.length} chars, ~${estimatedTokens.toLocaleString()} tokens`);
      
      if (estimatedTokens <= MAX_DEFINITIONS_TOKENS) {
        console.log(`[ParsingChunking] Preserving Definitions as single chunk (under ${MAX_DEFINITIONS_TOKENS.toLocaleString()} token limit)`);
        const chunks = createSingleChunk(partText, fullText, part.startPosition);
        allChunks.set(part.orderIndex, chunks);
        continue;
      } else {
        console.warn(`[ParsingChunking] Definitions section too large (~${estimatedTokens.toLocaleString()} tokens), falling back to standard chunking`);
      }
    }
    
    // Standard chunking for all other parts (and oversized Definitions)
    const chunks = chunkPartText(partText, fullText, part.startPosition);
    allChunks.set(part.orderIndex, chunks);
  }
  
  // Calculate total chunks
  let totalChunks = 0;
  allChunks.forEach(chunks => {
    totalChunks += chunks.length;
  });
  
  console.log(`[ParsingChunking] Total chunks created: ${totalChunks}`);
  
  return allChunks;
}

/**
 * Create a single chunk from entire part text
 * Used for TOC and Definitions to preserve them as complete references
 */
function createSingleChunk(
  partText: string,
  fullText: string,
  partStartPosition: number
): ContractChunk[] {
  const startPage = getPageNumberAtPosition(fullText, partStartPosition);
  const endPage = getPageNumberAtPosition(fullText, partStartPosition + partText.length);
  
  return [{
    chunkIndex: 1,
    startPage,
    endPage,
    startChar: 0,
    endChar: partText.length,
    rawText: partText,
    clauseCount: countClauses(partText)
  }];
}
