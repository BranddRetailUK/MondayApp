const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../public/proof-generator.js'), 'utf8');
const review = source.slice(source.indexOf('  async function reviewBrief()'), source.indexOf('  async function uploadForm('));
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
    async designRequest(){calls.push('reserve-request');await gate;if(fail)throw Error('Service unavailable');return {id:'existing-design',revision:4,status:'saved'};},
    async recordProgress(state){calls.push(state);},async prepareArtworkFile(){},async saveProofSource(){calls.push('source');},
    async reserveDesign(brief){calls.push('identity');brief.proofDesignId=context.designId;brief.proofRevision=4;},
    async updatePreview(){calls.push('save');context.savedBrief=structuredClone(context.currentBrief);context.currentPreview={issues:[]};},
  };
  vm.createContext(context);vm.runInContext(review+history+'\nthis.run=reviewBrief;this.rowState=historyState;',context);
  return {context,calls,release};
}
test('regeneration returns to list before networking and keeps row busy until saving completes',async()=>{
  const {context,calls,release}=harness();const pending=context.run();
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
    document:{createElement:element},colourName:x=>x,action:()=>element('button'),viewEditor:()=>element('canvas')};
  vm.createContext(context);
  const render=source.slice(source.indexOf('  function renderEditor()'),source.indexOf('  function openProofPreview('));
  vm.runInContext(render+'\nrenderEditor();',context);
  const fallback=results.children.find(node=>node.className==='proof-fallback');
  const grid=fallback.children.find(node=>node.className==='proof-placement-views');
  assert.equal(grid.children.length,2);
  assert.equal(grid.children[0].children[0].textContent,'GD010 · Grey');
  assert.equal(grid.children[1].children[0].textContent,'GD001 · Orange');
  assert.ok(grid.children.every(tile=>tile.children.length===2 && tile.children[1].tag==='canvas'));
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
  assert.ok(product.decorations[0].widthMm>100);assert.equal(product.decorations[0].heightMm,'');assert.equal(dirtyCount,2);
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
  vm.runInContext(open+'\nthis.open=openHistoryProof;',context);
  await context.open({id:'saved-proof',revision:6,hasPreview:true});
  assert.equal(context.request.value,'Saved request');assert.equal(context.currentBrief.proofRevision,6);
  assert.equal(context.busy,false);assert.ok(calls.includes('restore'));
  const requests=calls.filter(Array.isArray);assert.equal(requests.length,1);
  assert.equal(requests[0][0],'/api/proof-generator/designs/saved-proof/source');assert.equal(requests[0][1].method,undefined);
  assert.equal(context.results.children[0].alt,'Previously saved proof');
});
