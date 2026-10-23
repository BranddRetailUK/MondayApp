const test=require('node:test'),assert=require('node:assert/strict');
test('identical swatches group in first-seen order without reducing sewing stops',async()=>{
 const {groupThreadSwatches,applyThreadSwatch}=await import('../public/proof-thread-swatches.mjs');
 const colours=['#b60f2f','#28292a','#B60F2F','#008745','#008745'];
 const groups=groupThreadSwatches(colours,['1147','1000','1147','1051','1051']);
 assert.deepEqual(groups.map(g=>g.indices),[[0,2],[1],[3,4]]);
 assert.deepEqual(groups.map(g=>g.codes),[['1147'],['1000'],['1051']]);
 applyThreadSwatch(colours,groups[0].indices,'#ff0000');
 assert.deepEqual(colours,['#ff0000','#28292a','#ff0000','#008745','#008745']);
 assert.equal(colours.length,5);
});
test('unassigned stops stay separate and same-colour thread codes are preserved',async()=>{
 const {groupThreadSwatches}=await import('../public/proof-thread-swatches.mjs');
 assert.deepEqual(groupThreadSwatches(['','','#ffffff','#ffffff'],['','','1001','1002']).map(g=>({indices:g.indices,codes:g.codes})),[{indices:[0],codes:[]},{indices:[1],codes:[]},{indices:[2,3],codes:['1001','1002']}]);
});
