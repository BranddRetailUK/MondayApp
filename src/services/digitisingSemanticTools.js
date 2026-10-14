// Source-fitted constructions. The planner selects a tool, never machine points.
const {contours,simplify}=require('./digitisingSections');
const {counterColumns}=require('./digitisingCounterColumns');
const {straightColumns}=require('./digitisingStrokeTools');
const {inside,dist}=require('./digitisingProject');
const signed=r=>r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p[0]*q[1]-q[0]*p[1];},0);
function baseline(rings,scale){
  const angles=[];
  for(const ring of rings) {const pts=simplify(ring,.15/scale);for(let i=1;i<pts.length;i++){
    const a=pts[i-1],b=pts[i],length=dist(a,b),angle=((Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI+270)%180)-90;
    if(Math.abs(angle)<=30&&length*scale>1)angles.push({angle,length});
  }}
  angles.sort((a,b)=>a.angle-b.angle);let left=angles.reduce((s,a)=>s+a.length,0)/2;
  for(const a of angles){left-=a.length;if(left<=0)return a.angle;}return 0;
}
function fit(ids,w,element,scale,tool,spacing=.3){
  const rings=contours(ids,w,element),holes=rings.filter(r=>signed(r)<0&&Math.abs(signed(r))*scale*scale>.3);
  const angle=baseline(rings,scale),rad=angle*Math.PI/180,u=[Math.cos(rad),Math.sin(rad)],v=[-u[1],u[0]];
  const local=p=>[p[0]*u[0]+p[1]*u[1],p[0]*v[0]+p[1]*v[1]];
  const world=p=>[p[0]*u[0]+p[1]*v[0],p[0]*u[1]+p[1]*v[1]];
  const physical=p=>p.map(n=>(n+.5)*scale);
  const bounds=points=>{const a=points.map(local);return {x0:Math.min(...a.map(p=>p[0])),x1:Math.max(...a.map(p=>p[0])),y0:Math.min(...a.map(p=>p[1])),y1:Math.max(...a.map(p=>p[1]))};};
  const outer=bounds(rings[0]),hb=holes.map(bounds);
  const maskWhere=predicate=>{const mask=new Int16Array(ids.length).fill(-1);let pixels=0,x0=w,y0=ids.length/w,x1=0,y1=0;
    for(let y=element.y;y<element.y+element.height;y++)for(let x=element.x;x<element.x+element.width;x++)if(ids[y*w+x]===element.id&&predicate(local([x,y]),[x,y])){mask[y*w+x]=element.id;pixels++;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
    return {mask,el:{...element,pixels,x:x0,y:y0,width:x1-x0+1,height:y1-y0+1}};
  };
  const sweep=(predicate,axis=angle+90)=>{const {mask,el}=maskWhere(predicate);if(!el.pixels)return [];return straightColumns(mask,w,el,scale,spacing,axis).filter(r=>r.length>=2).map(rungs=>({rungs}));};
  if(tool==='open-curve-bars'){
    const {column,branchedColumns}=require('./digitisingColumns');
    // Preserve established valid generic curves; fit explicit end caps when
    // broad cap twigs prevent the skeleton from supplying a narrow column.
    if(column(ids,w,element,scale,spacing)||branchedColumns(ids,w,element,scale,spacing))return null;
    const tolerance=Math.max(.15,scale*1.5),boundary=simplify(rings[0],tolerance/scale).slice(0,-1),caps=[];
    const turnAt=i=>{
      const b=boundary[i],away=sign=>{for(let n=1;n<boundary.length;n++){const p=boundary[(i+sign*n+boundary.length)%boundary.length];if(dist(p,b)*scale>=.8)return p;}return b;};
      const a=away(-1),c=away(1),u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-b[k]);return Math.atan2(u[0]*v[1]-u[1]*v[0],u[0]*v[0]+u[1]*v[1]);
    };
    for(let i=0;i<boundary.length;i++){
      const j=(i+1)%boundary.length,length=dist(boundary[i],boundary[j])*scale,a=turnAt(i),b=turnAt(j);
      if(length>=1&&length<=9&&a>.65&&b>.65)caps.push({point:boundary[i].map((v,k)=>(v+boundary[j][k])/2),score:Math.min(a,b)*length});
    }
    caps.sort((a,b)=>b.score-a.score);
    if(caps.length!==2)throw Error('Open curve needs two stable source end caps.');
    return [{rungs:require('./digitisingRibbon').ribbon(ids,w,element,scale,angle,caps[0].point,caps[1].point,tolerance)}];
  }
  if(tool==='stems-diagonal'){
    const boundary=simplify(rings[0],.18/scale).slice(0,-1).map(local),corners=[],slopes=[],turns=[];
    for(let i=0;i<boundary.length;i++){
      const a=boundary[(i+boundary.length-1)%boundary.length],b=boundary[i],c=boundary[(i+1)%boundary.length];
      const away=sign=>{for(let n=1;n<boundary.length;n++){const p=boundary[(i+sign*n+boundary.length)%boundary.length];if(dist(p,b)*scale>=1)return p;}return b;};
      const before=away(-1),after=away(1),u=b.map((v,k)=>v-before[k]),v=after.map((v,k)=>v-b[k]);
      const turn=Math.atan2(u[0]*v[1]-u[1]*v[0],u[0]*v[0]+u[1]*v[1]);if(turn<-.5)turns.push({point:b,turn});
      const dx=c[0]-b[0],dy=c[1]-b[1];if(Math.abs(dy)*scale>5&&Math.abs(dx/dy)<.5)slopes.push({s:dx/dy,length:dist(b,c)});
    }
    for(const t of turns.sort((a,b)=>a.turn-b.turn))if(!corners.some(p=>dist(p,t.point)*scale<2))corners.push(t.point);
    if(corners.length!==2||!slopes.length)throw Error('Diagonal-stem construction needs two inside corners and stable stems.');
    slopes.sort((a,b)=>b.length-a.length);const shear=slopes[0].s,across=p=>p[0]-shear*p[1];
    corners.sort((a,b)=>across(a)-across(b));const lo=across(corners[0]),hi=across(corners[1]);
    const middle=maskWhere(p=>across(p)>lo&&across(p)<hi);
    return [...sweep(p=>across(p)<=lo),...straightColumns(middle.mask,w,middle.el,scale,spacing).filter(r=>r.length>=2).map(rungs=>({rungs})),...sweep(p=>across(p)>=hi)];
  }
  if(tool==='straight-column')return sweep(()=>true,require('./digitisingStrokeTools').principal(ids,w,element));
  if(tool==='closed-columns'){
    if(!holes.length)throw Error('Closed columns need a source counter.');
    const centres=hb.map(h=>[(h.x0+h.x1)/2,(h.y0+h.y1)/2]);
    return holes.flatMap((h,i)=>{const {mask,el}=maskWhere(p=>centres.every((c,j)=>j===i||dist(p,centres[i])<=dist(p,c)));return counterColumns(mask,w,el,scale).map(rungs=>({rungs:rungs.map(r=>r.map(physical)),closed:true}));});
  }
  if(tool==='legs-crossbar'){
    if(hb.length!==1)throw Error('Two-leg construction needs one counter.');
    const h=hb[0],cx=(h.x0+h.x1)/2;
    // Locate the open notch below the counter on the source centre line.
    let notch=outer.y1;
    for(let y=h.y1+1;y<outer.y1;y++){const [x0,y0]=world([cx,y]).map(Math.round);if(ids[y0*w+x0]!==element.id){notch=y;break;}}
    const barTop=h.y1,barBottom=notch;
    // Above a small counter, the two legs meet in a single continuous column.
    const columns=sweep(p=>p[1]<barTop||p[1]>barBottom||p[0]<h.x0||p[0]>h.x1);
    columns.push(...sweep(p=>p[1]>=barTop&&p[1]<=barBottom&&p[0]>=h.x0&&p[0]<=h.x1,angle));
    return columns;
  }
  if(tool==='stem-bowl'||tool==='stem-bowl-leg'){
    if(hb.length!==1)throw Error('Stem and bowl construction needs one counter.');
    const h=hb[0],outerRing=simplify(rings[0],.15/scale).slice(0,-1),joins=[];
    for(let i=0;i<outerRing.length;i++){
      const a=outerRing[(i+outerRing.length-1)%outerRing.length],b=outerRing[i],c=outerRing[(i+1)%outerRing.length];
      const turn=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
      if(turn<0&&dist(a,b)*scale>.4&&dist(b,c)*scale>.4&&local(b)[1]>(h.y0+h.y1)/2)joins.push(local(b));
    }
    const cut=joins.length?Math.min(...joins.map(p=>p[1])):outer.y1;
    const bowlMask=maskWhere(p=>p[1]<=cut),raw=counterColumns(bowlMask.mask,w,bowlMask.el,scale);
    if(!raw.length)throw Error('Cannot fit bowl rails.');
    if(!joins.length)return raw.map(r=>({rungs:r.map(pair=>pair.map(physical)),closed:true}));
    const ring=raw[0].slice(0,-1),cx=(h.x0+h.x1)/2,cy=(h.y0+h.y1)/2;
    const keep=ring.map(r=>{const p=local(r[0]);return !(p[0]<cx&&p[1]>cy);});
    const start=keep.findIndex((yes,i)=>yes&&!keep[(i+keep.length-1)%keep.length]),curve=[];
    if(start<0)throw Error('Cannot locate the bowl/stem boundary.');
    for(let i=0;i<ring.length;i++){const j=(start+i)%ring.length;if(!keep[j])break;curve.push(ring[j].map(physical));}
    const bowl={type:'satin',rungs:curve};
    const uncovered=(p,q)=>!inside(physical(q),bowl,.025);
    const limbs=tool==='stem-bowl-leg'?[...sweep((p,q)=>uncovered(p,q)&&p[0]<=h.x0),...sweep((p,q)=>uncovered(p,q)&&p[0]>h.x0)]:sweep(uncovered);
    return [{rungs:curve},...limbs];
  }
  if(tool==='stem-foot'||tool==='stem-three-arms'){
    // The narrowest horizontal scan identifies the uninterrupted stem width.
    const rows=[];
    for(let y=outer.y0+2;y<outer.y1-2;y+=2){let first=null,last=null;for(let x=outer.x0;x<=outer.x1;x++){
      const q=world([x,y]).map(Math.round);if(ids[q[1]*w+q[0]]===element.id){if(first===null)first=x;last=x;}
    }if(first!==null)rows.push({y,a:first,b:last,width:last-first});}
    if(!rows.length)throw Error('No measurable stem rows.');
    const sorted=rows.slice().sort((a,b)=>a.width-b.width),low=sorted[Math.floor(sorted.length*.05)].width,high=sorted[Math.floor(sorted.length*.95)].width;
    const stemRows=sorted.filter(r=>r.width<=low+(high-low)*.25),stemWidth=stemRows[Math.floor(stemRows.length/2)].width;
    const stemRight=p=>{const row=rows[Math.max(0,Math.min(rows.length-1,Math.round((p[1]-rows[0].y)/2)))];return row.width<stemWidth*1.3?row.b+1:row.a+stemWidth;};
    const boundary=simplify(rings[0],.15/scale).slice(0,-1),corners=[];
    for(let i=0;i<boundary.length;i++){
      const a=boundary[(i+boundary.length-1)%boundary.length],b=boundary[i],c=boundary[(i+1)%boundary.length];
      if((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0])<0&&dist(a,b)*scale>.5&&dist(b,c)*scale>.5)corners.push(b);
    }
    corners.sort((a,b)=>local(a)[1]-local(b)[1]);
    const makeRibbon=(predicate,startCap)=>{const {mask,el}=maskWhere(predicate);return {rungs:require('./digitisingRibbon').ribbon(mask,w,el,scale,angle,startCap,'right')};};
    if(tool==='stem-foot')return [makeRibbon(()=>true,'up')];
    if(corners.length>=2){
      const top=local(corners[0])[1],bottom=local(corners.at(-1))[1],middle=(top+bottom)/2;
      return [makeRibbon(p=>p[1]<=middle&&(p[0]<=stemRight(p)||p[1]<=top),'down'),
        ...sweep(p=>p[1]>top&&p[1]<bottom&&p[0]>stemRight(p),angle),
        makeRibbon(p=>p[1]>=middle&&(p[0]<=stemRight(p)||p[1]>=bottom),'up')];
    }
    throw Error('Arm construction needs two stable inside corners.');
  }
  return null;
}
module.exports={fit,baseline};
