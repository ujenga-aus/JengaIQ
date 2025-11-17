/**
 * Test script for Extended TOC Extraction
 * 
 * Runs the extended TOC extraction on an already-parsed contract
 * to verify the logic works correctly.
 */

import { db } from './db';
import { contractParsedAssets, extendedToc } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { buildExtendedToc, sortExtendedToc } from './extendedTocExtraction';
import { normalizeContractText } from './contractTextExtraction';

async function testExtendedTocExtraction(parsedAssetId: string) {
  console.log(`\n=== Testing Extended TOC Extraction ===`);
  console.log(`Parsed Asset ID: ${parsedAssetId}\n`);
  
  // Fetch the parsed asset
  const [parsedAsset] = await db
    .select()
    .from(contractParsedAssets)
    .where(eq(contractParsedAssets.id, parsedAssetId))
    .limit(1);
  
  if (!parsedAsset) {
    console.error(`❌ Parsed asset not found: ${parsedAssetId}`);
    return;
  }
  
  console.log(`📄 Contract: ${parsedAsset.pageCount} pages, ${parsedAsset.rawExtractedText.length} chars`);
  
  // Normalize text (same as in parsing pipeline)
  console.log(`\n🔄 Normalizing text...`);
  const normalizedText = normalizeContractText(parsedAsset.rawExtractedText);
  
  // Extract TOC entries
  console.log(`🔍 Extracting clause headings from contract body...`);
  const tocEntries = buildExtendedToc(normalizedText);
  const sortedTocEntries = sortExtendedToc(tocEntries);
  
  console.log(`\n✅ Found ${sortedTocEntries.length} clause headings!\n`);
  
  // Show first 20 entries
  console.log(`📋 First 20 entries:`);
  sortedTocEntries.slice(0, 20).forEach((entry, index) => {
    console.log(`  ${(index + 1).toString().padStart(2, ' ')}. [${entry.clauseNumber.padEnd(8, ' ')}] ${entry.description.slice(0, 60)} (page ${entry.pageNo})`);
  });
  
  if (sortedTocEntries.length > 20) {
    console.log(`  ... and ${sortedTocEntries.length - 20} more\n`);
  }
  
  // Show last 10 entries
  if (sortedTocEntries.length > 20) {
    console.log(`📋 Last 10 entries:`);
    sortedTocEntries.slice(-10).forEach((entry, index) => {
      console.log(`  ${(sortedTocEntries.length - 10 + index + 1).toString().padStart(2, ' ')}. [${entry.clauseNumber.padEnd(8, ' ')}] ${entry.description.slice(0, 60)} (page ${entry.pageNo})`);
    });
  }
  
  // Check for existing extended TOC entries
  const existing = await db
    .select()
    .from(extendedToc)
    .where(eq(extendedToc.parsedAssetId, parsedAssetId));
  
  console.log(`\n📊 Database status: ${existing.length} existing entries`);
  
  if (existing.length === 0) {
    console.log(`\n💾 Inserting ${sortedTocEntries.length} entries into database...`);
    
    await db.insert(extendedToc).values(
      sortedTocEntries.map(entry => ({
        parsedAssetId: parsedAsset.id,
        clauseNumber: entry.clauseNumber,
        description: entry.description,
        pageNo: entry.pageNo,
      }))
    );
    
    console.log(`✅ Successfully inserted all entries!`);
  } else {
    console.log(`ℹ️  Extended TOC already exists for this asset`);
  }
  
  console.log(`\n=== Test Complete ===\n`);
}

// BOP Contract parsed asset ID from previous parsing
const BOP_PARSED_ASSET_ID = 'c320e525-2a04-4c22-806f-3dbe30e2e56a';

testExtendedTocExtraction(BOP_PARSED_ASSET_ID)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
