const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../public/proof-links.js'),'utf8');
function harness({confirmed=true,approved=true,proofId='proof-1',failed=false}={}){
  const calls=[];let warning=null;
  const context={confirmRegeneration:async job=>{warning=job;return confirmed;},allowed:()=>true,refresh:()=>calls.push('refresh'),window:{confirm:message=>{warning=message;return confirmed;},openLinkedProof:async()=>calls.push('editor')},activateDashboardTab(){},api:async(path)=>{calls.push(path);return path.endsWith('/edit')?{design:{}}:{job:{proof_approved:approved,proof_id:proofId,order_no:51340}};},fetch:async(path,options)=>{calls.push([path,JSON.parse(options.body)]);return {ok:!failed,json:async()=>failed?{error:'Save failed'}:{}};}};
  vm.createContext(context);vm.runInContext(source.slice(source.indexOf('  async function edit('),source.indexOf('  function confirmRegeneration('))+source.slice(source.indexOf('  async function beginRegeneration('),source.indexOf('  async function create('))+'\nthis.open=edit;this.begin=beginRegeneration;',context);
  return {context,calls,warning:()=>warning};
}
test('opening an approved proof does not prompt or clear approval',async()=>{
  const h=harness();await h.context.open(50587);
  assert.equal(h.warning(),null);assert.deepEqual(h.calls,['/link-jobs/50587','/link-jobs/50587/edit','editor']);
});
for(const confirmed of [false,true])test(`actual regeneration ${confirmed?'clears approval after confirmation':'cancellation preserves approval'}`,async()=>{
  const h=harness({confirmed});assert.equal(await h.context.begin(50587,'proof-1'),confirmed);
  assert.equal(h.warning().order_no,51340);
  if(!confirmed)assert.deepEqual(h.calls,['/link-jobs/50587']);
  else assert.deepEqual(h.calls,['/link-jobs/50587',['/api/test-dashboard/items/50587/checkbox-column',{columnId:'checkbox1__1',checked:false}],'refresh']);
});
test('unapproved regeneration does not reset status again',async()=>{
  const h=harness({approved:false});assert.equal(await h.context.begin(50587,'proof-1'),true);
  assert.equal(h.warning(),null);assert.deepEqual(h.calls,['/link-jobs/50587']);
});
test('changed proof links and failed approval saves stop regeneration',async()=>{
  const changed=harness({proofId:'different'});await assert.rejects(()=>changed.context.begin(50587,'proof-1'),/linked proof changed/);
  assert.equal(changed.warning(),null);assert.deepEqual(changed.calls,['/link-jobs/50587']);
  const failed=harness({failed:true});await assert.rejects(()=>failed.context.begin(50587,'proof-1'),/Save failed/);
  assert.ok(!failed.calls.includes('refresh'));
});

for(const choice of ['cancel','regenerate','escape'])test(`centred approval warning resolves ${choice} and restores focus`,async()=>{
  const nodes=[];let restored=false,focused=null;
  function node(tag){
    const n={tag,children:[],attrs:{},listeners:{},classList:{add(){}},append(...items){this.children.push(...items);},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,fn){this.listeners[k]=fn;},showModal(){this.modal=true;},focus(){focused=this;},remove(){this.removed=true;},close(value=''){this.returnValue=value;this.listeners.close();}};
    nodes.push(n);return n;
  }
  const context={document:{activeElement:{focus(){restored=true;}},createElement:node,body:node('body')},button(label,run){const n=node('button');n.textContent=label;n.click=run;return n;}};
  vm.createContext(context);vm.runInContext(source.slice(source.indexOf('  function confirmRegeneration('),source.indexOf('  async function beginRegeneration('))+'\nthis.confirm=confirmRegeneration;',context);
  const promise=context.confirm({order_no:51340});
  const dialog=nodes.find(n=>n.tag==='dialog');assert.equal(dialog.modal,true);assert.equal(dialog.className,'proof-regeneration-warning');
  assert.equal(dialog.attrs['aria-labelledby'],'proof-regeneration-warning-title');
  assert.equal(dialog.attrs['aria-describedby'],'proof-regeneration-warning-message');
  assert.ok(nodes.some(n=>/51340.*clear JOB approval.*OFFICE/.test(n.textContent||'')));
  assert.equal(focused.textContent,'Cancel');
  if(choice==='escape')dialog.close();else nodes.find(n=>n.tag==='button'&&n.textContent===(choice==='cancel'?'Cancel':'Regenerate proof')).click();
  assert.equal(await promise,choice==='regenerate');assert.equal(dialog.removed,true);assert.equal(restored,true);
});
test('warning dialog is centred in the viewport with a dimmed backdrop',()=>{
  const css=fs.readFileSync(require.resolve('../public/proof-generator.css'),'utf8');
  assert.match(css,/\.proof-regeneration-warning\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*margin:\s*auto;/);
  assert.match(css,/\.proof-regeneration-warning::backdrop/);
});
