const express=require('express');
const multer=require('multer');
const engine=require('../services/digitisingStudio');
const {plan}=require('../services/digitisingAuto');
function createRouter(options={}){
  const router=express.Router();let busy=false;
  router.use(require('../services/digitisingAccess').requireStudioUser);
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:1,fields:20,fieldSize:16384}}).single('artwork');
  router.get('/status',(_req,res)=>res.json({enabled:true,openai:!!process.env.OPENAI_API_KEY,presets:engine.PRESETS}));
  router.get('/jobs',async(req,res)=>{
    const offset=Number(req.query.offset||0);
    if(!Number.isSafeInteger(offset)||offset<0)return res.status(400).json({error:'Invalid history offset.'});
    try{res.json(options.history?await options.history.list(offset):{jobs:[],hasMore:false});}
    catch{res.status(503).json({error:'Unable to load previous files. Please retry.'});}
  });
  router.get('/jobs/:id/:file',async(req,res)=>{
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)||!['download','preview'].includes(req.params.file))return res.sendStatus(404);
    try{
      const preview=req.params.file==='preview';
      const file=options.history&&await options.history.file(req.params.id,preview);
      if(!file)return res.sendStatus(404);
      res.set('Cache-Control','private, no-store');
      if(preview)res.type('png');else res.attachment(file.filename).type('application/octet-stream');
      res.send(file.bytes);
    }catch{res.status(503).json({error:'Unable to load this file. Please retry.'});}
  });
  // Use validated object construction for Create; an explicit server false
  // retains the legacy rollback. Request fields cannot choose the engine.
  const objectPipeline=options.objectPipeline??(process.env.DIGITISING_OBJECT_PIPELINE!=='false');
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
      const result=objectPipeline
        ?await require('../services/digitisingObjectGenerate').generate(png,config,options)
        :await engine.generate(png,config);
      let historyId=null,historyError=null;
      if(options.history){
        try{historyId=await options.history.save({filename:req.file.originalname,garment:config.garment,result,preview});}
        catch{historyError='Your DST is ready but could not be saved to previous files. Download it now before leaving this page.';}
      }
      res.json({...result,interpretation,historyId,historyError});
    }catch(error){res.status(400).json({error:error.name==='TimeoutError'?'OpenAI timed out. Retry.':error.message});}finally{busy=false;}});
  });
  return router;
}
module.exports={createRouter};
