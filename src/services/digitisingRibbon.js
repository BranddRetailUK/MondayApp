const {contours,simplify}=require('./digitisingSections');
const {dist,mix}=require('./digitisingProject');

// Match progress along the two boundaries of an open ribbon. Corner points on
// either rail remain paired controls, spreading a turn across both stroke arms.
function ribbon(ids,w,element,scale,angle,startCap,endCap,tolerance=.06){
  const rad=angle*Math.PI/180,u=[Math.cos(rad),Math.sin(rad)],v=[-u[1],u[0]];
  const local=p=>[p[0]*u[0]+p[1]*u[1],p[0]*v[0]+p[1]*v[1]];
  const ring=simplify(contours(ids,w,element)[0],tolerance/scale).slice(0,-1);
  const cap=side=>{
    if(Array.isArray(side))return ring.map((p,i)=>({i,d:dist(mix(p,ring[(i+1)%ring.length],.5),side)})).sort((a,b)=>a.d-b.d)[0].i;
    const axis=side==='right'?0:1,sign=side==='up'?-1:1,edges=[];
    for(let i=0;i<ring.length;i++){const a=local(ring[i]),b=local(ring[(i+1)%ring.length]);
      if(dist(a,b)*scale<.5||Math.abs(b[axis]-a[axis])>Math.abs(b[1-axis]-a[1-axis])*.6)continue;
      edges.push({i,score:sign*(a[axis]+b[axis])/2});
    }
    edges.sort((a,b)=>b.score-a.score);if(!edges.length)throw Error('Ribbon has no stable end cap.');return edges[0].i;
  };
  const a=cap(startCap),b=cap(endCap);if(a===b)throw Error('Ribbon end caps coincide.');
  const path=(from,to)=>{const pts=[];for(let i=(from+1)%ring.length;i!==to;i=(i+1)%ring.length)pts.push(ring[i]);pts.push(ring[to]);return pts;};
  const rails=[path(a,b),path(b,a).reverse()];
  const lengths=rails.map(pts=>{const d=[0];for(let i=1;i<pts.length;i++)d.push(d.at(-1)+dist(pts[i-1],pts[i]));return d.map(n=>n/d.at(-1));});
  const at=(side,t)=>{const d=lengths[side],points=rails[side];let i=1;while(i<d.length-1&&d[i]<t)i++;return mix(points[i-1],points[i],(t-d[i-1])/(d[i]-d[i-1]));};
  const raw=[...new Set([...lengths[0],...lengths[1]])].sort((a,b)=>a-b),ts=[0];
  const centreAt=t=>mix(at(0,t),at(1,t),.5);
  for(const t of raw.slice(1,-1))if(dist(centreAt(t),centreAt(ts.at(-1)))*scale>=.015)ts.push(t);
  if(dist(centreAt(1),centreAt(ts.at(-1)))*scale<.015)ts.pop();ts.push(1);
  let rows=ts.map(t=>[at(0,t),at(1,t)]);
  // Long/italic arms can make normalized perimeter progress pair distant
  // corners. Keep established valid ribbons unchanged; otherwise align the
  // rails monotonically by source-contained cross-stroke distance.
  if(rows.some(r=>dist(...r)*scale>9)&&tolerance<.15)return ribbon(ids,w,element,scale,angle,startCap,endCap,.15);
  if(rows.some(r=>dist(...r)*scale>9))rows=alignRails(rails,ids,w,element.id,scale,tolerance+Math.max(.08,scale*Math.SQRT2/2));
  return rows.map(r=>r.map(p=>p.map(n=>(n+.5)*scale)));

}
function alignRails(rails,ids,w,id,scale,margin){
  const sample=points=>{const out=[points[0]];for(let i=1;i<points.length;i++){
    const n=Math.max(1,Math.ceil(dist(points[i-1],points[i])*scale/.3));
    for(let j=1;j<=n;j++)out.push(mix(points[i-1],points[i],j/n));
  }return out;};
  const [a,b]=rails.map(sample),cols=b.length;
  if(a.length*cols>2000000)throw Error('Ribbon alignment exceeds geometry limit.');
  const costs=new Float64Array(a.length*cols).fill(Infinity),back=new Uint8Array(costs.length);
  const contained=(p,q)=>{const n=Math.ceil(dist(p,q)*scale/.15);for(let i=1;i<n;i++){
    const r=mix(p,q,i/n).map(Math.round);if(ids[r[1]*w+r[0]]!==id){
      const radius=Math.ceil(margin/scale);let near=false;
      for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++)if(r[0]+dx>=0&&r[0]+dx<w&&r[1]+dy>=0&&(r[1]+dy)*w<ids.length&&Math.hypot(dx,dy)*scale<=margin&&ids[(r[1]+dy)*w+r[0]+dx]===id)near=true;
      if(!near)return false;
    }
  }return true;};
  for(let i=0;i<a.length;i++)for(let j=0;j<cols;j++){
    const width=dist(a[i],b[j])*scale;if(width<.3||width>12||!contained(a[i],b[j]))continue;
    const k=i*cols+j,options=[i&&j?costs[k-cols-1]:Infinity,i?costs[k-cols]:Infinity,j?costs[k-1]:Infinity];
    if(i===0&&j===0){costs[k]=width*width;continue;}
    const best=Math.min(...options);if(!Number.isFinite(best))continue;
    costs[k]=best+width*width;back[k]=options.indexOf(best)+1;
  }
  let i=a.length-1,j=b.length-1;const rows=[];
  if(!Number.isFinite(costs[i*cols+j]))throw Error('Cannot pair source ribbon rails within the split-satin limit.');
  while(true){rows.push([a[i],b[j]]);if(!i&&!j)break;const step=back[i*cols+j];if(step===1){i--;j--;}else if(step===2)i--;else j--;}
  return rows.reverse();
}
module.exports={ribbon};
