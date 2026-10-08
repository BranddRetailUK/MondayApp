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
  const context={busy:false,generatingProof:false,designId:'existing-design',design:{id:'existing-design',status:'saved',revision:4},localPreview:false,
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
