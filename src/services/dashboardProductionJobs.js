const { TEST_DASHBOARD_COLUMN_IDS: C, TEST_DASHBOARD_GROUP_IDS: G } = require('./testDashboardDefaults');
const { dashboardStatusValue, resolveJobApproved, resolveDashboardGroupId, groupIdForStatusAndType, getColumnText } = require('./dashboardAutomation');
const { dashboardSamplingState, fetchDashboardSamplingHistory } = require('./dashboardSampling');
const { DASHBOARD_SPLIT_STATE_KEY } = require('./dashboardSplitJobs');
const { updateDatabaseJobDashboardFields } = require('./testDashboardDbFields');

// Reuse the independent dashboard-row storage and its existing editing endpoints.
// The link owns no financial data: the order's line and design remain authoritative.
async function ensureProductionJobTables(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS dashboard_production_jobs (
    dashboard_job_id TEXT PRIMARY KEY REFERENCES test_dashboard_private_jobs(id) ON DELETE RESTRICT,
    source_order_id INTEGER NOT NULL REFERENCES database_jobs(source_order_id) ON DELETE CASCADE,
    source_order_position_id INTEGER NOT NULL UNIQUE REFERENCES database_job_positions(source_order_position_id) ON DELETE RESTRICT,
    source_order_item_id INTEGER NOT NULL UNIQUE REFERENCES database_job_line_items(source_order_item_id) ON DELETE RESTRICT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);
  await db.query('CREATE INDEX IF NOT EXISTS dashboard_production_jobs_order_idx ON dashboard_production_jobs(source_order_id)');
  await db.query(`CREATE OR REPLACE FUNCTION guard_production_job_link() RETURNS trigger AS $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM database_job_positions WHERE source_order_position_id=NEW.source_order_position_id AND source_order_id=NEW.source_order_id)
        OR NOT EXISTS (SELECT 1 FROM database_job_line_items WHERE source_order_item_id=NEW.source_order_item_id AND source_order_id=NEW.source_order_id) THEN
        RAISE EXCEPTION 'Production line and design must belong to the parent order';
      END IF;
      RETURN NEW;
    END; $$ LANGUAGE plpgsql`);
  await db.query('DROP TRIGGER IF EXISTS production_job_link_guard ON dashboard_production_jobs');
  await db.query(`CREATE TRIGGER production_job_link_guard BEFORE INSERT OR UPDATE ON dashboard_production_jobs
    FOR EACH ROW EXECUTE FUNCTION guard_production_job_link()`);
  // Guard every parent write path, including DATABASE completion and invoicing.
  await db.query(`CREATE OR REPLACE FUNCTION guard_production_parent_completion() RETURNS trigger AS $$
    DECLARE total integer; completed integer;
    BEGIN
      SELECT count(*), count(*) FILTER (WHERE upper(d.column_values->'${C.STATUS}'->>'text') = 'COMPLETED')
      INTO total, completed FROM dashboard_production_jobs p
      JOIN test_dashboard_private_jobs d ON d.id=p.dashboard_job_id WHERE p.source_order_id=NEW.source_order_id;
      IF total > 0 AND completed < total AND
         (NEW.is_complete IS TRUE OR upper(coalesce(NEW.dashboard_status,'')) IN ('COMPLETED','INVOICED') OR
          (NEW.invoice_printed IS TRUE AND OLD.invoice_printed IS NOT TRUE)) THEN
        RAISE EXCEPTION 'Complete all linked production jobs before completing this order';
      END IF;
      IF total > 0 AND completed = total AND OLD.is_complete IS TRUE AND
         (NEW.is_complete IS FALSE OR upper(coalesce(NEW.dashboard_status,'')) NOT IN ('COMPLETED','INVOICED')) THEN
        RAISE EXCEPTION 'Reopen an individual production job to reopen this order';
      END IF;
      RETURN NEW;
    END; $$ LANGUAGE plpgsql`);
  await db.query('DROP TRIGGER IF EXISTS production_parent_completion_guard ON database_jobs');
  await db.query(`CREATE TRIGGER production_parent_completion_guard BEFORE UPDATE ON database_jobs
    FOR EACH ROW EXECUTE FUNCTION guard_production_parent_completion()`);
  await db.query(`CREATE OR REPLACE FUNCTION guard_production_parent_dashboard_state() RETURNS trigger AS $$
    DECLARE total integer; completed integer; next_status text;
    BEGIN
      SELECT count(*), count(*) FILTER (WHERE upper(d.column_values->'${C.STATUS}'->>'text') = 'COMPLETED')
      INTO total, completed FROM dashboard_production_jobs p
      JOIN test_dashboard_private_jobs d ON d.id=p.dashboard_job_id WHERE p.source_order_id=NEW.source_order_id;
      next_status := upper(coalesce(NEW.column_values->'${C.STATUS}'->>'text',''));
      IF total > 0 AND completed < total AND (next_status IN ('COMPLETED','INVOICED') OR NEW.group_id='${G.COMPLETED}' OR NEW.archived IS TRUE) THEN
        RAISE EXCEPTION 'Complete all linked production jobs before completing this order';
      END IF;
      IF total > 0 AND completed = total AND next_status NOT IN ('COMPLETED','INVOICED') THEN
        RAISE EXCEPTION 'Reopen an individual production job to reopen this order';
      END IF;
      RETURN NEW;
    END; $$ LANGUAGE plpgsql`);
  await db.query('DROP TRIGGER IF EXISTS production_parent_dashboard_state_guard ON test_dashboard_job_state');
  await db.query(`CREATE TRIGGER production_parent_dashboard_state_guard BEFORE INSERT OR UPDATE ON test_dashboard_job_state
    FOR EACH ROW EXECUTE FUNCTION guard_production_parent_dashboard_state()`);

}

