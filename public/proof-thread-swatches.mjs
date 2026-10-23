// Group only the editor controls; the per-stop DST sewing sequence stays intact.
export function groupThreadSwatches(colours,codes=[]) {
  const groups=[],byColour=new Map();
  colours.forEach((colour,index)=>{
    const key=colour?colour.toLowerCase():`unassigned-${index}`;
    let group=byColour.get(key);
    if(!group){group={colour,indices:[],codes:[]};byColour.set(key,group);groups.push(group);}
    group.indices.push(index);
    const code=String(codes[index]||'');
    if(code&&!group.codes.includes(code))group.codes.push(code);
  });
  return groups;
}
export function applyThreadSwatch(colours,indices,colour) {
  for(const index of indices)colours[index]=colour;
}
