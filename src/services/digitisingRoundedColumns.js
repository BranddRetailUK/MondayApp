// Recover rounded satin geometry from source contours, never reference stitches.
const {contours,simplify}=require('./digitisingSections');
const {dist,mix,inside,validate}=require('./digitisingProject');
const {components,straightColumns}=require('./digitisingStrokeTools');
const signed=r=>r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p[0]*q[1]-q[0]*p[1];},0)/2;
function sample(ring,step){
  const out=[];let carried=0;
  for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],length=dist(a,b);let at=step-carried;for(;at<=length;at+=step)out.push(mix(a,b,at/length));carried=length-(at-step);}
  return out;
}
function smooth(points,radius){return points.map((_,i)=>[0,1].map(k=>{let sum=0,weight=0;for(let j=-radius;j<=radius;j++){const t=radius+1-Math.abs(j);sum+=points[(i+j+points.length)%points.length][k]*t;weight+=t;}return sum/weight;}));}
function construct(ids,w,el,scale,base,project){
  const rings=contours(ids,w,el,true),holes=rings.filter(r=>signed(r)*scale*scale<-.3),outer=rings.filter(r=>signed(r)>0);
  if(outer.length!==1)return null;
  const {simplifyRungs}=require('./digitisingObjectPlan');
  const verify=o=>validate({...project,travelRegions:[],objects:[o]});
  const physical=p=>p.map(v=>(v+.5)*scale);
  // A slightly wider pitch reduces crowding in recovered rounded T-shirt
  // columns. Explicit object settings still take precedence.
  const satin=(rows,id,closed=false)=>{rows=rows.map(r=>r.map(p=>p.map((v,k)=>Math.max(0,Math.min(k?project.heightMm:project.widthMm,v)))));const o={...base,id,type:'satin',...(project.garment==='tshirt'?{settings:{satinSpacing:.31,...base.settings}}:{}),rungs:simplifyRungs(require('./digitisingSatinGeometry').stabilise(rows).rungs),...(closed?{closed:true}:{}),...(rows.some(r=>dist(...r)>9)?{splitSatin:true}:{})};try{verify(o);}catch(error){throw Error(`${id}: ${error.message}`);}return o;};
  if(!holes.length){
    // A convex rounded island has a stable principal axis even when cap twigs
    // make its medial skeleton fail. Require near-convexity, not a letter guess.
    const ring=simplify(outer[0],.15/scale).slice(0,-1),hull=[];
    const pts=ring.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cross=(a,b,c)=>(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
    for(const pass of [pts,pts.slice().reverse()]){const half=[];for(const p of pass){while(half.length>1&&cross(half.at(-2),half.at(-1),p)<=0)half.pop();half.push(p);}hull.push(...half.slice(0,-1));}
    if(Math.abs(signed(ring))/Math.abs(signed(hull))<.97){
      const rows=require('./digitisingArcColumns').guide(ids,w,el,scale);if(!rows)return null;
      const arc=satin(rows,base.id+'-arc'),rest=components(ids,w,el,scale,[arc]),parts=[];
      for(const part of rest.elements){if(part.pixels*scale*scale<.3)continue;
        for(const r of straightColumns(rest.ids,w,part,scale,.3)){if(r.length>=2)parts.push(satin(r,base.id+'-cap-'+parts.length));}
      }
      return [...parts,arc];
    }
    const rows=straightColumns(ids,w,el,scale,.3);
    if(rows.length!==1||rows[0].length<8)return null;
    const widths=rows[0].map(r=>dist(...r)),length=dist(rows[0][0][0],rows[0].at(-1)[0]);
    if(length<8||Math.max(...widths)>12||Math.max(...widths)<1||length/Math.max(...widths)<1.25)return null;
    return [satin(rows[0],base.id+'-rounded')];
  }
  const hole=holes.slice().sort((a,b)=>Math.abs(signed(b))-Math.abs(signed(a)))[0],area=Math.abs(signed(hole))*scale*scale;
  const boundary=simplify(hole,.15/scale);let perimeter=0;for(let i=1;i<boundary.length;i++)perimeter+=dist(boundary[i-1],boundary[i])*scale;
  if(area<100||4*Math.PI*area/perimeter**2<.65||holes.filter(h=>h!==hole).some(h=>Math.abs(signed(h))*scale*scale>area*.02))return null;
  const points=smooth(sample(hole.slice(0,-1),.2/scale),5);
  const mean=points.reduce((s,p)=>s.map((v,k)=>v+p[k]/points.length),[0,0]);
  const contains=p=>{const x=Math.round(p[0]),y=Math.round(p[1]);return x>=0&&x<w&&y>=0&&y<ids.length/w&&ids[y*w+x]===el.id;};
  const raw=[];
  const contour=simplify(hole,.08/scale).slice(0,-1);
  for(let i=0;i<720;i++){
    const angle=i*Math.PI/360,n=[Math.cos(angle),Math.sin(angle)];let radius=0;
    for(let j=0;j<contour.length;j++){
      const a=contour[j].map((v,k)=>v-mean[k]),b=contour[(j+1)%contour.length].map((v,k)=>v-mean[k]),d=b.map((v,k)=>v-a[k]);
      const den=n[0]*d[1]-n[1]*d[0];if(Math.abs(den)<1e-8)continue;
      const t=(a[0]*d[1]-a[1]*d[0])/den,u=(a[0]*n[1]-a[1]*n[0])/den;
      if(t>0&&u>=0&&u<=1)radius=Math.max(radius,t);
    }
    if(!radius)return null;
    const p=mean.map((v,k)=>v+n[k]*radius);let start=0;
    while(start<1&&!contains(p.map((v,k)=>v+n[k]*start/scale)))start+=.025;
    let end=start;while(end<12&&contains(p.map((v,k)=>v+n[k]*end/scale)))end+=.025;
    raw.push({p,n,start,end:end-.025});
  }
  // Smooth the normal field, not the source boundary. Bound turns away from
  // radial directions so distressed edges cannot fold the paired rails.
  const polar=smooth(raw.map(r=>r.p),7);
  for(let i=0;i<raw.length;i++){
    const a=polar[(i+raw.length-5)%raw.length],b=polar[(i+5)%raw.length],len=dist(a,b),r=raw[i];
    let normal=[(b[1]-a[1])/len,-(b[0]-a[0])/len];if(normal[0]*r.n[0]+normal[1]*r.n[1]<0)normal=normal.map(v=>-v);
    const angle=Math.atan2(r.n[0]*normal[1]-r.n[1]*normal[0],r.n[0]*normal[0]+r.n[1]*normal[1]);
    const turn=Math.max(-.35,Math.min(.35,angle));const n=[r.n[0]*Math.cos(turn)-r.n[1]*Math.sin(turn),r.n[0]*Math.sin(turn)+r.n[1]*Math.cos(turn)];
    let start=0;while(start<1&&!contains(r.p.map((v,k)=>v+n[k]*start/scale)))start+=.025;
    let end=start;while(end<12&&contains(r.p.map((v,k)=>v+n[k]*end/scale)))end+=.025;
    Object.assign(r,{n,start,end:end-.025});
  }
  const widths=raw.map(r=>r.end-r.start).sort((a,b)=>a-b),median=widths[Math.floor(widths.length/2)];
  if(widths[Math.floor(widths.length*.1)]<.8||median>8||median<1)return null;
  // Stop the main ring at branch junctions; remaining source pixels form
  // separate appendages sewn underneath the ring.
  const cap=median*1.15;
  const rows=raw.filter(r=>r.end-r.start>=.3).map(({p,n,start,end})=>[start,Math.min(end,start+cap)].map(t=>physical(p.map((v,k)=>v+n[k]*t/scale))));rows.push(rows[0].map(p=>p.slice()));
  const ring=satin(rows,base.id+'-ring',true),remaining=components(ids,w,el,scale,[ring]);const parts=[];
  for(const part of remaining.elements){if(part.pixels*scale*scale<.3)continue;
    const columns=straightColumns(remaining.ids,w,part,scale,.3);
    for(const r of columns){if(r.length<2)continue;parts.push(satin(r,base.id+'-appendage-'+parts.length));}
  }
  // Branches are sewn first so the continuous ring covers their joins.
  return [...parts,ring];
}
function recover(ids,w,el,scale,base,project){
  const objects=construct(ids,w,el,scale,base,project);if(!objects?.length)return null;
  const stride=Math.max(1,Math.ceil(Math.sqrt(el.pixels/3000)));let count=0,covered=0;
  for(let y=el.y;y<el.y+el.height;y+=stride)for(let x=el.x;x<el.x+el.width;x+=stride)if(ids[y*w+x]===el.id){
    count++;if(objects.some(o=>inside([(x+.5)*scale,(y+.5)*scale],o,.08)))covered++;
  }
  if(!count||covered<count*.99)throw Error('Rounded columns omit source coverage.');
  const radius=Math.ceil(.2/scale),near=p=>{
    const [x,y]=p.map(v=>Math.round(v/scale-.5));
    for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++)if(x+dx>=0&&x+dx<w&&y+dy>=0&&(y+dy)*w<ids.length&&Math.hypot(dx,dy)*scale<=.2&&ids[(y+dy)*w+x+dx]===el.id)return true;
    return false;
  };
  for(const o of objects)for(const [a,b]of o.rungs){const n=Math.max(1,Math.ceil(dist(a,b)/.2));for(let i=0;i<=n;i++)if(!near(mix(a,b,i/n)))throw Error('Rounded column leaves the source boundary.');}
  return objects;
}
module.exports={recover};
