// Extract a simple, unbranched medial path. Complex lettering remains a fill region.
function column(ids,w,element,scale,spacing,widthMm=0){
  const W=element.width+4,H=element.height+4,ox=element.x-2,oy=element.y-2;
  const mask=new Uint8Array(W*H);
  for(let y=2;y<H-2;y++)for(let x=2;x<W-2;x++)mask[y*W+x]=Number(ids[(y+oy)*w+x+ox]===element.id);
  const sk=mask.slice(), offsets=[-W,-W+1,1,W+1,W,W-1,-1,-W-1];
  for(let iteration=0;iteration<Math.max(W,H);iteration++){
    let changed=false;
    for(let phase=0;phase<2;phase++){
      const remove=[];
      for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
        const k=y*W+x;if(!sk[k])continue;const p=offsets.map(d=>sk[k+d]);const n=p.reduce((a,b)=>a+b,0);
        if(n<2||n>6)continue;
        let transitions=0;for(let i=0;i<8;i++)if(!p[i]&&p[(i+1)%8])transitions++;
        if(transitions!==1)continue;
        if(phase===0?(p[0]*p[2]*p[4]||p[2]*p[4]*p[6]):(p[0]*p[2]*p[6]||p[0]*p[4]*p[6]))continue;
        remove.push(k);
      }
      for(const k of remove)sk[k]=0;changed ||= remove.length>0;
    }
    if(!changed)break;
  }
  const points=[];for(let k=0;k<sk.length;k++)if(sk[k])points.push(k);
  const neighbours=k=>offsets.map(d=>k+d).filter(n=>sk[n]);
  const ends=points.filter(k=>neighbours(k).length===1);
  if(ends.length!==2)return null;
  const previous=new Int32Array(sk.length).fill(-1),queue=[ends[0]];previous[ends[0]]=ends[0];
  for(let q=0;q<queue.length;q++)for(const n of neighbours(queue[q]))if(previous[n]<0){previous[n]=queue[q];queue.push(n);}
  if(previous[ends[1]]<0)return null;
  const path=[];for(let k=ends[1];;k=previous[k]){path.push([k%W,Math.floor(k/W)]);if(k===ends[0])break;}
  if(path.length<10 || path.length<points.length*.9)return null;
  // Smooth the centre line before measuring normals, avoiding pixel-grid angle jumps.
  const radius=Math.max(2,Math.round(.7/scale));
  const smooth=path.map((_,i)=>{const chunk=path.slice(Math.max(0,i-radius),Math.min(path.length,i+radius+1));return [0,1].map(a=>chunk.reduce((s,p)=>s+p[a],0)/chunk.length);});
  for(const end of [0,smooth.length-1]){const other=end===0?Math.min(radius*2,smooth.length-1):Math.max(0,end-radius*2),dx=smooth[end][0]-smooth[other][0],dy=smooth[end][1]-smooth[other][1],len=Math.hypot(dx,dy);if(len){const tip=smooth[end].slice();for(let d=.25;d<20/scale;d+=.25){const x=tip[0]+dx/len*d,y=tip[1]+dy/len*d;if(mask[Math.round(y)*W+Math.round(x)]!==1)break;smooth[end]=[x,y];}}}
  const sampled=[smooth[0]];let carried=0;
  for(let i=1;i<smooth.length;i++){const a=smooth[i-1],b=smooth[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),step=spacing/(2*scale);let at=step-carried;while(at<=length){sampled.push([a[0]+(b[0]-a[0])*at/length,a[1]+(b[1]-a[1])*at/length]);at+=step;}carried=length-(at-step);}
  smooth.splice(0,smooth.length,...sampled);
  const inside=(x,y)=>mask[Math.round(y)*W+Math.round(x)]===1;
  const rails=[];
  for(let i=0;i<smooth.length;i++){
    const a=smooth[Math.max(0,i-radius)],b=smooth[Math.min(smooth.length-1,i+radius)],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);
    if(!len)return null;const nx=-dy/len,ny=dx/len,p=smooth[i];if(!inside(...p))return null;
    const pair=[];
    for(const sign of [-1,1]){let d=0;while(d*scale<8&&inside(p[0]+nx*(d+.25)*sign,p[1]+ny*(d+.25)*sign))d+=.25;pair.push([p[0]+nx*d*sign+ox,p[1]+ny*d*sign+oy]);}
    const width=Math.hypot(pair[0][0]-pair[1][0],pair[0][1]-pair[1][1])*scale;
    if(width>7)return null;if(width<.7)continue;
    if(widthMm){const mid=[(pair[0][0]+pair[1][0])/2,(pair[0][1]+pair[1][1])/2],half=widthMm/(2*scale);pair[0]=[mid[0]-nx*half,mid[1]-ny*half];pair[1]=[mid[0]+nx*half,mid[1]+ny*half];}
    rails.push(pair);
  }
  return rails.length>=10?rails:null;
}
module.exports={column};
