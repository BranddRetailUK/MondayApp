const {contours,simplify}=require('./digitisingSections');
const {ribbon}=require('./digitisingRibbon');
const {straightColumns,principal}=require('./digitisingStrokeTools');
const {dist,centre}=require('./digitisingProject');

// Recognise an upright, three-prong fork from its source topology. The two
// shoulders remain turning ribbons; a single fill would erase their sheen.
// Unsupported orientations/topologies return null for ordinary planning.
function measure(ids,w,e){
  if(e.height<e.width*1.3||e.height>e.width*3)return null;
  const rings=contours(ids,w,e);
  if(rings.length!==1)return null;
  const cx=e.x+e.width/2,rows=[];
  for(let y=e.y;y<e.y+e.height;y++){
    const spans=[];let start=null;
    for(let x=e.x;x<=e.x+e.width;x++){
      if(x<e.x+e.width&&ids[y*w+x]===e.id){if(start===null)start=x;}
      else if(start!==null){spans.push([start,x-1]);start=null;}
    }
    rows.push({y,spans});
  }
  const width=r=>r.spans.reduce((sum,[a,b])=>sum+b-a+1,0);
  const ends=[...rows.slice(0,Math.max(1,Math.floor(e.height*.02))),...rows.slice(-Math.max(1,Math.floor(e.height*.02)))];
  if(ends.some(r=>r.spans.length!==1||width(r)>e.width*.15||Math.abs((r.spans[0][0]+r.spans[0][1])/2-cx)>e.width*.05))return null;
  const triple=rows.filter(r=>r.spans.length===3&&r.spans[1][0]<cx&&r.spans[1][1]>cx);
  if(triple.length<e.height*.2||triple[0].y<e.y+e.height*.1)return null;
  const widths=triple.map(r=>r.spans[1][1]-r.spans[1][0]).sort((a,b)=>a-b),median=widths[Math.floor(widths.length/2)];
  if(median<e.width*.04||median>e.width*.25)return null;
  const join=triple.filter(r=>r.spans[1][1]-r.spans[1][0]<median*1.25).at(-1);
  if(!join||join.y<e.y+e.height*.5||join.y>e.y+e.height*.85)return null;
  const [left,right]=join.spans[1],mask=new Int16Array(ids.length).fill(-1);
  const parts=[0,1,2].map(id=>({id,x:w,y:ids.length/w,right:-1,bottom:-1,pixels:0,colour:e.colour}));
  for(const {y,spans}of rows)for(const [a,b]of spans)for(let x=a;x<=b;x++){
    const owner=y<join.y?(a<=cx&&b>=cx?1:b<cx?0:2):x<left?0:x>right?2:1;
    mask[y*w+x]=owner;const p=parts[owner];p.x=Math.min(p.x,x);p.y=Math.min(p.y,y);p.right=Math.max(p.right,x);p.bottom=Math.max(p.bottom,y);p.pixels++;
  }
  for(const p of parts){p.width=p.right-p.x+1;p.height=p.bottom-p.y+1;}
  if(parts.some(p=>p.pixels<e.pixels*.1))return null;
  return {ids:mask,parts};
}
function fit(measured,w,scale){
  const result=[];
  for(const p of measured.parts){
    if(p.id===1){for(const rungs of straightColumns(measured.ids,w,p,scale,.3,90))result.push({rungs});}
    else{
      const start=[p.id===0?p.x:p.right,p.y],end=[p.id===0?p.right:p.x,p.bottom-p.height*.1];
      const rungs=ribbon(measured.ids,w,p,scale,0,start,end,.15,true,true).filter(r=>dist(...r)>=.3);
      if(rungs.length<2)throw Error('Fork shoulder has no sewable ribbon.');
      result.push({rungs});
    }
  }
  if(result.length<3)throw Error('Fork construction is incomplete.');
  return result;
}
function tipPaths(measured,w,scale){
  const p=measured.parts[1],rows=straightColumns(measured.ids,w,p,scale,.3,90).flat();
  if(!rows.length)return [];
  rows.sort((a,b)=>centre(a)[1]-centre(b)[1]);
  return [[p.y,rows[0]],[p.bottom,rows.at(-1)]].map(([y,row])=>{
    const xs=[];for(let x=p.x;x<=p.right;x++)if(measured.ids[y*w+x]===p.id)xs.push(x);
    if(!xs.length)throw Error('Fork tip has no source pixels.');
    return [centre(row),[((xs[0]+xs.at(-1))/2+.5)*scale,(y+.5)*scale]];
  }).filter(path=>dist(...path)>=.3);
}
// A barb is an interior corner near the upper end of a side prong. Its
// shallow edge defines a source-derived seam between the blade and its stem.
function splitHead(measured,w,e,scale){
  const ring=simplify(contours(measured.ids,w,e)[0],.15/scale).slice(0,-1),corners=[];
  for(let i=0;i<ring.length;i++){
    const a=ring[(i+ring.length-1)%ring.length],p=ring[i],b=ring[(i+1)%ring.length];
    const v=[p[0]-a[0],p[1]-a[1]],u=[b[0]-p[0],b[1]-p[1]],turn=Math.atan2(v[0]*u[1]-v[1]*u[0],v[0]*u[0]+v[1]*u[1]);
    if(turn<-.8&&p[1]<e.y+e.height*.5)corners.push({a,p,b,turn});
  }
  const corner=corners.sort((a,b)=>a.turn-b.turn)[0];if(!corner)return null;
  const edge=[corner.a,corner.b].sort((a,b)=>Math.abs(b[0]-corner.p[0])/dist(b,corner.p)-Math.abs(a[0]-corner.p[0])/dist(a,corner.p))[0];
  const dx=edge[0]-corner.p[0],dy=edge[1]-corner.p[1];if(Math.abs(dx)<Math.abs(dy))return null;
  const line=x=>corner.p[1]+(x-corner.p[0])*dy/dx,ids=new Int16Array(measured.ids.length).fill(-1);
  const parts=[0,1].map(id=>({id,x:w,y:ids.length/w,right:-1,bottom:-1,pixels:0,colour:e.colour}));
  for(let y=e.y;y<e.y+e.height;y++)for(let x=e.x;x<e.x+e.width;x++)if(measured.ids[y*w+x]===e.id){
    const id=y<=line(x)?0:1;ids[y*w+x]=id;const p=parts[id];p.x=Math.min(p.x,x);p.y=Math.min(p.y,y);p.right=Math.max(p.right,x);p.bottom=Math.max(p.bottom,y);p.pixels++;
  }
  if(parts.some(p=>p.pixels<4))return null;
  for(const p of parts){p.width=p.right-p.x+1;p.height=p.bottom-p.y+1;}
  return {ids,parts,cap:corner.p};
}
function directedBody(rows,section,w,scale,side,compact,end){
  const guide=rows.map(pair=>{
    const [a,b]=pair,angle=((Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI+270)%180)-90;
    const t=Math.max(0,Math.min(1,(Math.abs(angle)-10)/80));
    // Compact columns retain an oblique stem; larger stems are crosswise.
    // Compact stems hold their direction until the shoulder, then fan into
    // its end cap. This concentration is a development calibration profile.
    const target=(compact?20:0)+(compact?70:90)*t**(compact?12:1.4);
    return {y:centre(pair)[1]/scale-.5,angle:(side===0?-target:target)*Math.PI/180};
  }).sort((a,b)=>a.y-b.y);
  const field=(a,b)=>{
    const y=(a[1]+b[1])/2;let lo=0,hi=guide.length-1;
    while(lo<hi){const mid=(lo+hi)>>1;if(guide[mid].y<y)lo=mid+1;else hi=mid;}
    return guide[lo].angle;
  };
  return ribbon(section.ids,w,section.parts[1],scale,0,section.cap,end,.15,true,false,field).filter(r=>dist(...r)>=.3);
}
function constructions(measured,w,scale,garment){
  const baseline=fit(measured,w,scale),compact=garment==='tshirt'&&Math.max(...baseline.flatMap(p=>p.rungs.map(r=>dist(...r))))<7;
  const paths=compact?tipPaths(measured,w,scale):[],basic={parts:baseline,paths,compact},variants=[];
  try{
    const sections=new Map(measured.parts.filter(p=>p.id!==1).map(p=>[p.id,splitHead(measured,w,p,scale)]));
    if([...sections.values()].every(Boolean)){
      const parts=[],headTips=[];
      for(const p of measured.parts){
        if(p.id===1){for(const rungs of straightColumns(measured.ids,w,p,scale,.3,90))parts.push({rungs});continue;}
        const section=sections.get(p.id),head=section.parts[0];
        const angle=principal(section.ids,w,head);
        const columns=straightColumns(section.ids,w,head,scale,.3,angle);if(!columns.length)throw Error('Fork blade has no crosswise column.');
        for(const rungs of columns)parts.push({rungs,role:'blade'});
        const x=p.id===0?head.x:head.right,ys=[];
        for(let y=head.y;y<=head.bottom;y++)if(section.ids[y*w+x]===head.id)ys.push(y);
        const tip=[(x+.5)*scale,((ys[0]+ys.at(-1))/2+.5)*scale];
        const nearest=columns.flat().map(centre).sort((a,b)=>dist(a,tip)-dist(b,tip))[0];
        if(nearest&&dist(nearest,tip)>=.3)headTips.push([nearest,tip]);
        const end=[p.id===0?p.right:p.x,p.bottom-p.height*.1];
        const rows=ribbon(section.ids,w,section.parts[1],scale,0,section.cap,end,.15,true).filter(r=>dist(...r)>=.3);
        parts.push({rungs:directedBody(rows,section,w,scale,p.id,compact,end),role:'shoulder'});
      }
      variants.push({parts,paths:[...paths,...headTips],compact});
    }
  }catch{/* A more detailed construction is optional; basic ribbons remain. */}
  return [...variants,basic];
}
module.exports={measure,fit,tipPaths,constructions};
