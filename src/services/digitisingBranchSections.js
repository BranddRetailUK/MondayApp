const {centre}=require('./digitisingProject');
// Multi-source geodesic ownership partitions a branched mask without deleting pixels.
function partition(ids,w,element,paths){
  const labels=new Int16Array(ids.length).fill(-1),queue=[];
  for(const [id,path]of paths.entries())for(const pair of path){const p=centre(pair).map(Math.round),k=p[1]*w+p[0];if(p[0]>=0&&p[0]<w&&ids[k]===element.id&&labels[k]<0){labels[k]=id;queue.push(k);}}
  for(let i=0;i<queue.length;i++){const k=queue[i],x=k%w,y=Math.floor(k/w);for(const n of [x?k-1:-1,x<w-1?k+1:-1,y?k-w:-1,k+w<ids.length?k+w:-1,x&&y?k-w-1:-1,x<w-1&&y?k-w+1:-1,x&&k+w<ids.length?k+w-1:-1,x<w-1&&k+w<ids.length?k+w+1:-1])if(n>=0&&ids[n]===element.id&&labels[n]<0){labels[n]=labels[k];queue.push(n);}}
  // Geodesic fronts can leave small disconnected islands behind another
  // branch. Reassign each island to an adjacent owner; never delete its pixels.
  for(let pass=0;pass<paths.length;pass++){
    const seen=new Uint8Array(labels.length),groups=new Map();
    for(const seed of queue){if(seen[seed])continue;const owner=labels[seed],pixels=[seed];seen[seed]=1;
      for(let i=0;i<pixels.length;i++){const k=pixels[i],x=k%w;for(const n of [x?k-1:-1,x<w-1?k+1:-1,k-w,k+w])if(n>=0&&n<labels.length&&!seen[n]&&labels[n]===owner){seen[n]=1;pixels.push(n);}}
      if(!groups.has(owner))groups.set(owner,[]);groups.get(owner).push(pixels);
    }
    let changed=false;
    for(const [owner,parts]of groups){parts.sort((a,b)=>b.length-a.length);for(const pixels of parts.slice(1)){
      const neighbours=new Map();for(const k of pixels){const x=k%w;for(const n of [x?k-1:-1,x<w-1?k+1:-1,k-w,k+w])if(n>=0&&n<labels.length&&labels[n]>=0&&labels[n]!==owner)neighbours.set(labels[n],(neighbours.get(labels[n])||0)+1);}
      const next=[...neighbours].sort((a,b)=>b[1]-a[1]||a[0]-b[0])[0]?.[0];
      if(next!==undefined){for(const k of pixels)labels[k]=next;changed=true;}
    }}
    if(!changed)break;
  }
  const elements=paths.map((p,id)=>({id,colour:element.colour,x:w,y:ids.length/w,right:-1,bottom:-1,pixels:0}));
  for(let y=element.y;y<element.y+element.height;y++)for(let x=element.x;x<element.x+element.width;x++){const k=y*w+x;if(ids[k]!==element.id)continue;if(labels[k]<0)throw Error('Branch partition left unowned source pixels');const e=elements[labels[k]];e.x=Math.min(e.x,x);e.y=Math.min(e.y,y);e.right=Math.max(e.right,x);e.bottom=Math.max(e.bottom,y);e.pixels++;}
  for(const e of elements){e.width=e.right-e.x+1;e.height=e.bottom-e.y+1;}
  return {ids:labels,elements:elements.filter(e=>e.pixels)};
}
module.exports={partition};
