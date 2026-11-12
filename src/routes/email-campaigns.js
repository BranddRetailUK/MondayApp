const express = require('express');
const service = require('../services/emailCampaigns');
function webhook(db, env = process.env) {
  return async (req,res,next) => {
    if (!env.SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY) return res.status(503).json({ error:'Campaign tracking is not configured.' });
    if (!service.verifySignature(req.body,req.get('X-Twilio-Email-Event-Webhook-Signature'),req.get('X-Twilio-Email-Event-Webhook-Timestamp'),env.SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY)) return res.sendStatus(401);
    let events;
    try { events = JSON.parse(req.body.toString('utf8')); } catch { return res.sendStatus(400); }
    if (!Array.isArray(events) || events.length > 1000 || events.some(e=>!e || typeof e !== 'object')) return res.sendStatus(400);
    try { await service.recordEvents(db, events); res.sendStatus(204); } catch(e) { next(e); }
  };
}
function createRouter(db, env = process.env) {
  const router = express.Router();
  router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  router.get('/',async(_req,res,next)=>{
    try { res.json({ ...await service.overview(db), trackingConfigured: Boolean(env.SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY) }); } catch(e) { next(e); }
  });
  router.get('/suppressions',async(req,res,next)=>{
    const kind = req.query.kind || 'unsubscribed';
    if (!['unsubscribed','invalid','undeliverable','complaint'].includes(kind)) return res.status(400).json({error:'Choose a valid list.'});
    const page = Math.max(0,Math.min(100000,parseInt(req.query.page,10)||0));
    const search = String(req.query.search || '').slice(0,200);
    try {
      const args = [kind,search];
      const where = "kind=$1 AND ($2='' OR strpos(email,lower($2))>0)";
      const count = await db.query(`SELECT COUNT(*)::int AS total FROM hub_email_suppressions WHERE ${where}`,args);
      const rows = await db.query(`SELECT email,kind,reason,source,occurred_at FROM hub_email_suppressions WHERE ${where} ORDER BY occurred_at DESC,email LIMIT 50 OFFSET $3`,[...args,page*50]);
      res.json({rows:rows.rows,total:count.rows[0].total,page});
    } catch(e) { next(e); }
  });
  return router;
}
module.exports = { webhook, createRouter };
