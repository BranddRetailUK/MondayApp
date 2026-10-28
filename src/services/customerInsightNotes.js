const { customerNoteKey } = require('./customerInsights');
async function attachNotes(db, result) {
  const keys = [...new Set(result.customers.flatMap(c=>c.noteKeys))];
  const rows = keys.length ? (await db.query(`SELECT n.* FROM unnest($1::text[]) AS k(customer_key)
    CROSS JOIN LATERAL (SELECT id, customer_key, body, created_by_name, created_at
      FROM customer_insight_notes WHERE customer_key=k.customer_key
      ORDER BY created_at DESC, id DESC) n`, [keys])).rows : [];
  const documents = keys.length ? (await db.query('SELECT * FROM customer_insight_note_documents WHERE customer_key=ANY($1::text[])', [keys])).rows : [];
  result.customers = result.customers.map(({noteKeys,...c}) => {
    const salesNotes = rows.filter(n=>noteKeys.includes(n.customer_key)).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)||Number(b.id)-Number(a.id)).slice(0,20).map(({customer_key,...n})=>n);
    const document=documents.filter(d=>noteKeys.includes(d.customer_key)).sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at))[0];
    const legacyHistory=rows.filter(n=>noteKeys.includes(n.customer_key)).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)||Number(b.id)-Number(a.id));
    const legacyText=legacyHistory.map(n=>`${new Date(n.created_at).toLocaleDateString('en-GB',{timeZone:'Europe/London'})} — ${n.created_by_name}\n${n.body}`).join('\n\n');
    return {...c,salesNotes,salesNote:{body:document?.body ?? legacyText, version:document?.version || 0, documentKey:document?.customer_key || null, updatedBy:document?.updated_by_name || '', updatedAt:document?.updated_at || null}};
  });
  return result;
}
async function saveNoteDocument(db, {noteKeys,body,version,documentKey,user}) {
  const client=await db.connect();
  try{
    await client.query('BEGIN');
    const canonical=[...noteKeys].sort()[0];
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[canonical]);
    const existing=(await client.query('SELECT * FROM customer_insight_note_documents WHERE customer_key=ANY($1::text[]) ORDER BY updated_at DESC FOR UPDATE',[noteKeys])).rows[0];
    if(existing && existing.version===version+1 && existing.body===body && Number(existing.updated_by_user_id)===Number(user.id)) {
      await client.query('COMMIT');return {status:200,salesNote:{body:existing.body,version:existing.version,documentKey:existing.customer_key,updatedBy:existing.updated_by_name,updatedAt:existing.updated_at}};
    }
    if ((existing?.version||0)!==version || (existing?.customer_key||null)!==(documentKey||null)) {
      await client.query('ROLLBACK');return {status:409,error:'These notes were changed by someone else. Your text is kept. Copy your changes, then reload to review the latest notes before saving.'};
    }
    const name=[user.first_name,user.last_name].filter(Boolean).join(' ')||user.email||'Hub user';
    const row=existing ? (await client.query(`UPDATE customer_insight_note_documents SET body=$1,version=version+1,updated_by_user_id=$2,updated_by_name=$3,updated_at=NOW() WHERE customer_key=$4 RETURNING *`,[body,user.id,name,existing.customer_key])).rows[0]
      : (await client.query(`INSERT INTO customer_insight_note_documents(customer_key,body,updated_by_user_id,updated_by_name) VALUES($1,$2,$3,$4) RETURNING *`,[canonical,body,user.id,name])).rows[0];
    await client.query('COMMIT');return {status:200,salesNote:{body:row.body,version:row.version,documentKey:row.customer_key,updatedBy:row.updated_by_name,updatedAt:row.updated_at}};
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
}
async function addNote(db, { sourceOrderId, body, requestId, user }) {
  const job = (await db.query('SELECT customer_id, customer_name FROM database_jobs WHERE source_order_id=$1',[sourceOrderId])).rows[0];
  if (!job) return {status:404,error:'Customer order not found.'};
  if (Number(job.customer_id)===469) return {status:400,error:'This closed customer is excluded from Insights.'};
  const key=customerNoteKey(job), name=[user.first_name,user.last_name].filter(Boolean).join(' ')||user.email||'Hub user';
  const inserted = await db.query(`INSERT INTO customer_insight_notes(customer_key,body,request_id,created_by_user_id,created_by_name)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT(request_id) DO NOTHING
    RETURNING id,body,created_by_name,created_at`,[key,body,requestId,user.id,name]);
  if (inserted.rows.length) return {status:201,note:inserted.rows[0]};
  const existing = (await db.query(`SELECT id,body,created_by_name,created_at FROM customer_insight_notes
    WHERE request_id=$1 AND customer_key=$2 AND body=$3 AND created_by_user_id=$4`,[requestId,key,body,user.id])).rows[0];
  return existing ? {status:200,note:existing} : {status:409,error:'This save request has already been used. Please refresh before trying again.'};
}
module.exports = { attachNotes, addNote, saveNoteDocument };
