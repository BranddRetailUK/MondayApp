const express = require('express');
const { groupInput, list, CUSTOMERS_SQL } = require('../services/customerGroups');
function createRouter(db) {
  const router = express.Router();
  router.use((_req,res,next) => { res.set('Cache-Control','no-store'); next(); });
  const route = fn => async (req,res,next) => {
    try { await fn(req,res); } catch (e) {
      if (e.code === '23505') return res.status(409).json({error:'A group with that title already exists.'});
      if (e.code === '23503') return res.status(404).json({error:'This group no longer exists. Refresh the page.'});
      next(e);
    }
  };
  router.get('/',route(async (_req,res) => res.json(await list(db))));
  router.post('/groups',route(async (req,res) => {
    const value=groupInput(req.body);
    if (!value) return res.status(400).json({error:'Enter a title (up to 100 characters) and description (up to 2,000 characters).'});
    const result=await db.query('INSERT INTO hub_customer_groups(title,description) VALUES($1,$2) RETURNING *',[value.title,value.description]);
    res.status(201).json(result.rows[0]);
  }));
  router.param('id',(req,res,next,id) => /^\d+$/.test(id) && Number(id)>0 && Number(id)<=2147483647 ? next() : res.status(400).json({error:'Invalid group.'}));
  router.put('/groups/:id',route(async (req,res) => {
    const value=groupInput(req.body);
    if (!value) return res.status(400).json({error:'Enter a title (up to 100 characters) and description (up to 2,000 characters).'});
    const result=await db.query('UPDATE hub_customer_groups SET title=$2,description=$3,updated_at=NOW() WHERE id=$1 RETURNING *',[req.params.id,value.title,value.description]);
    if (!result.rowCount) return res.status(404).json({error:'Group not found.'});
    res.json(result.rows[0]);
  }));
  router.delete('/groups/:id',route(async (req,res) => {
    await db.query('DELETE FROM hub_customer_groups WHERE id=$1',[req.params.id]);
    res.json({ok:true});
  }));
  router.put('/groups/:id/member',route(async (req,res) => {
    const {key,selected}=req.body || {};
    if (typeof key!=='string' || key.length>2000 || typeof selected!=='boolean') return res.status(400).json({error:'Invalid customer assignment.'});
    const customer=(await db.query(`SELECT key,aliases FROM (${CUSTOMERS_SQL}) customers WHERE key=$1`,[key])).rows[0];
    if (!customer) return res.status(404).json({error:'Customer not found. Refresh the page.'});
    if (selected) await db.query('INSERT INTO hub_customer_group_members(group_id,customer_key) VALUES($1,$2) ON CONFLICT DO NOTHING',[req.params.id,key]);
    else await db.query('DELETE FROM hub_customer_group_members WHERE group_id=$1 AND customer_key=ANY($2::text[])',[req.params.id,customer.aliases]);
    res.json({ok:true});
  }));
  return router;
}
module.exports={createRouter};
