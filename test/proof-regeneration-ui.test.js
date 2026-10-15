const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../public/proof-generator.js'), 'utf8');
const review = source.slice(source.indexOf('  async function reviewBrief()'), source.indexOf('  async function uploadForm('));
const http = source.slice(source.indexOf('  // Retry only reads:'),source.indexOf('  root.innerHTML'));
const history = source.slice(source.indexOf('  function historyState(job)'), source.indexOf('  function renderHistory()'));
function createContext(context){
  for(const [key,value] of Object.entries({sandbox:false,localPreview:false,standalonePreview:false,historyEndpoint:'designs'}))if(!(key in context))context[key]=value;
  vm.createContext(context);
}
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
    async prepareMissingViews(){calls.push('views');},
    async reserveDesign(brief){calls.push('identity');brief.proofDesignId=context.designId;brief.proofRevision=4;},
    async updatePreview(){calls.push('save');context.savedBrief=structuredClone(context.currentBrief);context.currentPreview={issues:[]};},
  };
  createContext(context);vm.runInContext(review+history+'\nthis.run=reviewBrief;this.rowState=historyState;',context);
  return {context,calls,release};
}
test('regeneration returns to list before networking and keeps row busy until the numbered proof is queued',async()=>{
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
  const context={designId:'saved',results,currentBrief:{products:[{code:'GD010',colour:'Grey',decorations:[]},{code:'GD001',colour:'Orange',decorations:[]}]},currentPreview:{issues:[],pages:[{productIndex:0,image:'front'},{productIndex:1,image:'front'}]},dirty:false,
    document:{createElement:element},colourName:x=>x,action:()=>element('button'),inputField:()=>element('label'),viewEditor:()=>element('canvas')};
  createContext(context);
  const render=source.slice(source.indexOf('  function renderEditor()'),source.indexOf('  function openProofPreview('));
  vm.runInContext(render+'\nrenderEditor();',context);
  const fallback=results.children.find(node=>node.className==='proof-fallback');
  const grid=fallback.children.find(node=>node.className==='proof-placement-views');
  assert.equal(grid.children.length,2);
  assert.equal(fallback.children[0].textContent,'Adjust artwork position');
  assert.ok(grid.children.every(tile=>tile.children.length===1 && tile.children[0].tag==='canvas'));
});
test('canvas movement and corner scaling still update placement without numeric controls',()=>{
  const canvas=element('canvas');let dirtyCount=0;
  Object.assign(canvas,{getContext:()=>({fillRect(){},drawImage(){},strokeRect(){}}),getBoundingClientRect:()=>({left:0,top:0,width:600,height:600}),setPointerCapture(){},hasPointerCapture:()=>false,focus(){}});
  const product={code:'GD001',decorations:[{id:'mark',widthMm:100}]};
  const page={view:'front',image:'garment',width:600,height:600,placements:[{id:'mark',x:.5,y:.3,width:.2,height:.1,size:{width:100,height:50},preview:'art'}]};
  const context={document:{createElement:tag=>tag==='canvas'?canvas:element(tag)},Image:class{},busy:false,markDirty(){dirtyCount++;},product,page};
  createContext(context);
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
  createContext(context);
  const fn=source.slice(source.indexOf('  function metadataChanged()'),source.indexOf("  const customerResults="));
  vm.runInContext(fn+'\nmetadataChanged();',context);
  assert.equal(context.currentBrief,brief);assert.equal(brief.customer,'New customer');assert.equal(brief.jobTitle,'New title');
  assert.deepEqual(brief.products[0].decorations[0],{placement:{x:.4,y:.2},widthMm:140});assert.equal(dirty,true);
});

