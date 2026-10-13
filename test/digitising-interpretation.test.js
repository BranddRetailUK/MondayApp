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
