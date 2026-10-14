const {test}=require('node:test'),assert=require('node:assert/strict');
const {routeInside}=require('../src/services/digitisingTravel');
test('connected section travel bends around empty areas without crossing them',()=>{
 const w=40,h=40,ids=new Int16Array(w*h).fill(-1);
 for(let y=3;y<37;y++)for(let x=3;x<37;x++)if(x<10||x>29||y>29)ids[y*w+x]=0;
 const path=routeInside(ids,w,0,[6,5],[33,5],.1);assert.ok(path);assert.ok(path.some(p=>p[1]>=30));
 for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*2));for(let j=0;j<=n;j++)assert.equal(ids[Math.round(a[1]+(b[1]-a[1])*j/n)*w+Math.round(a[0]+(b[0]-a[0])*j/n)],0);}
});
test('travel does not join separate islands or another thread region',()=>{
 const ids=new Int16Array(400).fill(-1);for(let y=2;y<18;y++)for(let x=2;x<18;x++)if(x<7||x>12)ids[y*20+x]=0;
 assert.equal(routeInside(ids,20,0,[4,8],[15,8],.1),null);
 ids.fill(1);assert.equal(routeInside(ids,20,0,[4,8],[15,8],.1),null);
});
test('complex contour travel keeps safe direct runs and declines expensive counter detours',()=>{
 const {route}=require('../src/services/digitisingObjectTravel');
 const hole=Array.from({length:1021},(_,i)=>[10+5*Math.cos(i*2*Math.PI/1021),10+5*Math.sin(i*2*Math.PI/1021)]);
 const o={type:'fill',outline:[[0,0],[20,0],[20,20],[0,20]],holes:[hole]};
 assert.deepEqual(route([2,2],[18,2],o),[[18,2]]);
 assert.equal(route([2,10],[18,10],o),null);
});
