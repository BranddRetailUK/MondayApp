const express=require('express');
const {requireHubFullApiAccess}=require('../middleware/hubAuth');
const {workerAuth}=require('./print-exports');
const service=require('../services/designFolders');
function createRouter(pool){
  const router=express.Router();
  const wrap=fn=>async(req,res,next)=>{try{res.set('Cache-Control','no-store');await fn(req,res);}catch(error){next(error);}};
  router.post('/api/design-folders/open',requireHubFullApiAccess,wrap(async(req,res)=>{
    const number=String(req.body?.designNumber||'');
    if(!service.DESIGN.test(number))return res.status(400).json({error:'Invalid design number'});
    try{res.json(await service.request(pool,number));}catch(error){if(/worker/.test(error.message))return res.status(409).json({error:error.message});throw error;}
  }));
  router.get('/api/design-folders/requests/:id',requireHubFullApiAccess,wrap(async(req,res)=>{
    if(!service.UUID.test(req.params.id))return res.status(400).json({error:'Invalid request'});
    const result=await service.status(pool,req.params.id);res.status(result?200:404).json(result||{error:'Request not found'});
  }));
  router.post('/api/design-folder-worker/claim',workerAuth,wrap(async(req,res)=>{
    if(!/^[A-Za-z0-9._-]{1,80}$/.test(req.body?.workerId||''))return res.status(400).json({error:'Invalid worker ID'});
    res.json({task:await service.claim(pool,req.body.workerId)});
  }));
  router.post('/api/design-folder-worker/tasks/:id',workerAuth,wrap(async(req,res)=>{
    const body=req.body||{};
    if(!service.UUID.test(req.params.id)||!service.UUID.test(body.claimToken||'')||!['opened','error'].includes(body.status))return res.status(400).json({error:'Invalid result'});
    res.json({accepted:await service.report(pool,req.params.id,body.claimToken,body.status,String(body.message||'').slice(0,300))});
  }));
  return router;
}
module.exports={createRouter};
