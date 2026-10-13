const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const run=promisify(execFile);
function extractEps(buffer){
  if(buffer.length>=30&&buffer.readUInt32LE(0)===0xc6d3d0c5){const start=buffer.readUInt32LE(4),length=buffer.readUInt32LE(8);if(start<30||length<1||start+length>buffer.length)throw Error('Invalid binary EPS header.');buffer=buffer.subarray(start,start+length);}
  if(!/^%!PS-Adobe-[^\r\n]*EPSF-/i.test(buffer.subarray(0,128).toString('ascii')))return null;
  return buffer;
}
async function rasterize(buffer){
  const eps=extractEps(buffer);if(!eps)throw Error('Invalid EPS artwork.');
  const text=eps.toString('latin1'),match=text.match(/^%%(?:HiResBoundingBox|BoundingBox):\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/m);
  if(!match)throw Error('EPS needs a numeric bounding box. Re-export the artwork as EPS or SVG.');
  const [x,y,right,bottom]=match.slice(1).map(Number),width=right-x,height=bottom-y;
  if(![x,y,right,bottom].every(Number.isFinite)||width<=0||height<=0||Math.max(width,height)>100000)throw Error('Invalid EPS artwork bounds.');
  const factor=2000/Math.max(width,height),w=Math.max(1,Math.round(width*factor)),h=Math.max(1,Math.round(height*factor));
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'digitising-eps-'));
  try{
    const input=path.join(directory,'artwork.eps'),output=path.join(directory,'artwork.png');await fs.writeFile(input,eps);
    const executable=process.env.GHOSTSCRIPT_BIN||(process.platform==='darwin'?'/opt/homebrew/bin/gs':'gs');
    await run(executable,['-dSAFER','-dBATCH','-dNOPAUSE','-dQUIET','-dFirstPage=1','-dLastPage=1','-sDEVICE=pngalpha','-dTextAlphaBits=4','-dGraphicsAlphaBits=4','-dFIXEDMEDIA','-dEPSFitPage','-r72',`-g${w}x${h}`,`-sOutputFile=${output}`,input],{timeout:15000,killSignal:'SIGKILL',maxBuffer:128*1024,env:{PATH:process.env.PATH||'/usr/bin:/bin',HOME:directory,TMPDIR:directory}});
    const stat=await fs.stat(output);if(stat.size>8*1024*1024)throw Error('EPS render exceeds size limit.');return await fs.readFile(output);
  }catch(error){if(error.code==='ENOENT')throw Error('EPS conversion is unavailable: Ghostscript must be installed on the server.');throw Error('EPS could not be rendered. Re-export it as a self-contained EPS or SVG.');}
  finally{await fs.rm(directory,{recursive:true,force:true});}
}
module.exports={extractEps,rasterize};
