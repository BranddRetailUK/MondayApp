const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../public/proof-generator.js'), 'utf8');
const review = source.slice(source.indexOf('  async function reviewBrief()'), source.indexOf('  async function uploadForm('));
const http = source.slice(source.indexOf('  // Retry only reads:'),source.indexOf('  root.innerHTML'));
const history = source.slice(source.indexOf('  function historyState(job)'), source.indexOf('  function renderHistory()'));
function harness({ fail=false }={}) {
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const calls=[];
  const context={selectedLinkJob:null,busy:false,generatingProof:false,designId:'existing-design',design:{id:'existing-design',status:'saved',revision:4},localPreview:false,
    request:{value:'Print artwork'},customer:{value:'Customer'},jobTitle:{value:'Updated job'},instructions:{value:'Special instruction'},
    artworks:[{id:'art-1',file:{name:'art.png'},assignment:'front',notes:'Keep colour'}],
    currentBrief:{products:[{decorations:[{id:'mark',artworkId:'art-1',placement:{x:.37,y:.22},widthMm:125}]}]},currentPreview:null,
    progressMessage:'',setCreating(){},setFeedback(message){context.progressMessage=message;},
    showProofList(){calls.push('list');},renderHistory(){},refreshHistory(){},
    preflightBrief:async()=>true,jobReservation(){return {};},
    async designRequest(){calls.push('reserve-request');await gate;if(fail)throw Error('Service unavailable');return {id:'existing-design',revision:4,status:'saved'};},
    async recordProgress(state){calls.push(state);},async prepareArtworkFile(){},async saveProofSource(){calls.push('source');},
    async reserveDesign(brief){calls.push('identity');brief.proofDesignId=context.designId;brief.proofRevision=4;},
    async updatePreview(){calls.push('save');context.savedBrief=structuredClone(context.currentBrief);context.currentPreview={issues:[]};},
  };
  vm.createContext(context);vm.runInContext(review+history+'\nthis.run=reviewBrief;this.rowState=historyState;',context);
  return {context,calls,release};
}
test('regeneration returns to list before networking and keeps row busy until saving completes',async()=>{
  const {context,calls,release}=harness();const pending=context.run();await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls,['list','reserve-request']);assert.equal(context.busy,true);
  assert.equal(context.rowState({id:'existing-design',status:'saved'})[0],'Pending');
  release();await pending;
  assert.equal(context.busy,false);assert.equal(context.generatingProof,false);
  assert.deepEqual(context.savedBrief.products[0].decorations[0].placement,{x:.37,y:.22});
  assert.equal(context.savedBrief.products[0].decorations[0].widthMm,125);
  assert.equal(context.savedBrief.proofDesignId,'existing-design');assert.equal(context.savedBrief.proofRevision,4);
  assert.ok(calls.indexOf('save')>calls.indexOf('source'));assert.equal(calls.at(-1),'complete');
});
test('regeneration failures stop the spinner and leave a failed row on the list',async()=>{
  const {context,release}=harness({fail:true});const pending=context.run();release();await pending;
  assert.equal(context.busy,false);assert.equal(context.rowState(context.design)[0],'Failed');
  assert.equal(context.rowState(context.design)[1],'Service unavailable');
});

