const geometry=require('./digitisingProject');
const {validate,satinRows,fillRows,segmentInside,dist,mix,centre}=geometry;
const {chains,route}=require('./digitisingObjectTravel');
// Compile a reviewed physical object plan; no artwork recognition or external APIs.
function compile(input){
  const project=validate(input),commands=[],threads=[],objectStats=[],warnings=[];
  const regions=new Map(project.travelRegions.map(r=>[r.id,{...r,type:'fill'}]));
  let current=[project.widthMm/2,project.heightMm/2],colour=null,trims=0,phase='travel',objectId=null,locked=false,trimmed=true;
  const rounded=p=>p.map((v,i)=>Math.round((v-[project.widthMm,project.heightMm][i]/2)*10));
  const quantised=p=>rounded(p).map((v,i)=>v/10+[project.widthMm,project.heightMm][i]/2);
  const append=(p,kind='stitch',length=3.8)=>{
    const a=rounded(current),b=rounded(p),n=Math.max(1,Math.ceil(dist(a,b)/(length*10)));
    for(let i=1;i<=n;i++){const q=mix(a,b,i/n).map(Math.round),last=rounded(current);if(q[0]===last[0]&&q[1]===last[1])continue;
      commands.push({kind,x:q[0],y:q[1],objectId,phase});if(kind==='stitch'){locked=false;trimmed=false;}current=[q[0]/10+project.widthMm/2,q[1]/10+project.heightMm/2];
      if(commands.length>150000)throw Error('Object plan exceeds 150,000 commands.');
    }
  };
  const lock=()=>{
    if(locked)return;
    const a=commands.at(-2),b=commands.at(-1);if(a?.kind!=='stitch'||b?.kind!=='stitch')return;
    const p=[a.x/10+project.widthMm/2,a.y/10+project.heightMm/2],end=[...current],d=dist(p,end);if(d<.3)return;
    const back=mix(end,p,Math.min(.4/d,.5)),old=phase;phase='lock';append(back);append(end);phase=old;locked=true;
  };
  // Tie off only when thread is actually cut. Continuous same-colour joins
  // remain sewn and do not need duplicate locks at every object boundary.
  const trim=()=>{if(!commands.length||trimmed)return;lock();const [x,y]=rounded(current);commands.push({kind:'jump',x:x+2,y:y+2,objectId,phase:'trim'},{kind:'jump',x:x-2,y:y-2,objectId,phase:'trim'},{kind:'jump',x,y,objectId,phase:'trim'});trims++;trimmed=true;};
  const travel=(p,o,margin=0)=>{
    if(!trimmed&&o.type!=='run'&&segmentInside(current,quantised(p),o,margin+.08)){append(p,'stitch',o.settings.stitchLength);return;}
    const region=regions.get(o.regionId);
    if(!trimmed&&region){
      const allowance=o.settings.pullCompensation+.08,path=route(current,p,region,allowance)?.map(quantised);
      if(path&&path.every((q,i)=>segmentInside(i?path[i-1]:current,q,region,allowance))){const old=phase;phase='connection';for(const q of path)append(q,'stitch',o.settings.stitchLength);phase=old;return;}
    }
    trim();const old=phase;phase='travel';append(p,'jump',7);phase=old;
  };
  const safe=(p,o,max=o.settings.stitchLength,margin=0)=>{
    // Quantisation allowance does not grant permission to stitch across a hole.
    if(!segmentInside(current,quantised(p),o,margin+.08))throw Error(`Object ${o.id}: ${phase} crosses its boundary or a counter; edit the section/entry.`);
    append(p,'stitch',max);
  };
  for(const o of project.objects){
    if(o.type==='fill'&&[o.outline,...o.holes].reduce((n,r)=>n+r.length,0)>1024)warnings.push(`${o.id}: complex raster contour uses trim/jump travel where a direct connection is not contained; review trim count.`);
    const start=commands.length;objectId=o.id;phase='travel';
    if(o.colour!==colour){trim();if(colour!==null)commands.push({kind:'colour',objectId,phase:'colour'});threads.push(o.colour);colour=o.colour;}
    if(o.type==='run'){
      const path=o.entry==='end'?o.path.slice().reverse():o.path;travel(path[0],o);phase='run';for(const p of path.slice(1)){const a=[...current];append(p,'stitch',o.settings.stitchLength);if(o.passes===3){append(a,'stitch',o.settings.stitchLength);append(p,'stitch',o.settings.stitchLength);}}
    }else if(o.type==='satin'){
      const rows=satinRows(o),stride=Math.max(1,Math.round(o.settings.underlaySpacing/(o.settings.satinSpacing/2)));
      travel(centre(rows[0]),o);
      if(o.settings.underlay!=='none'){
        phase='underlay';const spine=require('./digitisingSections').simplify(o.rungs.map(centre),.15);if(o.entry==='end')spine.reverse();
        for(const p of spine.slice(1))safe(p,o);
        if(o.settings.underlay==='centre')rows.reverse();
        else{
          for(let i=rows.length-1,j=0;i>=0;i-=stride,j++){
            const p=mix(centre(rows[i]),rows[i][j%2],.5);
            if(segmentInside(current,p,o,.08))safe(p,o);
            else {travel(centre(rows[i]),o);safe(p,o);}
          }
          travel(centre(rows[0]),o);
        }
      }
      phase='satin';
      for(let i=0;i<rows.length;i++){
        const pair=rows[i],c=centre(pair),edge=pair[i%2],half=dist(c,edge),comp=Math.min(o.settings.pullCompensation,half*.3),target=mix(c,edge,1+comp/half);
        if(!segmentInside(current,quantised(target),o,o.settings.pullCompensation+.08))safe(c,o,9.6,o.settings.pullCompensation);
        safe(target,o,9.6,o.settings.pullCompensation);
      }
    }else{
      for(const underlay of o.settings.underlay==='none'?[false]:[true,false]){
        phase=underlay?'underlay':'fill';const spacing=underlay?o.settings.fillUnderlaySpacing:o.settings.fillSpacing,angle=o.angle+(underlay?90:0);
        const strips=chains(fillRows(o,spacing,angle),angle,spacing);
        let first=true;
        while(strips.length){
          if(!first)strips.sort((a,b)=>Math.min(...a[0].map(p=>dist(current,p)),...a.at(-1).map(p=>dist(current,p)))-Math.min(...b[0].map(p=>dist(current,p)),...b.at(-1).map(p=>dist(current,p))));
          const strip=strips.shift();if(!first&&Math.min(...strip.at(-1).map(p=>dist(current,p)))<Math.min(...strip[0].map(p=>dist(current,p))))strip.reverse();first=false;
          for(let [a,b] of strip){
            if(dist(current,b)<dist(current,a))[a,b]=[b,a];
            if(!trimmed&&dist(current,a)<.5&&segmentInside(current,quantised(b),o,.08)){safe(b,o);continue;}
            let path=!trimmed?route(current,a,o):null;
            if(path){path=path.map(quantised);if(path.some((p,i)=>!segmentInside(i?path[i-1]:current,p,o,.08)))path=null;}
            if(path)for(const p of path)safe(p,o);else travel(a,o,.08);
            safe(b,o);
          }
        }
      }
    }
    if(!commands.slice(start).some(c=>c.kind==='stitch'))throw Error(`Object ${o.id}: no sewable stitches at this size; review the object.`);
    objectStats.push({id:o.id,type:o.type,commands:commands.length-start,entry:o.entry});
  }
  trim();const dst=require('./digitisingStudio').encode(commands,'OBJECT PROJECT');
  const stitches=commands.filter(c=>c.kind==='stitch');let previous={x:0,y:0},shortStitches=0;
  for(const c of commands){if(c.kind==='colour')continue;if(c.kind==='stitch'&&Math.hypot(c.x-previous.x,c.y-previous.y)<5)shortStitches++;previous=c;}
  if(shortStitches>stitches.length*.1)warnings.push('More than 10% of sewing movements are below 0.5 mm; review joins and routing.');
  warnings.push('Object compiler is experimental. Digital validation is not sew-out approval.');
  return {project,dst:dst.toString('base64'),threads,commands,objectStats,stats:{stitches:stitches.length,colourChanges:threads.length-1,trims,shortStitches},warnings};
}
function preview(result){
  const {project,commands,threads}=result;let last=[project.widthMm/2,project.heightMm/2],colour=0,paths=[];
  for(const c of commands){if(c.kind==='colour'){colour++;continue;}const p=[c.x/10+project.widthMm/2,c.y/10+project.heightMm/2];if(c.kind==='stitch')paths.push(`<path d="M${last.join(' ')} L${p.join(' ')}" stroke="${threads[colour]}"/>`);last=p;}
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 ${project.widthMm+2} ${project.heightMm+2}" width="1200" height="${Math.round(1200*(project.heightMm+2)/(project.widthMm+2))}"><rect x="-1" y="-1" width="100%" height="100%" fill="#182430"/><g fill="none" stroke-width="0.08">${paths.join('')}</g></svg>`;
}
module.exports={compile,preview};
