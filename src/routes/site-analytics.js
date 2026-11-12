const express=require('express'),crypto=require('node:crypto');
const service=require('../services/siteAnalytics');
function createPublicRouter(db){
 const router=express.Router(),buckets=new Map(),salt=crypto.randomBytes(32);
 router.use((req,res,next)=>{
  const origin=req.get('Origin');if(!service.ORIGINS.has(origin))return res.sendStatus(403);
  res.set({'Access-Control-Allow-Origin':origin,'Vary':'Origin','Cache-Control':'no-store'});
  if(req.method==='OPTIONS')return res.set({'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Content-Type'}).sendStatus(204);
  const now=Date.now(),key=crypto.createHmac('sha256',salt).update(req.ip||'unknown').digest('hex');
  if(buckets.size>10000)buckets.clear();
  let entry=buckets.get(key);if(!entry||entry.until<now){entry={count:0,until:now+60000};buckets.set(key,entry);}if(++entry.count>180)return res.sendStatus(429);next();
 });
 router.post('/',express.text({type:['text/plain','application/json'],limit:'2kb'}),async(req,res)=>{
  let body;try{body=JSON.parse(req.body);}catch{return res.sendStatus(400);}
  const event=service.normalize(body,req.get('Origin'),req.get('User-Agent'));
  if(!event)return res.sendStatus(202);
  try{await service.record(db,event);res.sendStatus(202);}catch{res.sendStatus(503);}
 });
 return router;
}
function createAdminRouter(db){const router=express.Router();router.get('/',async(req,res,next)=>{const range=service.dateRange(req.query);if(!range)return res.status(400).json({error:'Choose valid dates covering up to 180 days, ending today or earlier.'});try{res.set('Cache-Control','no-store').json(await service.report(db,range));}catch(e){next(e);}});return router;}
module.exports={createPublicRouter,createAdminRouter};
