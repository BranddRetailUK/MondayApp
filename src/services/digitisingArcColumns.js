const {branchedColumns,column}=require('./digitisingColumns');
const {dist,centre}=require('./digitisingProject');
// Circle fitting is only a direction guide. Every rail is measured on the
// actual source mask; the fitted circle never supplies the artwork boundary.
function guide(ids,w,el,scale){
  // Probe the skeleton up to the explicit split-satin ceiling. Returned rails
  // remain source coordinates; final physical widths still pass validation.
  const probeScale=scale*.75,one=column(ids,w,el,probeScale,.225),paths=one?[one]:branchedColumns(ids,w,el,probeScale,.225);if(!paths)return null;
  const longest=Math.max(...paths.map(p=>p.length)),points=paths.filter(p=>p.length>longest*.3).flatMap(p=>p.map(centre));
  if(points.length<30)return null;
  const m=Array.from({length:3},()=>Array(4).fill(0));
  for(const [x,y]of points){const row=[x,y,1],v=-(x*x+y*y);for(let i=0;i<3;i++){for(let j=0;j<3;j++)m[i][j]+=row[i]*row[j];m[i][3]+=row[i]*v;}}
  for(let i=0;i<3;i++){if(Math.abs(m[i][i])<1e-8)return null;const d=m[i][i];for(let j=i;j<4;j++)m[i][j]/=d;for(let k=0;k<3;k++)if(k!==i){const v=m[k][i];for(let j=i;j<4;j++)m[k][j]-=m[i][j]*v;}}
  const c=m.slice(0,2).map(r=>-r[3]/2),radii=points.map(p=>dist(p,c)),radius=radii.reduce((a,b)=>a+b)/points.length;
  const error=Math.sqrt(radii.reduce((s,r)=>s+(r-radius)**2,0)/points.length);
  if(radius*scale<5||error>radius*.08||radius*scale>150)return null;
  const contains=p=>{const x=Math.round(p[0]),y=Math.round(p[1]);return x>=0&&x<w&&y>=0&&y<ids.length/w&&ids[y*w+x]===el.id;};
  const rays=[];
  for(let i=0;i<720;i++){
    const t=i*Math.PI/360,n=[Math.cos(t),Math.sin(t)];let best=null,start=null;
    for(let r=Math.max(0,radius-8/scale);r<=radius+8/scale;r+=.04/scale){const yes=contains(c.map((v,k)=>v+n[k]*r));if(yes&&start===null)start=r;if(!yes&&start!==null){if(!best||Math.abs((start+r)/2-radius)<Math.abs((best[0]+best[1])/2-radius))best=[start,r-.04/scale];start=null;}}
    rays.push(best&& (best[1]-best[0])*scale>=.3?{r:best,n}:null);
  }
  let start=rays.findIndex(r=>!r);if(start<0)return null;const groups=[];let group=[];
  for(let i=1;i<=720;i++){const ray=rays[(start+i)%720];if(ray)group.push(ray);else if(group.length){groups.push(group);group=[];}}
  if(group.length)groups.push(group);groups.sort((a,b)=>b.length-a.length);if(!groups.length||groups[0].length<120||groups[0].length>600)return null;
  const main=groups[0],widths=main.map(p=>(p.r[1]-p.r[0])*scale).sort((a,b)=>a-b),width=widths[Math.floor(widths.length/2)];if(width<.8||width>8)return null;
  // Remove flared terminal caps from the main ribbon. They become separate
  // crosswise columns, rather than distorting the curve's direction.
  let lo=0,hi=main.length-1;
  for(let i=0;i<Math.floor(main.length*.2);i++)if((main[i].r[1]-main[i].r[0])*scale>width*1.35)lo=i+1;
  for(let i=main.length-1;i>main.length*.8;i--)if((main[i].r[1]-main[i].r[0])*scale>width*1.35)hi=i-1;
  const rows=main.slice(lo,hi+1).map(({r,n})=>[r[0],Math.min(r[1],r[0]+width*1.2/scale)].map(d=>c.map((v,k)=>(v+n[k]*d+.5)*scale)));
  return rows;
}
module.exports={guide};
