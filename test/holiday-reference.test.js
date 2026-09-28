const test = require('node:test');
const assert = require('node:assert/strict');
const { importHolidayReference } = require('../src/db/holidayReference');
function fixture({ imported = false, matches = 1, fail = false } = {}) {
  const calls = [];
  const client = { async query(sql, args) {
    calls.push({ sql, args });
    if (sql.startsWith('SELECT source_key')) return { rowCount: imported ? 1 : 0 };
    if (sql.startsWith('SELECT id')) return { rowCount: matches, rows: [{id: args[0] === 'Lubos' ? 1 : 2}] };
    if (fail && sql.startsWith('INSERT INTO holiday_board_days')) throw new Error('write failed');
    return { rowCount: 1, rows: [] };
  }, release() { calls.push({sql:'RELEASE'}); } };
  return { calls, async connect() { return client; } };
}
test('reference import inserts 35 dates including four correct half days, then receipts atomically', async () => {
  const db=fixture(); await importHolidayReference(db);
  const days=db.calls.filter(c=>c.sql.startsWith('INSERT INTO holiday_board_days'));
  assert.equal(days.length,35);
  assert.deepEqual(days.filter(c=>c.args[2]!=='full').map(c=>c.args.slice(1)),[['2026-01-30','am'],['2026-02-13','pm'],['2026-02-20','pm'],['2026-07-30','pm']]);
  assert.ok(days.every(c=>c.sql.includes('ON CONFLICT DO NOTHING')));
  assert.equal(db.calls.at(-2).sql,'COMMIT');assert.equal(db.calls.at(-1).sql,'RELEASE');
});
test('receipt prevents restoration of deleted days on subsequent startups',async()=>{
 const db=fixture({imported:true});await importHolidayReference(db);assert.ok(!db.calls.some(c=>c.sql.startsWith('INSERT')));
});
test('ambiguous account causes no partial import',async()=>{
 const db=fixture({matches:2});await importHolidayReference(db);assert.ok(db.calls.some(c=>c.sql==='ROLLBACK'));assert.ok(!db.calls.some(c=>c.sql.startsWith('INSERT')));
});
test('failed import rolls back without recording success',async()=>{
 const db=fixture({fail:true});await assert.rejects(importHolidayReference(db),/write failed/);assert.equal(db.calls.at(-2).sql,'ROLLBACK');assert.ok(!db.calls.some(c=>c.sql.startsWith('INSERT INTO holiday_board_imports')));
});
