const express=require('express');
const multer=require('multer');
const engine=require('../services/digitisingStudio');
const {plan}=require('../services/digitisingAuto');
function createRouter(options={}){
  const router=express.Router();let busy=false;
  router.use(require('../services/digitisingAccess').requireStudioUser);
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:1,fields:20,fieldSize:16384}}).single('artwork');
  router.get('/status',(_req,res)=>res.json({enabled:true,openai:!!process.env.OPENAI_API_KEY,presets:engine.PRESETS}));
  // Explicit experimental tooling; automatic customer output remains on the
  // existing generator until object-planning quality is validated.
  router.post('/compile-project',express.json({limit:'1mb'}),(req,res)=>{
    if(busy)return res.status(429).json({error:'A design is processing. Try again shortly.'});
    busy=true;
    try{res.json(require('../services/digitisingCompiler').compile(req.body));}
    catch(error){res.status(400).json({error:error.message});}finally{busy=false;}
  });
  router.post(['/prepare','/generate','/project'],(req,res)=>{
    if(busy)return res.status(429).json({error:'A design is processing. Try again shortly.'});
    busy=true;
    upload(req,res,async err=>{try{
      if(err)throw Error(err.code==='LIMIT_FILE_SIZE'?'Maximum artwork size is 8 MB.':'Invalid upload.');
      if(!req.file)throw Error('Choose PNG, EPS or SVG artwork.');
      if(req.body.psgNumber)throw Error('This job already has a PSG reference. Use its existing embroidery file.');
      const {config,png,interpretation,preview}=await plan(req.file.buffer,req.body,{...options,interpret:req.path!=='/prepare'});
      if(req.path==='/project')return res.json({...await require('../services/digitisingObjectPlan').propose(png,config,{...options,interpret:true}),interpretation});
      if(req.path==='/prepare'){
        const prepared=await engine.prepare(png,config);
        return res.json({elements:prepared.elements,widthMm:config.widthMm,heightMm:prepared.heightMm,png:preview.toString('base64')});
      }
      if(config.garment==='cap')throw Error('Cap generation needs a separately validated centre-out strategy. Choose a flat garment for this test.');
      const result=await engine.generate(png,config);
      res.json({...result,interpretation});
    }catch(error){res.status(400).json({error:error.name==='TimeoutError'?'OpenAI timed out. Retry.':error.message});}finally{busy=false;}});
  });
  return router;
}
module.exports={createRouter};
