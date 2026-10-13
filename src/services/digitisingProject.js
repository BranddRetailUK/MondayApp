// Editable physical embroidery objects. This module has no network or model dependency.
const VERSION=1;
const PROFILES={tshirt:{fillSpacing:.42,satinSpacing:.34,underlaySpacing:1.8,stitchLength:3.8,pullCompensation:.1},hoodie:{fillSpacing:.4,satinSpacing:.32,underlaySpacing:1.3,stitchLength:3.8,pullCompensation:.15},woven:{fillSpacing:.45,satinSpacing:.36,underlaySpacing:2.2,stitchLength:3.8,pullCompensation:.08}};
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const centre=r=>mix(r[0],r[1],.5);
const fail=message=>{throw Error(`Embroidery project: ${message}`);};
const number=(n,min,max,label)=>{if(!Number.isFinite(n)||n<min||n>max)fail(`${label} must be ${min}–${max}.`);};
function area(ring){return Math.abs(ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-q[0]*p[1];},0))/2;}
function edgeDistance(p,a,b){const den=dist(a,b)**2,t=den?Math.max(0,Math.min(1,((p[0]-a[0])*(b[0]-a[0])+(p[1]-a[1])*(b[1]-a[1]))/den)):0;return dist(p,mix(a,b,t));}
function inRing(p,ring){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[j],b=ring[i];if(edgeDistance(p,a,b)<1e-7)return true;
  if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;
}return yes;}
function cross(a,b,c){return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);}
function intersects(a,b,c,d){
  const x=cross(a,b,c),y=cross(a,b,d),u=cross(c,d,a),v=cross(c,d,b);
  if(x*y<0&&u*v<0)return true;
  return (Math.abs(x)<1e-8&&edgeDistance(c,a,b)<1e-8)||(Math.abs(y)<1e-8&&edgeDistance(d,a,b)<1e-8)||(Math.abs(u)<1e-8&&edgeDistance(a,c,d)<1e-8)||(Math.abs(v)<1e-8&&edgeDistance(b,c,d)<1e-8);
}
function ringEdges(ring){return ring.map((p,i)=>[p,ring[(i+1)%ring.length]]);}
function satinRings(object){
  const a=object.rungs.map(r=>r[0]),b=object.rungs.map(r=>r[1]);
  if(object.closed){a.pop();b.pop();return area(a)>area(b)?[a,b]:[b,a];}
  return [[...a,...b.reverse()]];
}
function outline(object){return object.type==='satin'?satinRings(object)[0]:object.outline;}
function holes(object){return object.type==='satin'?satinRings(object).slice(1):(object.holes||[]);}
function inside(p,object,margin=0){
  const outer=outline(object),cutouts=holes(object);
  if(inRing(p,outer)&&!cutouts.some(r=>inRing(p,r)))return true;
  return margin>0&&[outer,...cutouts].some(r=>ringEdges(r).some(([a,b])=>edgeDistance(p,a,b)<=margin));
}
function segmentInside(a,b,object,margin=0){
  // Include every polygon intersection, not only sampled endpoints; narrow holes
  // must not disappear between samples on a long stitch or connector.
  const ts=[0,1],dx=b[0]-a[0],dy=b[1]-a[1];
  for(const ring of [outline(object),...holes(object)])for(const [c,d]of ringEdges(ring)){
    const ex=d[0]-c[0],ey=d[1]-c[1],den=dx*ey-dy*ex;if(Math.abs(den)<1e-10)continue;
    const t=((c[0]-a[0])*ey-(c[1]-a[1])*ex)/den,u=((c[0]-a[0])*dy-(c[1]-a[1])*dx)/den;
    if(t>0&&t<1&&u>=0&&u<=1)ts.push(t);
  }
  ts.sort((a,b)=>a-b);
  for(let i=0;i<ts.length;i++){if(!inside(mix(a,b,ts[i]),object,margin))return false;if(i&& !inside(mix(a,b,(ts[i-1]+ts[i])/2),object,margin))return false;}
  return true;
}
function validate(input){
  const p=structuredClone(input);
  if(!p||p.version!==VERSION||p.units!=='mm'||!PROFILES[p.garment])fail('unsupported version, units or garment.');
  number(p.widthMm,1,300,'width');number(p.heightMm,1,360,'height');
  if(!Array.isArray(p.objects)||!p.objects.length||p.objects.length>128)fail('provide 1–128 ordered objects.');
  const ids=new Set();let points=0;
  const point=q=>{if(!Array.isArray(q)||q.length!==2)fail('invalid point.');number(q[0],0,p.widthMm,'point X');number(q[1],0,p.heightMm,'point Y');if(++points>12000)fail('too many control points.');};
  const ring=r=>{
    if(!Array.isArray(r)||r.length<3||r.length>512)fail('a contour needs 3–512 vertices.');r.forEach(point);
    if(area(r)<.001)fail('degenerate contour.');
    const edges=ringEdges(r);for(let i=0;i<edges.length;i++){
      if(dist(...edges[i])<1e-6)fail('duplicate contour vertices.');
      for(let j=i+2;j<edges.length;j++)if(!(i===0&&j===edges.length-1)&&intersects(...edges[i],...edges[j]))fail('self-intersecting contour.');
    }
  };
  for(const o of p.objects){
    if(!o||typeof o.id!=='string'||!/^[-\w]{1,64}$/.test(o.id)||ids.has(o.id))fail('object IDs must be unique.');ids.add(o.id);
    if(!/^#[\da-f]{6}$/i.test(o.colour)||!['satin','fill','run'].includes(o.type))fail('invalid colour or object type.');
    o.entry=o.entry||'start';if(!['start','end'].includes(o.entry))fail('invalid entry direction.');
    o.settings={...PROFILES[p.garment],underlay:o.type==='run'?'none':'centre',...o.settings};
    const s=o.settings;number(s.fillSpacing,.2,.6,'fill spacing');number(s.satinSpacing,.2,.6,'satin spacing');number(s.underlaySpacing,.8,4,'underlay spacing');number(s.stitchLength,1,4,'stitch length');number(s.pullCompensation,0,.3,'pull compensation');
    if(!['none','centre','zigzag'].includes(s.underlay))fail('unsupported underlay.');
    if(o.type==='satin'){
      if(!Array.isArray(o.rungs)||o.rungs.length<2||o.rungs.length>256)fail('satin needs 2–256 paired direction rungs.');
      for(const r of o.rungs){if(!Array.isArray(r)||r.length!==2)fail('invalid satin rung.');r.forEach(point);number(dist(...r),.3-1e-8,9+1e-8,'satin width');}
      for(let i=1;i<o.rungs.length;i++)if(dist(centre(o.rungs[i-1]),centre(o.rungs[i]))<.01)fail('satin rungs must advance along the stroke.');
      if(o.closed!==undefined&&typeof o.closed!=='boolean')fail('invalid closed-column flag.');
      if(o.closed&&(dist(o.rungs[0][0],o.rungs.at(-1)[0])>.001||dist(o.rungs[0][1],o.rungs.at(-1)[1])>.001))fail('closed satin must return to its first rung.');
      for(const r of satinRings(o))ring(r);
      if(o.closed&&(!holes(o)[0].every(q=>inRing(q,outline(o)))||ringEdges(holes(o)[0]).some(e=>ringEdges(outline(o)).some(f=>intersects(...e,...f)))))fail('closed satin rails must enclose a counter.');
    }else if(o.type==='fill'){
      ring(o.outline);o.holes=o.holes||[];if(!Array.isArray(o.holes)||o.holes.length>32)fail('too many holes.');
      for(const h of o.holes){ring(h);if(!h.every(q=>inRing(q,o.outline))||ringEdges(h).some(e=>ringEdges(o.outline).some(f=>intersects(...e,...f))))fail('hole must be strictly inside outline.');}
      for(let i=0;i<o.holes.length;i++)for(let j=i+1;j<o.holes.length;j++)if(inRing(o.holes[i][0],o.holes[j])||inRing(o.holes[j][0],o.holes[i])||ringEdges(o.holes[i]).some(e=>ringEdges(o.holes[j]).some(f=>intersects(...e,...f))))fail('holes overlap.');
      number(o.angle,0,180,'fill angle');
    }else{if(!Array.isArray(o.path)||o.path.length<2||o.path.length>512)fail('run needs 2–512 points.');o.path.forEach(point);if(o.path.slice(1).every((q,i)=>dist(q,o.path[i])<.01))fail('empty run.');}
  }
  return p;
}
function satinRows(o){
  const step=o.settings.satinSpacing/2,rows=[o.rungs[0]],rungs=o.rungs;let carried=0;
  for(let i=1;i<rungs.length;i++){
    const a=rungs[i-1],b=rungs[i],length=dist(centre(a),centre(b));let at=step-carried;
    for(;at<=length;at+=step){rows.push([mix(a[0],b[0],at/length),mix(a[1],b[1],at/length)]);if(rows.length>50000)fail('too many satin rows.');}
    carried=length-(at-step);
  }
  if(dist(centre(rows.at(-1)),centre(rungs.at(-1)))>.05)rows.push(rungs.at(-1));
  return o.entry==='end'?rows.reverse():rows;
}
function fillRows(o,spacing,angle){
  const rad=angle*Math.PI/180,u=[Math.cos(rad),Math.sin(rad)],v=[-u[1],u[0]],dot=(p,q)=>p[0]*q[0]+p[1]*q[1];
  const rings=[o.outline,...o.holes].map(r=>r.map(p=>[dot(p,u),dot(p,v)])),ys=rings[0].map(p=>p[1]),out=[];
  for(let y=Math.min(...ys)+spacing/2;y<Math.max(...ys);y+=spacing){
    const xs=[];for(const r of rings)for(const [a,b]of ringEdges(r))if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y))xs.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));
    xs.sort((a,b)=>a-b);for(let i=0;i+1<xs.length;i+=2)if(xs[i+1]-xs[i]>=.3)out.push([xs[i],xs[i+1]].map(x=>[x*u[0]+y*v[0],x*u[1]+y*v[1]]));
    if(out.length>20000)fail('too many fill rows.');
  }
  if(o.entry==='end')out.reverse();return out;
}
function edit(project,id,operation,value){
  const p=validate(project),i=p.objects.findIndex(o=>o.id===id);if(i<0)fail('unknown object.');const o=p.objects[i];
  if(operation==='settings')o.settings={...o.settings,...value};
  else if(operation==='geometry'){
    const allowed=o.type==='satin'?['rungs','closed']:o.type==='fill'?['outline','holes','angle']:['path'];
    if(!value||typeof value!=='object'||Object.keys(value).some(k=>!allowed.includes(k)))fail('invalid geometry edit.');
    Object.assign(o,structuredClone(value));
  }
  else if(operation==='reverse')o.entry=o.entry==='start'?'end':'start';
  else if(operation==='move'){if(!Number.isInteger(value)||value<0||value>=p.objects.length)fail('invalid sequence position.');p.objects.splice(i,1);p.objects.splice(value,0,o);}
  else if(operation==='split-satin'){
    if(o.type!=='satin'||!Number.isInteger(value)||value<=0||value>=o.rungs.length-1)fail('split needs an interior satin rung.');
    p.objects.splice(i,1,{...o,id:o.id+'-a',closed:false,rungs:o.rungs.slice(0,value+1)},{...o,id:o.id+'-b',closed:false,rungs:o.rungs.slice(value)});
    if(o.entry==='end')p.objects.splice(i,2,p.objects[i+1],p.objects[i]);
  }else fail('unsupported edit operation.');
  return validate(p);
}
function resize(project,widthMm){
  const p=validate(project);number(widthMm,1,300,'width');const scale=widthMm/p.widthMm;
  p.widthMm=widthMm;p.heightMm*=scale;const point=q=>q.map(n=>n*scale);
  for(const o of p.objects){
    if(o.type==='satin')o.rungs=o.rungs.map(r=>r.map(point));
    else if(o.type==='fill'){o.outline=o.outline.map(point);o.holes=o.holes.map(r=>r.map(point));}
    else o.path=o.path.map(point);
  }
  // Physical stitch settings stay fixed; resizing requires fresh compilation.
  // Oversized satin columns fail validation and require conversion to fill.
  return validate(p);
}
module.exports={VERSION,PROFILES,validate,edit,resize,satinRows,fillRows,inside,segmentInside,outline,holes,dist,mix,centre};
