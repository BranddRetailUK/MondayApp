async function ensureHolidayTables(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS holiday_board_members (
    user_id INTEGER PRIMARY KEY REFERENCES hub_users(id) ON DELETE CASCADE,
    initials VARCHAR(3) NOT NULL, colour VARCHAR(7) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS holiday_board_days (
    user_id INTEGER NOT NULL REFERENCES holiday_board_members(user_id) ON DELETE CASCADE,
    day DATE NOT NULL, portion TEXT NOT NULL DEFAULT 'full' CHECK (portion IN ('full','am','pm')), created_by INTEGER REFERENCES hub_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(user_id, day)
  );
  CREATE TABLE IF NOT EXISTS holiday_board_imports (
    source_key TEXT PRIMARY KEY, imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS holiday_board_days_day_idx ON holiday_board_days(day);
  ALTER TABLE holiday_board_days ADD COLUMN IF NOT EXISTS portion TEXT NOT NULL DEFAULT 'full' CHECK (portion IN ('full','am','pm'));`);
}
module.exports = { ensureHolidayTables };
