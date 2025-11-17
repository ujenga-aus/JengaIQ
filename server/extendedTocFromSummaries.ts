/**
 * Build Extended TOC from Claude Summaries
 * 
 * Instead of parsing clause numbers from raw contract text (which may not have them),
 * we extract the extended TOC from the Claude summaries that were already generated
 * during the parsing pipeline.
 * 
 * This is more reliable because Claude has already identified the clause structure,
 * numbers, and headings during the summarization phase.
 */

import { db } from './db';
import { contractTextChunks, extendedToc, InsertExtendedToc } from '@shared/schema';
import { eq } from 'drizzle-orm';

export interface ExtendedTocEntry {
  clauseNumber: string;
  description: string;
  pageNo: number;
}

/**
 * Build extended TOC from Claude summaries stored in contract_text_chunks
 * 
 * @param parsedAssetId - The ID of the parsed contract asset
 * @returns Array of clause headings with page numbers
 */
export async function buildExtendedTocFromSummaries(parsedAssetId: string): Promise<ExtendedTocEntry[]> {
  // Fetch all chunks for this parsed asset
  const chunks = await db
    .select()
    .from(contractTextChunks)
    .where(eq(contractTextChunks.parsedAssetId, parsedAssetId))
    .orderBy(contractTextChunks.chunkIndex);
  
  const entries: ExtendedTocEntry[] = [];
  const seenClauses = new Set<string>(); // Deduplicate across chunks
  
  for (const chunk of chunks) {
    if (!chunk.summaryJson || typeof chunk.summaryJson !== 'object') continue;
    
    const summaryData = chunk.summaryJson as any;
    const summaries = summaryData.summaries || [];
    
    // Extract clause summaries from this chunk
    for (const summary of summaries) {
      if (!summary || typeof summary !== 'object') continue;
      
      const clauseNumber = summary.clauseNumber;
      const heading = summary.heading;
      
      if (!clauseNumber || !heading) continue;
      
      // Skip duplicates
      if (seenClauses.has(clauseNumber)) continue;
      seenClauses.add(clauseNumber);
      
      entries.push({
        clauseNumber: String(clauseNumber),
        description: String(heading),
        pageNo: chunk.startPage, // Use the chunk's start page
      });
    }
  }
  
  return entries;
}

/**
 * Sort extended TOC entries by clause number hierarchy
 * 
 * Sorts: "1" before "1.1" before "1.2" before "2" before "2.1", etc.
 * Also handles: "1.1(a)" before "1.1(b)", "1.10" after "1.9"
 */
export function sortExtendedToc(entries: ExtendedTocEntry[]): ExtendedTocEntry[] {
  return entries.sort((a, b) => {
    // Split clause numbers into parts for comparison
    const partsA = a.clauseNumber.split(/(?=\.)|(?=\()/);
    const partsB = b.clauseNumber.split(/(?=\.)|(?=\()/);
    
    // Compare part by part
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const partA = partsA[i] || '';
      const partB = partsB[i] || '';
      
      // If both parts are numeric, compare as numbers
      const numA = parseInt(partA.replace(/[^\d]/g, ''), 10);
      const numB = parseInt(partB.replace(/[^\d]/g, ''), 10);
      
      if (!isNaN(numA) && !isNaN(numB)) {
        if (numA !== numB) return numA - numB;
      }
      
      // Otherwise compare as strings
      if (partA !== partB) {
        return partA.localeCompare(partB);
      }
    }
    
    return 0;
  });
}

/**
 * Build and store extended TOC for a parsed contract
 * 
 * @param parsedAssetId - The ID of the parsed contract asset
 * @returns Number of entries created
 */
export async function storeExtendedToc(parsedAssetId: string): Promise<number> {
  // Build TOC from summaries
  const entries = await buildExtendedTocFromSummaries(parsedAssetId);
  const sortedEntries = sortExtendedToc(entries);
  
  console.log(`[ExtendedTOC] Found ${sortedEntries.length} clause headings in summaries`);
  
  // Delete any existing entries (for re-processing)
  await db
    .delete(extendedToc)
    .where(eq(extendedToc.parsedAssetId, parsedAssetId));
  
  // Batch insert new entries with orderIndex
  if (sortedEntries.length > 0) {
    const insertValues: InsertExtendedToc[] = sortedEntries.map((entry, index) => ({
      parsedAssetId,
      clauseNumber: entry.clauseNumber,
      description: entry.description,
      pageNo: entry.pageNo,
      orderIndex: index, // Preserve sorted order with explicit index
    }));
    
    await db.insert(extendedToc).values(insertValues);
  }
  
  return sortedEntries.length;
}
