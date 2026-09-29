const crypto = require('node:crypto');
const { deriveJobCategory } = require('./dashboardAutomation');
const { TEST_DASHBOARD_COLUMN_IDS: ids } = require('./testDashboardDefaults');
const { updateDatabaseJobDashboardFields } = require('./testDashboardDbFields');
const ACTIVE = ['queued', 'processing', 'awaiting_review'];
const RUNNING = ['processing', 'awaiting_review'];
const CONTROL_EMAIL = 'production@ultimatepromotions.co.uk';
const canControl = user => Boolean(user && user.access_scope !== 'dtf_only' && String(user.email || '').trim().toLowerCase() === CONTROL_EMAIL);
async function enabled(db, lock = false) {
  const result = await db.query('SELECT enabled FROM print_export_settings WHERE id=1' + (lock ? ' FOR SHARE' : ''));
  return result.rows[0]?.enabled === true;
}
async function setEnabled(db, value, user) {
  if (!canControl(user)) throw new Error('Production account required');
  if (typeof value !== 'boolean') throw new Error('enabled must be a boolean');
  // This row lock also serialises against approval/claim/retry transactions.
  await db.query('UPDATE print_export_settings SET enabled=$1,updated_by=$2,updated_at=NOW() WHERE id=1', [value, CONTROL_EMAIL]);
  return value;
}

