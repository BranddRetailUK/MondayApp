const {contours,simplify}=require('./digitisingSections');
const {dist,mix}=require('./digitisingProject');

// Match progress along the two boundaries of an open ribbon. Corner points on
// either rail remain paired controls, spreading a turn across both stroke arms.
function ribbon(ids,w,element,scale,angle,startCap,endCap){
  const rad=angle*Math.PI/180,u=[Math.cos(rad),Math.sin(rad)],v=[-u[1],u[0]];
  const local=p=>[p[0]*u[0]+p[1]*u[1],p[0]*v[0]+p[1]*v[1]];
  const ring=simplify(contours(ids,w,element)[0],.06/scale).slice(0,-1);
  const cap=side=>{
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
  return ts.map(t=>[at(0,t),at(1,t)].map(p=>p.map(n=>(n+.5)*scale)));
}
module.exports={ribbon};
