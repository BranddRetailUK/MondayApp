const {spans}=require('./digitisingSections');
const {chains}=require('./digitisingObjectTravel');
const {inside,dist,centre}=require('./digitisingProject');

function components(ids,w,element,scale,covered=[]){
  const h=ids.length/w,mask=new Int16Array(ids.length).fill(-1),elements=[];
  for(let y=element.y;y<element.y+element.height;y++)for(let x=element.x;x<element.x+element.width;x++){
    const k=y*w+x;if(ids[k]===element.id&&!covered.some(o=>inside([(x+.5)*scale,(y+.5)*scale],o)))mask[k]=-2;
  }
  for(let y=element.y;y<element.y+element.height;y++)for(let x=element.x;x<element.x+element.width;x++){
    const k=y*w+x;if(mask[k]!==-2)continue;const id=elements.length,q=[k];mask[k]=id;let left=x,right=x,top=y,bottom=y;
    for(let i=0;i<q.length;i++){const at=q[i],xx=at%w,yy=Math.floor(at/w);left=Math.min(left,xx);right=Math.max(right,xx);top=Math.min(top,yy);bottom=Math.max(bottom,yy);
      for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=xx+dx,ny=yy+dy,j=ny*w+nx;if(nx>=0&&nx<w&&ny>=0&&ny<h&&mask[j]===-2){mask[j]=id;q.push(j);}}
    }
    elements.push({id,x:left,y:top,width:right-left+1,height:bottom-top+1,pixels:q.length,colour:element.colour});
  }
  return {ids:mask,elements};
}
function principal(ids,w,element){
  let n=0,x=0,y=0;for(let yy=element.y;yy<element.y+element.height;yy++)for(let xx=element.x;xx<element.x+element.width;xx++)if(ids[yy*w+xx]===element.id){n++;x+=xx;y+=yy;}
  x/=n;y/=n;let xx=0,yy=0,xy=0;
  for(let j=element.y;j<element.y+element.height;j++)for(let i=element.x;i<element.x+element.width;i++)if(ids[j*w+i]===element.id){xx+=(i-x)**2;yy+=(j-y)**2;xy+=(i-x)*(j-y);}
  return .5*Math.atan2(2*xy,xx-yy)*180/Math.PI;
}
function straightColumns(ids,w,element,scale,spacing,axis=principal(ids,w,element)){
  const angle=(axis+270)%180;
  const rows=spans(ids,w,element,scale,spacing/2,angle).map(r=>r.map(p=>p.map(v=>(v+.5)*scale)));
  return chains(rows,angle,spacing/2).filter(c=>c.length>=2).map(c=>c.filter(r=>dist(...r)>=.3-1e-8));
}
function linearGuides(paths,scale){
  const guides=[];
  for(const path of paths||[]){
    const pts=path.map(centre),mid=pts.reduce((s,p)=>s.map((v,i)=>v+p[i]/pts.length),[0,0]);let xx=0,yy=0,xy=0;
    for(const p of pts){xx+=(p[0]-mid[0])**2;yy+=(p[1]-mid[1])**2;xy+=(p[0]-mid[0])*(p[1]-mid[1]);}
    const angle=.5*Math.atan2(2*xy,xx-yy),u=[Math.cos(angle),Math.sin(angle)],t=pts.map(p=>(p[0]-mid[0])*u[0]+(p[1]-mid[1])*u[1]);
    const length=Math.max(...t)-Math.min(...t),lateral=Math.sqrt(pts.reduce((s,p)=>s+(-(p[0]-mid[0])*u[1]+(p[1]-mid[1])*u[0])**2,0)/pts.length);
    const widths=path.map(r=>dist(...r)).sort((a,b)=>a-b),width=widths[Math.floor(widths.length/2)];
    if(length*scale<1||length<width*.8||lateral>length*.1)continue;
    guides.push([Math.min(...t),Math.max(...t)].map(v=>mid.map((p,i)=>p+v*u[i])));
  }
  return guides;
}
function guidedSections(ids,w,element,guides,kinds=[]){
  const mask=new Int16Array(ids.length).fill(-1),elements=guides.map((guide,id)=>({id,x:w,y:ids.length/w,right:0,bottom:0,pixels:0,colour:element.colour,kind:kinds[id]||'line',axis:Math.atan2(guide.at(-1)[1]-guide[0][1],guide.at(-1)[0]-guide[0][0])*180/Math.PI}));
  for(let y=element.y;y<element.y+element.height;y++)for(let x=element.x;x<element.x+element.width;x++)if(ids[y*w+x]===element.id){
    let best=0,distance=Infinity;guides.forEach((guide,i)=>{
      const points=kinds[i]==='loop'?[...guide,guide[0]]:guide;
      for(let j=1;j<points.length;j++){const a=points[j-1],b=points[j],dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy;if(!den)continue;const t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/den)),d=(x-a[0]-t*dx)**2+(y-a[1]-t*dy)**2;if(d<distance){distance=d;best=i;}}
    });
    const e=elements[best];mask[y*w+x]=best;e.x=Math.min(e.x,x);e.y=Math.min(e.y,y);e.right=Math.max(e.right,x);e.bottom=Math.max(e.bottom,y);e.pixels++;
  }
  for(const e of elements){e.width=e.right-e.x+1;e.height=e.bottom-e.y+1;}
  return {ids:mask,elements:elements.filter(e=>e.pixels>0)};
}
module.exports={components,principal,straightColumns,linearGuides,guidedSections};