async function fetchProductionLinks(db) {
  const { rows } = await db.query(`SELECT p.*, j.order_no, j.customer_name, j.job_title AS parent_title,
      j.invoice_printed, j.pf_invoice_printed, j.closed_without_invoice, j.invoice_required,
      pos.position_name, pos.colour_notes, pos.design_ref,
      row_to_json(li) AS line
    FROM dashboard_production_jobs p JOIN database_jobs j USING(source_order_id)
    JOIN database_job_positions pos ON pos.source_order_position_id=p.source_order_position_id
    JOIN database_job_line_items li ON li.source_order_item_id=p.source_order_item_id
    ORDER BY pos.position_sort_order, p.dashboard_job_id`);
  return rows;
}

async function productionLink(db, id) {
  return (await db.query('SELECT * FROM dashboard_production_jobs WHERE dashboard_job_id=$1', [id])).rows[0];
}

async function syncProductionParent(db, sourceOrderId) {
  const { rows } = await db.query(`SELECT d.column_values FROM dashboard_production_jobs p
    JOIN test_dashboard_private_jobs d ON d.id=p.dashboard_job_id WHERE p.source_order_id=$1`, [sourceOrderId]);
  if (!rows.length) return;
  const completed = rows.filter(r => String(r.column_values[C.STATUS]?.text).toUpperCase() === 'COMPLETED').length;
  const allCompleted = completed === rows.length;
  const parent = (await db.query('SELECT * FROM database_jobs WHERE source_order_id=$1 FOR UPDATE', [sourceOrderId])).rows[0];
  const wasCompleted = parent.is_complete || ['COMPLETED', 'INVOICED'].includes(parent.dashboard_status);
  if (!allCompleted && !wasCompleted) return { completed, total: rows.length };
  const status = allCompleted ? 'COMPLETED' : (parent.proof_approved ? 'NO STOCK' : 'AWAITING APPROVAL');
  const group = allCompleted ? G.COMPLETED : (parent.proof_approved ? G.PRE_PRODUCTION : G.OFFICE);
  await db.query(`UPDATE database_jobs SET is_complete=$2, complete_date=CASE WHEN $2 THEN COALESCE(complete_date,NOW()) ELSE NULL END,
    dashboard_status=$3, dashboard_status_updated_at=NOW(), updated_at_source=NOW() WHERE source_order_id=$1`, [sourceOrderId, allCompleted, status]);
  await db.query(`UPDATE test_dashboard_job_state SET group_id=$2, archived=FALSE,
    column_values=jsonb_set(column_values, ARRAY[$3]::text[], $4::jsonb), updated_at=NOW() WHERE source_order_id=$1`,
  [sourceOrderId, group, C.STATUS, JSON.stringify(dashboardStatusValue(status))]);
  return { completed, total: rows.length };
}