function element(tag) {
  return {tag,children:[],dataset:{},listeners:{},className:'',append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;},addEventListener(name,fn){this.listeners[name]=fn;},setAttribute(){}};
}
test('placement tiles share one grid across products without per-decoration dropdowns',()=>{
  const results=element('div');
  const context={results,currentBrief:{products:[{code:'GD010',colour:'Grey',decorations:[]},{code:'GD001',colour:'Orange',decorations:[]}]},currentPreview:{issues:[],pages:[{productIndex:0,image:'front'},{productIndex:1,image:'front'}]},dirty:false,
    document:{createElement:element},colourName:x=>x,action:()=>element('button'),inputField:()=>element('label'),viewEditor:()=>element('canvas')};
  vm.createContext(context);
  const render=source.slice(source.indexOf('  function renderEditor()'),source.indexOf('  function openProofPreview('));
  vm.runInContext(render+'\nrenderEditor();',context);
  const fallback=results.children.find(node=>node.className==='proof-fallback');
  const grid=fallback.children.find(node=>node.className==='proof-placement-views');
  assert.equal(grid.children.length,2);
  assert.equal(grid.children[0].children[0].textContent,'GD010 · Grey');
  assert.equal(grid.children[1].children[0].textContent,'GD001 · Orange');
  assert.ok(grid.children.every(tile=>tile.children.length===4 && tile.children[1].tag==='label' && tile.children[3].tag==='canvas'));
});
test('canvas movement and corner scaling still update placement without numeric controls',()=>{
  const canvas=element('canvas');let dirtyCount=0;
  Object.assign(canvas,{getContext:()=>({fillRect(){},drawImage(){},strokeRect(){}}),getBoundingClientRect:()=>({left:0,top:0,width:600,height:600}),setPointerCapture(){},hasPointerCapture:()=>false,focus(){}});
  const product={code:'GD001',decorations:[{id:'mark',widthMm:100}]};
  const page={view:'front',image:'garment',width:600,height:600,placements:[{id:'mark',x:.5,y:.3,width:.2,height:.1,size:{width:100,height:50},preview:'art'}]};
  const context={document:{createElement:tag=>tag==='canvas'?canvas:element(tag)},Image:class{},busy:false,markDirty(){dirtyCount++;},product,page};
  vm.createContext(context);
  const view=source.slice(source.indexOf('  function viewEditor('),source.indexOf('  const epsPreviews='));
  vm.runInContext(view+'\nviewEditor(product,page);',context);
  const event=(x,y)=>({clientX:x,clientY:y,button:0,pointerId:1,preventDefault(){}});
  canvas.listeners.pointerdown(event(300,210));canvas.listeners.pointermove(event(330,240));canvas.listeners.pointerup(event(330,240));
  assert.ok(Math.abs(product.decorations[0].placement.x-.55)<.0001);
  assert.ok(Math.abs(product.decorations[0].placement.y-.35)<.0001);
  canvas.listeners.pointerdown(event(390,270));canvas.listeners.pointermove(event(450,300));canvas.listeners.pointerup(event(450,300));
  assert.ok(product.decorations[0].widthMm>100);assert.equal(product.decorations[0].heightMm,'');assert.equal(dirtyCount,2);assert.equal(product.decorations[0].manualScale.widthPerMm,.002);assert.equal(product.decorations[0].manualScale.view,'front');
});

test('customer and title edits retain manual geometry while updating the saved brief names',()=>{
  const brief={customer:'Old',jobTitle:'Old title',products:[{decorations:[{placement:{x:.4,y:.2},widthMm:140}]}]};
  let dirty=false;
  const context={currentBrief:brief,customer:{value:'New customer'},jobTitle:{value:'New title'},markDirty(){dirty=true;},setFeedback(){},sourceChanged(){throw Error('Metadata must not discard placements');}};
  vm.createContext(context);
  const fn=source.slice(source.indexOf('  function metadataChanged()'),source.indexOf("  const customerResults="));
  vm.runInContext(fn+'\nmetadataChanged();',context);
  assert.equal(context.currentBrief,brief);assert.equal(brief.customer,'New customer');assert.equal(brief.jobTitle,'New title');
  assert.deepEqual(brief.products[0].decorations[0],{placement:{x:.4,y:.2},widthMm:140});assert.equal(dirty,true);
});

