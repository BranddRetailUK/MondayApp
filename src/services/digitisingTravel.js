// Route support stitches through a single source region, never across its holes.
function routeInside(ids,w,id,from,to,scale){
  const h=ids.length/w,inside=(x,y)=>x>=0&&x<w&&y>=0&&y<h&&ids[y*w+x]===id;
  const snap=p=>{let best=null,distance=Infinity;const r=Math.ceil(.4/scale);for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const x=Math.round(p[0])+dx,y=Math.round(p[1])+dy,d=Math.hypot(x-p[0],y-p[1]);if(d*scale<=.4&&d<distance&&inside(x,y)){distance=d;best=y*w+x;}}return best;};
  const start=snap(from),end=snap(to);if(start===null||end===null)return null;
  const previous=new Int32Array(ids.length).fill(-1),queue=new Int32Array(ids.length);let head=0,tail=1;queue[0]=start;previous[start]=start;
  while(head<tail&&previous[end]<0){const k=queue[head++],x=k%w,y=Math.floor(k/w);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const xx=x+dx,yy=y+dy,n=yy*w+xx;if(!inside(xx,yy)||previous[n]>=0)continue;previous[n]=k;queue[tail++]=n;}}
  if(previous[end]<0)return null;
  const path=[];for(let k=end;;k=previous[k]){path.push([k%w,Math.floor(k/w)]);if(k===start)break;}path.reverse();
  const visible=(a,b)=>{const n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*2));for(let i=0;i<=n;i++)if(!inside(Math.round(a[0]+(b[0]-a[0])*i/n),Math.round(a[1]+(b[1]-a[1])*i/n)))return false;return true;};
  const result=[path[0]];for(let i=0;i<path.length-1;){let next=i+1;for(let j=i+2;j<path.length&&j<=i+40;j++){if(visible(path[i],path[j]))next=j;}result.push(path[next]);i=next;}result.push(to);return result;
}
module.exports={routeInside};
