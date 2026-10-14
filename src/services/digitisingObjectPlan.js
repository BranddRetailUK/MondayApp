// Artwork recognition proposes editable objects; it never emits machine stitches.
const {prepare}=require('./digitisingStudio');
const {column,branchedColumns}=require('./digitisingColumns');
const {contours,simplify,sectionAngle}=require('./digitisingSections');
const {validate,dist,centre,segmentInside,satinRows}=require('./digitisingProject');
const {counterColumns}=require('./digitisingCounterColumns');
const {components,straightColumns,linearGuides,guidedSections}=require('./digitisingStrokeTools');

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
async function propose(png,config,options={}){
  const prepared=await prepare(png,config),{ids,info,scale,heightMm}=prepared;
  const strokePlan=options.strokePlan||(options.interpret?await require('./digitisingStrokePlanner').planStrokes(png,prepared,options):null);
  const plans=new Map((strokePlan?.regions||[]).map(r=>[r.id,r]));
  const project={version:1,units:'mm',garment:config.garment,widthMm:config.widthMm,heightMm,objects:[],travelRegions:[]},warnings=[],includedSources=new Set();
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
    const selected=plans.get(el.id),toolPlan=selected?{...selected,construction:selected.tool?(selected.tool==='fill'?'fill':'columns'):selected.construction}:null;
    const semantic=toolPlan?.tool&&require('./digitisingSemanticTools').fit(ids,info.width,el,scale,toolPlan.tool);
    if(semantic){
      for(const [i,part]of semantic.entries()){
        const o={...base,id:base.id+`-tool-${i}`,type:'satin',...part,rungs:simplifyRungs(part.rungs)};
        try{verify(o);}catch(error){throw Error(`${o.id}: ${error.message}`);}proposed.push(o);
      }
    }else if(toolPlan?.construction!=='fill'&&(toolPlan?.tool||choice?.type==='satin'||choice?.type==='satin-branches')){
      const single=column(ids,info.width,el,scale,config.satinSpacing);
      const paths=single?[single]:branchedColumns(ids,info.width,el,scale,config.satinSpacing);
      try{
        if(!paths)throw Error('no stable paired rails');
        const counters=counterColumns(ids,info.width,el,scale);
        if(counters.length){
          proposed=counters.map((path,i)=>{const o={...base,id:base.id+`-counter-${i}`,type:'satin',rungs:simplifyRungs(path.map(r=>r.map(physical))),closed:true};verify(o);return o;});
          const remaining=components(ids,info.width,el,scale,proposed);
          for(const part of remaining.elements){
            if(part.pixels*scale*scale<.2)continue;
            const columns=straightColumns(remaining.ids,info.width,part,scale,config.satinSpacing);
            for(const rungs of columns){if(rungs.length<2)continue;const o={...base,id:base.id+`-limb-${proposed.length}`,type:'satin',rungs:simplifyRungs(rungs)};verify(o);proposed.push(o);}
          }
        }else{
          const guides=linearGuides(paths,scale);
          const curved=paths.filter(path=>{let length=0;for(let i=1;i<path.length;i++)length+=dist(centre(path[i-1]),centre(path[i]));return length>dist(centre(path[0]),centre(path.at(-1)))*1.5&&length*scale>5;});
          if(guides.length>=2&&!curved.length){
            const sections=guidedSections(ids,info.width,el,guides);
            for(const part of sections.elements)for(const rungs of straightColumns(sections.ids,info.width,part,scale,config.satinSpacing,part.axis)){
              if(rungs.length<2)continue;const o={...base,id:base.id+`-section-${proposed.length}`,type:'satin',rungs:simplifyRungs(rungs)};verify(o);proposed.push(o);
            }
          }else {
            for(const [i,path] of (curved.length?curved:paths).entries()){
              let rungs=path.map(r=>r.map(physical));
              const closed=dist(centre(rungs[0]),centre(rungs.at(-1)))<.8&&rungs[0].every((p,j)=>dist(p,rungs.at(-1)[j])<1.2)&&rungs.length>20;
              if(closed)rungs[rungs.length-1]=rungs[0].map(p=>p.slice());
              rungs=simplifyRungs(require('./digitisingSatinGeometry').stabilise(rungs).rungs);
              const o={...base,id:base.id+`-stroke-${i}`,type:'satin',rungs,closed};verify(o);
              const checked=validate({...project,objects:[o]}).objects[0];
              if(satinRows(checked).some(r=>!segmentInside(r[0],r[1],checked,.08)))throw Error('paired controls leave the stroke');
              proposed.push(o);
            }
            if(curved.length){const remaining=components(ids,info.width,el,scale,proposed);
              for(const part of remaining.elements){if(part.pixels*scale*scale<.2)continue;
                for(const rungs of straightColumns(remaining.ids,info.width,part,scale,config.satinSpacing)){
                  if(rungs.length<2)continue;const o={...base,id:base.id+`-limb-${proposed.length}`,type:'satin',rungs:simplifyRungs(rungs)};verify(o);proposed.push(o);
                }
              }
            }
          }
        }
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
    if(proposed.length>1){
      const rings=contours(ids,info.width,el).map(r=>simplify(r.map(physical),.08).slice(0,-1)).filter(r=>r.length>=3&&area(r)>=.001).sort((a,b)=>area(b)-area(a));
      const region={id:base.id,outline:rings[0],holes:rings.slice(1)};
      validate({...project,travelRegions:[...project.travelRegions,region],objects:proposed.map(o=>({...o,regionId:region.id}))});
      project.travelRegions.push(region);proposed.forEach(o=>{o.regionId=region.id;});
    }
    project.objects.push(...proposed);
    includedSources.add(el.sourceId??el.id);
  }
  // Outline original included source regions, never artificial section seams.
  // Sew these last so all outlines share the requested garment thread.
  if(config.border)for(const el of prepared.sourceElements.filter(e=>includedSources.has(e.id))){
    const rings=contours(prepared.sourceIds,info.width,el);
    for(const [i,ring] of rings.entries()){
      const path=simplify(ring.map(physical),.05);
      if(path.length<4)throw Error('Outline is too small to resolve; review artwork.');
      if(dist(path[0],path.at(-1))>.001)path.push(path[0].slice());
      project.objects.push({id:`outline-${el.id}-${i}`,type:'run',colour:config.garmentColour,path,passes:3,settings:{stitchLength:1}});
    }
  }
  return {project:validate(project),warnings,reviewRequired:warnings.length>0,strokePlan};
}
module.exports={propose,simplifyRungs};
