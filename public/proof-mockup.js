(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ProofMockup=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  const sheet={width:841.89,height:595.275};
  const area={x:34,y:152,width:774,height:410};
  function placement(value={}){
    const finite=(v,fallback)=>typeof v==='number'&&Number.isFinite(v)?v:fallback;
    const size=Math.max(41,Math.min(area.height*4,finite(value?.size,410)));
    return {x:Math.max(area.x+20-size,Math.min(area.x+area.width-20,finite(value?.x,(sheet.width-size)/2))),
      y:Math.max(area.y+20-size,Math.min(area.y+area.height-20,finite(value?.y,area.y+(area.height-size)/2))),size};
  }
  function createEditor({product,page,isBusy,onChange}){
    const wrap=document.createElement('div');wrap.className='proof-view-editor';
    const help=document.createElement('p');help.textContent='Drag the mock up to move it. Drag the bottom-right corner or use Size to resize it. Anything outside the dashed area is clipped.';wrap.append(help);
    const canvas=document.createElement('canvas');canvas.width=842;canvas.height=595;canvas.className='proof-placement-canvas';canvas.tabIndex=0;
    canvas.setAttribute('aria-label',`${product.code} mock up position on proof. Use arrow keys to move; plus and minus to resize.`);
    const ctx=canvas.getContext('2d'),image=new Image();let drag=null;
    const current=()=>placement(product.mockupPlacement||page.mockupPlacement);
    const controls=document.createElement('div');controls.className='proof-question-actions';
    const label=document.createElement('label');label.className='proof-control';label.textContent='Size';
    const size=document.createElement('input');size.type='range';size.min=10;size.max=400;size.step=1;size.value=Math.round(current().size/area.height*100);label.append(size);
    const reset=document.createElement('button');reset.type='button';reset.className='proof-secondary-button';reset.textContent='Reset position and size';controls.append(label,reset);
    function paint(){
      const p=current();ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle='#e5eaf0';ctx.fillRect(0,0,canvas.width,98);ctx.fillStyle='#172839';ctx.font='bold 16px sans-serif';ctx.fillText(`${product.code} ${product.name||''}`,34,40,774);ctx.font='13px sans-serif';ctx.fillText('Product and print details',34,76);ctx.fillText('Mock up area',34,135);
      ctx.strokeStyle='#b7c3ce';ctx.setLineDash([5,5]);ctx.strokeRect(area.x,area.y,area.width,area.height);ctx.setLineDash([]);
      ctx.save();ctx.beginPath();ctx.rect(area.x,area.y,area.width,area.height);ctx.clip();
      if(image.complete&&image.naturalWidth)ctx.drawImage(image,p.x,p.y,p.size,p.size);
      ctx.strokeStyle='#0873c8';ctx.lineWidth=2;ctx.strokeRect(p.x,p.y,p.size,p.size);ctx.fillStyle='#0873c8';const corner=handle(p);ctx.fillRect(corner.x-7,corner.y-7,14,14);ctx.restore();
      size.value=Math.round(p.size/area.height*100);
    }
    function handle(p){return {x:Math.max(area.x+7,Math.min(area.x+area.width-7,p.x+p.size)),y:Math.max(area.y+7,Math.min(area.y+area.height-7,p.y+p.size))};}
    function update(p){product.mockupPlacement=placement(p);onChange();paint();}
    function resize(next){const p=current();update({x:p.x+(p.size-next)/2,y:p.y+(p.size-next)/2,size:next});}
    const point=event=>{const box=canvas.getBoundingClientRect();return {x:(event.clientX-box.left)*sheet.width/box.width,y:(event.clientY-box.top)*sheet.height/box.height};};
    canvas.addEventListener('pointerdown',event=>{
      if(isBusy()||event.button!==0)return;
      const q=point(event),p=current(),hit=12*sheet.width/canvas.getBoundingClientRect().width;
      if(q.x<area.x||q.x>area.x+area.width||q.y<area.y||q.y>area.y+area.height)return;
      const corner=handle(p);
      if(Math.abs(q.x-corner.x)<=hit&&Math.abs(q.y-corner.y)<=hit)drag={mode:'resize',p,start:q};
      else if(q.x>=p.x&&q.x<=p.x+p.size&&q.y>=p.y&&q.y<=p.y+p.size)drag={mode:'move',p,dx:q.x-p.x,dy:q.y-p.y};
      if(drag){event.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(event.pointerId);}
    });
    canvas.addEventListener('pointermove',event=>{
      if(!drag||isBusy())return;const q=point(event);
      if(drag.mode==='move')update({...drag.p,x:q.x-drag.dx,y:q.y-drag.dy});
      else update({...drag.p,size:drag.p.size+(q.x-drag.start.x+q.y-drag.start.y)/2});
    });
    const finish=event=>{drag=null;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);};
    canvas.addEventListener('pointerup',finish);canvas.addEventListener('pointercancel',finish);canvas.addEventListener('lostpointercapture',()=>{drag=null;});
    canvas.addEventListener('keydown',event=>{
      if(isBusy())return;const p=current(),step=event.shiftKey?10:2;
      if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();update({...p,x:p.x+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0),y:p.y+(event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0)});}
      if(['+','=','-'].includes(event.key)){event.preventDefault();resize(p.size+(event.key==='-'?-step:step));}
    });
    size.addEventListener('input',()=>{if(!isBusy())resize(Number(size.value)*area.height/100);});
    reset.addEventListener('click',()=>{if(!isBusy())update(placement());});
    wrap.previewReady=new Promise(resolve=>{image.onload=()=>{paint();resolve();};image.onerror=()=>{help.textContent='Mock up preview unavailable. Reopen the proof to try again.';resolve();};});
    image.src=page.image;wrap.append(canvas,controls);paint();return wrap;
  }
  return {sheet,area,placement,createEditor};
});
