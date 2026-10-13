const {contours,simplify}=require('./digitisingSections');
const {dist,mix}=require('./digitisingProject');
const {stabilise}=require('./digitisingSatinGeometry');

// Follow the actual inner boundary of a closed stroke. Medial-axis branches at
// joins must not drag a closed counter's direction controls down another limb.
function counterColumns(ids,w,element,scale){
  const rings=contours(ids,w,element),signed=r=>r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p[0]*q[1]-q[0]*p[1];},0);
  const inside=p=>{const x=Math.round(p[0]),y=Math.round(p[1]);return x>=0&&x<w&&y>=0&&y<ids.length/w&&ids[y*w+x]===element.id;};
  const output=[];
  for(const contour of rings){
    if(signed(contour)>=0||Math.abs(signed(contour))*scale*scale<.3)continue;
    const ring=simplify(contour,.08/scale),points=[];let carried=0;
    for(let i=1;i<ring.length;i++){const a=ring[i-1],b=ring[i],length=dist(a,b);let at=.15/scale-carried;for(;at<=length;at+=.15/scale)points.push(mix(a,b,at/length));carried=length-(at-.15/scale);}
    if(points.length<8)continue;
    const mean=points.reduce((s,p)=>s.map((n,i)=>n+p[i]/points.length),[0,0]);
    const raw=points.map((p,i)=>{
      const a=points[(i-2+points.length)%points.length],b=points[(i+2)%points.length],d=dist(a,b);let n=[-(b[1]-a[1])/d,(b[0]-a[0])/d];
      if(n[0]*(p[0]-mean[0])+n[1]*(p[1]-mean[1])<0)n=n.map(v=>-v);
      let width=0;for(let t=.04;t<=10;t+=.02){const q=p.map((v,k)=>v+n[k]*t/scale);if(t>.08&&!inside(q))break;width=t;}
      return {p,n,width};
    });
    const widths=raw.map(r=>r.width).sort((a,b)=>a-b),cap=Math.min(8.8,widths[Math.floor(widths.length/2)]*1.6);
    if(widths[Math.floor(widths.length*.1)]<.4||cap<.4)continue;
    let rungs=raw.map(({p,n,width})=>[p.map((v,k)=>v+n[k]*.025/scale),p.map((v,k)=>v+n[k]*Math.min(width,cap)/scale)]);
    // Erase local normal folds before representing a physical closed column.
    rungs.push(rungs[0].map(p=>p.slice()));
    rungs=stabilise(rungs.map(r=>r.map(p=>p.map(v=>v*scale)))).rungs.map(r=>r.map(p=>p.map(v=>v/scale)));
    output.push(rungs);
  }
  return output;
}
module.exports={counterColumns};
