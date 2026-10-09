const express=require('express');
const {workerAuth}=require('./print-exports');
const {createService,UUID}=require('../services/proofDesignJobs');
function createRouter(pool){
  const router=express.Router(),service=createService(pool);
  router.use(workerAuth);
  router.post('/claim',async(req,res,next)=>{
    if(!/^[A-Za-z0-9._-]{1,80}$/.test(req.body?.workerId||''))return res.status(400).json({error:'Invalid worker ID'});
    if(req.body.proofFilesVersion!==4)return res.json({task:null,message:'Update the print worker to 1.21 for proof file saving.'});
    try{res.set('Cache-Control','no-store').json({task:await service.claim(req.body.workerId)});}catch(error){next(error);}
  });
  router.post('/tasks/:id',async(req,res,next)=>{
    if(!UUID.test(req.params.id)||!UUID.test(req.body?.claimToken||''))return res.status(400).json({error:'Invalid worker claim'});
    try{const result=await service.report(req.params.id,req.body.claimToken,req.body);
      if(result.accepted && req.body.status==='saved'){
        try{await require('../services/proofJobLinks').createService(pool).sync(req.params.id);}catch(error){console.error('Proof visual publication pending:',error.message);}
      }
      res.json(result);}catch(error){next(error);}
  });
  return router;
}
module.exports={createRouter};
