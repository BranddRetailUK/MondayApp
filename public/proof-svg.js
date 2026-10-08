(function(root){
  const cache=new WeakMap();
  const externalUrl=value=>[...value.matchAll(/url\(\s*([^)]*)\)/gi)].some(match=>!match[1].trim().replace(/^['"]|['"]$/g,'').startsWith('#'));
  async function render(file){
    const parsed=new DOMParser().parseFromString(await file.text(),'image/svg+xml');
    const svg=parsed.documentElement;
    if(svg.localName!=='svg'||parsed.querySelector('parsererror'))throw new Error('The SVG artwork is invalid.');
    // Measure in an isolated, script-disabled document, never in the Hub document.
    // Only local references and embedded raster images are allowed.
    for(const node of [...svg.querySelectorAll('script,foreignObject,animate,animateMotion,animateTransform,set')])node.remove();
    for(const node of [svg,...svg.querySelectorAll('*')]){
      for(const attr of [...node.attributes]){
        if(/^on/i.test(attr.name))node.removeAttributeNode(attr);
        else if(/href$/i.test(attr.name)&&!/^#|^data:image\/(?:png|jpeg|webp);base64,/i.test(attr.value))throw new Error('Embed linked images in the SVG before uploading.');
        else if(externalUrl(attr.value))throw new Error('SVG artwork must use local resources.');
      }
      if(node.localName==='style'&&(/@import|@font-face/i.test(node.textContent)||externalUrl(node.textContent)))throw new Error('SVG artwork must use local resources.');
    }
    const frame=document.createElement('iframe');
    frame.setAttribute('sandbox','allow-same-origin');frame.setAttribute('aria-hidden','true');
    frame.style.cssText='position:fixed;left:-10000px;top:0;width:1000px;height:1000px;visibility:hidden;pointer-events:none';
    const loaded=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));
    frame.srcdoc='<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:">'+new XMLSerializer().serializeToString(svg);
    document.body.append(frame);
    let url;
    try{
      await loaded;
      const measured=frame.contentDocument.querySelector('svg');
      // getBBox sees complete geometry even when the root viewport clips it.
      const box=measured.getBBox();
      if(![box.x,box.y,box.width,box.height].every(Number.isFinite)||box.width<=0||box.height<=0)throw new Error('The SVG has no measurable artwork.');
      let pad=Math.max(box.width,box.height)*.01;
      for(const shape of measured.querySelectorAll('*')){
        const style=frame.contentWindow.getComputedStyle(shape);
        if(style.stroke==='none'||!shape.getCTM)continue;
        const m=shape.getCTM(),r=measured.getCTM();
        if(!m||!r)continue;
        const transform=r.inverse().multiply(m);
        const scale=Math.max(Math.hypot(transform.a,transform.b),Math.hypot(transform.c,transform.d));
        pad=Math.max(pad,parseFloat(style.strokeWidth)*scale*Math.max(1,Number(style.strokeMiterlimit)||1));
      }
      const width=box.width+2*pad,height=box.height+2*pad;
      svg.setAttribute('viewBox',`${box.x-pad} ${box.y-pad} ${width} ${height}`);
      svg.setAttribute('width',String(width));svg.setAttribute('height',String(height));
      svg.setAttribute('preserveAspectRatio','xMidYMid meet');
      // Root sizing styles must not override the measured viewport on reload.
      svg.style.removeProperty('width');svg.style.removeProperty('height');svg.style.removeProperty('overflow');
      url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}));
      const img=new Image();img.src=url;await img.decode();
      const scale=Math.min(4,4000/Math.max(width,height));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil(width*scale));canvas.height=Math.max(1,Math.ceil(height*scale));
      canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob)throw new Error('SVG rendering failed.');
      return new File([blob],file.name.replace(/\.svg$/i,'.png'),{type:'image/png'});
    }finally{frame.remove();if(url)URL.revokeObjectURL(url);}
  }
  root.ProofSvg={prepare(file){if(!cache.has(file))cache.set(file,render(file));return cache.get(file);}};
})(window);
