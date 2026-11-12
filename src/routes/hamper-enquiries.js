const express=require('express');
const {submit,EnquiryError}=require('../services/hamperEnquiries');
const origins=new Set(['https://christmashampers.ultimatepromotions.co.uk','https://ultimatechristmas-production.up.railway.app']);
function createRouter(db,options={}){
 const router=express.Router();
 router.use((req,res,next)=>{res.set('Cache-Control','no-store');res.vary('Origin');if(!origins.has(req.get('origin')))return res.status(403).json({error:'Please use the contact form on our hamper website.'});res.set('Access-Control-Allow-Origin',req.get('origin'));res.set('Access-Control-Allow-Methods','POST, OPTIONS');res.set('Access-Control-Allow-Headers','Content-Type');if(req.method==='OPTIONS')return res.sendStatus(204);next();});
 router.use(express.json({limit:'16kb'}));
 router.post('/',async(req,res)=>{try{res.json(await submit(db,req.body,req.ip,options));}catch(e){res.status(e instanceof EnquiryError?e.status:503).json({error:e instanceof EnquiryError?e.message:'Enquiries are temporarily unavailable. Please call 01442 264288.'});}});
 router.use((err,req,res,next)=>res.status(err.type==='entity.too.large'?413:400).json({error:'Please check your message and try again.'}));
 return router;
}
module.exports={createRouter};
