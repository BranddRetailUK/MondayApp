const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const router = require('../src/routes/file-viewer');
const route = router.stack.find(layer => layer.route).route;

function response() {
  return { code: 200, headers: {}, status(n) { this.code=n; return this; }, json(value) { this.body=value; return this; }, sendStatus(n) { this.code=n; }, set(k,v) { this.headers[k]=v; }, sendFile(file) { this.file=file; } };
}
test('PDF renderer denies anonymous and uploader-only callers', () => {
  for (const [user,code] of [[null,401],[{access_scope:'dtf_only'},403]]) {
    const res=response();let passed=false;
    route.stack[0].handle({hubUser:user},res,()=>{passed=true;});
    assert.equal(res.code,code);assert.equal(passed,false);
  }
});
test('PDF renderer allows full users and serves only the two installed renderer assets', () => {
  let passed=false;route.stack[0].handle({hubUser:{access_scope:'full'}},response(),()=>{passed=true;});assert.equal(passed,true);
  for (const asset of ['pdf.mjs','pdf.worker.mjs']) {
    const res=response();route.stack[1].handle({params:{asset}},res);
    assert.equal(path.basename(res.file),asset);assert.ok(fs.existsSync(res.file));assert.equal(res.headers['Cache-Control'],'private, no-store');
  }
  for (const asset of ['../../package.json','package.json','pdf.mjs.map']) {
    const res=response();route.stack[1].handle({params:{asset}},res);assert.equal(res.code,404);assert.equal(res.file,undefined);
  }
});
test('DTF navigation is exclusive to the exact production email, including uploader-only accounts', async () => {
  const source=fs.readFileSync(path.join(__dirname,'../public/auth-session.js'),'utf8');
  for (const [email,scope,hidden] of [
    ['production@ultimatepromotions.co.uk','full',false],
    [' PRODUCTION@ULTIMATEPROMOTIONS.CO.UK ','full',false],
    ['person@example.test','full',true],
    ['person@example.test','dtf_only',true],
    ['production@ultimatepromotions.co.uk.example.test','full',true],
  ]) {
    const tabs=['dtf-uploader','file-viewer','test-dashboard'].map(tab=>({dataset:{tab},hidden:false}));
    const context={window:{location:{assign(){throw Error('Unexpected redirect');}}},document:{getElementById(){return null;},querySelector(){return null;},querySelectorAll(){return tabs;},body:{classList:{toggle(){},remove(){}}},dispatchEvent(){}},fetch:async()=>({ok:true,json:async()=>({user:{email,access_scope:scope}})}),CustomEvent:class{},console};
    vm.runInNewContext(source,context);await context.window.ultimateHubUserPromise;
    assert.equal(tabs[0].hidden,hidden,email);assert.equal(tabs[1].hidden,scope==='dtf_only');
  }
});
