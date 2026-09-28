const express = require('express');
const pool = require('../db/pool');
function londonToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year:'numeric', month:'2-digit', day:'2-digit' }).format(now);
}
function dateRange(body) {
  const { start, end } = body;
  const valid = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!valid(start) || !valid(end) || start > end || +start.slice(0, 4) < 2000 || +end.slice(0, 4) > 2100 || (Date.parse(end) - Date.parse(start)) / 86400000 > 365) return null;
  const days = [];
  for (let t = Date.parse(start); t <= Date.parse(end); t += 86400000) {
    const d = new Date(t);
    if (!body.weekdaysOnly || (d.getUTCDay() !== 0 && d.getUTCDay() !== 6)) days.push(d.toISOString().slice(0, 10));
  }
  return days;
}
function createRouter(db = pool) {
  const router = express.Router();
  const route = (method, path, fn) => router[method](path, async (req, res, next) => { try { await fn(req, res); } catch (e) { next(e); } });
  route('get', '/api/holiday-board', async (req, res) => {
    const year = Number(req.query.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return res.status(400).json({ error: 'Choose a year from 2000 to 2100.' });
    const [users, members, days] = await Promise.all([
      db.query('SELECT id, first_name, last_name FROM hub_users ORDER BY first_name, last_name'),
      db.query('SELECT user_id, initials, colour FROM holiday_board_members ORDER BY user_id'),
      db.query("SELECT user_id, to_char(day, 'YYYY-MM-DD') AS day, portion FROM holiday_board_days WHERE day >= $1::date AND day < $2::date ORDER BY day, user_id", [`${year}-01-01`, `${year + 1}-01-01`]),
    ]);
    res.set('Cache-Control', 'no-store').json({ users: users.rows, members: members.rows, days: days.rows });
  });
  route('put', '/api/holiday-board/members/:id', async (req, res) => {
    const id = Number(req.params.id), initials = String(req.body.initials || '').trim().toUpperCase(), colour = req.body.colour;
    if (!Number.isSafeInteger(id) || id < 1 || !/^[A-Z0-9]{1,3}$/.test(initials) || !/^#[0-9a-f]{6}$/i.test(colour || '')) return res.status(400).json({ error: 'Choose a registered user, 1–3 letters or numbers, and a colour.' });
    const result = await db.query(`INSERT INTO holiday_board_members(user_id, initials, colour)
      SELECT id, $2, $3 FROM hub_users WHERE id = $1
      ON CONFLICT(user_id) DO UPDATE SET initials = EXCLUDED.initials, colour = EXCLUDED.colour, updated_at = NOW() RETURNING user_id`, [id, initials, colour]);
    if (!result.rowCount) return res.status(404).json({ error: 'Registered user not found.' });
    res.json({ ok: true });
  });
  route('post', '/api/holiday-board/days', async (req, res) => {
    const id = Number(req.body.userId), days = dateRange(req.body), portion = req.body.portion || 'full';
    if (!Number.isSafeInteger(id) || id < 1 || !days?.length || !['add', 'remove'].includes(req.body.action) || !['full', 'am', 'pm'].includes(portion)) return res.status(400).json({ error: 'Choose a board member and a valid date range of up to 366 days.' });
    if (req.body.start < londonToday()) return res.status(403).json({ error: 'Past holiday dates are locked. Only today and future dates can be changed.' });
    const member = await db.query('SELECT user_id FROM holiday_board_members WHERE user_id = $1', [id]);
    if (!member.rowCount) return res.status(404).json({ error: 'Add this user to the board first.' });
    if (req.body.action === 'remove') await db.query('DELETE FROM holiday_board_days WHERE user_id = $1 AND day = ANY($2::date[])', [id, days]);
    else await db.query('INSERT INTO holiday_board_days(user_id, day, created_by, portion) SELECT $1, unnest($2::date[]), $3, $4 ON CONFLICT(user_id, day) DO UPDATE SET portion = EXCLUDED.portion', [id, days, req.hubUser.id, portion]);
    res.json({ ok: true });
  });
  return router;
}
module.exports = { createRouter, dateRange, londonToday };
