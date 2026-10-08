// Shared by hosted downloads and the standalone Windows worker.
function proofFileName({reference,designNumber,customer,jobTitle}={}) {
  const clean=value=>String(value||'').replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim().slice(0,70).replace(/[. ]+$/g,'');
  return [clean(designNumber||reference)||'Clothing',clean(customer),clean(jobTitle),'PROOF'].filter(Boolean).join(' - ')+'.pdf';
}
function originalArtworkName(value){
  if(typeof value!=='string'||!value||value.length>255||/[<>:"/\\|?*\x00-\x1f\x7f-\x9f]/.test(value)||/[. ]$/.test(value)||/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(value))throw new Error('Artwork filename is not valid on Windows. Rename the uploaded file and try again.');
  return value;
}
module.exports={proofFileName,originalArtworkName};
