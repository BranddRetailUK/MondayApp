// Uses session-local temporary tables only; never migrates or edits live Hub tables.
require('dotenv').config();
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { ensureHolidayTables } = require('../src/db/holidaySchema');
const { importHolidayReference } = require('../src/db/holidayReference');
const { createRouter, londonToday } = require('../src/routes/holiday-board');
async function main() {
  const pool = new Pool({ connectionString:process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL, ssl:process.env.PGSSLMODE === 'disable' ? false : {rejectUnauthorized:false}, connectionTimeoutMillis:10000 });
  const client = await pool.connect();
  try {
    // No public schema in search_path: even an accidental missing temporary table fails closed.
    await client.query('SET search_path TO pg_temp');
    await client.query('CREATE TEMP TABLE hub_users (id INTEGER PRIMARY KEY, first_name TEXT, last_name TEXT)');
    await client.query("INSERT INTO hub_users VALUES (1,'Lubos','Svorad'), (2,'Scott','Charles')");
    const tempSchema = { query:sql=>client.query(sql.replaceAll('CREATE TABLE IF NOT EXISTS', 'CREATE TEMP TABLE IF NOT EXISTS')) };
    await ensureHolidayTables(tempSchema); await ensureHolidayTables(tempSchema);
    const db = { query:(...args)=>client.query(...args), connect:async()=>({query:(...args)=>client.query(...args),release(){}}) };
    await importHolidayReference(db);
    assert.equal((await client.query('SELECT COUNT(*)::int AS count FROM holiday_board_days')).rows[0].count,35);
    async function request(method,path,body,params={},query={}) {
      const handler=createRouter(db).stack.find(l=>l.route?.path===path).route.stack.find(l=>l.method===method).handle;
      const res={statusCode:200,status(n){this.statusCode=n;return this;},set(){return this;},json(v){this.body=v;return this;}};
      await handler({body,params,query,hubUser:{id:1}},res,e=>{throw e;});return res;
    }
    let result=await request('get','/api/holiday-board',null,{}, {year:'2026'});
    assert.equal(result.body.days.length,35);assert.equal(result.body.days.find(d=>d.day==='2026-01-30').portion,'am');
    const date=londonToday();
    for (const portion of ['full','am','pm']) {
      result=await request('post','/api/holiday-board/days',{userId:1,start:date,end:date,action:'add',portion});assert.equal(result.statusCode,200);
      assert.equal((await client.query('SELECT portion FROM holiday_board_days WHERE user_id=1 AND day=$1',[date])).rows[0].portion,portion);
    }
    await request('post','/api/holiday-board/days',{userId:1,start:date,end:date,action:'remove'});
    assert.equal((await client.query('SELECT 1 FROM holiday_board_days WHERE user_id=1 AND day=$1',[date])).rowCount,0);
    result=await request('post','/api/holiday-board/days',{userId:1,start:'2000-01-01',end:'2000-01-01',action:'add'});assert.equal(result.statusCode,403);
    await request('put','/api/holiday-board/members/:id',{initials:'L',colour:'#a78bfa'},{id:1});
    await client.query("DELETE FROM holiday_board_days WHERE user_id=1 AND day='2026-10-30'");
    await importHolidayReference(db);
    assert.equal((await client.query("SELECT 1 FROM holiday_board_days WHERE user_id=1 AND day='2026-10-30'")).rowCount,0);
    assert.equal((await client.query('SELECT colour FROM holiday_board_members WHERE user_id=1')).rows[0].colour,'#a78bfa');
    await client.query('DELETE FROM hub_users WHERE id=2');
    assert.equal((await client.query('SELECT 1 FROM holiday_board_days WHERE user_id=2')).rowCount,0);
    console.log('Postgres verification passed: idempotent schema/import, half days, date lock, removal, colour persistence and user deletion cascade. Only temporary tables used.');
  } finally { client.release(); await pool.end(); }
}
main().catch(err=>{console.error(err.message);process.exitCode=1;});
