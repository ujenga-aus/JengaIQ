/**
 * Script to trigger contract parsing for a specific revision
 * Usage: tsx server/triggerParsing.ts <revisionId>
 */

import { processContractRevision } from './contractParsingPipeline';

const revisionId = process.argv[2];

if (!revisionId) {
  console.error('Usage: tsx server/triggerParsing.ts <revisionId>');
  process.exit(1);
}

console.log(`Starting contract parsing for revision ${revisionId}...`);

processContractRevision(revisionId)
  .then(() => {
    console.log('✅ Contract parsing completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Contract parsing failed:', error);
    process.exit(1);
  });
