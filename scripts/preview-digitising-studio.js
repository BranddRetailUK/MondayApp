require('dotenv').config();
const express=require('express');
const path=require('node:path');
const fs=require('node:fs');
const app=express();
// Loopback-only prototype: no database, migrations, storage, or production writes.
app.use((req,res,next)=>{
  if(!['127.0.0.1:3110','localhost:3110'].includes(req.headers.host))return res.sendStatus(403);
  if(req.method==='POST' && req.headers.origin && !['http://127.0.0.1:3110','http://localhost:3110'].includes(req.headers.origin))return res.sendStatus(403);
  res.set('Cache-Control','no-store'); next();
});
app.get('/api/auth/me',(_req,res)=>res.json({user:{id:0,first_name:'Local',last_name:'Studio',access_scope:'full'}}));
app.use('/api/digitising-studio',require('../src/routes/digitising-studio').createRouter());
app.get('/api/digitising-reference',(_req,res)=>{
  const file='/tmp/digitising-studio/library-audit.json';
  if(!fs.existsSync(file))return res.json({available:false});
  const data=JSON.parse(fs.readFileSync(file));res.json({available:true,totalDst:data.totalDst,sampled:data.sampled,read:data.read,summary:data.summary,benchmark:'PSG7000 run sheet: 85.8 × 79.6 mm · 8,313 stitches · thread order 1366 → 1297 → 1249 → 1068 → 1278 → 1147 → 1001. Railway links print design 28516 to PSG6893 (9,163 stitches) on jobs 50151, 50436 and 50659; PSG7000 is a separate reference, not a confirmed replacement.'});
});
app.get('/digitising-source.png',(_req,res)=>res.sendFile('/tmp/digitising-studio/psg7000-source.png'));
app.get('/digitising-reference.png',(_req,res)=>res.sendFile('/tmp/digitising-studio/psg7000.png'));
app.use('/api',(_req,res)=>res.status(404).json({error:'Local Digitising Studio only.'}));
app.use(express.static(path.resolve(__dirname,'../public')));
app.listen(3110,'127.0.0.1',()=>console.log('Digitising Studio http://127.0.0.1:3110/?tab=digitising-studio'));