for(const sandbox of [false,true])test(`opening a saved ${sandbox?'test':'production'} proof restores the editor without generating or saving`,async()=>{
  const calls=[];
  const context={sandbox,localPreview:sandbox,historyEndpoint:sandbox?'tests':'designs',busy:false,designId:null,artworks:[],customer:{},jobTitle:{},request:{},instructions:{},reviewButton:{querySelector:()=>({})},results:element('div'),document:{createElement:element},sessionStorage:{setItem(){}},
    startNewProof(){},showProofEditor(){calls.push('editor');},showDesign(){},setCreating(){},renderHistory(){},renderEditor(){calls.push('restore');},setFeedback(){},
    async fetch(url,options){calls.push([url,options]);return {ok:true,json:async()=>({source:{request:'Saved request',instructions:'Legacy instruction',brief:{products:[]}},artworks:[]})};},
    loadPlacementPreview:async()=>{calls.push('placement');},
    updatePreview(){throw Error('Opening must not save or generate garment views');}
  };
  createContext(context);
  const open=source.slice(source.indexOf('  async function openHistoryProof(job)'),source.indexOf('  async function loadPlacementPreview('));
  vm.runInContext(http+open+'\nthis.open=openHistoryProof;',context);
  await context.open({id:'saved-proof',revision:6,hasPreview:true});
  assert.equal(context.request.value,'Saved request\n\nLegacy instruction');assert.ok(calls.includes('placement'));assert.equal(context.currentBrief.proofRevision,sandbox?undefined:6);assert.equal(context.currentBrief.proofDesignId,sandbox?undefined:'saved-proof');if(sandbox)assert.equal(context.currentBrief.testProofId,'saved-proof');
  assert.equal(context.busy,false);assert.ok(calls.includes('restore'));
  const requests=calls.filter(Array.isArray);assert.equal(requests.length,1);
  assert.equal(requests[0][0],`/api/proof-generator/${sandbox?'tests':'designs'}/saved-proof/source${sandbox?'?test=1':''}`);assert.equal(requests[0][1].method,undefined);
  assert.equal(context.results.children[0].alt,'Previously saved proof');
});

test('optional job selection sends a reference only when explicitly starting a job-linked proof',()=>{
  const fn=source.slice(source.indexOf('  function jobReservation()'),source.indexOf('  window.openLinkedProof='));
  const context={selectedLinkJob:null,design:null,existingReference:{value:'29123'}};createContext(context);
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
    createContext(context);vm.runInContext(http,context);
    const response=await context.proofFetch('/api/proof-generator/designs/id');
    assert.equal((await context.proofJson(response)).design.status,'saved');assert.equal(count,2);
  }
});
test('gateway retries are bounded and save POSTs are never replayed',async()=>{
  for(const method of ['GET','POST']){
    let count=0;const context={setTimeout:fn=>fn(),fetch:async()=>{count++;return new Response('upstream error',{status:502});}};
    createContext(context);vm.runInContext(http,context);
    const response=await context.proofFetch('/api/proof-generator/save',{method});
    await assert.rejects(context.proofJson(response),/HTTP 502.*check whether saving completed/);
    assert.equal(count,method==='GET'?3:1);
  }
});
test('valid application errors are preserved and do not retry',async()=>{
  let count=0;const context={fetch:async()=>{count++;return Response.json({error:'Artwork needs attention'},{status:422});}};
  createContext(context);vm.runInContext(http,context);
  assert.equal((await context.proofJson(await context.proofFetch('/proof'))).error,'Artwork needs attention');assert.equal(count,1);
});
test('queued proof needs no further completion request before becoming available',async()=>{
  const h=harness();h.context.updatePreview=async()=>{h.context.readyThisRun=true;h.context.design={...h.context.design,designNumber:'29144',status:'save_queued',generationStatus:'complete',hasPdf:true};h.context.currentPreview={issues:[]};};
  h.context.recordProgress=async state=>{h.calls.push(state);if(state==='complete')throw Error('upstream error');};
  const pending=h.context.run();h.release();await pending;
  assert.equal(h.context.design.generationStatus,'complete');assert.ok(!h.calls.includes('error'));assert.ok(!h.calls.includes('complete'));assert.equal(h.context.busy,false);assert.equal(h.context.rowState(h.context.design)[0],'Proof ready');
});
test('cancelled requests are not retried',async()=>{
  let count=0;const error=new Error('Cancelled');error.name='AbortError';
  const context={fetch:async()=>{count++;throw error;}};
  createContext(context);vm.runInContext(http,context);
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
 createContext(context);const fn=source.slice(source.indexOf('  async function preflightBrief()'),source.indexOf('  function renderPreflight('));vm.runInContext(fn+'\nthis.check=preflightBrief;',context);
 assert.equal(await context.check(),false);assert.deepEqual(calls,['/api/proof-generator/preflight','Choose exact black']);assert.equal(context.busy,false);assert.deepEqual(brief.products[0].decorations[0].placement,{x:.4,y:.3});assert.equal(brief.products[0].decorations[0].widthMm,'90');
});

