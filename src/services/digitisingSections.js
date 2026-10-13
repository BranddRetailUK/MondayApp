// Source-only centre-line guides partition a connected shape without adding/removing pixels.
function refine(points,guides){
  let lines=guides.map(g=>g.map(p=>p.slice()));
  for(let iteration=0;iteration<8;iteration++){
    const groups=lines.map(()=>[]);
    for(const p of points){let best=0,distance=Infinity;lines.forEach(([a,b],i)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy))),d=(p[0]-a[0]-dx*t)**2+(p[1]-a[1]-dy*t)**2;if(d<distance){distance=d;best=i;}});groups[best].push(p);}
    lines=groups.map((group,i)=>{if(group.length<10)return lines[i];const c=[0,1].map(axis=>group.reduce((n,p)=>n+p[axis],0)/group.length);let xx=0,yy=0,xy=0;for(const p of group){xx+=(p[0]-c[0])**2;yy+=(p[1]-c[1])**2;xy+=(p[0]-c[0])*(p[1]-c[1]);}const angle=.5*Math.atan2(2*xy,xx-yy),u=[Math.cos(angle),Math.sin(angle)],t=group.map(p=>(p[0]-c[0])*u[0]+(p[1]-c[1])*u[1]).sort((a,b)=>a-b);const a=t[Math.floor(t.length*.01)],b=t[Math.floor(t.length*.99)];return [a,b].map(v=>[c[0]+v*u[0],c[1]+v*u[1]]);});
  }
  return lines;
}
function partition(ids,elements,w,h,plans){
  for(const [key,inputGuides] of Object.entries(plans||{})){
    let guides=inputGuides;
    const id=Number(key),element=elements[id];if(!element||!guides.length)continue;
    const points=[];for(let k=0;k<ids.length;k++)if(ids[k]===id)points.push([k%w,Math.floor(k/w)]);
    guides=refine(points,guides);
    guides.forEach((g,i)=>{const original=inputGuides[i];if((g[1][0]-g[0][0])*(original[1][0]-original[0][0])+(g[1][1]-g[0][1])*(original[1][1]-original[0][1])<0)g.reverse();});
    const targets=guides.map((guide,i)=>({id:i?elements.length+i-1:id,sourceId:id,colour:element.colour,pixels:0,x:w,y:h,right:-1,bottom:-1,guide}));
    if(elements.length+guides.length-1>128)throw Error('Too many stitch sections.');
    for(let k=0;k<ids.length;k++)if(ids[k]===id){const x=k%w,y=Math.floor(k/w);let best=0,dist=Infinity;
      guides.forEach((g,i)=>{const [a,b]=g,dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy))),d=(x-a[0]-t*dx)**2+(y-a[1]-t*dy)**2;if(d<dist){dist=d;best=i;}});
      const e=targets[best];ids[k]=e.id;e.pixels++;e.x=Math.min(e.x,x);e.y=Math.min(e.y,y);e.right=Math.max(e.right,x);e.bottom=Math.max(e.bottom,y);
    }
    if(targets.some(e=>e.pixels<4))throw Error('Artwork analysis produced an empty stitch section.');
    for(const e of targets){e.width=e.right-e.x+1;e.height=e.bottom-e.y+1;delete e.right;delete e.bottom;}
    // Parallel limbs share the dominant long-limb direction for consistent sheen.
    for(const e of targets){const angle=sectionAngle(e);const family=targets.filter(t=>{const d=Math.abs(sectionAngle(t)-angle);return Math.min(d,180-d)<25;});const dominant=family.reduce((a,b)=>Math.hypot(...[0,1].map(i=>b.guide[1][i]-b.guide[0][i]))>Math.hypot(...[0,1].map(i=>a.guide[1][i]-a.guide[0][i]))?b:a);e.stitchAngle=sectionAngle(dominant);}
    elements[id]=targets[0];elements.push(...targets.slice(1));
  }
}
// Intersect parallel rows with the real mask. Row separation is measured in mm.
function spans(ids,w,element,scale,spacing,angle){
  const rad=angle*Math.PI/180,ux=Math.cos(rad),uy=Math.sin(rad),vx=-uy,vy=ux;
  const corners=[[element.x,element.y],[element.x+element.width-1,element.y],[element.x,element.y+element.height-1],[element.x+element.width-1,element.y+element.height-1]];
  const us=corners.map(([x,y])=>x*ux+y*uy),vs=corners.map(([x,y])=>x*vx+y*vy),out=[];
  const inside=(u,v)=>{const x=Math.round(u*ux+v*vx),y=Math.round(u*uy+v*vy);return x>=0&&x<w&&y>=0&&y<ids.length/w&&ids[y*w+x]===element.id;};
  const point=(u,v)=>[u*ux+v*vx,u*uy+v*vy];
  for(let v=Math.min(...vs);v<=Math.max(...vs);v+=spacing/scale){let from=null,last=null;
    for(let u=Math.min(...us);u<=Math.max(...us)+1;u+=.5){const yes=u<=Math.max(...us)&&inside(u,v);if(yes){if(from===null)from=u;last=u;}else if(from!==null){if((last-from)*scale>=.4)out.push(Object.assign([point(from,v),point(last,v)],{row:v}));from=null;}}
  }
  return out;
}
function sectionAngle(element){if(Number.isFinite(element.stitchAngle))return element.stitchAngle;const [a,b]=element.guide;return (Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI+90+180)%180;}
// Boundary runs retain narrow brush tips that cannot carry a satin row.
function contours(ids,w,element){
  const edges=new Map(),key=p=>p.join(','),inside=(x,y)=>x>=0&&x<w&&y>=0&&y<ids.length/w&&ids[y*w+x]===element.id;
  const add=(a,b)=>{const k=key(a);if(!edges.has(k))edges.set(k,[]);edges.get(k).push(b);};
  for(let y=element.y;y<element.y+element.height;y++)for(let x=element.x;x<element.x+element.width;x++)if(inside(x,y)){
    if(!inside(x,y-1))add([x-.5,y-.5],[x+.5,y-.5]);
    if(!inside(x+1,y))add([x+.5,y-.5],[x+.5,y+.5]);
    if(!inside(x,y+1))add([x+.5,y+.5],[x-.5,y+.5]);
    if(!inside(x-1,y))add([x-.5,y+.5],[x-.5,y-.5]);
  }
  const paths=[];
  while(edges.size){const start=edges.keys().next().value,points=[start.split(',').map(Number)];let at=start;
    do{const options=edges.get(at);if(!options?.length)break;const next=options.pop();if(!options.length)edges.delete(at);points.push(next);at=key(next);}while(at!==start);
    if(points.length>3)paths.push(points);
  }
  return paths.sort((a,b)=>b.length-a.length);
}
function simplify(points,tolerance){
  if(points.length<3)return points;
  const keep=new Set([0,points.length-1]),stack=[[0,points.length-1]];
  while(stack.length){const [a,b]=stack.pop(),p=points[a],q=points[b],dx=q[0]-p[0],dy=q[1]-p[1],den=dx*dx+dy*dy;let far=tolerance*tolerance,index=-1;
    for(let i=a+1;i<b;i++){const v=points[i],t=den?Math.max(0,Math.min(1,((v[0]-p[0])*dx+(v[1]-p[1])*dy)/den)):0,d=(v[0]-p[0]-t*dx)**2+(v[1]-p[1]-t*dy)**2;if(d>far){far=d;index=i;}}
    if(index>=0){keep.add(index);stack.push([a,index],[index,b]);}
  }
  return [...keep].sort((a,b)=>a-b).map(i=>points[i]);
}
module.exports={partition,spans,sectionAngle,contours,simplify};
