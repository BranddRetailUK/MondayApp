#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const DEFAULT_DASHBOARD_URL = 'https://mondayapp-production.up.railway.app/?tab=test-dashboard';
const DEFAULT_CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

if (process.platform !== 'darwin') {
  console.error('This launcher currently supports the dashboard Mac only.');
  process.exit(1);
}

const chromePath = process.env.CHROME_PATH || DEFAULT_CHROME_PATH;
if (!fs.existsSync(chromePath)) {
  console.error(`Google Chrome was not found at ${chromePath}. Set CHROME_PATH to the Chrome executable.`);
  process.exit(1);
}

const requestedUrl = process.argv[2] || process.env.TUESDAY_DASHBOARD_URL || DEFAULT_DASHBOARD_URL;
let dashboardUrl;
try {
  dashboardUrl = new URL(requestedUrl);
} catch {
  console.error(`Invalid Tuesday Dashboard URL: ${requestedUrl}`);
  process.exit(1);
}
dashboardUrl.searchParams.set('tab', 'test-dashboard');

const profilePath = process.env.TUESDAY_PRINT_CHROME_PROFILE ||
  path.join(os.homedir(), '.mondayapp-tuesday-print-chrome');
const child = spawn(chromePath, [
  '--kiosk-printing',
  '--no-first-run',
  '--no-default-browser-check',
  `--user-data-dir=${profilePath}`,
  `--app=${dashboardUrl.toString()}`,
], {
  detached: true,
  stdio: 'ignore',
});

child.unref();
console.log(`Opened Tuesday Dashboard with silent printing enabled: ${dashboardUrl.toString()}`);
console.log('Labels will use the macOS default printer and its default paper settings.');
