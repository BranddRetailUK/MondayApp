#!/usr/bin/env node
const path = require('path');
const { parseOpenOrdersFile } = require('../src/services/openOrdersParser');

const filePath = process.argv[2];
if (!filePath) {
  console.log('Usage: npm run smoke:open-orders -- /path/to/open_orders.csv');
  process.exit(1);
}

const resolved = path.resolve(process.cwd(), filePath);
const jobs = parseOpenOrdersFile(resolved);
console.log(`Parsed ${jobs.length} jobs from ${resolved}`);
jobs.slice(0, 3).forEach(job => {
  console.log('---');
  console.log(`Job: ${job.jobNumber}`);
  console.log(`Type: ${job.jobType}`);
  console.log(`Customer: ${job.customer}`);
  console.log(`Title: ${job.jobTitle}`);
  console.log(`Line items: ${job.lineItems.length}`);
  console.table(job.lineItems.slice(0, 5));
});
