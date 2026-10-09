(function(root){
  // Supplier footnote keys are display-only; keep original catalogue values for lookup/cache keys.
  function colourName(value){
    return String(value||'').trim().replace(/(?:[^\p{L}\p{N})\]}]|[\u00b9\u00b2\u00b3\u2070-\u2079])+$/u,'').trim();
  }
  function printMethod(value){
    const method=String(value||'').trim();
    if(/embroid|stitch/i.test(method))return 'Embroidery';
    if(/^(?:print(?:ing)?|transfer(?: print(?:ing)?)?|dtf(?: print(?:ing)?)?|heat transfer(?: print(?:ing)?)?)$/i.test(method))return 'Transfer print';
    return method||'To confirm';
  }
  function reviewMessage(value){
    // Old saved history rows may still contain the original catalogue colour dump.
    return String(value||'').replace(/The requested colour does not match this garment in the (?:Ralawise|PenCarrie) catalogue\.[\s\S]*?(?=\s+[A-Z0-9-]{2,24}:|$)/g,'This colour is not available.');
  }
  const api={colourName,printMethod,reviewMessage};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ProofDisplay=api;
})(typeof window==='object'?window:globalThis);
