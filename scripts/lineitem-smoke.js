#!/usr/bin/env node
// scripts/lineitem-smoke.js
const path = require('path');
const { parseLineItemsFromFile } = require('../src/services/lineItemParser');

function usage() {
  console.log('Usage: node scripts/lineitem-smoke.js <path-to-xlsx-or-csv>');
  console.log('Example: node scripts/lineitem-smoke.js ~/Dropbox/Apps/Ultimate\\ Hub/MONDAY/50658.xlsx');
}

function printPreview(items, limit = 5) {
  const preview = items.slice(0, limit).map(item => ({
    productId: item.productId,
    styleCode: item.styleCode,
    styleName: item.styleName,
    size: item.size,
    colour: item.colour,
    qty: item.qty,
  }));
  console.table(preview);
}

function main() {
  const fileInput = process.argv[2];
  if (!fileInput) {
    usage();
    process.exit(1);
  }

  const resolvedPath = path.resolve(process.cwd(), fileInput);
  console.log(`[smoke] Reading file: ${resolvedPath}`);

  try {
    const { items, errors, rowsParsed, jobNumber } = parseLineItemsFromFile(resolvedPath);
    console.log(`[smoke] Rows parsed: ${rowsParsed}`);
    if (jobNumber) console.log(`[smoke] Detected job number: ${jobNumber}`);
    if (errors.length > 0) {
      console.log('[smoke] Validation issues:');
      errors.forEach(err => console.log(`  - Row ${err.rowNumber}: ${err.reason}`));
    } else {
      console.log('[smoke] No validation errors detected.');
    }
    console.log(`[smoke] Line items ready: ${items.length}`);
    printPreview(items);
  } catch (err) {
    console.error('[smoke] Failed to parse file:', err.message);
    process.exit(1);
  }
}

main();
