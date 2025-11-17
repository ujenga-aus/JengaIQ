/**
 * Test script for Extended TOC Extraction from Claude Summaries
 * 
 * Tests the summary-based extended TOC extraction on an already-parsed contract.
 */

import { db } from './db';
import { extendedToc } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { storeExtendedToc } from './extendedTocFromSummaries';

async function testExtendedTocFromSummaries(parsedAssetId: string) {
  console.log(`\n=== Testing Extended TOC Extraction from Claude Summaries ===`);
  console.log(`Parsed Asset ID: ${parsedAssetId}\n`);
  
  // Store the extended TOC
  const count = await storeExtendedToc(parsedAssetId);
  
  console.log(`\n✅ Stored ${count} clause headings!\n`);
  
  // Fetch and display the results, ordered by orderIndex for correct hierarchy
  const entries = await db
    .select()
    .from(extendedToc)
    .where(eq(extendedToc.parsedAssetId, parsedAssetId))
    .orderBy(extendedToc.orderIndex);
  
  // Show all entries
  console.log(`📋 All ${entries.length} entries:\n`);
  entries.forEach((entry, index) => {
    const num = (index + 1).toString().padStart(2, ' ');
    const clause = entry.clauseNumber.padEnd(8, ' ');
    const desc = entry.description.slice(0, 60).padEnd(60, ' ');
    console.log(`  ${num}. [${clause}] ${desc} (page ${entry.pageNo})`);
  });
  
  console.log(`\n=== Test Complete ===\n`);
}

// BOP Contract parsed asset ID from previous parsing
const BOP_PARSED_ASSET_ID = 'c320e525-2a04-4c22-806f-3dbe30e2e56a';

testExtendedTocFromSummaries(BOP_PARSED_ASSET_ID)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
