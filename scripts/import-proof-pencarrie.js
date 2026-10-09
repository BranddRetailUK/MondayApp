#!/usr/bin/env node
require('dotenv').config({quiet:true});
const path=require('node:path');
const {readCatalogue,applyCatalogue}=require('../src/services/proofPencarrieCatalogue');
(async()=>{
 const args=process.argv.slice(2),file=args[args.indexOf('--file')+1];
 if(!args.includes('--file')||!file||args.includes('--apply')===args.includes('--dry-run'))throw Error('Use --file <products.csv> and exactly one of --dry-run or --apply --confirm-write');
 if(args.includes('--apply')&&!args.includes('--confirm-write'))throw Error('--apply requires --confirm-write');
 const data=await readCatalogue(file);console.log(JSON.stringify({mode:args.includes('--apply')?'apply':'dry-run',source:path.basename(file),sha256:data.hash,...data.counts}));
 if(!args.includes('--apply'))return;
 const connectionString=process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL;
 if(!connectionString)throw Error('Database connection unavailable');
 const target=new URL(connectionString);console.log(`Database target: ${target.hostname}${target.pathname}; writes limited to proof_pencarrie_*`);
 const {Client}=require('pg');const db=new Client({connectionString,ssl:process.env.PGSSLMODE==='disable'?false:{rejectUnauthorized:false},connectionTimeoutMillis:15000});
 await db.connect();try{console.log(JSON.stringify({importId:await applyCatalogue(db,data,path.basename(file)),...data.counts}));}finally{await db.end();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
