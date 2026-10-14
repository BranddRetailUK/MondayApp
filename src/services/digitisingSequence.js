const {outline,dist}=require('./digitisingProject');
// Reorder only independent objects. Preserve the original order wherever bounds
// touch (including compensation), so grounds, overlapping joins and outlines
// retain their stacking order. Never connect separate letters with sewing.
function sequence(objects){
  const bounds=objects.map(o=>{
    const points=o.type==='run'?o.path:outline(o),margin=(o.settings?.pullCompensation??.3)+.1;
    return [Math.min(...points.map(p=>p[0]))-margin,Math.min(...points.map(p=>p[1]))-margin,Math.max(...points.map(p=>p[0]))+margin,Math.max(...points.map(p=>p[1]))+margin];
  });
  const overlap=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
  const pending=new Set(objects.map((_,i)=>i)),parents=objects.map((_,i)=>objects.flatMap((o,j)=>j<i&&overlap(bounds[i],bounds[j])?[j]:[]));
  const result=[];let colour=null,position=null;
  while(pending.size){
    const ready=[...pending].filter(i=>parents[i].every(j=>!pending.has(j)));
    const same=ready.filter(i=>objects[i].colour===colour),choices=same.length?same:ready;
    // Preserve the next original colour block when a change is unavoidable.
    const nextColour=same.length?colour:objects[choices[0]].colour;
    const selected=choices.filter(i=>objects[i].colour===nextColour).sort((a,b)=>position?dist(position,[(bounds[a][0]+bounds[a][2])/2,(bounds[a][1]+bounds[a][3])/2])-dist(position,[(bounds[b][0]+bounds[b][2])/2,(bounds[b][1]+bounds[b][3])/2])||a-b:a-b)[0];
    result.push(objects[selected]);pending.delete(selected);colour=nextColour;
    position=[(bounds[selected][0]+bounds[selected][2])/2,(bounds[selected][1]+bounds[selected][3])/2];
  }
  return result;
}
module.exports={sequence};
