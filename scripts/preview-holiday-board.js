// Isolated review server: reads registered names once; all edits stay in a local JSON file.
require('dotenv').config();
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { createRouter } = require('../src/routes/holiday-board');
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL, ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
  let users;
  try { users = (await pool.query('SELECT id, first_name, last_name FROM hub_users ORDER BY first_name, last_name')).rows; } finally { await pool.end(); }
  const file = path.resolve(process.env.HOLIDAY_PREVIEW_FILE || '/tmp/ultimate-holiday-preview.json');
  let state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { members: [], days: [] };
  const save = () => fs.writeFileSync(file, JSON.stringify(state, null, 2), { mode: 0o600 });
  if (!state.referenceImported) {
    const reference = require('../data/holiday-board/reference-2026.json');
    for (const person of reference.people) {
      const user = users.find(u => u.first_name === person.first_name && u.last_name === person.last_name);
      if (!user) throw new Error(`Registered reference user not found: ${person.initials}`);
      state.members = state.members.filter(m => Number(m.user_id) !== Number(user.id));
      state.members.push({ user_id: Number(user.id), initials: person.initials, colour: person.colour });
      for (const entry of reference.days.filter(d => d.initials === person.initials)) {
        state.days = state.days.filter(d => !(Number(d.user_id) === Number(user.id) && d.day === entry.day));
        state.days.push({ user_id: Number(user.id), day: entry.day, portion: entry.portion });
      }
    }
    state.referenceImported = true; save();
  }
  const db = { async query(sql, args = []) {
    let rows = [];
    if (sql.startsWith('SELECT id,')) rows = users;
    else if (sql.startsWith('SELECT user_id, initials')) rows = state.members;
    else if (sql.includes('to_char(day')) rows = state.days.filter(d => d.day >= args[0] && d.day < args[1]);
    else if (sql.startsWith('SELECT user_id FROM')) rows = state.members.filter(m => m.user_id === args[0]);
    else if (sql.startsWith('INSERT INTO holiday_board_members')) {
      if (users.some(u => Number(u.id) === args[0])) {
        state.members = state.members.filter(m => m.user_id !== args[0]);
        state.members.push({ user_id: args[0], initials: args[1], colour: args[2] }); rows = [{ user_id: args[0] }]; save();
      }
    } else if (sql.startsWith('INSERT INTO holiday_board_days')) {
      for (const day of args[1]) { state.days = state.days.filter(d => !(d.user_id === args[0] && d.day === day)); state.days.push({ user_id: args[0], day, portion: args[3] || 'full' }); } save();
    } else if (sql.startsWith('DELETE FROM holiday_board_days')) {
      state.days = state.days.filter(d => !(d.user_id === args[0] && args[1].includes(d.day))); save();
    } else throw new Error('Unsupported preview query');
    return { rows, rowCount: rows.length };
  } };
  const app = express(); app.use(express.json());
  app.get('/api/auth/me', (_req, res) => res.json({ user: { id: 0, first_name: 'Local', last_name: 'Preview', access_scope: 'full' } }));
  app.use((req, res, next) => { req.hubUser = { id: 0 }; const json = res.json.bind(res); res.json = value => json(value.users && value.members ? { ...value, preview: true } : value); next(); });
  app.use(createRouter(db));
  app.use('/api', (_req,res)=>res.status(404).json({error:'This preview only supports Holiday Board.'}));
  app.use(express.static(path.resolve(__dirname,'../public')));
  app.use((err,_req,res,_next)=>res.status(500).json({error:err.message}));
  app.listen(3107, '127.0.0.1', () => console.log(`Holiday preview http://127.0.0.1:3107/?tab=holiday-board (${users.length} registered users)`));
}
main().catch(e=>{console.error(e.message);process.exit(1);});
