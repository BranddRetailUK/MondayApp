#!/usr/bin/env node
require('dotenv').config({quiet:true});
const {Client}=require('pg');
const {enrichProofProducts}=require('../src/services/proofProductVisuals');
const {searchPencarrieProducts}=require('../src/services/proofPencarrieVisuals');
(async()=>{
 const db=new Client({connectionString:process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL,ssl:process.env.PGSSLMODE==='disable'?false:{rejectUnauthorized:false},connectionTimeoutMillis:15000});
 await db.connect();try{
  console.log((await db.query(`SELECT (SELECT COUNT(*) FROM proof_pencarrie_styles) AS styles,
    (SELECT COUNT(*) FROM proof_pencarrie_colours) AS colourways,
    (SELECT COUNT(*) FROM proof_pencarrie_variants) AS variants,
    (SELECT COUNT(*) FROM proof_pencarrie_variants WHERE is_active) AS active_variants,
    (SELECT COUNT(*) FROM database_products) AS database_products`)).rows[0]);
  const brief={products:[{code:'01436',colour:'Navy',supplier:'pencarrie'},{code:'GD57B',colour:'Royal Blue',supplier:'pencarrie'}]};
  await enrichProofProducts(brief,{pool:db});
  for(const p of brief.products){if(!p.visual.matched)throw Error(`Lookup failed: ${p.code}`);console.log(JSON.stringify({code:p.code,colour:p.colour,gender:p.visual.gender,views:p.visual.views.map(v=>v.view)}));}
  const results=await searchPencarrieProducts('01436',db);if(!results.some(r=>r.code==='01436'&&r.colours.includes('Navy')))throw Error('Proof picker failed');
  console.log('Proof picker verified; DATABASE product search is not connected to these tables.');
 }finally{await db.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
