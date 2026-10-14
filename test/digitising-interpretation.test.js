const {test}=require('node:test'),assert=require('node:assert/strict');
const {validate,interpret}=require('../src/services/digitisingInterpretation');
const regions=[{id:0,colour:'#000000'},{id:1,colour:'#ffffff'}];
const result=()=>({regions:[{id:0,colour:'#000000',include:true,role:'lettering',sections:[]},{id:1,colour:'#ffffff',include:false,role:'background',sections:[]}]});
test('interpretation cannot invent, recolour or delete nonwhite artwork',()=>{
  assert.deepEqual(validate(result(),regions),result());
  for(const mutate of [r=>r.regions[0].colour='#123456',r=>r.regions[0].include=false,r=>r.regions[1].id=0,r=>r.regions.pop()]){const r=result();mutate(r);assert.throws(()=>validate(r,regions));}
});
test('only source image and measured source regions are sent, even if caller supplies reference options',async()=>{
  const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test';try{let body;
    await interpret(Buffer.from('source'),{elements:regions,info:{width:100,height:100}},{referenceDirectory:'/private/reference',reference:{preview:'PRIVATE TARGET'},fetchImpl:async(url,args)=>{body=JSON.parse(args.body);return{ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify(result())}]}]})};}});
    assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.equal(body.input[0].content.filter(c=>c.type==='input_image').length,1);assert.ok(!JSON.stringify(body).includes('PRIVATE TARGET'));
  }finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});
test('large interpretation batches preserve every id including fully excluded white batches',async()=>{
  const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test';
  try{
    const elements=Array.from({length:53},(_,id)=>({id,colour:id<24?'#ffffff':'#000000'})),sizes=[];
    const r=await interpret(Buffer.from('source'),{elements,info:{width:100,height:100}},{fetchImpl:async(url,args)=>{
      const body=JSON.parse(args.body),batch=JSON.parse(body.input[0].content[0].text).regions;sizes.push(batch.length);
      assert.equal(body.store,false);
      return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({regions:batch.map(e=>({...e,include:e.colour!=='#ffffff',role:e.colour==='#ffffff'?'background':'shape',sections:[]}))})}]}]})};
    }});
    assert.deepEqual(sizes.sort((a,b)=>a-b),[5,24,24]);assert.equal(r.regions.length,53);assert.equal(new Set(r.regions.map(e=>e.id)).size,53);assert.equal(r.regions.filter(e=>e.include).length,29);
  }finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});
test('token-limit responses split into smaller requests without accepting partial output',async()=>{
  const {mapRegions,complete}=require('../src/services/digitisingModelBatches');let active=0,peak=0,calls=0;
  const input=Array.from({length:53},(_,i)=>i);
  const output=await mapRegions(input,async batch=>{calls++;active++;peak=Math.max(peak,active);await new Promise(r=>setImmediate(r));active--;if(batch.length>6)complete({status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output:[{text:'partial'}]},'Test');return batch;});
  assert.deepEqual(output,input);assert.ok(calls>3);assert.ok(peak<=2);
  let attempts=0;await assert.rejects(mapRegions([1],async()=>{attempts++;complete({status:'incomplete',incomplete_details:{reason:'max_output_tokens'}},'Test');}),/incomplete/);assert.equal(attempts,1);
});
test('non-token incomplete responses and invalid batches are not silently retried or accepted',async()=>{
  const {mapRegions,complete}=require('../src/services/digitisingModelBatches');let calls=0;
  await assert.rejects(mapRegions([1,2],async()=>{calls++;complete({status:'incomplete',incomplete_details:{reason:'content_filter'}},'Test');}),/content_filter/);assert.equal(calls,1);
  calls=0;await assert.rejects(mapRegions([1,2],async()=>{calls++;throw Error('Invalid regions');}),/Invalid regions/);assert.equal(calls,1);
});
test('interpretation schema binds colours to source ids and forbids excluding nonwhite regions',()=>{
  const {sourceSchema}=require('../src/services/digitisingInterpretation');
  const variants=sourceSchema([{id:2,colour:'#010204'},{id:9,colour:'#010204'},{id:4,colour:'#ffffff'}]).properties.regions.items.anyOf;
  const dark=variants.find(v=>v.properties.colour.enum[0]==='#010204'),white=variants.find(v=>v.properties.colour.enum[0]==='#ffffff');
  assert.deepEqual(dark.properties.id.enum,[2,9]);assert.deepEqual(dark.properties.include.enum,[true]);assert.deepEqual(white.properties.include.enum,[true,false]);
});
test('source transparency prevents white artwork from being classified as removable background',()=>{
  const {sourceSchema}=require('../src/services/digitisingInterpretation'),white=[{id:0,colour:'#ffffff'}];
  assert.deepEqual(sourceSchema(white,true).properties.regions.items.anyOf[0].properties.include.enum,[true]);
  assert.throws(()=>validate({regions:[{id:0,colour:'#ffffff',include:false,role:'background',sections:[]}]},white,true,true),/Unexpected artwork exclusion/);
});
