const test = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../public/embroidery-viewer.mjs');
function dst(commands, end = true) {
  const bytes = new Uint8Array(512 + commands.length * 3 + (end ? 3 : 0));
  bytes.set(Buffer.from('LA:TEST\r'));
  commands.forEach((command, i) => bytes.set(command, 512 + i * 3));
  if (end) bytes.set([0, 0, 0xf3], bytes.length - 3);
  return bytes.buffer;
}
test('DST decodes every signed movement weight and uses canvas Y orientation', async () => {
  const { parseDst } = await modulePromise;
  const movements = [
    [0,0,1,0],[0,1,-1,0],[1,0,3,0],[1,1,-3,0],
    [0,2,9,0],[0,3,-9,0],[1,2,27,0],[1,3,-27,0],[2,2,81,0],[2,3,-81,0],
    [0,7,0,-1],[0,6,0,1],[1,7,0,-3],[1,6,0,3],
    [0,5,0,-9],[0,4,0,9],[1,5,0,-27],[1,4,0,27],[2,5,0,-81],[2,4,0,81],
  ];
  for (const [byte, bit, x, y] of movements) {
    const record = [0,0,3]; record[byte] |= 1 << bit;
    const design = parseDst(dst([record]));
    assert.deepEqual(design.segments[0], [0,0,x,y,0]);
    assert.equal(design.widthMm, Math.abs(x)/10);
    assert.equal(design.heightMm, Math.abs(y)/10);
  }
});
test('jumps and colour changes move without sewing connecting lines', async () => {
  const { parseDst } = await modulePromise;
  const design = parseDst(dst([[1,0,0x83],[4,0,3],[0,0,0xc3],[0x20,0,3]]));
  assert.deepEqual(design.segments, [[1,0,10,0,0],[10,0,10,-9,1]]);
  assert.equal(design.stitches,2);assert.equal(design.colourChanges,1);
  assert.equal(design.widthMm,0.9);assert.equal(design.heightMm,0.9);
});
test('invalid, truncated, empty, oversized and sequin designs fail explicitly', async () => {
  const { parseDst } = await modulePromise;
  assert.throws(()=>parseDst(new ArrayBuffer(520)), /valid/);
  assert.throws(()=>parseDst(dst([[1,0,3]],false)), /incomplete/);
  assert.throws(()=>parseDst(dst([])), /no stitches/);
  assert.throws(()=>parseDst(dst([[0,0,0]])), /invalid stitch/);
  assert.throws(()=>parseDst(dst([[0,0,0x43]])), /Sequin/);
  const large=new Uint8Array(1600000);large.set([76,65,58]);
  assert.throws(()=>parseDst(large.buffer), /500,000/);
});
test('rendered preview is bounded, contains stitches and leaves jumps transparent', async () => {
  const { parseDst, renderDst } = await modulePromise;
  const { createCanvas } = require('@napi-rs/canvas');
  const design=parseDst(dst([[4,0,3],[4,0,0x83],[4,0,3]]));
  const canvas=renderDst(design,()=>createCanvas(1,1));
  assert.ok(canvas.width<=2048 && canvas.height<=2048);
  const ctx=canvas.getContext('2d');
  assert.ok(ctx.getImageData(60,24,1,1).data[3]>0);
  assert.equal(ctx.getImageData(130,24,1,1).data[3],0);
  assert.ok(ctx.getImageData(200,24,1,1).data[3]>0);
});

test('PXF extracts the saved colour PNG intact and renders its pixels', async () => {
  const { extractPxfPreview } = await modulePromise;
  const { createCanvas, loadImage } = require('@napi-rs/canvas');
  const c=createCanvas(200,200);const ctx=c.getContext('2d');
  ctx.fillStyle='#ff0000';ctx.fillRect(20,20,50,50);
  const png=c.toBuffer('image/png');
  const pxf=Buffer.concat([Buffer.from('PMLPXF01'),Buffer.alloc(165),png,Buffer.from('other design data')]);
  const extracted=extractPxfPreview(pxf);
  assert.deepEqual(Buffer.from(extracted),png);
  const img=await loadImage(Buffer.from(extracted));assert.equal(img.width,200);
});
test('PXF rejects missing, truncated and oversized embedded previews', async () => {
  const { extractPxfPreview } = await modulePromise;
  const { createCanvas } = require('@napi-rs/canvas');
  const png=createCanvas(10,10).toBuffer('image/png');
  const wrap=body=>Buffer.concat([Buffer.from('PMLPXF01'),body]);
  assert.throws(()=>extractPxfPreview(Buffer.from('not pxf')), /supported Pulse/);
  assert.throws(()=>extractPxfPreview(wrap(Buffer.alloc(30))), /no supported embedded/);
  assert.throws(()=>extractPxfPreview(wrap(png.subarray(0,png.length-8))), /no supported embedded/);
  const huge=Buffer.from(png);huge.writeUInt32BE(50000,16);
  assert.throws(()=>extractPxfPreview(wrap(huge)), /no supported embedded/);
  const corrupt=Buffer.from(png);corrupt.writeUInt32BE(0xffffffff,8);
  assert.throws(()=>extractPxfPreview(wrap(corrupt)), /no supported embedded/);
});

test('proof embroidery shading preserves selected colours, transparency and jumps', async()=>{
  const {renderThreadPreview}=await import('../public/proof-embroidery.mjs');
  const {parseDst}=await modulePromise;
  const {createCanvas}=require('@napi-rs/canvas');
  const design=parseDst(dst([[4,0,3],[4,0,0x83],[0,0,0xc3],[4,0,3]]));
  assert.throws(()=>renderThreadPreview(design,[]),/every DST/);
  assert.throws(()=>renderThreadPreview(design,['#ffffff','red']),/every DST/);
  const canvas=renderThreadPreview(design,['#ff0000','#0000ff'],()=>createCanvas(1,1));
  const ctx=canvas.getContext('2d');
  const red=ctx.getImageData(70,16,1,1).data,blue=ctx.getImageData(370,16,1,1).data;
  assert.ok(red[0]>red[2]);assert.ok(blue[2]>blue[0]);
  assert.equal(ctx.getImageData(230,16,1,1).data[3],0);
  assert.equal(ctx.getImageData(0,0,1,1).data[3],0);
  assert.ok(canvas.width<=2032&&canvas.height<=2032);
});
