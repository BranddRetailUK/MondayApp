#!/usr/bin/env node
// scripts/dropbox-lineitem-importer.js
require('dotenv').config();

const { listProcessableFiles, IMPORT_FOLDER } = require('../src/services/dropboxClient');
const { processDropboxEntry } = require('../src/services/dropboxLineItemImporter');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(`[import] Listing Dropbox folder ${IMPORT_FOLDER}`);
  const entries = await listProcessableFiles();
  if (!entries.length) {
    console.log('[import] No files to process.');
    return;
  }

  for (const entry of entries) {
    console.log(`\n[import] Processing ${entry.name}`);
    try {
      const result = await processDropboxEntry(entry, { dryRun: DRY_RUN });
      console.log(
        `[import] ✅ Finished ${entry.name} -> job #${result.jobNumber} (${result.lineItems} line items)`
      );
    } catch (err) {
      console.error(`[import] ❌ Failed ${entry.name}: ${err.message}`);
    }
  }
}

main().catch(err => {
  console.error('[import] Fatal error:', err);
  process.exit(1);
});
