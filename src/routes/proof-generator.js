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
const { searchRalawiseProducts } = require('../services/proofRalawiseVisuals');
const {createService:designService,UUID}=require('../services/proofDesignJobs');

const { prepareBrief, recoverProductCodes } = require('../services/proofLayout');

const PRODUCTION_EMAIL = 'production@ultimatepromotions.co.uk';

function isProofGeneratorUser(user) {
  return user?.access_scope !== 'dtf_only'
    && String(user?.email || '').trim().toLowerCase() === PRODUCTION_EMAIL;
}

function createRouter({ requireProduction = true, parse = parseProofBrief, enrich = enrichProofProducts, build = buildProof, status = proofRuntimeStatus, generateViews = ensureGeneratedViews, searchProducts = searchRalawiseProducts, designs } = {}) {
  const router = express.Router();
  const designJobs=()=>designs || (designs=designService(require('../db/pool')));
  const upload = multer({ storage: multer.memoryStorage(), limits: { files: 40, fields: 2, parts: 42, fileSize: 10 * 1024 * 1024, fieldSize: 100 * 1024 } });
  let active = false;
  const viewJobs = new Map();
  const allowed = (req, res) => {
    if (requireProduction && !isProofGeneratorUser(req.hubUser)) {
      res.status(req.hubUser ? 403 : 401).json({ error: 'Proof Generator access required.' });
      return false;
    }
    return true;
  };
  router.post('/designs',async(req,res)=>{
    if(!allowed(req,res))return;res.set('Cache-Control','no-store');
    if(!UUID.test(req.body?.id||''))return res.status(400).json({error:'Invalid proof ID.'});
    try{return res.json({design:await designJobs().reserve(req.body.id,req.body.customer,req.body.jobTitle)});}
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
  const exclusive = handler => async (req, res, next) => {
    if (!allowed(req, res)) return;
    res.set('Cache-Control', 'no-store');
    if (active) return res.set('Retry-After', '5').status(429).json({ error: 'Another proof is being prepared. Please try again shortly.' });
    active = true;
    try { await handler(req, res); }
    catch (error) { next(error); }
    finally { active = false; }
  };
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
      const brief = await parse(req.body);
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
      if (!supported) return res.status(400).json({ error: 'For proof creation, upload PNG, JPG, or PDF artwork. SVG, EPS, and AI files need a PNG or PDF copy.' });
      await enrich(brief);
      await generateViews(brief, { allowGenerate: false });
      const productIndex=req.query.productIndex;
      if(productIndex!==undefined && (typeof productIndex!=='string'||!/^\d+$/.test(productIndex)||Number(productIndex)>=brief.products.length))return res.status(400).json({error:'Choose a valid product PDF.'});
      const { bytes, documents = [], pages, issues } = await build(brief, artworks, { strict: req.path !== '/preview' });
      if(req.path==='/save')return res.json({design:await designJobs().queueSave(design.id,brief.proofSaveKey,brief.proofRevision,bytes,brief,originals||req.files)});
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
