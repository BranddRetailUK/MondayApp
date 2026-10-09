const {proofFileName}=require('../../tools/print-worker/proof-filename');
const express = require('express');
const multer = require('multer');
const path = require('path');
const { parseProofBrief } = require('../services/proofBriefParser');
const { enrichProofProducts } = require('../services/proofProductVisuals');
const { buildProof } = require('../services/proofPdfGenerator');
const { proofRuntimeStatus } = require('../services/proofRuntime');
const { ensureGeneratedViews } = require('../services/proofGeneratedViews');
const { randomUUID } = require('crypto');
const { searchProofProducts } = require('../services/proofPencarrieVisuals');
const {createService:designService,UUID}=require('../services/proofDesignJobs');

const { prepareBrief, recoverProductCodes, repairRetainedDimensions } = require('../services/proofLayout');

const PRODUCTION_EMAIL = 'production@ultimatepromotions.co.uk';

function isProofGeneratorUser(user) {
  return user?.access_scope !== 'dtf_only'
    && String(user?.email || '').trim().toLowerCase() === PRODUCTION_EMAIL;
}

function createRouter({ requireProduction = true, parse = parseProofBrief, enrich = enrichProofProducts, build = buildProof, status = proofRuntimeStatus, generateViews = ensureGeneratedViews, searchProducts = searchProofProducts, convertEps = require('../services/dtfCloudinary').createEpsPng, designs } = {}) {
  const router = express.Router();
  const designJobs=()=>designs || (designs=designService(require('../db/pool')));
  const upload = multer({ storage: multer.memoryStorage(), limits: { files: 40, fields: 2, parts: 42, fileSize: 10 * 1024 * 1024, fieldSize: 100 * 1024 } });
  let active = false;
  const uploadLanes={source:false,eps:false};
  const viewJobs = new Map();
  const allowed = (req, res) => {
    if (requireProduction && !isProofGeneratorUser(req.hubUser)) {
      res.status(req.hubUser ? 403 : 401).json({ error: 'Proof Generator access required.' });
      return false;
    }
    return true;
  };
  router.get('/designs',async(req,res)=>{
    if(!allowed(req,res))return;res.set('Cache-Control','no-store');
    const offset=String(req.query.offset||'0');
    if(!/^\d{1,7}$/.test(offset))return res.status(400).json({error:'Invalid history page.'});
    try{return res.json(await designJobs().list(Number(offset)));}
    catch(error){return res.status(503).json({error:'Could not load proof history.'});}
  });
  router.get('/designs/:id/preview',async(req,res)=>{
    if(!allowed(req,res))return;res.set('Cache-Control','no-store');
    try{const png=await designJobs().preview(req.params.id);if(!png)return res.status(404).end();return res.type('png').send(Buffer.from(png));}
    catch(error){return res.status(404).end();}
  });
  router.get('/designs/:id/source',async(req,res)=>{
    if(!allowed(req,res))return;res.set('Cache-Control','no-store');
    try{const data=await designJobs().source(req.params.id);if(!data)return res.status(404).json({error:'This older proof has no retained source. Reattach its artwork and request to regenerate.'});return res.json(data);}
    catch(error){return res.status(404).json({error:'Proof source is unavailable.'});}
  });
  router.get('/designs/:id/pdf',async(req,res)=>{
    if(!allowed(req,res))return;res.set('Cache-Control','no-store');
    try{
      const job=await designJobs().get(req.params.id),pdf=await designJobs().document(req.params.id);
      if(!pdf)return res.status(404).json({error:'This proof has no retained PDF. Regenerate it to create one.'});
      res.set('Content-Disposition',require('content-disposition')(proofFileName(job),{type:req.query.download==='1'?'attachment':'inline'}));
      return res.type('pdf').send(Buffer.from(pdf));
    }catch(error){return res.status(404).json({error:'Proof PDF is unavailable.'});}
  });
  router.post('/designs/:id/progress',async(req,res)=>{
    if(!allowed(req,res))return;res.set('Cache-Control','no-store');
    try{return res.json({design:await designJobs().progress(req.params.id,req.body)});}
    catch(error){return res.status(400).json({error:error.message});}
  });
  router.post('/designs',async(req,res)=>{
    if(!allowed(req,res))return;res.set('Cache-Control','no-store');
    if(!UUID.test(req.body?.id||''))return res.status(400).json({error:'Invalid proof ID.'});
    try{return res.json({design:await designJobs().reserve(req.body.id,req.body.customer,req.body.jobTitle,req.body.deferAllocation===true)});}
    catch(error){console.error('Proof design reservation:',error.message);return res.status(503).json({error:'Could not reserve the design folder. Please try again.'});}
  });
  router.get('/designs/:id',async(req,res)=>{
    if(!allowed(req,res))return;res.set('Cache-Control','no-store');
    try{return res.json({design:await designJobs().get(req.params.id)});}catch(error){return res.status(404).json({error:'Proof design not found.'});}
  });
  router.post('/designs/:id/retry',async(req,res)=>{
    if(!allowed(req,res))return;res.set('Cache-Control','no-store');
    try{return res.json({design:await designJobs().retry(req.params.id)});}catch(error){return res.status(400).json({error:error.message});}
  });
  // Reserve before accepting uploads; a cancelled client cannot release capacity
  // while its AI/render work is still running. Finally also releases failed jobs.
  const exclusive = (handler,lane='proof') => async (req, res, next) => {
    if (!allowed(req, res)) return;
    res.set('Cache-Control', 'no-store');
    if (lane==='proof'?active:uploadLanes[lane]) return res.set('Retry-After', '5').status(429).json({ error: 'Another proof is being prepared. Please try again shortly.' });
    if(lane==='proof')active=true;else uploadLanes[lane]=true;
    try { await handler(req, res); }
    catch (error) { next(error); }
    finally { if(lane==='proof')active=false;else uploadLanes[lane]=false; }
  };
  router.post('/designs/:id/source',exclusive(async(req,res)=>{
    await new Promise((resolve,reject)=>upload.array('artworks',20)(req,res,error=>error?reject(error):resolve()));
    try{await designJobs().saveSource(req.params.id,JSON.parse(req.body.brief||'{}'),req.files||[],JSON.parse(req.body.artworkDetails||'[]'));return res.json({ok:true});}
    catch(error){return res.status(400).json({error:error.message});}
  },'source'));
  router.post('/artwork/eps-preview',exclusive(async(req,res)=>{
    await new Promise((resolve,reject)=>upload.single('artwork')(req,res,error=>error?reject(error):resolve()));
    const file=req.file;
    const postscript=file?.buffer.subarray(0,4);
    if(!file||!/\.eps$/i.test(file.originalname)||!(postscript.toString().startsWith('%!PS')||postscript.equals(Buffer.from([0xc5,0xd0,0xd3,0xc6]))))return res.status(400).json({error:'Upload a valid EPS artwork file.'});
    try{
      const png=await convertEps(file.buffer,req.hubUser?.id||0);
      const {data,info}=await require('sharp')(png,{limitInputPixels:40_000_000}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      require('../services/proofArtwork').visibleBounds(data,info.width,info.height,'auto');
      const transparent=await require('sharp')(data,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer();
      return res.type('png').send(transparent);
    }catch(error){return res.status(422).json({error:'EPS preview conversion failed. '+error.message});}
  },'eps'));
  router.get('/products', async (req,res) => {
    if(!allowed(req,res))return;
    res.set('Cache-Control','no-store');
    const query=typeof req.query.q==='string'?req.query.q.trim():'';
    if(!/^[a-z0-9-]{2,24}$/i.test(query))return res.json({products:[]});
    try{return res.json({products:await searchProducts(query)});}
    catch(error){console.error('Proof catalogue search failed:',error.message);return res.status(503).json({error:'Catalogue search is unavailable. You can still type the product code in your request.'});}
  });
  router.get('/status', async (req, res, next) => {
    if (!allowed(req, res)) return;
    try {
      const readiness = await status();
      return res.set('Cache-Control', 'no-store').status(readiness.ready ? 200 : 503).json(readiness);
    } catch (error) { next(error); }
  });
  router.get('/renderer/:asset', (req, res) => {
    if (!allowed(req, res)) return;
    if (!['pdf.mjs', 'pdf.worker.mjs'].includes(req.params.asset)) return res.sendStatus(404);
    res.set('Cache-Control', 'no-store');
    return res.sendFile(path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'build', req.params.asset));
  });
  router.post('/views', (req, res) => {
    if (!allowed(req, res)) return;
    res.set('Cache-Control', 'no-store');
    if (active) return res.set('Retry-After','5').status(429).json({error:'Another proof is being prepared. Please try again shortly.'});
    const brief = req.body?.brief;
    if (!Array.isArray(brief?.products) || !brief.products.length || brief.products.length > 20) return res.status(400).json({error:'A proof needs 1-20 products.'});
    for(const [id,job] of viewJobs)if(Date.now()-job.createdAt>30*60*1000)viewJobs.delete(id);
    if(viewJobs.size>=100)return res.status(429).json({error:'Please try again later.'});
    const jobId=randomUUID();const job={state:'running',message:'Loading garment references…',completed:0,total:0,createdAt:Date.now()};
    viewJobs.set(jobId,job);active=true;
    res.status(202).json({jobId});
    Promise.resolve().then(async()=>{
      await enrich(brief);
      await generateViews(brief,{allowGenerate:true,onProgress:progress=>Object.assign(job,progress)});
      job.brief=brief;job.state='complete';
    }).catch(error=>{job.state='failed';job.error=error.message;console.error('Proof garment views failed:',error.message);})
      .finally(()=>{active=false;});
  });
  router.get('/views/:jobId', (req,res)=>{
    if(!allowed(req,res))return;
    res.set('Cache-Control','no-store');
    const job=viewJobs.get(req.params.jobId);
    if(!job)return res.status(404).json({error:'The garment-view task is no longer available. Create the proof again.'});
    return res.json(job);
  });
  router.post('/parse', exclusive(async (req, res) => {
    try {
      let artworkImages = [];
      if (req.is('multipart/form-data')) {
        await new Promise((resolve,reject)=>upload.array('artworks',20)(req,res,error=>error?reject(error):resolve()));
        req.body = JSON.parse(req.body.brief || '{}');
        if (!Array.isArray(req.body.artworks) || req.body.artworks.length !== req.files.length) throw new Error('Artwork details do not match uploaded files.');
        if (req.files.reduce((n,f)=>n+f.size,0)>50*1024*1024) throw new Error('Artwork uploads exceed 50 MB.');
        const {PDFDocument} = require('pdf-lib');
        const {prepareArtwork} = require('../services/proofArtwork');
        const pdf = await PDFDocument.create();
        for (const [index,file] of req.files.entries()) {
          const asset = await prepareArtwork(pdf,{file,backgroundMode:'auto'});
          const png = await require('sharp')(Buffer.from(asset.preview.split(',')[1],'base64')).resize({width:768,height:768,fit:'inside',withoutEnlargement:true}).png().toBuffer();
          artworkImages.push({id:req.body.artworks[index].id,url:`data:image/png;base64,${png.toString('base64')}`});
        }
      }
      const brief = await parse(req.body, {artworkImages});
      if(String(req.body.customer||'').trim())brief.customer=String(req.body.customer).trim().slice(0,200);
      if(String(req.body.jobTitle||'').trim())brief.jobTitle=String(req.body.jobTitle).trim().slice(0,200);
      recoverProductCodes(brief, req.body);
      await enrich(brief);
      return res.json({ brief: prepareBrief(brief, req.body) });
    } catch (err) {
      if (/^Enter a request|^Special instructions|^Add no more|^Answer no more/.test(err.message)) {
        return res.status(400).json({ error: err.message });
      }
      console.error('Proof Generator parsing failed:', err.message);
      return res.status(502).json({ error: err.message || 'Could not review the proof brief.' });
    }
  }));
  router.post(['/create', '/preview', '/save'], exclusive(async (req, res) => {
    await new Promise((resolve, reject) => upload.fields([{name:'artworks',maxCount:20},...(req.path==='/save'?[{name:'originalArtworks',maxCount:20}]:[])])(req, res, error => error ? reject(error) : resolve()));
    const originals=req.files?.originalArtworks;
    req.files=req.files?.artworks||[];
    try {
      const brief = JSON.parse(req.body.brief || '{}');
      const details = JSON.parse(req.body.artworkDetails || '[]');
      if (!Array.isArray(brief?.products) || !brief.products.length || brief.products.length > 20) {
        return res.status(400).json({ error: 'A proof needs 1-20 products.' });
      }
      let design;
      if(brief.proofDesignId){design=await designJobs().get(brief.proofDesignId);if(!design.designNumber||!design.folderName)throw new Error('The design folder is still being prepared.');brief.reference=design.designNumber;}
      if(req.path==='/save'&&!design)throw new Error('Reserve a design folder before saving.');
      if (!Array.isArray(details) || details.length !== (req.files || []).length) {
        return res.status(400).json({ error: 'Artwork details do not match uploaded files.' });
      }
      if(originals){
        if(originals.length!==details.length)throw new Error('Original artwork files do not match uploaded details.');
        originals.forEach((file,index)=>{
          // JSON retains Unicode exactly; multipart filename parameters may decode as Latin-1.
          if(typeof details[index]?.originalName==='string')file.originalname=details[index].originalName;
        });
      }
      const artworks = (req.files || []).map((file, index) => ({ file,
        id: String(details[index]?.id || '').slice(0, 100),
        backgroundMode: String(details[index]?.backgroundMode || 'auto'),
        assignment: String(details[index]?.assignment || '').slice(0, 500),
        notes: String(details[index]?.notes || '').slice(0, 1000) }));
      const supported = artworks.every(({ file }) => /\.(png|jpe?g|webp|pdf)$/i.test(file.originalname) || file.buffer.subarray(0, 4).toString() === '%PDF');
      if (!supported) return res.status(400).json({ error: 'Artwork must be prepared as PNG, JPG, WebP or a single-page PDF before proof creation.' });
      // Reuse the saved supplier selection when reopening an unchanged product.
      // Only server-retained visuals are trusted; changed products are resolved normally.
      const retained=design&&designJobs().source?await designJobs().source(design.id):null;
      const savedProducts=retained?.source?.brief?.products||[];
      repairRetainedDimensions(brief,retained?.source);
      await enrich(brief);
      for(const product of brief.products){
        const saved=savedProducts.find(item=>item.code===product.code&&item.colour===product.colour&&item.supplier===product.supplier);
        if(saved?.visual?.matched)product.visual=saved.visual;
      }
      await generateViews(brief, { allowGenerate: false });
      const productIndex=req.query.productIndex;
      if(productIndex!==undefined && (typeof productIndex!=='string'||!/^\d+$/.test(productIndex)||Number(productIndex)>=brief.products.length))return res.status(400).json({error:'Choose a valid product PDF.'});
      const { bytes, documents = [], pages, issues } = await build(brief, artworks, { strict: req.path !== '/preview', ...(design&&designJobs().garmentLoader?{garmentLoader:await designJobs().garmentLoader(design.id)}:{}) });
      if(req.path==='/save')return res.json({design:await designJobs().queueSave(design.id,brief.proofSaveKey,brief.proofRevision,bytes,brief,originals||req.files)});
      if(design&&req.path==='/preview')await designJobs().setPreview(design.id,bytes,brief,!issues.some(issue=>issue.blocking));
      if (req.path === '/preview') return res.json({ pdf: bytes.toString('base64'), fileName:proofFileName(brief), documents:documents.map(({bytes,...metadata})=>metadata), pages, issues, brief });
      const selected=productIndex===undefined?null:documents.find(document=>document.productIndex===Number(productIndex));
      if(productIndex!==undefined&&!selected)return res.status(422).json({error:'The product PDF is unavailable. Create the proof again.'});
      res.set('Content-Type', 'application/pdf');
      res.set('Content-Disposition', require('content-disposition')(proofFileName(brief), {type:'inline'}));
      return res.send(selected?selected.bytes:bytes);
    } catch (error) {
      console.error('Proof Generator PDF creation failed:', error.message);
      return res.status(422).json({ error: error.message || 'Could not create the proof PDF.', issues: error.issues || [] });
    }
  }));
  router.use((error, _req, res, next) => {
    if (error instanceof multer.MulterError) return res.status(400).json({ error: 'Upload up to 20 artwork files, at most 10 MB each, with a brief under 100 KB.' });
    next(error);
  });
  return router;
}

module.exports = { createRouter, isProofGeneratorUser };
