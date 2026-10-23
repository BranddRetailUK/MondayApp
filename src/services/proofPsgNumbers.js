const {resolveDecorations}=require('./proofLayout');
function hasEmbroidery(source) {
  const brief=source?.brief;
  return (brief?.products||[]).some(product=>resolveDecorations(brief,product)
    .some(decoration=>/embroidery/i.test(decoration.method||product.method||brief.method||'')));
}
// Only DST originals actually used by a non-omitted decoration identify a PSG.
function psgNumbers(source, artworks = []) {
  const brief = source?.brief;
  const used = new Set((brief?.products || []).flatMap(product => product.decorations || [])
    .filter(decoration => !decoration.omit).map(decoration => decoration.artworkId));
  return [...new Set(artworks.filter(artwork => used.has(artwork.id)).flatMap(artwork => {
    const name = String(artwork.name || '').split(/[\\/]/).pop();
    if (!/\.dst$/i.test(name)) return [];
    const match = name.match(/(?:^|[^a-z0-9])psg[\s_-]*(\d+)(?=$|[^a-z0-9])/i);
    return match ? [`PSG${match[1]}`] : [];
  }))];
}
// Project only metadata: never load base64 originals into the history response.
const psgColumns = `source AS psg_source,
  (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',a->>'id','name',a->>'name')),'[]'::jsonb)
   FROM jsonb_array_elements(source_artworks) a) AS psg_artworks`;
async function addPsgPositions(db, sourceOrderId, source, artworks) {
  const numbers = psgNumbers(source, artworks);
  if (!numbers.length) return numbers;
  await db.query('LOCK TABLE database_job_positions IN SHARE ROW EXCLUSIVE MODE');
  for (const number of numbers) {
    await db.query(`INSERT INTO database_job_positions(source_order_position_id,source_order_id,position_sort_order,design_ref,created_at_source,updated_at_source)
      SELECT (SELECT COALESCE(MAX(source_order_position_id),0)+1 FROM database_job_positions),$1,
        (SELECT COALESCE(MAX(position_sort_order),0)+1 FROM database_job_positions WHERE source_order_id=$1),$2,NOW(),NOW()
      WHERE NOT EXISTS(SELECT 1 FROM database_job_positions WHERE source_order_id=$1 AND UPPER(BTRIM(design_ref))=$2)`,[sourceOrderId,number]);
  }
  return numbers;
}
module.exports = {hasEmbroidery, psgNumbers, psgColumns, addPsgPositions};
