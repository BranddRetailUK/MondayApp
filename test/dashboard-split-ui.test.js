const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'script.js'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');

test('renders a SPLIT JOB pill on both virtual dashboard rows', () => {
  assert.match(script, /item\?\.dashboard_split_job/);
  assert.match(script, /splitPill\.textContent = 'SPLIT JOB'/);
  assert.match(styles, /\.dashboard-split-job-pill\s*\{[^}]*background:#00c875/s);
});

test('uses a green full-row highlight for a completed split branch', () => {
  assert.match(script, /item\?\.dashboard_split_completed/);
  assert.match(
    styles,
    /\.job-row\.dashboard-split-branch-completed \.grid-cell\s*\{[^}]*background:rgba\(0,200,117,.22\)/s
  );
});
