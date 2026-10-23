const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { isProofGeneratorUser } = require('../src/services/proofAccess');
const { isProduction } = require('../src/services/proofJobLinks');
const read = name => fs.readFileSync(require.resolve('../public/' + name), 'utf8');

for (const [email, scope, allowed] of [
  ['production@ultimatepromotions.co.uk', 'full', true],
  ['charlie@ultimatepromotions.co.uk', 'full', true],
  ['melvyn@ultimatepromotions.co.uk', 'full', true],
  ['melvyn@ultimatepromotions.co.uk', 'dtf_only', false],
  [' CHARLIE@ULTIMATEPROMOTIONS.CO.UK ', 'full', true],
  ['charlie@ultimatepromotions.co.uk', 'dtf_only', false],
  ['production@ultimatepromotions.co.uk', 'dtf_only', false],
  ['office@ultimatepromotions.co.uk', 'full', false],
  ['charlie@ultimatepromotions.co.uk.attacker.test', 'full', false],
  ['charlie@ultimate', 'full', false],
  ['', 'full', false],
]) {
  test(`proof access agrees across server and browser for ${email || 'anonymous'} / ${scope}`, async () => {
    const user = email ? { email, access_scope: scope } : null;
    assert.equal(isProofGeneratorUser(user), allowed);
    const productionAllowed=allowed;
    assert.equal(isProduction(user), productionAllowed);
    const tabs = ['proof-generator', 'digitising-studio', 'dtf-uploader'].map(tab => ({dataset:{tab,available:'true'}}));
    const context = {
      window:{location:{assign(){}}},
      document:{getElementById(){return null;},querySelector(){return null;},querySelectorAll(){return tabs;},body:{classList:{toggle(){},remove(){}}},dispatchEvent(){}},
      fetch:async()=>({ok:true,json:async()=>({user})}),CustomEvent:class{},console,
    };
    vm.runInNewContext(read('auth-session.js'), context);
    await context.window.ultimateHubUserPromise;
    if (user) {
      assert.equal(tabs[0].hidden, !allowed);
      const production = email.trim().toLowerCase() === 'production@ultimatepromotions.co.uk';
      assert.equal(tabs[1].hidden, !production || scope === 'dtf_only');
      assert.equal(tabs[2].hidden, !production);
    }
    vm.runInNewContext(read('proof-links.js'), context);
    assert.equal(context.window.ProofLinks.allowed(), productionAllowed);
    // Exercise the real editor initialization gate, stopping before its UI setup.
    const editor = read('proof-generator.js').split('  // Retry only reads:')[0] + '\nwindow.started = true;window.sandbox = sandbox;})();';
    const editorContext = {URLSearchParams,location:{search:''},window:{ProofDisplay:{},ultimateHubUserPromise:Promise.resolve(user)},document:{getElementById:()=>({}),body:{classList:{contains:()=>false}}}};
    await vm.runInNewContext(editor, editorContext);
    assert.equal(!!editorContext.window.started, allowed);
    if(allowed)assert.equal(editorContext.window.sandbox,false);
  });
}

for(const email of ['production@ultimatepromotions.co.uk','charlie@ultimatepromotions.co.uk','office@ultimatepromotions.co.uk'])test(`dashboard tab activation enforces separate proof and digitising access for ${email}`,()=>{
  const script=read('script.js'),activation=script.slice(script.indexOf('function activateDashboardTab(target)'),script.indexOf('window.activateDashboardTab = activateDashboardTab;'));
  let selected;
  const context={window:{ultimateHubUser:{email,access_scope:'full'}},document:{getElementById:()=>({}),querySelectorAll:()=>[]},isProductionArtworkUser:u=>u.email==='production@ultimatepromotions.co.uk',isValidDashboardTab:()=>true,setStoredDashboardTab:value=>selected=value,loadTestBoard(){},closeTestDashboardMobileJobOverview(){},closeMobileNav(){}};
  vm.createContext(context);vm.runInContext(activation,context);
  context.activateDashboardTab('proof-generator');assert.equal(selected,email.startsWith('office@')?'test-dashboard':'proof-generator');
  context.activateDashboardTab('digitising-studio');assert.equal(selected,email.startsWith('production@')?'digitising-studio':'test-dashboard');
});