for(const sandbox of [false,true])test(`restores editable placement data in ${sandbox?'sandbox':'production'} without saving`,async()=>{
 const brief={products:[{decorations:[{id:'mark',placement:{x:.4,y:.2}}]}]};
 const payload={brief,pages:[{image:'garment',placements:[{id:'mark'}]}],issues:[]};
 let rendered=false;
 const context={sandbox,currentBrief:brief,uploadForm:async b=>b,proofFetch:async(url,options)=>{assert.equal(url,'/api/proof-generator/placement-preview');assert.equal(options.body,brief);return {ok:true};},proofJson:async()=>payload,renderEditor(){rendered=true;}};
 createContext(context);
 const fn=source.slice(source.indexOf('  async function loadPlacementPreview()'),source.indexOf('  async function recordProgress('));
 vm.runInContext(fn+'\nthis.load=loadPlacementPreview;',context);await context.load();
 assert.equal(context.currentPreview,payload);assert.equal(rendered,true);
});

test('folder allocation overlaps view preparation and both finish before numbered rendering',async()=>{
 const h=harness();let releaseFolder,releaseViews;
 const folder=new Promise(resolve=>releaseFolder=resolve),views=new Promise(resolve=>releaseViews=resolve);
 h.context.reserveDesign=async brief=>{h.calls.push('folder-start');await folder;brief.proofDesignId='existing-design';brief.proofRevision=4;brief.reference='30001';h.calls.push('folder-end');};
 h.context.prepareMissingViews=async()=>{h.calls.push('views-start');await views;h.context.currentBrief=structuredClone(h.context.currentBrief);h.calls.push('views-end');};
 const pending=h.context.run();h.release();await new Promise(resolve=>setImmediate(resolve));
 assert.ok(h.calls.includes('folder-start'));assert.ok(h.calls.includes('views-start'));assert.ok(!h.calls.includes('save'));
 releaseFolder();await new Promise(resolve=>setImmediate(resolve));assert.ok(!h.calls.includes('save'));
 releaseViews();await pending;assert.equal(h.context.savedBrief.reference,'30001');assert.equal(h.context.savedBrief.proofRevision,4);
});
test('ready proofs remain accessible while saving and after background save failure',()=>{
 const h=harness();h.context.busy=false;
 for(const status of ['save_queued','saving'])assert.equal(h.context.rowState({id:'other',hasPdf:true,status,generationStatus:'generating'})[0],'Proof ready');
 assert.equal(h.context.rowState({id:'other',hasPdf:true,status:'error',message:'Worker offline'})[0],'Save needs attention');
});
test('the production render queues the proof once and never waits for the worker',async()=>{
 const calls=[];const brief={products:[]};
 const context={currentBrief:brief,designId:'id',design:{revision:2},localPreview:false,sandbox:false,generatingProof:true,selectedLinkJob:null,artworks:[],localStorage:{},crypto:{randomUUID:()=> 'save-key'},setFeedback(){},showDesign(){},renderEditor(){},uploadForm:async(b,originals)=>{assert.equal(originals,true);assert.equal(b.proofSaveKey,'save-key');return b;},proofFetch:async(url)=>{calls.push(url);return {ok:true};},proofJson:async()=>({brief,pages:[],issues:[],design:{id:'id',revision:3,designNumber:'30001',hasPdf:true,status:'save_queued'}}),awaitDesign(){throw Error('Do not wait for the worker');}};
 createContext(context);const fn=source.slice(source.indexOf('  async function updatePreview('),source.indexOf('  async function prepareMissingViews('));
 vm.runInContext(fn+'\nthis.run=()=>updatePreview(true,true,true);',context);await context.run();
 assert.deepEqual(calls,['/api/proof-generator/generate']);assert.equal(context.readyThisRun,true);assert.equal(context.generatingProof,false);assert.equal(context.design.status,'save_queued');
});
