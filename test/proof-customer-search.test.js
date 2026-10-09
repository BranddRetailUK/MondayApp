const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../public/proof-generator.js'),'utf8');
function element(){return {children:[],listeners:{},value:'',append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},addEventListener(event,fn){this.listeners[event]=fn;},focus(){}};}
function harness(){
  const customer=element(),results=element(),status=element(),requests=[];let timer,changed=0;
  const context={customer,localPreview:false,AbortController,root:{querySelector:selector=>selector.endsWith('results')?results:status},document:{createElement:element},setTimeout(fn){timer=fn;},clearTimeout(){timer=null;},metadataChanged(){changed++;},fetch(url,options){return new Promise(resolve=>requests.push({url,options,resolve}));}};
  vm.createContext(context);vm.runInContext(source.slice(source.indexOf('  const customerResults='),source.indexOf("  customer.addEventListener('input',metadataChanged);")),context);
  return {customer,results,status,requests,changed:()=>changed,type(value){customer.value=value;customer.listeners.input();},run(){return timer();},reset(){vm.runInContext('clearCustomerSearch()',context);}};
}
test('customer search copies canonical match while accepting unmatched manual names',async()=>{
  const h=harness();h.type('dac');const pending=h.run();assert.match(h.requests[0].url,/q=dac$/);
  h.requests[0].resolve({ok:true,json:async()=>[{business_name:'Dacorum Borough Council',customer_code:'DAC'}]});await pending;
  h.results.children[0].listeners.click();assert.equal(h.customer.value,'Dacorum Borough Council');assert.equal(h.changed(),1);assert.equal(h.results.children.length,0);
  h.type('New Customer');const noMatch=h.run();h.requests[1].resolve({ok:true,json:async()=>[]});await noMatch;
  assert.equal(h.customer.value,'New Customer');assert.match(h.status.textContent,/use the name you entered/);
});
test('stale responses cannot replace newer suggestions or repopulate a reset form',async()=>{
  const h=harness();h.type('d');const old=h.run();h.type('da');const current=h.run();
  assert.equal(h.requests[0].options.signal.aborted,true);
  h.requests[1].resolve({ok:true,json:async()=>[{business_name:'Dacorum'}]});await current;
  h.requests[0].resolve({ok:true,json:async()=>[{business_name:'Different'}]});await old;
  assert.equal(h.results.children[0].children[0].textContent,'Dacorum');
  h.type('new');const reset=h.run();h.reset();h.requests[2].resolve({ok:true,json:async()=>[{business_name:'New'}]});await reset;assert.equal(h.results.children.length,0);
});
