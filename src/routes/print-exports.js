const express = require('express');
const crypto = require('node:crypto');
const service = require('../services/printExports');
const { requireHubFullApiAccess } = require('../middleware/hubAuth');
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function workerAuth(req, res, next) {
  const configured = process.env.PRINT_EXPORT_WORKER_TOKEN || '';
  const supplied = String(req.headers.authorization || '').replace(/^Bearer /, '');
  if (configured.length < 32 || !supplied || !crypto.timingSafeEqual(crypto.createHash('sha256').update(configured).digest(), crypto.createHash('sha256').update(supplied).digest())) {
    return res.status(401).json({ error: 'Worker authentication required' });
  }
  next();
}
function createRouter(pool) {
  const router = express.Router();
  const wrap = fn => async (req,res,next) => { try { await fn(req,res); } catch(e) { next(e); } };
  router.get('/api/print-exports/settings',requireHubFullApiAccess,wrap(async(req,res)=>{
    res.json({enabled:await service.enabled(pool),canToggle:service.canControl(req.hubUser)});
  }));
  router.put('/api/print-exports/settings',requireHubFullApiAccess,wrap(async(req,res)=>{
    if (!service.canControl(req.hubUser)) return res.status(403).json({error:'Production account required'});
    if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({error:'enabled must be a boolean'});
    res.json({enabled:await service.setEnabled(pool,req.body.enabled,req.hubUser),canToggle:true});
  }));
  router.post('/api/print-worker/claim' , workerAuth, wrap(async (req,res) => {
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(req.body.workerId || '')) return res.status(400).json({ error:'Invalid worker ID' });
    const task = await service.claim(pool,req.body.workerId);
    res.json({ enabled: await service.enabled(pool), task: task && { id:task.id, designNumber:task.design_number, sourceOrderId:task.source_order_id, claimToken:task.claim_token, attempt:task.attempt } });
  }));
  router.post('/api/print-exports/jobs/:id/run',requireHubFullApiAccess,wrap(async(req,res)=>{
    if(!service.canControl(req.hubUser))return res.status(403).json({error:'Production account required'});
    if(!/^[1-9]\d*$/.test(req.params.id)||Number(req.params.id)>2147483647)return res.status(400).json({error:'Invalid DATABASE job'});
    try{res.json({ok:true,...await service.requestManual(pool,Number(req.params.id),req.hubUser)});}
    catch(e){if(/Approve this|No eligible/.test(e.message))return res.status(409).json({error:e.message});throw e;}
  }));
  router.post('/api/print-worker/tasks/:id', workerAuth, wrap(async (req,res) => {
    const { claimToken, status, outputs = [] } = req.body;
    if (!uuid.test(req.params.id) || !uuid.test(claimToken || '') || !['processing','awaiting_review','exported','needs_attention'].includes(status)
      || !Array.isArray(outputs) || outputs.length>100 || outputs.some(x=>typeof x!=='string'||x.length>1000)) return res.status(400).json({ error:'Invalid result' });
    // Allow in-flight workers to finish even when new claims are disabled.
    res.json(await service.updateClaim(pool,req.params.id,claimToken,{ status,message:req.body.message,outputs }));
  }));
  router.get('/api/print-exports',requireHubFullApiAccess,wrap(async (_req,res) => {
    const jobs = await pool.query(`SELECT e.id,e.source_order_id,e.design_number,e.status,e.attempt,e.message,e.outputs,e.worker_id,e.updated_at,e.lease_until,
      j.order_no FROM print_export_jobs e LEFT JOIN database_jobs j USING(source_order_id)
      ORDER BY e.updated_at DESC LIMIT 200`);
    res.json({ enabled:await service.enabled(pool), jobs:jobs.rows });
  }));
  router.post('/api/print-exports/:id/retry',requireHubFullApiAccess,wrap(async(req,res)=>{
    if (!(await service.enabled(pool))) return res.status(409).json({error:'Print exports are disabled'});
    if (!uuid.test(req.params.id) || req.body.outputsReviewed !== true) return res.status(400).json({error:'Review existing outputs before retrying'});
    if (!(await service.retry(pool,req.params.id))) return res.status(409).json({error:'Task cannot be retried; check approval, references and active exports'});
    res.json({ok:true});
  }));
  return router;
}
module.exports = { createRouter, workerAuth };