test('opening a saved proof restores the editor without generating or saving',async()=>{
  const calls=[];
  const context={busy:false,designId:null,artworks:[],customer:{},jobTitle:{},request:{},instructions:{},reviewButton:{querySelector:()=>({})},results:element('div'),document:{createElement:element},sessionStorage:{setItem(){}},
    startNewProof(){},showProofEditor(){calls.push('editor');},showDesign(){},setCreating(){},renderHistory(){},renderEditor(){calls.push('restore');},setFeedback(){},
    async fetch(url,options){calls.push([url,options]);return {ok:true,json:async()=>({source:{request:'Saved request',brief:{products:[]}},artworks:[]})};},
    updatePreview(){throw Error('Opening must not generate a preview');}
  };
  vm.createContext(context);
  const open=source.slice(source.indexOf('  async function openHistoryProof(job)'),source.indexOf('  async function recordProgress('));
  vm.runInContext(http+open+'\nthis.open=openHistoryProof;',context);
  await context.open({id:'saved-proof',revision:6,hasPreview:true});
  assert.equal(context.request.value,'Saved request');assert.equal(context.currentBrief.proofRevision,6);
  assert.equal(context.busy,false);assert.ok(calls.includes('restore'));
  const requests=calls.filter(Array.isArray);assert.equal(requests.length,1);
  assert.equal(requests[0][0],'/api/proof-generator/designs/saved-proof/source');assert.equal(requests[0][1].method,undefined);
  assert.equal(context.results.children[0].alt,'Previously saved proof');
});

test('optional job selection sends a reference only when explicitly starting a job-linked proof',()=>{
  const fn=source.slice(source.indexOf('  function jobReservation()'),source.indexOf('  window.openLinkedProof='));
  const context={selectedLinkJob:null,design:null,existingReference:{value:'29123'}};vm.createContext(context);
  vm.runInContext(fn+'\nthis.reservation=jobReservation;',context);
  assert.equal(JSON.stringify(context.reservation()),'{}');
  context.selectedLinkJob={source_order_id:50600};
  assert.equal(JSON.stringify(context.reservation()),JSON.stringify({sourceOrderId:50600,designReference:'29123'}));
  context.design={sourceOrderId:50600};assert.equal(JSON.stringify(context.reservation()),'{}');
});

test('approved linked proofs reach the approval gate only when submitting regeneration',async()=>{
  const h=harness();h.context.design.sourceOrderId=50587;let resolveApproval;
  h.context.window={ProofLinks:{beginRegeneration:async(id,proofId)=>{
    assert.equal(id,50587);assert.equal(proofId,'existing-design');h.calls.push('approval');
    return new Promise(resolve=>{resolveApproval=resolve;});
  }}};
  const pending=h.context.run();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(h.calls,['approval']);assert.equal(h.context.busy,true);
  await h.context.run();assert.deepEqual(h.calls,['approval']); // Repeated clicks cannot start a second action.
  resolveApproval(true);h.release();await pending;
  assert.equal(h.calls[0],'approval');assert.ok(h.calls.includes('save'));assert.equal(h.context.busy,false);
});
for(const failed of [false,true])test(`regeneration ${failed?'approval-save failure':'cancel'} leaves the editor and saved proof alone`,async()=>{
  const h=harness();h.context.design.sourceOrderId=50587;
  h.context.window={ProofLinks:{beginRegeneration:async()=>{if(failed)throw Error('Approval save failed');return false;}}};
  await h.context.run();assert.deepEqual(h.calls,[]);assert.equal(h.context.busy,false);
  assert.equal(h.context.design.status,'saved');assert.equal(h.context.design.generationStatus,undefined);
  assert.equal(h.context.savedBrief,undefined);
  if(failed)assert.equal(h.context.progressMessage,'Approval save failed');
});

