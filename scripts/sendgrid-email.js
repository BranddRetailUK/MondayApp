#!/usr/bin/env node
'use strict';
require('dotenv').config();
const fs = require('node:fs');
const { status, sendMarketingEmail } = require('../src/services/sendgrid');
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--status') { console.log(JSON.stringify(status(), null, 2)); return; }
  if (args.length !== 2 || !['--validate', '--send'].includes(args[0])) throw new Error('Usage: node scripts/sendgrid-email.js --status | --validate message.json | --send message.json');
  const message = JSON.parse(fs.readFileSync(args[1], 'utf8'));
  // Only the explicit command-line flag can request delivery.
  console.log(JSON.stringify(await sendMarketingEmail({ ...message, sandbox: args[0] !== '--send' }), null, 2));
}
main().catch(err => { console.error(err.message); process.exitCode = 1; });
