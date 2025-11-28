const { analyzeItemSide, SIDE_FRONT, SIDE_BACK } = require('./visualAnalysis');

const queue = [];
let working = false;

function enqueue(task) {
  const job = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, ...task };
  queue.push(job);
  tick();
  return job.id;
}

async function tick() {
  if (working) return;
  const next = queue.shift();
  if (!next) return;
  working = true;
  try {
    const side = normalizeSide(next.side);
    await analyzeItemSide({
      itemId: next.itemId,
      side,
      uploadedFilename: next.filename || null
    });
  } catch (err) {
    console.error('[analysisQueue] job failed:', err?.message || err);
  } finally {
    working = false;
    setImmediate(tick);
  }
}

function normalizeSide(raw) {
  const s = String(raw || '').toLowerCase();
  if (s.includes('back')) return SIDE_BACK;
  return SIDE_FRONT;
}

module.exports = {
  enqueue,
  normalizeSide
};
