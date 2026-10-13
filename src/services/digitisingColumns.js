function skeleton(ids,w,element){
  const W=element.width+4,H=element.height+4,ox=element.x-2,oy=element.y-2,mask=new Uint8Array(W*H);
  for(let y=2;y<H-2;y++)for(let x=2;x<W-2;x++)mask[y*W+x]=Number(ids[(y+oy)*w+x+ox]===element.id);
  const sk=mask.slice(),offsets=[-W,-W+1,1,W+1,W,W-1,-1,-W-1];
  for(let iteration=0;iteration<Math.max(W,H);iteration++){
    let changed=false;
    for(let phase=0;phase<2;phase++){
      const remove=[];
      for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
        const k=y*W+x;if(!sk[k])continue;const p=offsets.map(d=>sk[k+d]),n=p.reduce((a,b)=>a+b,0);if(n<2||n>6)continue;
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
  return {W,H,ox,oy,mask,sk,points,neighbours};
}
function railsFor(path,shape,scale,spacing,widthMm=0,extend=true){
  const {W,H,ox,oy,mask}=shape;
  const inside=(x,y)=>x>=0&&y>=0&&x<W&&y<H&&mask[Math.round(y)*W+Math.round(x)]===1;
  const radius=Math.max(2,Math.round(.7/scale));
  const smooth=path.map((_,i)=>{const chunk=path.slice(Math.max(0,i-radius),Math.min(path.length,i+radius+1));return [0,1].map(a=>chunk.reduce((s,p)=>s+p[a],0)/chunk.length);});
  if(extend)for(const end of [0,smooth.length-1]){const other=end===0?Math.min(radius*2,smooth.length-1):Math.max(0,end-radius*2),dx=smooth[end][0]-smooth[other][0],dy=smooth[end][1]-smooth[other][1],len=Math.hypot(dx,dy);if(len){const tip=smooth[end].slice();for(let d=.25;d<20/scale;d+=.25){const x=tip[0]+dx/len*d,y=tip[1]+dy/len*d;if(!inside(x,y))break;smooth[end]=[x,y];}}}
  const sampled=[smooth[0]];let carried=0;
  for(let i=1;i<smooth.length;i++){const a=smooth[i-1],b=smooth[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),step=spacing/(2*scale);let at=step-carried;while(at<=length){sampled.push([a[0]+(b[0]-a[0])*at/length,a[1]+(b[1]-a[1])*at/length]);at+=step;}carried=length-(at-step);}
  const rails=[];
  for(let i=0;i<sampled.length;i++){
    const a=sampled[Math.max(0,i-radius)],b=sampled[Math.min(sampled.length-1,i+radius)],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);if(!len)return null;
    const nx=-dy/len,ny=dx/len,p=sampled[i];if(!inside(...p))return null;
    const pair=[];
    for(const sign of [-1,1]){let d=0;while(d*scale<8&&inside(p[0]+nx*(d+.25)*sign,p[1]+ny*(d+.25)*sign))d+=.25;pair.push([p[0]+nx*d*sign+ox,p[1]+ny*d*sign+oy]);}
    const width=Math.hypot(pair[0][0]-pair[1][0],pair[0][1]-pair[1][1])*scale;
    if(width>7&&extend)return null;if(width<.7)continue;
    if(widthMm){const mid=[(pair[0][0]+pair[1][0])/2,(pair[0][1]+pair[1][1])/2],half=widthMm/(2*scale);pair[0]=[mid[0]-nx*half,mid[1]-ny*half];pair[1]=[mid[0]+nx*half,mid[1]+ny*half];}
    rails.push(pair);
  }
  if(!extend){
    const widths=rails.map(pair=>Math.hypot(pair[0][0]-pair[1][0],pair[0][1]-pair[1][1])*scale),regular=widths.filter(v=>v<=7).sort((a,b)=>a-b);
    if(regular.length<widths.length*.8||!regular.length)return null;
    const normalWidth=regular[Math.floor(regular.length/2)];
    for(let i=0;i<rails.length;i++)if(widths[i]>7){const pair=rails[i],mid=[(pair[0][0]+pair[1][0])/2,(pair[0][1]+pair[1][1])/2],factor=normalWidth/widths[i];for(let side=0;side<2;side++)pair[side]=pair[side].map((v,axis)=>mid[axis]+(v-mid[axis])*factor);}
  }
  return rails.length>=3?rails:null;
}
function column(ids,w,element,scale,spacing,widthMm=0){
  const shape=skeleton(ids,w,element),{W,sk,points,neighbours}=shape;
  const ends=points.filter(k=>neighbours(k).length===1);if(ends.length!==2)return null;
  const previous=new Int32Array(sk.length).fill(-1),queue=[ends[0]];previous[ends[0]]=ends[0];
  for(let q=0;q<queue.length;q++)for(const n of neighbours(queue[q]))if(previous[n]<0){previous[n]=queue[q];queue.push(n);}
  if(previous[ends[1]]<0)return null;
  const path=[];for(let k=ends[1];;k=previous[k]){path.push([k%W,Math.floor(k/W)]);if(k===ends[0])break;}
  if(path.length<10||path.length<points.length*.9)return null;
  const rails=railsFor(path,shape,scale,spacing,widthMm);return rails?.length>=10?rails:null;
}
// Break a branched narrow shape into complete graph edges. No reference stitches used.
function branchedColumns(ids,w,element,scale,spacing){
  const shape=skeleton(ids,w,element),{W,sk,points}=shape;
  if(points.length<10)return null;
  const adjacent=k=>[-W,-W+1,1,W+1,W,W-1,-1,-W-1].map(d=>k+d).filter(n=>{
    if(!sk[n])return false;const dx=n%W-k%W,dy=Math.floor(n/W)-Math.floor(k/W);
    return !dx||!dy||(!sk[k+dx]&&!sk[k+dy*W]);
  });
  const nodes=points.filter(k=>adjacent(k).length!==2),used=new Set(),paths=[];
  const edge=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;
  for(const start of [...nodes,...points])for(const next of adjacent(start)){
    if(used.has(edge(start,next)))continue;
    const path=[start];let prev=start,k=next;
    while(true){used.add(edge(prev,k));path.push(k);const options=adjacent(k);if(k===start||options.length!==2)break;const n=options.find(n=>n!==prev);if(used.has(edge(k,n)))break;prev=k;k=n;}
    if(path.length>=4)paths.push(path);
  }
  if(!paths.length||paths.length>80)return null;
  const rails=[];let covered=0;
  for(const path of paths){const rail=railsFor(path.map(k=>[k%W,Math.floor(k/W)]),shape,scale,spacing,0,false);if(rail){covered+=path.length;rails.push(rail);}}
  // Reject partial reconstructions rather than silently losing branches.
  if(covered<points.length*.9||!rails.length)return null;
  return rails;
}
module.exports={column,branchedColumns};

// Detect local narrow branches from the source mask, independently of AI section angles.
function thinColumns(ids,w,element,scale,spacing,threadWidth=.3){
  const shape=skeleton(ids,w,element),{W,H,ox,oy,mask,sk,points}=shape;
  const inside=(x,y)=>x>=0&&y>=0&&x<W&&y<H&&mask[Math.round(y)*W+Math.round(x)]===1;
  const adjacent=k=>[-W,-W+1,1,W+1,W,W-1,-1,-W-1].map(d=>k+d).filter(n=>{
    if(!sk[n])return false;const dx=n%W-k%W,dy=Math.floor(n/W)-Math.floor(k/W);return !dx||!dy||(!sk[k+dx]&&!sk[k+dy*W]);
  });
  const used=new Set(),edge=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`,paths=[];
  const nodes=points.filter(k=>adjacent(k).length!==2);
  for(const start of [...nodes,...points])for(const next of adjacent(start)){
    if(used.has(edge(start,next)))continue;const path=[start];let prev=start,k=next;
    while(true){used.add(edge(prev,k));path.push(k);const choices=adjacent(k);if(k===start||choices.length!==2)break;const n=choices.find(n=>n!==prev);if(used.has(edge(k,n)))break;prev=k;k=n;}
    if(path.length>3)paths.push(path.map(k=>[k%W,Math.floor(k/W)]));
  }
  const output=[],radius=Math.max(2,Math.round(.3/scale)),advance=Math.max(.12,spacing/2)/scale;
  for(const path of paths){let rails=[],distance=advance;
    const flush=()=>{if(rails.length>=3)output.push(rails);rails=[];};
    for(let i=0;i<path.length;i++){
      if(i)distance+=Math.hypot(path[i][0]-path[i-1][0],path[i][1]-path[i-1][1]);if(distance<advance)continue;distance=0;
      const a=path[Math.max(0,i-radius)],b=path[Math.min(path.length-1,i+radius)],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(!length){flush();continue;}
      const nx=-dy/length,ny=dx/length,p=path[i],pair=[];
      for(const sign of [-1,1]){let d=0;while(d*scale<threadWidth*3&&inside(p[0]+nx*(d+.2)*sign,p[1]+ny*(d+.2)*sign))d+=.2;pair.push([p[0]+nx*d*sign+ox,p[1]+ny*d*sign+oy]);}
      const width=Math.hypot(pair[1][0]-pair[0][0],pair[1][1]-pair[0][1])*scale;
      if(width<.05||width>threadWidth*3){flush();continue;}
      if(width<threadWidth){const mid=[(pair[0][0]+pair[1][0])/2,(pair[0][1]+pair[1][1])/2],half=threadWidth/(2*scale);pair[0]=[mid[0]-nx*half,mid[1]-ny*half];pair[1]=[mid[0]+nx*half,mid[1]+ny*half];}
      rails.push(pair);
    }
    flush();
  }
  return output;
}
module.exports.thinColumns=thinColumns;
