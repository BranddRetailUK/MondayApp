#!/usr/bin/env node
require('dotenv').config();

const path = require('path');
const {
  syncOpenOrdersFile,
  syncOpenOrdersFromDropbox,
} = require('../src/services/openOrdersSync');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const fileArg = args.find(arg => !arg.startsWith('--'));
if (fileArg) {
  syncOpenOrdersFile(path.resolve(process.cwd(), fileArg), { dryRun })
    .then(handleResults)
    .catch(handleError);
} else {
  syncOpenOrdersFromDropbox({ dryRun })
    .then(handleResults)
    .catch(handleError);
}

function handleResults(results) {
  const success = results.filter(r => r.success).length;
  const failed = results.length - success;
  console.log(`[sync] Completed. Success: ${success}, Failed: ${failed}`);
  results.forEach(r => {
    if (r.success) {
      console.log(`  - Job ${r.job}: ${dryRun ? 'simulated' : `created item ${r.itemId}`}`);
    } else {
      console.log(`  - Job ${r.job}: error ${r.error}`);
    }
  });
}

function handleError(err) {
  console.error('[sync] Fatal error:', err);
  process.exit(1);
}
