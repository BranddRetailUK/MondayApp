const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../public/database.js'), 'utf8');
const constants = source.slice(source.indexOf('  const CHILD_PRODUCT_TITLE_PATTERN'), source.indexOf('  const compareProductSizes'));
const functions = source.slice(source.indexOf('  function effectiveLineVatRate('), source.indexOf('  function orderAckNumber('));
const numberFunction = source.match(/  function orderAckNumber\(value\) \{[\s\S]*?\n  \}/)[0];
const context = vm.createContext({});
vm.runInContext(`${constants}\n${functions}\n${numberFunction}`, context);

test('catalogue garment metadata, not the design name, determines childrens VAT', () => {
  const beanie={ralawise_catalog_variant_id:19204,style_name:'Original cuffed beanie',style_code:'BC045',size:'One size',vat_rate:0.2};
  assert.equal(context.effectiveLineVatPercent({...beanie,line_description:'Sonic Youth Goo Logo — Original cuffed beanie'}),20);
  assert.equal(context.effectiveLineVatPercent({...beanie,style_name:'Junior cuffed beanie'}),0);
  assert.equal(context.effectiveLineVatPercent({...beanie,size:'5-6'}),0);
  assert.equal(context.effectiveLineVatPercent({line_description:'Kids T-shirt',vat_rate:0.2}),0);
  assert.equal(context.effectiveLineVatPercent({...beanie,vat_rate:0}),0);
});
