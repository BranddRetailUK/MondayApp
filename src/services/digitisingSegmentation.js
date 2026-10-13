const {skeleton,invalidate}=require('./digitisingColumns');
// Separate substantial lobes joined by a sub-thread neck. Grow the labels back
// through the original mask: no erosion of the delivered artwork or its holes.
function separate(ids,elements,w,scale,options={}){
  let nextId=Math.max(...elements.map(e=>e.id))+1;
  for(const el of elements.slice()){
    if(el.guide||options[el.id]?.type==='skip')continue;
    if(el.pixels*scale*scale<.025&&Math.max(el.width,el.height)*scale<.4){
      for(let y=el.y;y<el.y+el.height;y++)for(let x=el.x;x<el.x+el.width;x++)if(ids[y*w+x]===el.id)ids[y*w+x]=-1;
      elements.splice(elements.indexOf(el),1);continue;
    }
    if(el.pixels*scale*scale<2)continue;
    const shape=skeleton(ids,w,el),{W,H,ox,oy,mask,distance}=shape;
    const labels=new Int16Array(mask.length).fill(-1),cores=[];
    const neighbours=k=>[k-1,k+1,k-W,k+W].filter(n=>n>=0&&n<mask.length&&Math.abs(n%W-k%W)+Math.abs(Math.floor(n/W)-Math.floor(k/W))===1);
    for(let k=0;k<mask.length;k++)if(mask[k]&&distance[k]*scale>.25&&labels[k]<0){
      const group=[k],id=cores.length;labels[k]=id;
      for(let q=0;q<group.length;q++)for(const n of neighbours(group[q]))if(mask[n]&&distance[n]*scale>.25&&labels[n]<0){labels[n]=id;group.push(n);}
      cores.push(group);
    }
    const substantial=cores.filter(c=>c.length*scale*scale>=1&&c.length>=el.pixels*.02);
    if(substantial.length<2||elements.length+substantial.length-1>128)continue;
    labels.fill(-1);const queue=[];
    substantial.forEach((core,i)=>{for(const k of core){labels[k]=i;queue.push(k);}});
    for(let q=0;q<queue.length;q++)for(const n of neighbours(queue[q]))if(mask[n]&&labels[n]<0){labels[n]=labels[queue[q]];queue.push(n);}
    const parts=substantial.map((_,i)=>({id:i?nextId+i-1:el.id,sourceId:el.sourceId??el.id,colour:el.colour,pixels:0,x:Infinity,y:Infinity,right:0,bottom:0}));
    for(let k=0;k<mask.length;k++)if(mask[k]){
      const part=parts[labels[k]];if(!part)continue;
      const x=k%W+ox,y=Math.floor(k/W)+oy;ids[y*w+x]=part.id;part.pixels++;part.x=Math.min(part.x,x);part.y=Math.min(part.y,y);part.right=Math.max(part.right,x);part.bottom=Math.max(part.bottom,y);
    }
    nextId+=parts.length-1;
    for(const part of parts){part.width=part.right-part.x+1;part.height=part.bottom-part.y+1;delete part.right;delete part.bottom;}
    elements.splice(elements.indexOf(el),1,parts[0]);elements.push(...parts.slice(1));
  }
  invalidate(ids);
}
module.exports={separate};
