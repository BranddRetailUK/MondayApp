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

// Pair only unambiguous same-name DST/PDF uploads. Other PDFs remain ordinary artwork.
export function pairRunoutFiles(files) {
  const stem=file=>file.name.replace(/\.(dst|pdf)$/i,'').toLowerCase();
  const pairs=new Map(),used=new Set();
  for(const dst of files.filter(file=>/\.dst$/i.test(file.name))){
    const designs=files.filter(file=>/\.dst$/i.test(file.name)&&stem(file)===stem(dst));
    const sheets=files.filter(file=>/\.pdf$/i.test(file.name)&&stem(file)===stem(dst));
    if(designs.length===1&&sheets.length===1){pairs.set(dst,sheets[0]);used.add(sheets[0]);}
  }
  return files.filter(file=>!used.has(file)).map(file=>({file,runout:pairs.get(file)}));
}
