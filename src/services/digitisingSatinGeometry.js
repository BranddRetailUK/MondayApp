const {dist,centre,mix}=require('./digitisingProject');

function intersection(a,b,c,d){
  const x=b[0]-a[0],y=b[1]-a[1],u=d[0]-c[0],v=d[1]-c[1],den=x*v-y*u;
  if(Math.abs(den)<1e-10)return null;
  const t=((c[0]-a[0])*v-(c[1]-a[1])*u)/den,s=((c[0]-a[0])*y-(c[1]-a[1])*x)/den;
  return t>1e-7&&t<1-1e-7&&s>1e-7&&s<1-1e-7?mix(a,b,t):null;
}

// Normal rays may reverse along the inner boundary of a tight turn. Erase only
// these local rail loops, retaining the paired direction controls. Repeated
// inner-rail points represent a fan corner, not a polygon crossing.
function stabilise(input){
  const rows=structuredClone(input);let repaired=0;
  for(let side=0;side<2;side++)for(let pass=0;pass<4;pass++){
    let changed=false;
    for(let i=0;i<rows.length-1;i++)for(let j=i+2;j<rows.length-1;j++){
      const q=intersection(rows[i][side],rows[i+1][side],rows[j][side],rows[j+1][side]);if(!q)continue;
      let length=0;for(let k=i+1;k<=j;k++)length+=dist(centre(rows[k-1]),centre(rows[k]));
      const width=Math.max(...rows.slice(i,j+2).map(r=>dist(...r)));
      if(length>width*1.5)continue;
      for(let k=i+1;k<=j;k++)rows[k][side]=q.slice();repaired++;changed=true;
    }
    if(!changed)break;
  }
  return {rungs:rows,repaired};
}
module.exports={stabilise,intersection};
