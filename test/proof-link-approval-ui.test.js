const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../public/proof-links.js'),'utf8');
const link=source.slice(source.indexOf('  async function link('),source.indexOf('  async function attach('));
for(const confirmed of [false,true])test(`approved-job link ${confirmed?'clears approval before linking':'cancellation leaves approval and link unchanged'}`,async()=>{
  const calls=[];
  const context={allowed:()=>true,window:{confirm:()=>confirmed},api:async(path,body)=>{calls.push({path,body});return path.startsWith('/link-jobs/')?{job:{proof_approved:true,order_no:51340}}:{ok:true};},fetch:async(path,options)=>{calls.push({path,body:JSON.parse(options.body)});return {ok:true,json:async()=>({})};}};
  vm.createContext(context);vm.runInContext(link+'\nthis.run=link;',context);
  const result=await context.run('proof-id',50587);
  if(!confirmed){assert.equal(result,null);assert.equal(calls.length,1);}
  else{assert.equal(calls.length,3);assert.equal(calls[1].body.checked,false);assert.equal(calls[1].path,'/api/test-dashboard/items/50587/checkbox-column');assert.equal(calls[2].path,'/designs/proof-id/link');}
});
