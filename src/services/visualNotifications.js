// Simple in-memory tracker for visual approval notifications
const pending = new Set();

function add(itemId) {
  if (!itemId) return;
  pending.add(String(itemId));
}

function remove(itemId) {
  if (!itemId) return;
  pending.delete(String(itemId));
}

function count() {
  return pending.size;
}

function list() {
  return Array.from(pending);
}

module.exports = {
  add,
  remove,
  count,
  list,
};
