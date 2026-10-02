const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
function folderMatches(name, ref) {
  return new RegExp(`(^|[^0-9])${ref}([^0-9]|$)`).test(name) && !/^\d+\s*-\s*\d+(?:\s|$)/.test(name);
}
async function findProof(root, ref, onProgress = () => {}) {
  if (!/^\d{5,10}$/.test(ref) || Number(ref)<28300) throw new Error('Ineligible design number');
  onProgress('Scanning local design folders');
  root = await fs.realpath(root);
  const found = []; let count = 0;
  async function visit(folder, depth) {
    if (++count>30000) throw new Error('Design search exceeded 30,000 folders');
    if(count%1000===0) onProgress(`Scanning local design folders (${count} checked)`);
    if (folderMatches(path.basename(folder),ref)) { found.push(folder); return; }
    if (depth>=6) return;
    for (const item of await fs.readdir(folder,{withFileTypes:true})) {
      if (!item.isDirectory() || item.isSymbolicLink() || item.name.toUpperCase()==='PRINT') continue;
      const range=item.name.match(/^(\d+)\s*-\s*(\d+)(?:\s|$)/);
      if (range && (Number(ref)<Number(range[1]) || Number(ref)>Number(range[2]))) continue;
      await visit(path.join(folder,item.name),depth+1);
    }
  }
  await visit(root,0);
  if (found.length!==1) throw new Error(`Expected one folder for ${ref}; found ${found.length}`);
  onProgress('Checking files in the matching design folder');
  // Proof must be directly in the matching design folder; never guess between revisions.
  const proofs=(await fs.readdir(found[0],{withFileTypes:true})).filter(e=>e.isFile()&&!e.isSymbolicLink()&&/proof\.(pdf|ai)$/i.test(e.name));
  if (proofs.length!==1) throw new Error(`Expected one file ending in proof.pdf or proof.ai; found ${proofs.length}`);
  const proof=path.join(found[0],proofs[0].name);
  onProgress('Reading proof bytes from the local design folder');
  const bytes=await fs.readFile(proof); // Hydrates OneDrive online-only files before Illustrator opens them.
  if (!bytes.length) throw new Error('Proof file is empty');
  let pdfPages=1;
  if (/\.pdf$/i.test(proof)) {
    onProgress('Counting proof PDF pages');
    try {
      const {PDFDocument}=require('./vendor/pdf-lib.min.js');
      pdfPages=(await PDFDocument.load(bytes,{updateMetadata:false})).getPageCount();
      if (pdfPages<1 || pdfPages>100) throw new Error('PDF must have 1–100 pages');
    } catch (error) { throw new Error(`Cannot read proof PDF pages: ${error.message}`); }
  }
  const print=path.join(found[0],'PRINT');
  try { if ((await fs.lstat(print)).isSymbolicLink()) throw new Error('PRINT must not be a linked folder'); }
  catch(e) { if(e.code!=='ENOENT') throw e; }
  onProgress('Local proof ready');
  return {proof, designFolder:found[0], pdfPages, hash:crypto.createHash('sha256').update(bytes).digest('hex')};
}
function decodeXml(text) {
  return text.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
}
function parseResult(text) {
  const read=name=>decodeXml((text.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))||[])[1]||'');
  if (!['exported','needs_attention'].includes(read('status'))) throw new Error('Invalid Illustrator result');
  return {status:read('status'),message:read('message'),outputs:[...text.matchAll(/<output>([\s\S]*?)<\/output>/g)].map(m=>decodeXml(m[1]))};
}
module.exports={findProof,folderMatches,parseResult};
