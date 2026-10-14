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
  const advancing=[rows[0]];
  for(const r of rows.slice(1,-1))if(dist(centre(r),centre(advancing.at(-1)))>=.01)advancing.push(r);
  if(dist(centre(advancing.at(-1)),centre(rows.at(-1)))<.01)advancing.pop();
  advancing.push(rows.at(-1));rows=advancing;
  if(rows.length<2)throw Error('No advancing satin controls.');
  const keep=new Set([0,rows.length-1]),stack=[[0,rows.length-1]];
  while(stack.length){const [a,b]=stack.pop();let far=tolerance,index=-1;
    const lengths=[0];for(let i=a+1;i<=b;i++)lengths.push(lengths.at(-1)+dist(centre(rows[i-1]),centre(rows[i])));
    for(let i=a+1;i<b;i++){const t=lengths[i-a]/lengths.at(-1),error=Math.max(...[0,1].map(side=>dist(rows[i][side],rows[a][side].map((v,k)=>v+(rows[b][side][k]-v)*t))));if(error>far){far=error;index=i;}}
    if(index>=0){keep.add(index);stack.push([a,index],[index,b]);}
  }
  const simplified=[...keep].sort((a,b)=>a-b).map(i=>rows[i]);
  return simplified.length>256&&tolerance<.15?simplifyRungs(rows,.15):simplified;
}
// Optional travel never overrides the validation of individual sewing objects.
function attachSharedTravel(project,proposed,region,warnings){
  // Validate these outside the catch: malformed sewing geometry must still fail.
  validate({...project,objects:proposed});
  try{
    validate({...project,travelRegions:[...project.travelRegions,region],objects:proposed.map(o=>({...o,regionId:region.id}))});
    project.travelRegions.push(region);proposed.forEach(o=>{o.regionId=region.id;});
  }catch(error){
    warnings.push(`${region.id}: shared travel boundary is invalid (${error.message}); separate validated objects retained with safe travel.`);
  }
}
function curvedParts(rows,base,verify,depth=0){
  const o={...base,type:'satin',rungs:simplifyRungs(rows)};
  try{verify(o);return [o];}catch(error){
    if(rows.length<4||depth>10)throw error;
    const mid=Math.floor((rows.length-1)/2);
    return [...curvedParts(rows.slice(0,mid+1),{...base,id:base.id+'a'},verify,depth+1),...curvedParts(rows.slice(mid),{...base,id:base.id+'b'},verify,depth+1)];
  }
}
async function propose(png,config,options={}){
  const prepared=await prepare(png,config),{ids,info,scale,heightMm}=prepared;
  const strokePlan=options.strokePlan||(options.interpret?await require('./digitisingStrokePlanner').planStrokes(png,prepared,options):null);
  const plans=new Map((strokePlan?.regions||[]).map(r=>[r.id,r]));
  const panels=new Map(prepared.elements.filter(e=>plans.get(e.id)?.tool==='finished-panel').map(e=>[e.id,require('./digitisingPanel').measure(prepared,e)]));
  if([...panels.values()].some(p=>!p))throw Error('Finished panel does not fit source geometry.');
  const coveredGround=new Set(prepared.elements.filter(e=>[...panels].some(([id,p])=>p.enclosed.includes(e.id)&&prepared.elements.find(el=>el.id===id).colour===e.colour)).map(e=>e.id));
  const project={version:1,units:'mm',garment:config.garment,widthMm:config.widthMm,heightMm,objects:[],travelRegions:[]},warnings=[],includedSources=new Set();
  if(prepared.consolidatedPixels)warnings.push(`${prepared.consolidatedPixels} raster pixels consolidated or omitted to remove tiny colour fragments; review fine details.`);
  const physical=p=>p.map((v,k)=>Math.max(0,Math.min(k?heightMm:config.widthMm,(v+.5)*scale)));
  const verify=o=>validate({...project,objects:[o]});
  const area=r=>Math.abs(r.reduce((sum,p,i)=>{const q=r[(i+1)%r.length];return sum+p[0]*q[1]-q[0]*p[1];},0))/2;
  const owners=new Map(),forkSources=new Map();
  for(const source of prepared.sourceElements){
    if(config.elementOptions[source.id]?.type==='skip')continue;
    const measured=require('./digitisingFork').measure(prepared.sourceIds,info.width,source);
    if(!measured)continue;
    try{
      const base={id:`source-${source.id}-fork`,colour:config.elementColours[source.id]||source.colour};
      const variants=require('./digitisingFork').constructions(measured,info.width,scale,config.garment);
      let failure=null;
      for(const variant of variants){
        try{
          const parts=variant.parts.map((part,i)=>{
            const o={...base,id:base.id+'-'+i,type:'satin',rungs:simplifyRungs(part.rungs),splitSatin:part.rungs.some(r=>dist(...r)>9),...(variant.compact?{settings:{satinSpacing:.24,pullCompensation:.3}}:{})};verify(o);return o;
          });
          for(const [i,path]of variant.paths.entries()){
            const o={...base,id:base.id+'-tip-'+i,type:'run',passes:3,path};verify(o);parts.push(o);
          }
          require('./digitisingCompiler').compile({...project,travelRegions:[],objects:parts});
          if(failure)warnings.push(`${base.id}: detailed head/shoulder pairing needs review; validated basic turning ribbons retained.`);
          forkSources.set(source.id,parts);break;
        }catch(error){failure=error;}
      }
      if(!forkSources.has(source.id))throw failure;

    }catch(error){warnings.push(`source-${source.id}: turning fork construction needs review (${error.message}); ordinary source planning retained.`);}
  }
  for(const el of prepared.elements.slice().sort((a,b)=>Number(panels.has(b.id))-Number(panels.has(a.id))||((config.elementOptions[a.id]?.order??a.id)-(config.elementOptions[b.id]?.order??b.id)))){
    const forkId=el.sourceId??el.id;
    if(forkSources.has(forkId)){
      if(!includedSources.has(forkId)){project.objects.push(...forkSources.get(forkId));forkSources.get(forkId).forEach(o=>owners.set(o.id,el.id));includedSources.add(forkId);}
      continue;
    }
    const choice=config.elementOptions[el.id];if(coveredGround.has(el.id))continue;if(choice?.type==='skip'||!ids.includes(el.id))continue;
    const base={id:`region-${el.id}`,colour:config.elementColours[el.id]||config.elementColours[el.sourceId]||el.colour};
    if(el.pixels*scale*scale<.05&&Math.max(el.width,el.height)*scale<.6){
      warnings.push(`${base.id}: isolated detail below 0.05 mm² and 0.6 mm extent omitted; review at actual size.`);continue;
    }
    let proposed=[];
    const selected=plans.get(el.id),toolPlan=selected?{...selected,construction:selected.tool?(selected.tool==='fill'?'fill':'columns'):selected.construction}:null;
    if(panels.has(el.id)){
      const parts=require('./digitisingPanel').construct(panels.get(el.id),base);project.objects.push(...parts);parts.forEach(o=>owners.set(o.id,el.id));includedSources.add(el.sourceId??el.id);continue;
    }
    let semantic=null;
    try{semantic=toolPlan?.tool&&require('./digitisingSemanticTools').fit(ids,info.width,el,scale,toolPlan.tool);}
    catch(error){
      // A model-selected family may not fit the measured source. Retry the
      // existing source-only generic construction, retaining an explicit flag.
      warnings.push(`${base.id}: ${toolPlan.tool} does not fit source geometry (${error.message}); generic source construction requires review.`);
    }
    if(semantic){
      for(const [i,part]of semantic.entries()){
        let o={...base,id:base.id+`-tool-${i}`,type:'satin',...part,...(part.rungs.some(r=>dist(...r)>9)?{splitSatin:true}:{}),rungs:simplifyRungs(part.rungs)};
        if(!part.closed&&part.rungs.some(r=>dist(...r)>12)){
          const ring=[...part.rungs.map(r=>r[0]),...part.rungs.map(r=>r[1]).reverse()];
          const outline=ring.filter((p,i)=>dist(p,ring[(i+ring.length-1)%ring.length])>1e-6);
          let x=0,y=0;for(const [a,b]of part.rungs){const angle=2*Math.atan2(b[1]-a[1],b[0]-a[0]);x+=Math.cos(angle);y+=Math.sin(angle);}
          o={...base,id:o.id,type:'fill',outline:simplify([...outline,outline[0]],.05).slice(0,-1),holes:[],angle:(Math.atan2(y,x)*90/Math.PI+180)%180};
          warnings.push(`${o.id}: source column exceeds split-satin width; direction-preserving fill requires review.`);
        }
        try{verify(o);}catch(error){throw Error(`${o.id}: ${error.message}`);}proposed.push(o);
      }
    }else if(toolPlan?.construction!=='fill'&&(toolPlan?.tool||choice?.type==='satin'||choice?.type==='satin-branches')){
      const single=column(ids,info.width,el,scale,config.satinSpacing);
      const paths=single?[single]:branchedColumns(ids,info.width,el,scale,config.satinSpacing);
      try{
        if(!paths)throw Error('no stable paired rails');
        let counters=counterColumns(ids,info.width,el,scale);
        // A ring attached to branches can produce crossing normal rails. In
        // that case retain the full source skeleton rather than forcing a ring.
        try{for(const path of counters)verify({...base,type:'satin',rungs:simplifyRungs(path.map(r=>r.map(physical))),closed:true});}catch{counters=[];}
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
              rungs=require('./digitisingSatinGeometry').stabilise(rungs).rungs;
              let parts;
              if(closed){const o={...base,id:base.id+`-stroke-${i}`,type:'satin',rungs:simplifyRungs(rungs),closed};try{verify(o);parts=[o];}catch{parts=curvedParts(rungs,{...base,id:base.id+`-stroke-${i}`},verify);}}
              else parts=curvedParts(rungs,{...base,id:base.id+`-stroke-${i}`},verify);
              for(const o of parts){verify(o);const checked=validate({...project,objects:[o]}).objects[0];
                if(satinRows(checked).some(r=>!segmentInside(r[0],r[1],checked,.08)))throw Error('paired controls leave the stroke');
                proposed.push(o);
              }
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
        // A valid rail polygon can still omit a substantial branch near a
        // junction. Measure coverage against source pixels before accepting it.
        let sourceSamples=0,coveredSamples=0;
        const stride=Math.max(1,Math.floor(.12/scale));
        for(let y=el.y;y<el.y+el.height;y+=stride)for(let x=el.x;x<el.x+el.width;x+=stride)if(ids[y*info.width+x]===el.id){
          sourceSamples++;if(proposed.some(o=>require('./digitisingProject').inside(physical([x,y]),o,.05)))coveredSamples++;
        }
        if(coveredSamples<sourceSamples*.9)throw Error('paired rails omit source branches');
      }catch(error){
        proposed=[];
        if(paths&&paths.length>1){
          try{
            const pieces=[];
            for(const path of paths){let part=[path[0]],length=0;for(const pair of path.slice(1)){length+=dist(centre(part.at(-1)),centre(pair))*scale;part.push(pair);if(length>=8){pieces.push(part);part=[pair];length=0;}}if(part.length>1)pieces.push(part);}
            const partitioned=require('./digitisingBranchSections').partition(ids,info.width,el,pieces);
            for(const part of partitioned.elements){
              const partBase={...base,id:base.id+'-branch-'+part.id};
              const raw=column(partitioned.ids,info.width,part,scale,config.satinSpacing);
              let candidates=[];
              if(raw){try{candidates=curvedParts(require('./digitisingSatinGeometry').stabilise(raw.map(r=>r.map(physical))).rungs,partBase,verify);}catch{}}
              if(!candidates.length){
                try{
                  const path=pieces[part.id],rungs=require('./digitisingRibbon').ribbon(partitioned.ids,info.width,part,scale,0,centre(path[0]),centre(path.at(-1)),.08,true);
                  candidates=curvedParts(rungs,partBase,verify);
                  let count=0,covered=0;for(let y=part.y;y<part.y+part.height;y+=2)for(let x=part.x;x<part.x+part.width;x+=2)if(partitioned.ids[y*info.width+x]===part.id){count++;if(candidates.some(o=>require('./digitisingProject').inside(physical([x,y]),o,.05)))covered++;}
                  if(!count||covered<count*.97)candidates=[];
                  // A rail polygon alone does not establish that quantised
                  // underlay and alternating top stitches stay within it.
                  if(candidates.length)require('./digitisingCompiler').compile({...project,travelRegions:[],objects:candidates});
                }catch{candidates=[];}
              }
              if(!candidates.length){
                const signed=r=>r.reduce((sum,p,i)=>{const q=r[(i+1)%r.length];return sum+p[0]*q[1]-q[0]*p[1];},0);
                const rings=contours(partitioned.ids,info.width,part,true).map(r=>simplify(r.map(physical),.08).slice(0,-1)).filter(r=>r.length>=3&&area(r)>=.001);
                const outers=rings.filter(r=>signed(r)>0),holes=rings.filter(r=>signed(r)<0);
                candidates=outers.map((outline,i)=>{const fill={...partBase,id:partBase.id+'-fill-'+i,type:'fill',outline,holes:holes.filter(h=>require('./digitisingProject').inside(h[0],{type:'fill',outline,holes:[]})),angle:(require('./digitisingStrokeTools').principal(partitioned.ids,info.width,part)+270)%180};verify(fill);return fill;});
                if(!candidates.length)throw Error('Branch has no valid source contour');
              }
              proposed.push(...candidates);
            }
            warnings.push(`${base.id}: branched reconstruction requires review; source ownership is preserved.`);
          }catch(branchError){warnings.push(`${base.id}: branch recovery failed (${branchError.message}).`);proposed=[];}
        }
        if(!proposed.length)warnings.push(`${base.id}: satin proposal needs review (${error.message}); provisional fill used.`);
      }
    }
    if(!proposed.length){
      const rings=contours(ids,info.width,el,true).map(r=>{
        const points=r.map(physical),tolerance=Math.min(.08,Math.sqrt(area(points))/12);
        let ring=simplify(points,tolerance).slice(0,-1);
        if(ring.length>512)warnings.push(`${base.id}: raster contour simplified within 0.2 mm to fit the control-point limit; review edges.`);
        for(const bound of [.12,.16,.2])if(ring.length>512)ring=simplify(points,bound).slice(0,-1);
        return ring;
      }).filter(r=>r.length>=3&&area(r)>=.001).sort((a,b)=>area(b)-area(a));
      if(!rings.length)throw Error(`${base.id}: no valid physical contour; review artwork.`);
      // Repeated small counters describe a perforated texture, rather than a
      // solid ground. Use a crosswise grain for that construction only; preserve
      // the established diagonal policy for ordinary broad fills.
      const textured=toolPlan?.construction==='fill'&&rings.slice(1).filter(r=>area(r)<area(rings[0])*.05).length>=6;
      const signed=r=>r.reduce((sum,p,i)=>{const q=r[(i+1)%r.length];return sum+p[0]*q[1]-q[0]*p[1];},0);
      const outers=rings.filter(r=>signed(r)>0).filter(r=>{
        const extent=Math.max(...[0,1].map(axis=>Math.max(...r.map(p=>p[axis]))-Math.min(...r.map(p=>p[axis]))));
        if(area(r)<.05&&extent<.6){warnings.push(`${base.id}: isolated fill island below 0.05 mm² and 0.6 mm extent omitted; review at actual size.`);return false;}return true;
      }),holes=rings.filter(r=>signed(r)<0);
      proposed=outers.map((outline,i)=>{
        const o={...base,id:i?base.id+'-island-'+i:base.id,type:'fill',outline,holes:holes.filter(h=>require('./digitisingProject').inside(h[0],{type:'fill',outline,holes:[]})),angle:el.guide?sectionAngle(el):textured?(require('./digitisingStrokeTools').principal(ids,info.width,el)+270)%180:(config.fillAngle??35)};
        try{verify(o);}catch(error){throw Error(`${base.id}: ${error.message} Review source segmentation before compiling.`);}
        const extent=Math.max(...[0,1].map(axis=>Math.max(...outline.map(p=>p[axis]))-Math.min(...outline.map(p=>p[axis]))));
        if(area(outline)<.2&&extent<1){
          try{require('./digitisingCompiler').compile({...project,travelRegions:[],objects:[o]});}
          catch(error){if(!error.message.includes('no sewable stitches'))throw error;warnings.push(`${o.id}: sub-millimetre raster island has no sewable fill rows; omitted for review.`);return null;}
        }
        return o;
      }).filter(Boolean);
    }
    if(proposed.length>1){
      const rings=contours(ids,info.width,el).map(r=>simplify(r.map(physical),.08).slice(0,-1)).filter(r=>r.length>=3&&area(r)>=.001).sort((a,b)=>area(b)-area(a));
      const region={id:base.id,outline:rings[0],holes:rings.slice(1)};
      attachSharedTravel(project,proposed,region,warnings);
    }
    project.objects.push(...proposed);proposed.forEach(o=>owners.set(o.id,el.id));
    includedSources.add(el.sourceId??el.id);
  }
  if(!config.border)for(const [id,panel]of panels){
    const adjustment=require('./digitisingPanel').opticalProposal(prepared,panel,id,project,owners);
    if(!adjustment)continue;
    try{
      require('./digitisingCompiler').compile(adjustment.project);
      project.objects=adjustment.project.objects;project.travelRegions=adjustment.project.travelRegions;
      warnings.push(`region-${id}: foreground optically centred by ${adjustment.shift.map(n=>n.toFixed(3)).join(', ')} mm with satin support over the panel; review the layout adjustment.`);
    }catch(error){warnings.push(`region-${id}: optical layout adjustment could not compile (${error.message}); original placement retained.`);}
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
module.exports={propose,simplifyRungs,attachSharedTravel};
