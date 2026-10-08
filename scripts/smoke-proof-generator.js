// Local, deterministic visual fixture. No supplier, OpenAI, or database calls.
const fs=require('fs/promises');
const path=require('path');
const sharp=require('sharp');
const {buildProof}=require('../src/services/proofPdfGenerator');
const {createHash}=require('crypto');
(async()=>{
 const dir=path.resolve('tmp/pdfs/proof-generator');await fs.mkdir(dir,{recursive:true});
 const garment=await sharp(Buffer.from('<svg width="700" height="850"><path fill="#263953" d="M200 60 L290 30 Q350 100 410 30 L500 60 L680 160 L630 340 L530 290 L530 800 L170 800 L170 290 L70 340 L20 160 Z"/></svg>')).png().toBuffer();
 const logo=await sharp(Buffer.from('<svg width="600" height="400"><rect x="200" y="150" width="200" height="100" rx="12" fill="#ef452d"/><text x="300" y="217" text-anchor="middle" font-family="sans-serif" font-size="45" font-weight="bold" fill="white">TEST</text></svg>')).png().toBuffer();
 await fs.writeFile(path.join(dir,'padded-logo.png'),logo);
 const sourceHash=createHash('sha256').update(garment).digest('hex');
 const calibrations=Object.fromEntries(['front','back','right'].map(view=>[view,{sourceHash,referenceMm:'700',start:{x:0,y:.5},end:{x:1,y:.5},collar:{x:.5,y:.08}}]));
 const decoration=(id,position,widthMm)=>({id,position,widthMm,artworkId:'test-art',artwork:'Test logo',method:position==='left breast'?'Embroidery':'Print',printColours:['Red / white']});
 const brief={customer:'Local regression fixture',jobTitle:'Artwork size and placement verification',reference:'PROOF-QA',sharedDecorations:[],products:[{code:'TEST',name:'Test shirt',colour:'Navy*',calibrations,decorations:[decoration('chest','left breast','100'),decoration('back','back','250'),decoration('sleeve','right sleeve','75')],visual:{matched:true,source:'PenCarrie',views:['front','back','right'].map(view=>({view,url:`https://www.pencarrie.com/storage/fixture-${view}.png`}))}}]};
 const result=await buildProof(brief,[{id:'test-art',file:{originalname:'padded-logo.png',buffer:logo}}],{fetchImpl:async()=>({ok:true,arrayBuffer:async()=>garment}),strict:true});
 await fs.writeFile(path.join(dir,'placement-check.pdf'),result.bytes);
 await fs.writeFile(path.join(dir,'placement-check.json'),JSON.stringify({issues:result.issues,pages:result.pages.map(({image,placements,...page})=>({...page,placements:placements.map(({preview,...p})=>p)}))},null,2));
 console.log(`Visual fixture: ${path.join(dir,'placement-check.pdf')} (${result.pages.length} pages)`);
})().catch(error=>{console.error(error);process.exitCode=1;});
