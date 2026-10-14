// A source-derived rectangular ground with overlaid artwork and a satin finish.
// Recognition is geometric; no customer identities or reference stitches enter it.
const {contours,simplify}=require('./digitisingSections');
const {dist,inside}=require('./digitisingProject');
function measure(prepared,element){
  const {ids,info,scale,elements}=prepared;
  const ring=simplify(contours(ids,info.width,element)[0],Math.max(.12/scale,1.5)).slice(0,-1).map(p=>p.map(v=>(v+.5)*scale));
  if(ring.length<4)return null;
  const longest=ring.map((p,i)=>({p,q:ring[(i+1)%ring.length],length:dist(p,ring[(i+1)%ring.length])})).sort((a,b)=>b.length-a.length)[0];
  if(longest.length<5)return null;
  const u=longest.q.map((v,k)=>(v-longest.p[k])/longest.length),v=[-u[1],u[0]],dot=(p,q)=>p[0]*q[0]+p[1]*q[1];
  const projected=ring.map(p=>[dot(p,u),dot(p,v)]),xs=projected.map(p=>p[0]),ys=projected.map(p=>p[1]);
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  if(Math.min(x1-x0,y1-y0)<10)return null;
  // Verify the entire source perimeter against an oriented rectangle. This
  // tolerates raster stair-steps without accepting arbitrary broad polygons.
  if(projected.some(([x,y])=>Math.min(x-x0,x1-x,y-y0,y1-y)>Math.max(.2,scale*2)))return null;
  const points=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]].map(([x,y])=>[x*u[0]+y*v[0],x*u[1]+y*v[1]]);
  const enclosed=elements.filter(e=>e.id!==element.id&&[[e.x,e.y],[e.x+e.width,e.y],[e.x+e.width,e.y+e.height],[e.x,e.y+e.height]].every(p=>inside(p.map(v=>v*scale),{type:'fill',outline:points,holes:[]})));
  if(enclosed.filter(e=>e.colour!==element.colour).length<2)return null;
  return {points,enclosed:enclosed.map(e=>e.id)};
}
function construct(panel,base){
  const outer=panel.points;
  // Inset by intersecting the two orthogonal edge offsets at each corner.
  const inset=amount=>outer.map((p,i)=>{
    const a=outer[(i+3)%4].map((v,k)=>v-p[k]),b=outer[(i+1)%4].map((v,k)=>v-p[k]);
    return p.map((v,k)=>v+amount*(a[k]/dist([0,0],a)+b[k]/dist([0,0],b)));
  });
  const inner=inset(2),rungs=outer.map((p,i)=>[inner[i],p]);rungs.push(rungs[0].map(p=>p.slice()));
  const longest=outer.map((p,i)=>({p,q:outer[(i+1)%4],length:dist(p,outer[(i+1)%4])})).sort((a,b)=>b.length-a.length)[0];
  const angle=(Math.atan2(longest.q[1]-longest.p[1],longest.q[0]-longest.p[0])*180/Math.PI+125+360)%180;
  return [{...base,id:base.id+'-ground',type:'fill',outline:inset(.6),holes:[],angle,settings:{stitchLength:4}},
    {...base,id:base.id+'-edge',type:'satin',rungs,closed:true,settings:{underlay:'centre'}}];
}
// A bounded optical correction is proposed only for an already centred,
// single-colour satin wordmark. Deliberately offset or strongly asymmetric
// artwork is left in its supplied position. The caller must flag the adjustment.
function opticalProposal(prepared,panel,groundId,project,owners){
  if(project.garment!=='tshirt')return null;
  const ground=prepared.elements.find(e=>e.id===groundId);
  const ids=new Set(panel.enclosed.filter(id=>prepared.elements.find(e=>e.id===id)?.colour!==ground.colour));
  const colours=new Set(prepared.elements.filter(e=>ids.has(e.id)).map(e=>e.colour));
  const selected=project.objects.filter(o=>ids.has(owners.get(o.id)));
  if(ids.size<2||colours.size!==1||!selected.length||selected.some(o=>o.type!=='satin'))return null;
  const p=panel.points,edges=p.map((a,i)=>({a,b:p[(i+1)%4],length:dist(a,p[(i+1)%4])})).sort((a,b)=>b.length-a.length);
  const u=edges[0].b.map((v,k)=>(v-edges[0].a[k])/edges[0].length),v=[-u[1],u[0]],dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
  const limits=[u,v].map(axis=>{const values=p.map(q=>dot(q,axis));return [Math.min(...values),Math.max(...values)];});
  const sums=[0,0],lo=[Infinity,Infinity],hi=[-Infinity,-Infinity];let count=0;
  for(let k=0;k<prepared.ids.length;k++)if(ids.has(prepared.ids[k])){
    const point=[(k%prepared.info.width+.5)*prepared.scale,(Math.floor(k/prepared.info.width)+.5)*prepared.scale];count++;
    [u,v].forEach((axis,i)=>{const q=dot(point,axis);sums[i]+=q;lo[i]=Math.min(lo[i],q);hi[i]=Math.max(hi[i],q);});
  }
  if(!count||hi[0]-lo[0]<(limits[0][1]-limits[0][0])*.6)return null;
  const centres=limits.map(([a,b])=>(a+b)/2),local=centres.map((c,i)=>c-sums[i]/count);
  if(local.some((delta,i)=>Math.abs((lo[i]+hi[i])/2-centres[i])>.5||Math.abs(delta)>Math.min(1,(limits[i][1]-limits[i][0])*.01)))return null;
  const shift=[0,1].map(i=>u[i]*local[0]+v[i]*local[1]);if(Math.hypot(...shift)<.05)return null;
  const candidate=structuredClone(project),names=new Set(selected.map(o=>o.id)),regions=new Set(selected.map(o=>o.regionId).filter(Boolean));
  if(candidate.objects.some(o=>regions.has(o.regionId)&&!names.has(o.id)))return null;
  const move=q=>q.map((n,i)=>n+shift[i]);
  for(const o of candidate.objects)if(names.has(o.id)){
    o.rungs=o.rungs.map(r=>r.map(move));
    if(o.rungs.flat().some(q=>!inside(q,{type:'fill',outline:panel.points,holes:[]})))return null;
    o.settings={...o.settings,satinSpacing:.24,pullCompensation:.2};
  }
  for(const region of candidate.travelRegions)if(regions.has(region.id)){region.outline=region.outline.map(move);region.holes=region.holes.map(r=>r.map(move));}
  return {project:candidate,shift};
}
module.exports={measure,construct,opticalProposal};
