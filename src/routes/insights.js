const express = require('express');
const { requireHubFullApiAccess } = require('../middleware/hubAuth');
const { createSnapshotLoader, buildCustomers, selectCustomers, todayLondon, customerNoteKey } = require('../services/customerInsights');
const { attachNotes, saveNoteDocument } = require('../services/customerInsightNotes');
function createRouter(pool = require('../db/pool'), load = createSnapshotLoader(pool)) {
  const router = express.Router();
  router.get('/api/insights/customers', requireHubFullApiAccess, async (req,res,next) => {
    const { years='3', preset='contact', search='', page='1', fromYear, toYear, jobType='all' } = req.query;
    const currentYear=Number(todayLondon().slice(0,4));
    const validYear=y=>typeof y==='string'&&/^\d{4}$/.test(y)&&Number(y)>=2000&&Number(y)<=currentYear;
    if (!['1','2','3','5'].includes(years) || !['contact','value','orders','lapsed','dormant','all'].includes(preset) || typeof search !== 'string' || search.length > 200 || typeof page !== 'string' || !/^\d{1,6}$/.test(page) || Number(page)<1 || !['all','print','embroidery','combined','gifts'].includes(jobType) || ((fromYear!==undefined||toYear!==undefined)&&(!validYear(fromYear)||!validYear(toYear)||Number(fromYear)>Number(toYear)))) {
      return res.status(400).json({error:'Choose a valid year range, job type and preset.'});
    }
    try {
      const result = buildCustomers(await load(), {years:Number(years),fromYear:fromYear?Number(fromYear):undefined,toYear:toYear?Number(toYear):undefined,jobType});
      res.set('Cache-Control','no-store');
      res.json(await attachNotes(pool,selectCustomers(result,{preset,search,page:Number(page)})));
    } catch(error) { next(error); }
  });
  router.post('/api/insights/notes', requireHubFullApiAccess, async(req,res,next)=>{
    const {sourceOrderId,body,requestId}=req.body||{};
    if (!Number.isSafeInteger(sourceOrderId)||sourceOrderId<1||typeof body!=='string'||!body.trim()||body.trim().length>4000||typeof requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId))return res.status(400).json({error:'Enter a note of 1–4,000 characters for a valid customer order.'});
    return res.status(409).json({error:'Sales notes now use one editable field. Copy your draft, then refresh Insights before saving.'});
  });
  router.put('/api/insights/notes', requireHubFullApiAccess, async(req,res,next)=>{
    const {sourceOrderId,body,version,documentKey}=req.body||{};
    if(!Number.isSafeInteger(sourceOrderId)||sourceOrderId<1||typeof body!=='string'||body.length>20000||!Number.isSafeInteger(version)||version<0||(documentKey!=null&&typeof documentKey!=='string'))return res.status(400).json({error:'Enter valid sales notes (up to 20,000 characters).'});
    try{
      const snapshot=await load(),job=snapshot.jobs.find(j=>Number(j.source_order_id)===sourceOrderId);
      if(!job)return res.status(404).json({error:'Customer order not found.'});
      const today=todayLondon(),all=buildCustomers(snapshot,{fromYear:2000,toYear:Number(today.slice(0,4)),today});
      const customer=all.customers.find(c=>c.noteKeys.includes(customerNoteKey(job)));
      if(!customer)return res.status(400).json({error:'This customer is not available in Insights.'});
      const result=await saveNoteDocument(pool,{noteKeys:customer.noteKeys,body,version,documentKey,user:req.hubUser});
      res.set('Cache-Control','no-store');res.status(result.status).json(result.error?{error:result.error}:{salesNote:result.salesNote});
    }catch(error){next(error);}
  });
  return router;
}
module.exports = { createRouter };
