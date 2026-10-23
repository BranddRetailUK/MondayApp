// Isolated visual approval fixture: fictional records, no database or live writes.
const express=require('express');
const fs=require('fs');
const path=require('path');
const app=express(),publicDir=path.join(__dirname,'../public');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><rect width="600" height="600" fill="#edf0f3"/><path d="M200 100L120 145 65 260 160 300 185 250 185 515 415 515 415 250 440 300 535 260 480 145 400 100Q300 155 200 100Z" fill="#29394d" stroke="#142336" stroke-width="4"/><path d="M250 112Q300 175 350 112" fill="none" stroke="#41526a" stroke-width="12"/><text x="333" y="240" fill="#b8d9f6" font-family="sans-serif" font-size="18" text-anchor="middle">NORTH</text><text x="333" y="258" fill="#b8d9f6" font-family="sans-serif" font-size="12" text-anchor="middle">STUDIO</text></svg>`;
const image='data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64');
const brief={customer:'North Studio',jobTitle:'Team polos',products:[{code:'RX101',name:'Classic polo',colour:'Navy',method:'Transfer print',decorations:[]}]};
const rows=[{id:'loading-demo',customer:'North Studio',jobTitle:'Team polos',designNumber:'30218',status:'allocated',generationStatus:'generating',generationMessage:'Preparing garment views…'}, {id:'saved-demo',customer:'Fieldwork Co.',jobTitle:'Crew uniform',designNumber:'30217',status:'saved'}].map(row=>({...row,revision:1,createdAt:'2026-10-23T10:00:00Z',hasPreview:true,hasPdf:true,hasSource:true,linkedOrders:[]}));
app.get('/',(_req,res)=>{
 let html=fs.readFileSync(path.join(__dirname,'proof-generator-preview.html'),'utf8').replace('class="proof-preview"','class="proof-loading-preview"').replace('Production preview','Local approval preview').replace('<script src="proof-display.js"',`<script>window.ultimateHubUser={email:'melvyn@ultimatepromotions.co.uk',access_scope:'full'};window.ultimateHubUserPromise=Promise.resolve(window.ultimateHubUser);window.ProofLinks={refresh(){},picker:async()=>null};window.openDesignFolder=()=>{};</script><script src="proof-display.js"`);
 html=html.replace('<main class="main-content">','<main class="main-content"><div style="padding:14px 20px;background:#203145;border:1px solid #527ca3;border-radius:10px;margin-bottom:22px;color:#d8eaff;font:14px system-ui">LOCAL PREVIEW · Fictional jobs. North Studio shows the sweep. Open Regenerate proof on Fieldwork Co. to preview the loader; placement views appear after 6 seconds.</div>');
 res.type('html').send(html);
});
app.get('/api/proof-generator/designs',(_req,res)=>res.json({designs:rows,nextOffset:null}));
app.get('/api/proof-generator/designs/:id/preview',(_req,res)=>res.type('svg').send(svg));
app.get('/api/proof-generator/designs/:id/source',(_req,res)=>res.json({source:{customer:'Fieldwork Co.',jobTitle:'Crew uniform',request:'Navy polo, front view',brief},artworks:[]}));
app.get('/api/proof-generator/link-jobs',(_req,res)=>res.json({jobs:[]}));
app.post('/api/proof-generator/placement-preview',(_req,res)=>setTimeout(()=>res.json({brief,pages:[{productIndex:0,view:'front',image,width:600,height:600,placements:[]},{productIndex:0,view:'back',image,width:600,height:600,placements:[]}],issues:[]}),6000));
app.use('/api',(_req,res)=>res.status(403).json({error:'This local preview does not write or access production.'}));
app.use(express.static(publicDir,{index:false}));
const host=process.env.PROOF_PREVIEW_HOST||'127.0.0.1';
app.listen(3119,host,()=>console.log(`Proof loading approval: http://${host}:3119`));
