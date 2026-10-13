const express=require('express');
const multer=require('multer');
const engine=require('../services/digitisingStudio');
function createRouter(){
  const router=express.Router();let busy=false;
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:1,fields:20,fieldSize:16384}}).single('artwork');
  router.get('/status',(_req,res)=>res.json({enabled:true,openai:!!process.env.OPENAI_API_KEY,presets:engine.PRESETS}));
  router.post(['/prepare','/generate'],(req,res)=>{
    if(busy)return res.status(429).json({error:'A design is processing. Try again shortly.'});
    busy=true;
    upload(req,res,async err=>{try{
      if(err)throw Error(err.code==='LIMIT_FILE_SIZE'?'Maximum artwork size is 8 MB.':'Invalid upload.');
      if(!req.file)throw Error('Choose PNG or SVG artwork.');
      const config=engine.settings(req.body),png=await engine.artwork(req.file.buffer);
      if(req.path==='/prepare'){
        const prepared=await engine.prepare(png,config);
        return res.json({elements:prepared.elements,heightMm:prepared.heightMm,png:png.toString('base64')});
      }
      if(config.garment==='cap')throw Error('Cap generation needs a separately validated centre-out strategy. Choose a flat garment for this test.');
      const measured=await engine.prepare(png,config);
      const review=await engine.assess(png,{...config,elements:measured.elements.map(el=>({...el,...config.elementOptions?.[el.id],excluded:config.elementOptions?.[el.id]?.type==='skip'}))});
      const result=await engine.generate(png,config);
      res.json({...result,review});
    }catch(error){res.status(400).json({error:error.name==='TimeoutError'?'OpenAI timed out. Retry.':error.message});}finally{busy=false;}});
  });
  return router;
}
module.exports={createRouter};