function numericDesigns(value) {
  // Strip the WHOLE embroidery/stitch reference before considering numeric tokens.
  const text = String(value || '').replace(/\bP[\s._-]*S[\s._-]*G\s*(?:(?:NO\.?|NUMBER)\s*)?[:#._-]*\s*\d+[A-Z]?\b/gi, '')
    .replace(/\b(?:STITCH\s*COUNT|STITCHES|ST)\s*[:#._-]*\s*[\d,]+\b/gi, '');
  return [...new Set(text.split(/[,;/|\s]+/).filter(x => /^\d{5,10}$/.test(x) && Number(x) >= 28300).map(x => String(Number(x))))];
}
function eligibleDesigns(job, positions, state = {}) {
  if (!['print', 'print_embroidery'].includes(deriveJobCategory(job))) return [];
  const values = positions.map(p => String(p.design_ref || '').trim()).filter(Boolean);
  return numericDesigns(values.length ? values.join(',') : state.column_values?.[ids.DESIGN]?.text);
}
async function currentDesigns(db, job) {
  const positions = await db.query('SELECT design_ref FROM database_job_positions WHERE source_order_id = $1', [job.source_order_id]);
  const state = await db.query('SELECT column_values FROM test_dashboard_job_state WHERE source_order_id = $1', [job.source_order_id]);
  return eligibleDesigns(job, positions.rows, state.rows[0]);
}
async function transaction(pool, action) {
  const db = await pool.connect();
  try { await db.query('BEGIN'); const result = await action(db); await db.query('COMMIT'); return result; }
  catch (e) { await db.query('ROLLBACK'); throw e; }
  finally { db.release(); }
}
async function saveApproval(pool, { sourceOrderId, labels, nextState, saveState }) {
  return transaction(pool, async db => {
    const queueEnabled = await enabled(db, true);
    const previous = (await db.query('SELECT * FROM database_jobs WHERE source_order_id = $1 FOR UPDATE', [sourceOrderId])).rows[0];
    if (!previous) throw new Error('Job no longer exists');
    const databaseJob = await updateDatabaseJobDashboardFields(db, sourceOrderId, labels);
    const saved = await saveState(db);
    if (!labels.jobApproved) {
      await db.query(`UPDATE print_export_jobs SET status='cancelled', message='Job approval removed. Check any files already produced.', updated_at=NOW()
        WHERE source_order_id=$1 AND status=ANY($2::text[])`, [sourceOrderId, ACTIVE]);
    } else if (queueEnabled && previous.proof_approved !== true) {
      const positions = (await db.query('SELECT design_ref FROM database_job_positions WHERE source_order_id = $1', [sourceOrderId])).rows;
      const refs = eligibleDesigns(previous, positions, nextState);
      const approvalId = crypto.randomUUID();
      for (const ref of refs) {
        await db.query(`INSERT INTO print_export_jobs(id,source_order_id,design_number,approval_id)
          VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [crypto.randomUUID(), sourceOrderId, ref, approvalId]);
      }
    }
    return { databaseJob, saved };
  });
}
async function stillEligible(db, task) {
  const job = (await db.query('SELECT * FROM database_jobs WHERE source_order_id=$1', [task.source_order_id])).rows[0];
  return Boolean(job?.proof_approved === true && (await currentDesigns(db, job)).includes(task.design_number));
}
async function claim(pool, workerId) {
  return transaction(pool, async db => {
    if (!(await enabled(db, true))) return null;
    // Serialise claims so even multiple configured workers cannot overlap Illustrator work.
    await db.query('SELECT pg_advisory_xact_lock(71062901)');
    await db.query(`UPDATE print_export_jobs SET status='needs_attention', message='Worker lost contact. Inspect local outputs before retrying.', updated_at=NOW()
      WHERE status=ANY($1::text[]) AND lease_until<NOW()`, [RUNNING]);
    if ((await db.query('SELECT id FROM print_export_jobs WHERE status=ANY($1::text[]) LIMIT 1', [RUNNING])).rows.length) return null;
    for (let n = 0; n < 100; n++) {
      const row = (await db.query(`SELECT * FROM print_export_jobs WHERE status='queued' ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`)).rows[0];
      if (!row) return null;
      if (!(await stillEligible(db, row))) {
        await db.query(`UPDATE print_export_jobs SET status='cancelled',message='Approval or eligible design reference changed.',updated_at=NOW() WHERE id=$1`, [row.id]);
        continue;
      }
      return (await db.query(`UPDATE print_export_jobs SET status='processing',attempt=attempt+1,claim_token=$2,worker_id=$3,
        lease_until=NOW()+INTERVAL '90 seconds',message='Finding local proof',updated_at=NOW() WHERE id=$1 RETURNING *`,
      [row.id, crypto.randomUUID(), workerId])).rows[0];
    }
    return null;
  });
}
async function updateClaim(pool, id, token, { status, message = '', outputs = [] }) {
  return transaction(pool, async db => {
    const row = (await db.query('SELECT * FROM print_export_jobs WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!row || row.claim_token !== token) return { accepted: false, stop: true };
    // Retry of a lost final HTTP response: acknowledge without re-running Illustrator.
    if (['exported', 'needs_attention'].includes(row.status) && row.status === status) return { accepted: true };
    if (!RUNNING.includes(row.status) || new Date(row.lease_until).getTime() < Date.now()) return { accepted: false, stop: true };
    if (!(await stillEligible(db, row))) {
      await db.query(`UPDATE print_export_jobs SET status='cancelled',message='Approval or design changed. Inspect any files already produced.',updated_at=NOW() WHERE id=$1`, [id]);
      return { accepted: false, stop: true };
    }
    await db.query(`UPDATE print_export_jobs SET status=$2,message=$3,outputs=$4,
      lease_until=CASE WHEN $2=ANY($5::text[]) THEN NOW()+INTERVAL '90 seconds' ELSE NULL END,updated_at=NOW() WHERE id=$1`,
    [id, status, String(message).slice(0,2000), JSON.stringify(outputs), RUNNING]);
    return { accepted: true };
  });
}
async function retry(pool, id) {
  return transaction(pool, async db => {
    if (!(await enabled(db, true))) return false;
    const row = (await db.query('SELECT * FROM print_export_jobs WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!row) return false;
    const expired = RUNNING.includes(row.status) && new Date(row.lease_until).getTime() < Date.now();
    if ((!expired && row.status !== 'needs_attention') || !(await stillEligible(db, row))) return false;
    const active = await db.query('SELECT id FROM print_export_jobs WHERE source_order_id=$1 AND design_number=$2 AND status=ANY($3::text[]) AND id<>$4', [row.source_order_id,row.design_number,ACTIVE,row.id]);
    if (active.rows.length) return false;
    await db.query(`UPDATE print_export_jobs SET status='queued',claim_token=NULL,worker_id=NULL,lease_until=NULL,message='Retry requested after output review',updated_at=NOW() WHERE id=$1`, [id]);
    return true;
  });
}
module.exports = { enabled, canControl, setEnabled, numericDesigns, eligibleDesigns, saveApproval, claim, updateClaim, retry };
