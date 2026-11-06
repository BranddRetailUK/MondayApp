const express=require('express');
const push=require('../services/hubPush');
function createRouter(pool) {
  const router=express.Router();
  router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  router.use((req,res,next)=>{
    if(req.method!=='GET' && req.get('origin') !== `${req.protocol}://${req.get('host')}`) return res.status(403).json({error:'Open notifications from Ultimate Hub.'});
    next();
  });
  const action=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(error){next(error);}};
  router.get('/config',action(async(req,res)=>{
    res.json(push.configuration());
  }));
  router.post('/device',action(async(req,res)=>{
    const row=(await pool.query('SELECT preferences FROM hub_push_subscriptions WHERE endpoint=$1 AND user_id=$2 AND session_id=$3',[String(req.body.endpoint||''),req.hubUser.id,push.sessionId(req)])).rows[0];
    res.json({enabled:!!row,preferences:row?.preferences});
  }));
  router.post('/subscribe',action(async(req,res)=>{
    if(!push.configuration().enabled)return res.status(503).json({error:'Notifications are not configured yet.'});
    let subscription,preferences;
    try{subscription=push.validateSubscription(req.body.subscription);preferences=push.validatePreferences(req.body.preferences);}catch(e){return res.status(400).json({error:e.message});}
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      const session=await db.query('SELECT id FROM hub_sessions WHERE id=$1 AND user_id=$2 AND expires_at>now() FOR SHARE',[push.sessionId(req),req.hubUser.id]);
      if(!session.rowCount){await db.query('ROLLBACK');return res.status(401).json({error:'Please sign in again.'});}
      await db.query(`INSERT INTO hub_push_subscriptions(endpoint,user_id,session_id,subscription,preferences) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(endpoint) DO UPDATE SET user_id=EXCLUDED.user_id,session_id=EXCLUDED.session_id,
        subscription=EXCLUDED.subscription,preferences=EXCLUDED.preferences,updated_at=now()`,[subscription.endpoint,req.hubUser.id,push.sessionId(req),subscription,preferences]);
      await db.query('DELETE FROM hub_push_deliveries WHERE endpoint=$1',[subscription.endpoint]);
      await db.query('COMMIT');res.json({enabled:true});
    }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  }));
  router.post('/unsubscribe',action(async(req,res)=>{
    await pool.query('DELETE FROM hub_push_subscriptions WHERE endpoint=$1 AND user_id=$2',[String(req.body.endpoint||''),req.hubUser.id]);res.json({enabled:false});
  }));
  router.post('/test',action(async(req,res)=>{
    const result=await pool.query(`WITH device AS (UPDATE hub_push_subscriptions SET last_test_at=now()
      WHERE endpoint=$1 AND user_id=$2 AND session_id=$3 AND (last_test_at IS NULL OR last_test_at<now()-interval '1 minute') RETURNING endpoint)
      INSERT INTO hub_push_deliveries(endpoint,kind,event_key) SELECT endpoint,'test',$4 FROM device RETURNING id`,
      [String(req.body.endpoint||''),req.hubUser.id,push.sessionId(req),`test:${require('crypto').randomUUID()}`]);
    if(!result.rowCount)return res.status(429).json({error:'Enable notifications first, or wait one minute before testing again.'});
    res.json({queued:true});
  }));
  return router;
}
module.exports={createRouter};
