(async () => {
  const root=document.getElementById('digitising-studio-root');if(!root)return;
  const user=await window.ultimateHubUserPromise;
  if(!user||user.access_scope==='dtf_only'||String(user.email||'').trim().toLowerCase()!=='production@ultimatepromotions.co.uk')return;
  try{const response=await fetch('/api/digitising-studio/status');if(!response.ok)return;const status=await response.json();if(!status.enabled)return;}catch{return;}
  const nav=document.getElementById('digitising-studio-nav');nav.dataset.available='true';nav.hidden=false;
  root.innerHTML=`<div class="ds"><header class="ds-header"><h1>Digitising Studio</h1><span class="ds-badge">Test version</span></header>
  <div class="ds-layout"><form id="ds-form" class="ds-card"><h2>Your artwork</h2>
  <label class="ds-drop" id="ds-drop"><span>＋</span><strong>Upload artwork</strong><small>PNG, EPS or SVG · up to 8 MB</small><input id="ds-file" type="file" accept=".png,.eps,.svg"></label><p id="ds-filename"></p>
  <div class="ds-pair"><label>Width · mm<input id="ds-width" type="number" min="0.1" max="300" step="any" disabled></label><label>Height · mm<input id="ds-height" type="number" min="0.1" step="any" disabled></label></div><label>Garment<select id="ds-garment"><option value="tshirt">T-shirt</option><option value="hoodie">Hoodie / sweatshirt</option><option value="woven">Shirt</option><option value="cap" disabled>Cap · coming soon</option></select></label>
  <label class="ds-check ds-outline"><input id="ds-border" type="checkbox"> Add running outline</label>
  <label id="ds-outline-colour-label" hidden>Outline colour<input id="ds-outline-colour" type="color" value="#000000"></label>
  <button id="ds-generate" type="submit" disabled>Create embroidery</button></form>
  <section class="ds-card"><h2>Preview</h2><div id="ds-stage" class="ds-stage"></div><div id="ds-stats" class="ds-stats"></div><p id="ds-status" role="status" aria-live="polite"></p><div class="ds-actions"><button id="ds-download" disabled>Download DST</button></div></section></div></div>`;
  const $=name=>document.getElementById('ds-'+name);
  let file=null,result=null,version=0,busy=false,previewUrl=null,rasterPreview=null,ratio=null;
  function showArtwork(){if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}$('stage').replaceChildren();if(file&&(rasterPreview||!/\.eps$/i.test(file.name))){if(!rasterPreview)previewUrl=URL.createObjectURL(file);const image=new Image();image.src=rasterPreview||previewUrl;image.alt='Uploaded artwork';$('stage').append(image);}}
  function invalidate(){version++;result=null;$('download').disabled=true;$('stats').textContent='';$('status').textContent='';showArtwork();}
  async function select(f){
    if(!f||busy)return;if(f.size>8*1024*1024){$('status').textContent='Maximum artwork size is 8 MB.';return;}if(!/\.(png|eps|svg)$/i.test(f.name)){$('status').textContent='Choose a PNG, EPS or SVG file.';return;}
    file=f;ratio=null;rasterPreview=null;$('filename').textContent=f.name;invalidate();const token=version;busy=true;$('form').querySelectorAll('input,select,button').forEach(el=>el.disabled=true);$('generate').disabled=true;$('width').disabled=$('height').disabled=true;$('status').textContent='Preparing artwork…';
    try{const data=new FormData();data.append('artwork',file);data.append('garment',$('garment').value);const response=await fetch('/api/digitising-studio/prepare',{method:'POST',body:data}),j=await response.json();if(!response.ok)throw Error(j.error||'Unable to read artwork.');if(token!==version)return;rasterPreview='data:image/png;base64,'+j.png;showArtwork();ratio=j.heightMm/j.widthMm;$('height').max=(300*ratio).toFixed(1);$('width').value=j.widthMm.toFixed(1);$('height').value=j.heightMm.toFixed(1);$('width').disabled=$('height').disabled=false;$('status').textContent='';}catch(error){$('status').textContent=error.message;}finally{busy=false;$('form').querySelectorAll('input,select,button').forEach(el=>el.disabled=false);$('width').disabled=$('height').disabled=!ratio;$('generate').disabled=!ratio;}
  }
  $('file').addEventListener('change',()=>select($('file').files[0]));
  $('drop').addEventListener('dragover',e=>e.preventDefault());
  $('drop').addEventListener('drop',e=>{e.preventDefault();select(e.dataTransfer.files[0]);});
  for(const id of ['garment','outline-colour'])$(id).addEventListener('change',()=>{if(!busy)invalidate();});
  $('border').addEventListener('change',()=>{$('outline-colour-label').hidden=!$('border').checked;if(!busy)invalidate();});
  for(const id of ['width','height'])$(id).addEventListener('input',()=>{if(busy)return;invalidate();if(ratio&&$(id).value){if(id==='width')$('height').value=(Number($('width').value)*ratio).toFixed(1);else $('width').value=(Number($('height').value)/ratio).toFixed(1);}});
  $('form').addEventListener('submit',async event=>{
    event.preventDefault();if(!file||!ratio||busy)return;invalidate();const token=version;busy=true;
    $('form').querySelectorAll('input,select,button').forEach(el=>el.disabled=true);$('generate').textContent='Creating…';$('status').textContent='Creating embroidery…';
    try{
      const data=new FormData();data.append('artwork',file);data.append('garment',$('garment').value);data.append('border',String($('border').checked));data.append('outlineColour',$('outline-colour').value);data.append('widthMm',$('width').value);data.append('heightMm',String(Number($('width').value)*ratio));
      const response=await fetch('/api/digitising-studio/generate',{method:'POST',body:data}),j=await response.json();if(!response.ok)throw Error(j.error||'Unable to create embroidery.');if(token!==version)return;
      const {parseDst}=await import('./embroidery-viewer.mjs');const decoded=parseDst(Uint8Array.from(atob(j.dst),c=>c.charCodeAt(0)));
      const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=650;const ctx=canvas.getContext('2d');ctx.fillStyle='#26313d';ctx.fillRect(0,0,1000,650);
      const scale=Math.min(900/Math.max(decoded.widthMm*10,1),550/Math.max(decoded.heightMm*10,1)),ox=(1000-decoded.widthMm*10*scale)/2-decoded.minX*scale,oy=(650-decoded.heightMm*10*scale)/2-decoded.minY*scale;
      ctx.lineWidth=Math.max(.7,scale*1.4);for(const [x,y,a,b,colour] of decoded.segments){ctx.strokeStyle=j.threads[colour]||'#999';ctx.beginPath();ctx.moveTo(ox+x*scale,oy+y*scale);ctx.lineTo(ox+a*scale,oy+b*scale);ctx.stroke();}
      result=j;$('stage').replaceChildren(canvas);$('stats').textContent=`${j.stats.widthMm.toFixed(1)} × ${j.stats.heightMm.toFixed(1)} mm`;$('status').textContent='Test sample ready.';$('download').disabled=false;
    }catch(error){$('status').textContent=error.message;}finally{busy=false;$('form').querySelectorAll('input,select,button').forEach(el=>el.disabled=false);$('generate').disabled=!file||!ratio;$('generate').textContent='Create embroidery';}
  });
  $('download').addEventListener('click',()=>{if(!result)return;const url=URL.createObjectURL(new Blob([Uint8Array.from(atob(result.dst),c=>c.charCodeAt(0))])),a=document.createElement('a');a.href=url;a.download='embroidery-sample.dst';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
})();
