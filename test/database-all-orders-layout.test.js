const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('All Orders omits the Open Orders status column and completed-row highlight', () => {
  const database = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'database.js'),
    'utf8'
  );
  const styles = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'styles.css'),
    'utf8'
  );

  assert.match(database, /const OUTSTANDING_ALL_TABLE_COLUMN_COUNT = 9;/);
  assert.match(
    database,
    /state\.orderMode === 'all' \? '' : renderOutstandingStatusCell\(statusLabel\)/
  );
  assert.match(
    database,
    /const statusCompleted = state\.orderMode !== 'all'\s+&& normalizeDashboardStatusLabel\(statusLabel\) === 'COMPLETED';/
  );
  assert.match(
    styles,
    /#db-outstanding-table\.db-all-orders-mode th\.db-open-orders-status-column\s*\{\s*display:none;/
  );
});
