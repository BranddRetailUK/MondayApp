const {test}=require('node:test'),assert=require('node:assert/strict');
const {extractEps}=require('../src/services/digitisingEps');
const artwork=Buffer.from('%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 100 50\n1 0 0 setrgbcolor\n0 0 100 50 rectfill\nshowpage\n%%EOF');
test('EPS detection handles text and validates binary EPS offsets',()=>{
 assert.ok(extractEps(artwork));assert.equal(extractEps(Buffer.from('%!PS ordinary postscript')),null);
 const header=Buffer.alloc(30);header.writeUInt32LE(0xc6d3d0c5,0);header.writeUInt32LE(30,4);header.writeUInt32LE(artwork.length,8);assert.deepEqual(extractEps(Buffer.concat([header,artwork])),artwork);
 header.writeUInt32LE(999999,8);assert.throws(()=>extractEps(header),/Invalid binary/);
});
test('EPS converts to bounded artwork and passes automatic preparation',async()=>{
 const engine=require('../src/services/digitisingStudio'),sharp=require('sharp'),{plan}=require('../src/services/digitisingAuto');
 const png=await engine.artwork(artwork),metadata=await sharp(png).metadata();assert.equal(metadata.format,'png');assert.equal(metadata.width,800);assert.equal(metadata.height,400);
 const p=await plan(artwork,{widthMm:70});assert.equal(p.config.widthMm,70);
});
