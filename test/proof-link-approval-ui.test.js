const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../public/proof-links.js'),'utf8');
for(const confirmed of [false,true])test(`approved proof regeneration ${confirmed?'requires explicit confirmation before clearing approval':'cancellation leaves approval unchanged'}`,async()=>{
  const calls=[];let warning='';
  const context={allowed:()=>true,window:{confirm:message=>{warning=message;return confirmed;},openLinkedProof:async()=>calls.push('editor')},activateDashboardTab(){},api:async(path)=>{calls.push(path);return path.endsWith('/edit')?{design:{}}:{job:{proof_approved:true,order_no:51340}};},fetch:async(path,options)=>{calls.push([path,JSON.parse(options.body)]);return {ok:true,json:async()=>({})};}};
  vm.createContext(context);vm.runInContext(source.slice(source.indexOf('  async function edit('),source.indexOf('  async function create('))+'\nthis.run=edit;',context);
  await context.run(50587);assert.match(warning,/regenerate and relink/);assert.match(warning,/clear JOB approval/);
  if(!confirmed)assert.deepEqual(calls,['/link-jobs/50587']);
  else{assert.equal(calls[1][1].checked,false);assert.equal(calls[2],'/link-jobs/50587/edit');assert.equal(calls[3],'editor');}
});
