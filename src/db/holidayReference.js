const reference = require('../../data/holiday-board/reference-2026.json');
const IMPORT_KEY = 'photo-2026-v1';

// One-time historical import, independent of the API's past-date edit restriction.
// A durable receipt prevents subsequent restarts from restoring removed holidays.
async function importHolidayReference(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('holiday-board-reference'))");
    const receipt = await client.query('SELECT source_key FROM holiday_board_imports WHERE source_key = $1', [IMPORT_KEY]);
    if (receipt.rowCount) { await client.query('COMMIT'); return; }
    const people = [];
    for (const person of reference.people) {
      const result = await client.query('SELECT id FROM hub_users WHERE first_name = $1 AND last_name = $2', [person.first_name, person.last_name]);
      if (result.rowCount !== 1) {
        await client.query('ROLLBACK');
        console.warn('Holiday reference import deferred: each reference person must match exactly one registered user.');
        return;
      }
      people.push({ ...person, id: result.rows[0].id });
    }
    for (const person of people) {
      await client.query('INSERT INTO holiday_board_members(user_id, initials, colour) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [person.id, person.initials, person.colour]);
      for (const entry of reference.days.filter(day => day.initials === person.initials)) {
        await client.query('INSERT INTO holiday_board_days(user_id, day, portion) VALUES ($1, $2::date, $3) ON CONFLICT DO NOTHING', [person.id, entry.day, entry.portion]);
      }
    }
    await client.query('INSERT INTO holiday_board_imports(source_key) VALUES ($1)', [IMPORT_KEY]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally { client.release(); }
}
module.exports = { importHolidayReference };
