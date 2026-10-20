// Share only concurrent reads. Completed results are never retained, so changes
// from DATABASE, workers and supplier sync are visible on the very next poll.
function coalesceReads(read) {
  let pending;
  return function get(fresh = false) {
    if (fresh) return read();
    if (!pending) pending = Promise.resolve().then(read).finally(() => { pending = null; });
    return pending;
  };
}
module.exports = { coalesceReads };
