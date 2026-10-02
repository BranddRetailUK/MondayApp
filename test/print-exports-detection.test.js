const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../tools/print-worker/exporter/proof-core');
const page=[0,0,842,595];
function mock(id,b) {return {id,b,kind:'vector',filled:true,points:90,colour:[0,0,0]};}
function art(id,b,kind='vector') {return {id,b,kind,filled:true,points:12,colour:[1,0,0]};}
function box(x,y,name='FRONT',process='TRANSFER') {
    return [{text:process,b:[x,y-14,x+90,y-2]},
        {text:name,b:[x,y,x+84,y+14]}, {text:'90mm',b:[x,y+14,x+22,y+28]}];
}
test('28516 geometry: side table whose size extends below hoodie top',()=>{
    const rows=core.detect([mock(1,[280.6,139.7,554.8,494]),mock(2,[280.5,139.7,554.8,494]),
        art(3,[443,234,484,275])],box(58.07,121.93,'LEFT BREAST (as worn)','PRINT'),page);
    assert.equal(rows.length,1); assert.deepEqual(rows[0].ids,[3]);
    assert.equal(rows[0].label.mm,90); assert.equal(rows[0].format,'EPS');
});
for(const [side,x,y] of [['above',350,85],['left',170,260],['right',565,260],['below',350,510]]) {
    test('information box '+side+' of mockup',()=>{
        const rows=core.detect([mock(1,[280,140,555,495]),art(2,[443,234,484,275])],box(x,y),page);
        assert.deepEqual(rows[0].ids,[2]);
    });
}
test('multiple mockups retain their own nearby boxes and mixed artwork exports as PNG',()=>{
    const rows=core.detect([mock(1,[80,180,300,480]),art(2,[140,240,200,270]),
        mock(3,[500,180,720,480]),art(4,[560,240,620,270]),art(5,[570,272,610,300],'raster')],
        box(110,135,'FRONT').concat(box(730,200,'BACK')),page);
    assert.deepEqual(rows.map(r=>r.ids),[[2],[4,5]]);
    assert.deepEqual(rows.map(r=>r.format),['EPS','PNG']);
});
test('equidistant box between two garments requires review',()=>{
    const rows=core.detect([mock(1,[50,180,250,480]),mock(2,[450,180,650,480])],box(308,250),page);
    assert.deepEqual(rows[0].ids,[]); assert.match(rows[0].warnings.join(),/No unique/);
});
test('one garment between equally near boxes is not assigned arbitrarily',()=>{
    const rows=core.detect([mock(1,[280,140,555,495]),art(2,[443,234,484,275])],
        box(176,260,'FRONT').concat(box(575,260,'BACK')),page);
    assert.ok(rows.every(r=>r.ids.length===0));
});
test('embroidery positions are omitted while print positions remain',()=>{
    const items=[mock(1,[280,140,555,495]),art(2,[443,234,484,275])];
    assert.deepEqual(core.detect(items,box(58,122,'LEFT BREAST','EMBROIDERY'),page),[]);
    assert.deepEqual(core.detect(items,box(58,122,'LEFT BREAST','PRINT'),page)[0].ids,[2]);
});
test('table labels with process and position prefixes are recognised',()=>{
    const texts=[{text:'process EMBROIDERY',b:[58,113,169,123]},
        {text:'position LEFT BREAST (as worn)',b:[58,126,175,136]},
        {text:'size 90mm WIDE',b:[58,139,101,149]},
        {text:'process PRINT',b:[729,113,780,123]},
        {text:'position BACK',b:[729,126,780,136]},
        {text:'size 300mm WIDE',b:[729,139,780,149]}];
    const rows=core.detect([mock(1,[97,187,401,516]),mock(2,[423,187,727,516]),
        art(3,[261,254,305,298],'raster'),art(4,[521,232,632,343],'raster')],texts,page);
    assert.equal(rows.length,1);assert.equal(rows[0].label.position,'BACK');assert.deepEqual(rows[0].ids,[4]);
});
test('PNG model shot is the garment base and separate raster artwork stays PNG',()=>{
    const base=(id,b)=>({id,b,kind:'raster',filled:false,points:0,colour:null});
    const rows=core.detect([base(1,[145,161,455,519]),base(2,[401,161,712,519]),
        art(3,[341,298,366,323],'raster'),art(4,[489,271,585,369],'raster')],
        box(58,126,'LEFT BREAST','EMBROIDERY').concat(box(729,126,'BACK','PRINT')),page);
    assert.equal(rows.length,1);assert.deepEqual(rows[0].ids,[4]);assert.equal(rows[0].format,'PNG');
});
test('clipped artwork requires a visual edge check',()=>{
    const rows=core.detect([mock(1,[280,140,555,495]),{...art(2,[443,234,484,275]),clipGroup:true}],box(58,122),page);
    assert.deepEqual(rows[0].ids,[2]);assert.match(rows[0].warnings.join(),/clipping group/);
    assert.equal(rows[0].confidence,'REVIEW');
});
test('same artwork and labelled size on another page is exported once',()=>{
    const row=(fingerprint,mm,format='PNG')=>({fingerprint,ids:[1],preview:{},prepared:{},format,confidence:'GOOD MATCH',warnings:[],label:{position:'BACK',axis:'width',mm}});
    const first=row('image-1',300),duplicate=row('image-1',300),other=row('image-1',90),different=row('image-2',300);
    assert.deepEqual(core.deduplicate([first,duplicate,other,different]),[first,other,different]);
    assert.equal(duplicate.duplicateOf,first);
    const vector=row('image-1',300,'EPS');
    assert.deepEqual(core.deduplicate([first,vector]),[vector]);assert.equal(first.duplicateOf,vector);
    const uncertain=row('image-1',300);uncertain.warnings=['Other objects excluded'];
    assert.deepEqual(core.deduplicate([vector,uncertain]),[vector,uncertain]);
});
test('white outlined lettering near rainbow survives white mockup palette without remote details',()=>{
    const white=(id,b)=>({...art(id,b),colour:[1,1,1]});
    const items=[mock(1,[280,140,555,495]),white(2,[280,140,555,495]),
        art(3,[443,240,484,274]),white(4,[440,234,487,238]),white(5,[442,276,485,279]),
        white(6,[350,350,355,354]),white(7,[280,200,284,205]),white(8,[420,180,422,390])];
    const r=core.detect(items,box(58,122,'LEFT BREAST'),page)[0];
    assert.deepEqual(r.ids,[3,4,5]);
    assert.deepEqual(r.b,[440,234,487,279]);
    assert.ok(!r.excluded.includes(4)&&!r.excluded.includes(5));
    assert.equal(r.format,'EPS'); assert.equal(r.confidence,'REVIEW');
});
test('same-colour recovery does not chain outward from recovered text',()=>{
    const white=(id,b)=>({...art(id,b),colour:[1,1,1]});
    const r=core.detect([mock(1,[280,140,555,495]),white(2,[280,140,555,495]),
        art(3,[443,240,484,274]),white(4,[443,232,484,237]),white(5,[443,225,484,229])],box(58,122),page)[0];
    assert.deepEqual(r.ids,[3,4]);
});
test('actual T-shirt PDF geometry retains 39 white paths and all six rainbow paths',()=>{
    const fixture=require('./fixtures/print-proof-28516-geometry.json');
    const row=core.detect(fixture.items,box(392,122,'LEFT BREAST'),fixture.page)[0];
    assert.deepEqual([...row.ids].sort((a,b)=>a-b),Array.from({length:45},(_,i)=>172+i));
    assert.deepEqual([...row.excluded].sort((a,b)=>a-b),[170,171]);
    assert.equal(row.format,'EPS');
    assert.equal(row.confidence,'GOOD MATCH');
    assert.equal(row.warnings.length,0);
    assert.match(row.details,/retained/);
});
test('automatic export requires every view to be confident and successfully prepared',()=>{
    const good=()=>({confidence:'GOOD MATCH',warnings:[],ids:[1],preview:{},prepared:{}});
    assert.equal(core.canAutoExport([good(),good()]),true);
    assert.equal(core.canAutoExport([]),false);
    for(const change of [{confidence:'REVIEW'},{confidence:'MANUAL'},{warnings:['uncertain']},{ids:[]},{preview:null},{prepared:null}]) {
        assert.equal(core.canAutoExport([good(),Object.assign(good(),change)]),false);
    }
});
