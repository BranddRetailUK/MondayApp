// Artwork recognition proposes editable objects; it never emits machine stitches.
const {prepare}=require('./digitisingStudio');
const {column,branchedColumns}=require('./digitisingColumns');
const {contours,simplify,sectionAngle}=require('./digitisingSections');
const {validate,dist,centre}=require('./digitisingProject');

// Simplify both rails together: retaining a point on just one rail would change
// the pairing and therefore the intended stitch direction.
function simplifyRungs(rows,tolerance=.06){
  const keep=new Set([0,rows.length-1]),stack=[[0,rows.length-1]];
  while(stack.length){const [a,b]=stack.pop();let far=tolerance,index=-1;
    const lengths=[0];for(let i=a+1;i<=b;i++)lengths.push(lengths.at(-1)+dist(centre(rows[i-1]),centre(rows[i])));
    for(let i=a+1;i<b;i++){const t=lengths[i-a]/lengths.at(-1),error=Math.max(...[0,1].map(side=>dist(rows[i][side],rows[a][side].map((v,k)=>v+(rows[b][side][k]-v)*t))));if(error>far){far=error;index=i;}}
    if(index>=0){keep.add(index);stack.push([a,index],[index,b]);}
  }
  return [...keep].sort((a,b)=>a-b).map(i=>rows[i]);
}
async function propose(png,config){
  if(config.border)throw Error('Object pipeline: running outlines need an explicit run object.');
  const prepared=await prepare(png,config),{ids,info,scale,heightMm}=prepared;
  const project={version:1,units:'mm',garment:config.garment,widthMm:config.widthMm,heightMm,objects:[]},warnings=[];
  const physical=p=>p.map((v,k)=>Math.max(0,Math.min(k?heightMm:config.widthMm,(v+.5)*scale)));
  const verify=o=>validate({...project,objects:[o]});
  const area=r=>Math.abs(r.reduce((sum,p,i)=>{const q=r[(i+1)%r.length];return sum+p[0]*q[1]-q[0]*p[1];},0))/2;
  for(const el of prepared.elements.slice().sort((a,b)=>(config.elementOptions[a.id]?.order??a.id)-(config.elementOptions[b.id]?.order??b.id))){
    const choice=config.elementOptions[el.id];if(choice?.type==='skip'||!ids.includes(el.id))continue;
    const base={id:`region-${el.id}`,colour:config.elementColours[el.id]||config.elementColours[el.sourceId]||el.colour};
    if(el.pixels*scale*scale<.05&&Math.max(el.width,el.height)*scale<.6){
      warnings.push(`${base.id}: isolated detail below 0.05 mm² and 0.6 mm extent omitted; review at actual size.`);continue;
    }
    let proposed=[];
    if(choice?.type==='satin'||choice?.type==='satin-branches'){
      const single=column(ids,info.width,el,scale,config.satinSpacing);
      const paths=single?[single]:branchedColumns(ids,info.width,el,scale,config.satinSpacing);
      try{
        if(!paths)throw Error('no stable paired rails');
        proposed=paths.map((path,i)=>{
          let rungs=simplifyRungs(path.map(r=>r.map(physical)));
          const closed=dist(centre(rungs[0]),centre(rungs.at(-1)))<.35&&rungs[0].every((p,j)=>dist(p,rungs.at(-1)[j])<.6);
          if(closed)rungs[rungs.length-1]=rungs[0].map(p=>p.slice());
          const o={...base,id:base.id+`-stroke-${i}`,type:'satin',rungs,closed};verify(o);return o;
        });
      }catch(error){warnings.push(`${base.id}: satin proposal needs review (${error.message}); provisional fill used.`);proposed=[];}
    }
    if(!proposed.length){
      const rings=contours(ids,info.width,el).map(r=>{
        const points=r.map(physical),tolerance=Math.min(.08,Math.sqrt(area(points))/12);
        return simplify(points,tolerance).slice(0,-1);
      }).filter(r=>r.length>=3&&area(r)>=.001).sort((a,b)=>area(b)-area(a));
      if(!rings.length)throw Error(`${base.id}: no valid physical contour; review artwork.`);
      const o={...base,type:'fill',outline:rings[0],holes:rings.slice(1),angle:el.guide?sectionAngle(el):(config.fillAngle??35)};
      try{verify(o);}catch(error){throw Error(`${base.id}: ${error.message} Review source segmentation before compiling.`);}
      proposed=[o];
    }
    project.objects.push(...proposed);
  }
  return {project:validate(project),warnings,reviewRequired:warnings.length>0};
}
module.exports={propose,simplifyRungs};
