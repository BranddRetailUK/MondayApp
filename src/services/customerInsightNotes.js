const { customerNoteKey } = require('./customerInsights');
async function attachNotes(db, result) {
  const keys = [...new Set(result.customers.flatMap(c=>c.noteKeys))];
  const rows = keys.length ? (await db.query(`SELECT n.* FROM unnest($1::text[]) AS k(customer_key)
    CROSS JOIN LATERAL (SELECT id, customer_key, body, created_by_name, created_at
      FROM customer_insight_notes WHERE customer_key=k.customer_key
      ORDER BY created_at DESC, id DESC LIMIT 20) n`, [keys])).rows : [];
  result.customers = result.customers.map(({noteKeys,...c}) => ({...c, salesNotes: rows.filter(n=>noteKeys.includes(n.customer_key)).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)||Number(b.id)-Number(a.id)).slice(0,20).map(({customer_key,...n})=>n)}));
  return result;
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
module.exports = { attachNotes, addNote };
