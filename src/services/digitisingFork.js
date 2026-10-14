const {contours}=require('./digitisingSections');
const {ribbon}=require('./digitisingRibbon');
const {straightColumns}=require('./digitisingStrokeTools');
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
module.exports={measure,fit,tipPaths};
