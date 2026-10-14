// Consolidate raster-sized colour islands only when they exhaust the region
// budget. Merge at most nine pixels into a dominant neighbouring colour.
// Alpha is never filled. Remaining islands no larger than 3×3
// raster pixels are omitted and reported as a review warning.
function consolidate(ids,w){
  const seen=new Uint8Array(ids.length),small=[];let count=0;
  const neighbours=k=>{const x=k%w,y=Math.floor(k/w),h=ids.length/w;return [x?k-1:-1,x<w-1?k+1:-1,y?k-w:-1,y<h-1?k+w:-1,x&&y?k-w-1:-1,x<w-1&&y?k-w+1:-1,x&&y<h-1?k+w-1:-1,x<w-1&&y<h-1?k+w+1:-1].filter(n=>n>=0);};
  for(let i=0;i<ids.length;i++)if(ids[i]>=0&&!seen[i]){
    const group=[i];seen[i]=1;count++;
    for(let q=0;q<group.length;q++)for(const n of neighbours(group[q]))if(!seen[n]&&ids[n]===ids[i]){seen[n]=1;group.push(n);}
  }
  if(count<=128)return 0;
  // A one-pixel majority pass removes colour chatter along raster edges.
  // Read the original labels throughout so smoothing cannot cascade.
  const smooth=[];
  for(let k=0;k<ids.length;k++)if(ids[k]>=0){
    const votes=new Map();for(const n of neighbours(k))if(ids[n]>=0)votes.set(ids[n],(votes.get(ids[n])||0)+1);
    for(const [label,votesFor]of votes)if(label!==ids[k]&&votesFor>=6){smooth.push([k,label]);break;}
  }
  // Smoothing can split a larger fringe into new tiny islands. Measure those
  // on the smoothed labels, without repeating or cascading the majority pass.
  const original=new Map(smooth.map(([k])=>[k,ids[k]]));
  for(const [k,label]of smooth)ids[k]=label;
  seen.fill(0);small.length=0;
  for(let i=0;i<ids.length;i++)if(ids[i]>=0&&!seen[i]){
    const group=[i];seen[i]=1;
    for(let q=0;q<group.length;q++)for(const n of neighbours(group[q]))if(!seen[n]&&ids[n]===ids[i]){seen[n]=1;group.push(n);}
    if(group.length<=9)small.push(group);
  }
  const changes=[];
  for(const group of small){
    const boundary=new Map();
    for(const k of group)for(const n of neighbours(k))if(ids[n]>=0&&ids[n]!==ids[k])boundary.set(ids[n],(boundary.get(ids[n])||0)+1);
    const ranked=[...boundary].sort((a,b)=>b[1]-a[1]),total=ranked.reduce((s,x)=>s+x[1],0);
    if(ranked.length&&ranked[0][1]>=total*.75)changes.push([group,ranked[0][0]]);
    else if(Math.max(...group.map(k=>k%w))-Math.min(...group.map(k=>k%w))<3&&Math.max(...group.map(k=>Math.floor(k/w)))-Math.min(...group.map(k=>Math.floor(k/w)))<3)changes.push([group,-1]);
  }
  for(const [group]of changes)for(const k of group)if(!original.has(k))original.set(k,ids[k]);
  for(const [group,label]of changes)for(const k of group)ids[k]=label;
  return [...original].filter(([k,label])=>ids[k]!==label).length;
}
function sameThreadColour(a,b){
  const neutralDark=c=>Math.max(...c)<=48&&Math.max(...c)-Math.min(...c)<12;
  return Math.hypot(...a.map((v,k)=>v-b[k]))<32||(neutralDark(a)&&neutralDark(b));
}
module.exports={consolidate,sameThreadColour};
