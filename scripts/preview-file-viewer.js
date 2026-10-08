// Loopback UI review: no database or migrations. EPS uses the configured temporary Cloudinary converter.
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { createEpsPng } = require('../src/services/dtfCloudinary');
const path = require('node:path');
const app = express();
app.get('/api/auth/me', (_req,res)=>res.json({user:{id:0,first_name:'Local',last_name:'Preview',access_scope:'full'}}));
app.get('/api/print-exports/settings', (_req,res)=>res.json({enabled:false,canToggle:false}));
const upload = multer({storage:multer.memoryStorage(),limits:{fileSize:25*1024*1024,files:1}});
app.post('/api/dtf/layouts/eps-preview',upload.single('file'),async(req,res)=>{
  res.set('Cache-Control','no-store');
  try {
    if(!req.file || !/\.eps$/i.test(req.file.originalname)) return res.status(400).json({error:'Choose an EPS file.'});
    res.type('png').send(await createEpsPng(req.file.buffer,0));
  } catch(err){res.status(422).json({error:err.message || 'EPS conversion failed.'});}
});
app.use((err,req,res,next)=>res.status(400).json({error:'Upload failed. Maximum file size is 25 MB.'}));
app.use('/api', (_req,res)=>res.status(404).json({error:'Only File Viewer is available in this local review.'}));
app.use('/file-viewer-renderer',express.static(path.resolve(__dirname,'../node_modules/pdfjs-dist/build')));
app.get('/vendor/pdf-lib.min.js',(_req,res)=>res.sendFile(require.resolve('pdf-lib/dist/pdf-lib.min.js')));
app.use(express.static(path.resolve(__dirname,'../public')));
app.listen(3109,'127.0.0.1',()=>console.log('File Viewer review: http://127.0.0.1:3109/?tab=file-viewer'));
