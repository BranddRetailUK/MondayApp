const { Pool } = require('pg');
const { DATABASE_URL, PGSSLMODE } = require('../config/env');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
});

module.exports = pool;
