// Read-only, bounded library audit. Private filenames/results belong outside Git.
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseDst} from '../public/embroidery-viewer.mjs';
const root=process.argv[2], output=process.argv[3]||'/tmp/digitising-studio/library-audit.json';
if(!root)throw Error('Supply embroidery library root.');
const files=[],extensions={};
async function walk(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){if(e.isDirectory())await walk(path.join(dir,e.name));else if(e.isFile()){const ext=path.extname(e.name).toLowerCase();extensions[ext]=(extensions[ext]||0)+1;if(ext==='.dst')files.push(path.join(dir,e.name));}}}
await walk(root); files.sort();
const available=[]; for(const file of files){const stat=await fs.stat(file);if(process.platform!=='darwin'||stat.blocks>0)available.push(file);}
const sample=Array.from({length:Math.min(250,available.length)},(_,i)=>available[Math.floor(i*available.length/Math.min(250,available.length))]);
const designs=[],failures=[];
for(const file of sample){try{const stat=await fs.stat(file);if(stat.size>1500515)throw Error('Over preview limit');const b=await fs.readFile(file);const d=parseDst(b);const lens=d.segments.map(([x,y,a,b])=>Math.hypot(a-x,b-y)/10).sort((a,b)=>a-b);let jumps=0,trimSequences=0,run=0;for(let i=512;i+2<b.length;i+=3){const c=b[i+2];if((c&0xf3)===0xf3)break;if((c&0xc3)===0x83){jumps++;run++;}else{if(run>=3)trimSequences++;run=0;}}designs.push({file:path.relative(root,file),widthMm:d.widthMm,heightMm:d.heightMm,stitches:d.stitches,colours:d.colourChanges+1,jumps,possibleTrimSequences:trimSequences,medianStitchMm:lens[Math.floor(lens.length*.5)],p95StitchMm:lens[Math.floor(lens.length*.95)],shortStitches:lens.filter(n=>n<.5).length});}catch(e){failures.push({file:path.relative(root,file),error:e.message});}}
const median=key=>{const v=designs.map(d=>d[key]).sort((a,b)=>a-b);return v[Math.floor(v.length/2)];};
const result={extensions,totalDst:files.length,cloudOnlySkipped:files.length-available.length,sampled:sample.length,read:designs.length,summary:{medianWidthMm:median('widthMm'),medianHeightMm:median('heightMm'),medianStitches:median('stitches'),medianColours:median('colours'),medianStitchMm:median('medianStitchMm'),medianP95StitchMm:median('p95StitchMm')},designs,failures};await fs.writeFile(output,JSON.stringify(result,null,2));console.log(JSON.stringify({...result,designs:undefined,failures:failures.length},null,2));