test('temporary gateway and network failures retry reads and recover the saved status',async()=>{
  for(const failure of [502,503,504,'network']){
    let count=0;
    const context={setTimeout:fn=>fn(),fetch:async()=>{count++;if(count===1){if(failure==='network')throw new TypeError('Failed to fetch');return new Response('upstream error',{status:failure});}return Response.json({design:{status:'saved'}});}};
    vm.createContext(context);vm.runInContext(http,context);
    const response=await context.proofFetch('/api/proof-generator/designs/id');
    assert.equal((await context.proofJson(response)).design.status,'saved');assert.equal(count,2);
  }
});
test('gateway retries are bounded and save POSTs are never replayed',async()=>{
  for(const method of ['GET','POST']){
    let count=0;const context={setTimeout:fn=>fn(),fetch:async()=>{count++;return new Response('upstream error',{status:502});}};
    vm.createContext(context);vm.runInContext(http,context);
    const response=await context.proofFetch('/api/proof-generator/save',{method});
    await assert.rejects(context.proofJson(response),/HTTP 502.*check whether saving completed/);
    assert.equal(count,method==='GET'?3:1);
  }
});
test('valid application errors are preserved and do not retry',async()=>{
  let count=0;const context={fetch:async()=>{count++;return Response.json({error:'Artwork needs attention'},{status:422});}};
  vm.createContext(context);vm.runInContext(http,context);
  assert.equal((await context.proofJson(await context.proofFetch('/proof'))).error,'Artwork needs attention');assert.equal(count,1);
});
test('failed completion notification cannot mark an acknowledged save as failed',async()=>{
  const h=harness();h.context.updatePreview=async()=>{h.context.savedThisRun=true;h.context.design={...h.context.design,designNumber:'29144',status:'saved'};h.context.currentPreview={issues:[]};};
  h.context.recordProgress=async state=>{h.calls.push(state);if(state==='complete')throw Error('upstream error');};
  const pending=h.context.run();h.release();await pending;
  assert.equal(h.context.design.generationStatus,'complete');assert.ok(!h.calls.includes('error'));assert.match(h.context.progressMessage,/Proof saved under design 29144/);
});
test('cancelled requests are not retried',async()=>{
  let count=0;const error=new Error('Cancelled');error.name='AbortError';
  const context={fetch:async()=>{count++;throw error;}};
  vm.createContext(context);vm.runInContext(http,context);
  await assert.rejects(context.proofFetch('/proof'),{name:'AbortError'});assert.equal(count,1);
});

 test('unresolved preflight stops before approval, reservation and source writes',async()=>{
  const h=harness();h.context.preflightBrief=async()=>false;
  h.context.design.sourceOrderId=50587;
  h.context.window={ProofLinks:{beginRegeneration(){throw Error('Preflight must happen first');}}};
  await h.context.run();assert.deepEqual(h.calls,[]);assert.equal(h.context.design.status,'saved');
 });

test('real preflight collects review issues before allocation and retains manual edits',async()=>{
 const calls=[];
 const brief={products:[{code:'JH001',colour:'Black',decorations:[{position:'right sleeve',widthMm:'90',placement:{x:.4,y:.3}}]}]};
 const context={busy:false,request:{value:'Original request'},instructions:{value:''},customer:{value:'Everyone Active'},jobTitle:{value:'Westway'},artworks:[{id:'logo',file:{name:'logo.png'}}],currentBrief:brief,setCreating(){},setFeedback(){},prepareArtworkFile:async()=>{},uploadForm:async b=>b,
  proofFetch:async(url,options)=>{calls.push(url);return {ok:true,json:async()=>({brief:options.body,ready:false,issues:[{path:'products.0.colour',message:'Choose exact black'}]})};},proofJson:r=>r.json(),renderPreflight:issues=>calls.push(issues[0].message)};
 vm.createContext(context);const fn=source.slice(source.indexOf('  async function preflightBrief()'),source.indexOf('  function renderPreflight('));vm.runInContext(fn+'\nthis.check=preflightBrief;',context);
 assert.equal(await context.check(),false);assert.deepEqual(calls,['/api/proof-generator/preflight','Choose exact black']);assert.equal(context.busy,false);assert.deepEqual(brief.products[0].decorations[0].placement,{x:.4,y:.3});assert.equal(brief.products[0].decorations[0].widthMm,'90');
});
