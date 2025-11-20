#!/usr/bin/env node
require('dotenv').config();

const path = require('path');
const { syncOpenOrdersFile } = require('../src/services/openOrdersSync');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const fileArg = args.find(arg => !arg.startsWith('--'));
const defaultPath =
  process.env.OPEN_ORDERS_PATH ||
  path.join(process.env.HOME || '', 'Dropbox/Apps/Ultimate Hub/MONDAY/open_orders.csv');

const filePath = fileArg || defaultPath;

if (!filePath) {
  console.error('Please provide a path to open_orders.csv or set OPEN_ORDERS_PATH.');
  process.exit(1);
}

syncOpenOrdersFile(filePath, { dryRun })
  .then(results => {
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
  })
  .catch(err => {
    console.error('[sync] Fatal error:', err);
    process.exit(1);
  });
