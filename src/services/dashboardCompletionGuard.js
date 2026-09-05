const DASHBOARD_COMPLETION_BLOCK_EMAILS = new Set([
  'melvyn@ultimatepromotions.co.uk',
]);
const DASHBOARD_COMPLETION_BLOCK_MESSAGE = 'LEAVE IT ALONE MELVYN';

function isDashboardCompletionBlocked({
  user,
  columnTitle,
  label,
  clearRequested = false,
} = {}) {
  return !clearRequested
    && isDashboardCompletionBlockedUser(user)
    && normalize(columnTitle) === 'status'
    && normalize(label) === 'completed';
}

function isDashboardCompletionBlockedUser(user) {
  return DASHBOARD_COMPLETION_BLOCK_EMAILS.has(normalize(user?.email));
}

function normalize(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

module.exports = {
  DASHBOARD_COMPLETION_BLOCK_EMAILS,
  DASHBOARD_COMPLETION_BLOCK_MESSAGE,
  isDashboardCompletionBlocked,
};
