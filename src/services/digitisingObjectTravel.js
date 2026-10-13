const {dist,segmentInside,outline,holes}=require('./digitisingProject');

// Split scanlines at forks/counters before sewing. Each chain follows one
// continuous strip instead of repeatedly jumping across a letter's counter.
function chains(rows,angle,spacing){
  const rad=angle*Math.PI/180,u=[Math.cos(rad),Math.sin(rad)],v=[-u[1],u[0]];
  const dot=(p,a)=>p[0]*a[0]+p[1]*a[1],bands=[];
  for(const row of rows){const y=dot(row[0],v),last=bands.at(-1);if(last&&Math.abs(last.y-y)<1e-6)last.rows.push(row);else bands.push({y,rows:[row]});}
  const out=[];let previous=[];
  for(const band of bands){
    const next=band.rows.map(row=>({row,lo:Math.min(...row.map(p=>dot(p,u))),hi:Math.max(...row.map(p=>dot(p,u)))}));
    for(const item of next)item.parents=previous.filter(p=>Math.abs(p.y-band.y)<=spacing*1.1&&Math.min(p.hi,item.hi)>=Math.max(p.lo,item.lo)-1e-6);
    for(const item of next){
      const parent=item.parents.length===1?item.parents[0]:null;
      if(parent&&next.filter(n=>n.parents.includes(parent)).length===1)item.chain=parent.chain;
      else {item.chain=[];out.push(item.chain);}
      item.chain.push(item.row);item.y=band.y;
    }
    previous=next;
  }
  return out;
}

// A bounded contour detour is sufficient for adjacent rows and counter edges.
// If no verified route exists the caller emits a trim/jump, never a blind stitch.
function route(a,b,o,margin=.08){
  if(segmentInside(a,b,o,margin))return [b];
  let best=null,bestLength=Infinity;
  for(const ring of [outline(o),...holes(o)]){
    const nearest=p=>ring.map((q,i)=>({i,d:dist(p,q)})).sort((a,b)=>a.d-b.d).slice(0,6).map(x=>x.i);
    const starts=nearest(a).filter(i=>segmentInside(a,ring[i],o,margin));
    const ends=nearest(b).filter(i=>segmentInside(ring[i],b,o,margin));
    for(const i of starts)for(const j of ends)for(const sign of [-1,1]){
      const path=[ring[i]];let at=i,length=dist(a,ring[i]);
      while(at!==j&&length<bestLength){const next=(at+sign+ring.length)%ring.length;length+=dist(ring[at],ring[next]);path.push(ring[next]);at=next;}
      length+=dist(ring[j],b);if(at!==j||length>=bestLength)continue;
      if(path.slice(1).some((p,k)=>!segmentInside(path[k],p,o,margin)))continue;
      best=[...path,b];bestLength=length;
    }
  }
  if(!best)return null;
  // Remove redundant boundary vertices without cutting through a counter.
  const compact=[];let from=a,index=0;
  while(index<best.length){let end=best.length-1;while(end>index&&!segmentInside(from,best[end],o,margin))end--;compact.push(best[end]);from=best[end];index=end+1;}
  return compact;
}
module.exports={chains,route};