async function saveLinkedProductionJob(pool, id, state, save, { designChanged = false } = {}) {
  if (!await productionLink(pool, id)) return save(pool);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const link = await productionLink(client, id);
    if (link) {
      const parent = (await client.query('SELECT * FROM database_jobs WHERE source_order_id=$1 FOR UPDATE', [link.source_order_id])).rows[0];
      if (parent.invoice_printed || parent.pf_invoice_printed || parent.closed_without_invoice) {
        throw new Error('This order has been finalized; reopen it before changing production jobs');
      }
      if (state.archived || String(state.column_values[C.STATUS]?.text).toUpperCase() === 'INVOICED') {
        throw new Error('Invoice or archive the parent order, not an individual production job');
      }
      if (designChanged) {
        const ref = String(state.column_values[C.DESIGN]?.text || '').trim();
        if (!ref) throw new Error('A linked production job must retain its design reference');
        await client.query('UPDATE database_job_positions SET design_ref=$2, updated_at_source=NOW() WHERE source_order_position_id=$1 AND source_order_id=$3',
          [link.source_order_position_id, ref, link.source_order_id]);
      }
    }
    const saved = await save(client);
    if (link) await syncProductionParent(client, link.source_order_id);
    await client.query('COMMIT');
    return saved;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

// Release the linked family as one transaction; completion remains per child.
async function readyLinkedProductionParent(pool, sourceOrderId) {
  const links = await pool.query('SELECT dashboard_job_id FROM dashboard_production_jobs WHERE source_order_id=$1', [sourceOrderId]);
  if (!links.rows.length) return null;
  const client = await pool.connect();
  const reject = message => { throw Object.assign(new Error(message), { statusCode: 409, code: 'production_release_blocked' }); };
  try {
    await client.query('BEGIN');
    const job = (await client.query('SELECT * FROM database_jobs WHERE source_order_id=$1 FOR UPDATE', [sourceOrderId])).rows[0];
    const state = (await client.query('SELECT * FROM test_dashboard_job_state WHERE source_order_id=$1 FOR UPDATE', [sourceOrderId])).rows[0];
    const children = (await client.query(`SELECT d.* FROM dashboard_production_jobs p
      JOIN test_dashboard_private_jobs d ON d.id=p.dashboard_job_id
      WHERE p.source_order_id=$1 ORDER BY d.id FOR UPDATE OF d`, [sourceOrderId])).rows;
    if (!job || !children.length) reject('The linked production jobs have changed; refresh the dashboard.');
    if (job.invoice_printed || job.pf_invoice_printed || job.closed_without_invoice || job.is_complete || state?.archived) {
      reject('Reopen the order or a completed child before releasing these production jobs.');
    }
    if (!resolveJobApproved(job, state?.column_values || {})) reject('Approve the parent job before releasing its production jobs.');
    const history = await fetchDashboardSamplingHistory(client, [sourceOrderId]);
    if (dashboardSamplingState(job, state, history.get(sourceOrderId)).blocked) reject('Set the parent job to SAMPLED before releasing its production jobs.');
    const updates = [];
    for (const child of children) {
      const values = child.column_values || {};
      const status = getColumnText(values[C.STATUS]).toUpperCase();
      if (['COMPLETED', 'IN PRODUCTION'].includes(status)) continue;
      if (child.archived || status === 'INVOICED') reject('A linked production job is archived; reopen it before releasing the order.');
      if (!resolveJobApproved({}, values)) reject(`Approve ${child.item_name || 'every child job'} before releasing the order.`);
      if (dashboardSamplingState({}, child).blocked) reject(`Set ${child.item_name || 'every child job'} to SAMPLED before releasing the order.`);
      const group = groupIdForStatusAndType('READY TO PRINT', getColumnText(values[C.TYPE]).toUpperCase());
      if (!group) reject(`Set the production type for ${child.item_name || 'every child job'} before releasing the order.`);
      updates.push({ child, group });
    }
    for (const { child, group } of updates) {
      await client.query(`UPDATE test_dashboard_private_jobs SET group_id=$2,
        column_values=jsonb_set(column_values, ARRAY[$3]::text[], $4::jsonb), updated_at=NOW() WHERE id=$1`,
      [child.id, group, C.STATUS, JSON.stringify(dashboardStatusValue('READY TO PRINT'))]);
    }
    const values = { ...(state?.column_values || {}), [C.STATUS]: dashboardStatusValue('READY TO PRINT') };
    delete values[DASHBOARD_SPLIT_STATE_KEY];
    const group = resolveDashboardGroupId({ ...job, dashboard_status: 'READY TO PRINT' }, { ...state, column_values: values });
    const saved = (await client.query(`INSERT INTO test_dashboard_job_state(source_order_id,group_id,item_name,column_values,archived,updated_at)
      VALUES($1,$2,$3,$4,false,NOW()) ON CONFLICT(source_order_id) DO UPDATE SET
      group_id=EXCLUDED.group_id,column_values=EXCLUDED.column_values,updated_at=NOW() RETURNING *`,
    [sourceOrderId, group, state?.item_name || [job.order_no, job.customer_name, job.job_title].filter(Boolean).join(' - '), JSON.stringify(values)])).rows[0];
    await updateDatabaseJobDashboardFields(client, sourceOrderId, { status: 'READY TO PRINT' });
    await client.query('COMMIT');
    return { ...saved, releasedChildren: updates.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

module.exports = { ensureProductionJobTables, fetchProductionLinks, productionLink, syncProductionParent, saveLinkedProductionJob, readyLinkedProductionParent };
