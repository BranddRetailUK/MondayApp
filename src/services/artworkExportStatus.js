const { canControl } = require('./printExports');
const COLUMN = { id:'artwork_export_result', title:'ARTWORK', type:'artwork_result', settings_str:'' };
function buttonState(rows,now=Date.now()) {
  const active=rows.filter(r=>r.status==='queued'||(['processing','awaiting_review'].includes(r.status)&&new Date(r.lease_until).getTime()>now));
  if(active.length) {
    const status=active.some(r=>r.status==='awaiting_review')?'awaiting_review':active.some(r=>r.status==='processing')?'processing':'queued';
    return {status,busy:true,message:status==='awaiting_review'?'Review artwork in Illustrator':status==='processing'?'Exporting artwork':'Artwork queued; waiting for worker'};
  }
  const result=summarize(rows,now);
  return {status:result?.result||'idle',busy:false,message:result?.message||''};
}
function summarize(rows, now=Date.now()) {
  if (!rows.length || rows.some(r=>r.status==='cancelled')) return null;
  const active=r=>r.status==='queued'||(['processing','awaiting_review'].includes(r.status)&&new Date(r.lease_until).getTime()>now);
  if(rows.some(active))return null;
  const files=rows.reduce((n,r)=>n+(Array.isArray(r.outputs)?r.outputs.length:0),0);
  const complete=rows.every(r=>r.status==='exported'&&Array.isArray(r.outputs)&&r.outputs.length>0);
  const result=complete?'success':files?'partial':'failed';
  return {result, message:complete?'Artwork exported successfully':files?'Some artwork exported; issues need attention':'Artwork export failed; no files confirmed saved'};
}
async function decorateArtworkStatus(db,payload,user) {
  if(!canControl(user))return payload;
  for(const board of payload.boards||[]) {
    const at=board.columns.findIndex(c=>c.id==='checkbox_mkm9ah5x');
    board.columns.splice(at<0?board.columns.length:at,0,{...COLUMN});
    const items=(board.groups||[]).flatMap(g=>g.items_page?.items||[]);
    const ids=[...new Set(items.map(i=>i.database_job?.source_order_id).filter(id=>id!=null))];
    if(!ids.length)continue;
    // Approval timestamps invalidate older results, including approval made while exports are Off.
    const {rows}=await db.query(`WITH latest AS (
      SELECT DISTINCT ON(e.source_order_id) e.source_order_id,e.approval_id
      FROM print_export_jobs e JOIN database_jobs j USING(source_order_id)
      WHERE e.source_order_id=ANY($1::integer[]) AND j.proof_approved=TRUE
        AND e.created_at>=COALESCE(j.proof_approved_at,e.created_at)
      ORDER BY e.source_order_id,e.created_at DESC,e.id DESC
    ) SELECT e.source_order_id,e.status,e.outputs,e.lease_until
      FROM print_export_jobs e JOIN latest l USING(source_order_id,approval_id)`,[ids]);
    const grouped=new Map();
    for(const r of rows){const key=String(r.source_order_id);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(r);}
    for(const item of items) {
      const jobs=grouped.get(String(item.database_job?.source_order_id))||[];
      if(item.database_job)item.artwork_export=buttonState(jobs);
      const result=summarize(jobs);
      if(result)item.column_values.push({id:COLUMN.id,type:COLUMN.type,text:result.message,value:JSON.stringify(result)});
    }
  }
  return payload;
}
module.exports={summarize,buttonState,decorateArtworkStatus,COLUMN};
