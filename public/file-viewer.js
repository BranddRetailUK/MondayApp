(() => {
  const root = document.getElementById('file-viewer-root');
  if (!root) return;
  const uploadIcon = '<span class="fv-upload" aria-hidden="true">↑</span>';
  const icon = '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 5h21l12 12v42H17z"/><path d="M38 5v14h12M25 31h17M25 39h17M25 47h10"/></svg>';
  root.innerHTML = `<div class="fv"><header><div><h1>File Viewer</h1><p>Open your artwork. Preview, convert and download.</p></div></header><div class="fv-layout"><section class="fv-card"><div class="fv-heading"><h2 class="fv-name" id="fv-name">Preview</h2><small id="fv-kind">No file selected</small></div><input type="file" id="fv-input" hidden><div class="fv-stage" id="fv-stage" role="button" tabindex="0" aria-label="Upload file: click or drop artwork here"><div class="fv-empty">${uploadIcon}<strong>Click or drop a file here</strong></div></div><div class="fv-toolbar"><small id="fv-dimensions">Transparency grid</small><button id="fv-clear" disabled>Clear</button></div></section><section class="fv-card fv-convert"><div class="fv-heading"><h2>Convert & download</h2></div><div class="fv-options"><label>Output format<select id="fv-format"><option value="png">PNG · transparent image</option><option value="jpg">JPG · image</option><option value="webp">WebP · image</option><option value="pdf">PDF · document</option><option value="svg">SVG · image wrapper</option><option value="eps">EPS · flattened artwork</option></select></label><p class="fv-note" id="fv-note">Exports use the preview resolution. SVG and EPS exports contain flattened pixels, not editable vector paths.</p><button class="fv-primary" id="fv-download" disabled>Convert & download ↓</button><div class="fv-details"><div><span>File type</span><b id="fv-meta-type">—</b></div><div><span>File size</span><b id="fv-meta-size">—</b></div><div><span>Dimensions</span><b id="fv-meta-dim">—</b></div></div><div class="fv-status" id="fv-status" role="status" aria-live="polite"></div></div></section></div></div>`;
  const $ = id => document.getElementById(`fv-${id}`);
  let selected = null, canvas = null, pdf = null, page = 1, version = 0;
  const size = n => n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
  const ext = f => f.name.split('.').pop().toLowerCase();
  async function add(incoming) {
    const file = incoming[0];
    if (!file) return;
    if (incoming.length > 1) { $('status').textContent='Please choose one file at a time.'; return; }
    if (file.size > 25*1024*1024) { $('status').textContent='Maximum file size is 25 MB.'; return; }
    await select(file);
  }
  $('stage').onclick=()=>$('input').click();
  $('stage').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('input').click();}};
  $('input').onchange=()=>{add($('input').files);$('input').value='';};
  $('stage').ondragover=e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';$('stage').classList.add('dragging');};
  $('stage').ondragleave=e=>{if(!$('stage').contains(e.relatedTarget))$('stage').classList.remove('dragging');};
  $('stage').ondrop=e=>{e.preventDefault();$('stage').classList.remove('dragging');add(e.dataTransfer.files);};
  function previewProgress(token, label, percent) {
    if (token !== version) return;
    const progress = $('progress');
    if (!progress) return;
    progress.textContent = percent == null ? label : `${label} ${percent}%`;
  }
  function requestEpsPreview(file, token) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/dtf/layouts/eps-preview');
      xhr.responseType = 'blob';
      xhr.timeout = 180000;
      previewProgress(token, 'Uploading', 0);
      xhr.upload.onprogress = event => {
        if (event.lengthComputable) previewProgress(token, 'Uploading', Math.floor(event.loaded / event.total * 100));
      };
      xhr.upload.onload = () => previewProgress(token, 'Converting EPS…');
      xhr.onprogress = event => {
        previewProgress(token, 'Receiving preview', event.lengthComputable ? Math.floor(event.loaded / event.total * 100) : null);
      };
      xhr.onload = async () => {
        if (xhr.status < 200 || xhr.status >= 300) {
          let message = 'EPS conversion failed.';
          try { message = JSON.parse(await xhr.response.text()).error || message; } catch (_) {}
          reject(new Error(message));
          return;
        }
        previewProgress(token, 'Rendering preview…');
        resolve(xhr.response);
      };
      xhr.onerror = () => reject(new Error('Could not connect to the EPS converter.'));
      xhr.ontimeout = () => reject(new Error('EPS conversion timed out. Please try again.'));
      const form = new FormData();
      form.append('file', file);
      xhr.send(form);
    });
  }
  async function imageCanvas(blob) {const url=URL.createObjectURL(blob);try{const img=new Image();img.src=url;await img.decode();const scale=Math.min(1,4096/Math.max(img.naturalWidth,img.naturalHeight));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.naturalWidth*scale));c.height=Math.max(1,Math.round(img.naturalHeight*scale));c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c;}finally{URL.revokeObjectURL(url);}}
  async function renderPdf(doc,n){const p=await doc.getPage(n);const base=p.getViewport({scale:1});const viewport=p.getViewport({scale:Math.min(2,4096/Math.max(base.width,base.height))});const c=document.createElement('canvas');c.width=Math.ceil(viewport.width);c.height=Math.ceil(viewport.height);await p.render({canvasContext:c.getContext('2d'),viewport}).promise;return c;}
  function display(){ $('stage').setAttribute('aria-busy','false');$('stage').replaceChildren(canvas);$('dimensions').textContent=`${canvas.width} × ${canvas.height} px`;$('meta-dim').textContent=`${canvas.width} × ${canvas.height} px`;$('download').disabled=false; }
  async function select(f){const token=++version;selected=f;canvas=null;if(pdf)pdf.destroy();pdf=null;page=1;$('clear').disabled=false;$('name').textContent=f.name;$('kind').textContent=ext(f).toUpperCase();$('meta-type').textContent=ext(f).toUpperCase();$('meta-size').textContent=size(f.size);$('meta-dim').textContent='—';$('download').disabled=true;$('dimensions').textContent='Transparency grid';$('status').textContent='';$('stage').setAttribute('aria-busy','true');$('stage').innerHTML='<div class="fv-loading" role="status" aria-label="Generating preview"><div class="fv-spinner" aria-hidden="true"></div><div id="fv-progress" class="fv-progress" aria-live="polite"></div></div>';
    try {let c,doc=null;if(ext(f)==='pdf'){const lib=await import('/file-viewer-renderer/pdf.mjs');lib.GlobalWorkerOptions.workerSrc='/file-viewer-renderer/pdf.worker.mjs';doc=await lib.getDocument({data:await f.arrayBuffer(),isEvalSupported:false}).promise;c=await renderPdf(doc,1);}else if(ext(f)==='eps'){c=await imageCanvas(await requestEpsPreview(f,token));}else if(['svg','png','jpg','jpeg','webp','gif','bmp','avif'].includes(ext(f))){c=await imageCanvas(f);}else throw Error('Preview is not available for this file type.');if(token!==version){doc?.destroy();return;}canvas=c;pdf=doc;display();$('status').textContent=ext(f)==='eps'?'EPS rendered at 300 DPI.':ext(f)==='gif'?'Preview and exports use a single frame.':'Ready to convert.';
    }catch(e){if(token!==version)return;$('stage').setAttribute('aria-busy','false');$('stage').innerHTML=`<div class="fv-empty">${icon}<strong>Preview unavailable</strong><p id="fv-error"></p></div>`;$('error').textContent=e.message;$('status').textContent='Preview could not be generated.';}}
  function save(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  $('clear').onclick=()=>{version++;selected=null;canvas=null;pdf?.destroy();pdf=null;$('clear').disabled=true;$('stage').setAttribute('aria-busy','false');$('stage').innerHTML=`<div class="fv-empty">${uploadIcon}<strong>Click or drop a file here</strong></div>`;for(const id of ['name','kind','meta-type','meta-size','meta-dim','dimensions'])$(id).textContent='—';$('status').textContent='';for(const id of ['download'])$(id).disabled=true;};
  $('download').onclick=async()=>{if(!canvas||!selected)return;const c=canvas,f=selected,n=page,format=$('format').value,token=version;$('download').disabled=true;$('status').textContent='Preparing download…';try{let blob;const flat=document.createElement('canvas');flat.width=c.width;flat.height=c.height;const ctx=flat.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,flat.width,flat.height);ctx.drawImage(c,0,0);
      if(format==='pdf'){const doc=await PDFLib.PDFDocument.create();const image=await doc.embedPng(c.toDataURL('image/png'));const p=doc.addPage([c.width*72/150,c.height*72/150]);p.drawImage(image,{x:0,y:0,width:p.getWidth(),height:p.getHeight()});blob=new Blob([await doc.save()],{type:'application/pdf'});}
      else if(format==='svg'){blob=new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="${c.width}" height="${c.height}" viewBox="0 0 ${c.width} ${c.height}"><image width="${c.width}" height="${c.height}" href="${c.toDataURL('image/png')}"/></svg>`],{type:'image/svg+xml'});}
      else if(format==='eps'){const pixels=ctx.getImageData(0,0,c.width,c.height).data;const lines=[];let line='';for(let i=0;i<pixels.length;i+=4){for(let j=0;j<3;j++)line+=pixels[i+j].toString(16).padStart(2,'0');if(line.length>=72){lines.push(line);line='';}}if(line)lines.push(line);blob=new Blob([`%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 ${c.width} ${c.height}\n%%EndComments\n/picstr ${c.width*3} string def\n${c.width} ${c.height} scale\n${c.width} ${c.height} 8\n[${c.width} 0 0 -${c.height} 0 ${c.height}]\n{currentfile picstr readhexstring pop} false 3 colorimage\n`,lines.join('\n'),'\nshowpage\n%%EOF\n'],{type:'application/postscript'});}
      else{blob=await new Promise(resolve=>(format==='jpg'?flat:c).toBlob(resolve,format==='jpg'?'image/jpeg':`image/${format}`,0.95));if(!blob||blob.type!==(format==='jpg'?'image/jpeg':`image/${format}`))throw Error('This browser cannot export that format.');}
      save(blob,`${f.name.replace(/\.[^.]+$/,'')}${ext(f)==='pdf'?`-page-${n}`:''}.${format}`);if(token===version)$('status').textContent='Download ready.';
    }catch(e){if(token===version)$('status').textContent=e.message;}finally{if(token===version)$('download').disabled=false;}};
})();
