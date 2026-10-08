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
  const api={colourName,printMethod};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ProofDisplay=api;
})(typeof window==='object'?window:globalThis);
