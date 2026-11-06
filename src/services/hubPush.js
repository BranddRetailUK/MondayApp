const crypto = require('node:crypto');
const { COOKIE_NAME } = require('./hubAuth');
const types = {
  completed: 'A job has been completed.',
  approved: 'A job has been approved.',
  proof: 'A new proof has been created.',
  test: 'Notifications are working on this device.',
};
function configuration(env = process.env) {
  const enabled = Boolean(env.HUB_PUSH_PUBLIC_KEY && env.HUB_PUSH_PRIVATE_KEY && env.HUB_PUSH_SUBJECT);
  return { enabled, publicKey: enabled ? env.HUB_PUSH_PUBLIC_KEY : null };
}
function sessionId(req) {
  const cookie = String(req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE_NAME}=`));
  let token = ''; try { token = decodeURIComponent(cookie?.slice(COOKIE_NAME.length + 1) || ''); } catch {}
  return crypto.createHash('sha256').update(token).digest('hex');
}
function validateSubscription(value) {
  let url; try { url = new URL(value?.endpoint); } catch { throw Error('Invalid notification device.'); }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash || value.endpoint.length > 2048 ||
      !(url.hostname.endsWith('.push.apple.com') || ['fcm.googleapis.com', 'updates.push.services.mozilla.com'].includes(url.hostname))) throw Error('Unsupported notification service.');
  for (const [name, size] of [['p256dh',65],['auth',16]]) {
    const key=value.keys?.[name];
    if (typeof key!=='string' || !/^[\w-]+={0,2}$/.test(key) || Buffer.from(key,'base64url').length!==size) throw Error('Invalid notification keys.');
  }
  try { crypto.ECDH.convertKey(Buffer.from(value.keys.p256dh,'base64url'),'prime256v1'); } catch { throw Error('Invalid notification keys.'); }
  return { endpoint: value.endpoint, keys: {p256dh:value.keys.p256dh,auth:value.keys.auth} };
}
function validatePreferences(value) {
  if (!value || ['completed','approved','proof'].some(k=>typeof value[k]!=='boolean') || Object.keys(value).length!==3) throw Error('Choose your notification preferences.');
  return value;
}
function payload(kind, key) {
  return {title:'Ultimate Hub', body:types[kind], tag:`hub-${crypto.createHash('sha256').update(key).digest('hex').slice(0,32)}`, url:'/mobile?tab=test-dashboard'};
}
async function deliver(subscription, data) {
  const webpush = require('web-push');
  return webpush.sendNotification(subscription, JSON.stringify(data), {
    vapidDetails:{subject:process.env.HUB_PUSH_SUBJECT,publicKey:process.env.HUB_PUSH_PUBLIC_KEY,privateKey:process.env.HUB_PUSH_PRIVATE_KEY},
    TTL:3600, timeout:10000,
  });
}
async function drain(pool, send = deliver) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    // Serialize workers across replicas; delivery row locks also protect preference edits.
    const lock = await db.query('SELECT pg_try_advisory_xact_lock(69112026) AS locked');
    if (!lock.rows[0].locked) { await db.query('ROLLBACK'); return; }
    await db.query(`DELETE FROM hub_push_subscriptions p WHERE NOT EXISTS
      (SELECT 1 FROM hub_sessions s JOIN hub_users u ON u.id=s.user_id
       WHERE s.id=p.session_id AND s.expires_at>now() AND u.access_scope='full')`);
    await db.query("DELETE FROM hub_push_deliveries WHERE created_at < now()-interval '24 hours' OR attempts>=8");
    const rows = (await db.query(`SELECT d.*,p.subscription,p.preferences FROM hub_push_deliveries d
      JOIN hub_push_subscriptions p ON p.endpoint=d.endpoint
      WHERE d.available_at<=now() ORDER BY d.id LIMIT 10 FOR UPDATE OF d,p SKIP LOCKED`)).rows;
    for (const row of rows) {
      try {
        if (row.kind==='test' || row.preferences[row.kind]) await send(row.subscription,payload(row.kind,row.event_key));
        await db.query('DELETE FROM hub_push_deliveries WHERE id=$1',[row.id]);
      } catch (error) {
        if ([404,410].includes(error.statusCode)) await db.query('DELETE FROM hub_push_subscriptions WHERE endpoint=$1',[row.endpoint]);
        else await db.query("UPDATE hub_push_deliveries SET attempts=attempts+1,available_at=now()+($2 * interval '1 second') WHERE id=$1",[row.id,Math.min(3600,30*2**row.attempts)]);
      }
    }
    await db.query('COMMIT');
  } catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
}
function start(pool) {
  if (!configuration().enabled) return;
  let running=false;
  const tick=async()=>{ if(running)return; running=true; try{await drain(pool);}catch{console.error('[hub-push] Delivery worker failed; will retry.');}finally{running=false;} };
  const timer=setInterval(tick,15000); timer.unref(); void tick(); return timer;
}
module.exports={configuration,sessionId,validateSubscription,validatePreferences,payload,drain,start};
