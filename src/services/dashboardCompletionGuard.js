const DASHBOARD_COMPLETION_BLOCK_EMAILS = new Set([
  'melvyn@ultimatepromotions.co.uk',
]);
const DASHBOARD_COMPLETION_BLOCK_NAMES = new Set([
  'ultimate production',
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
  const name = normalize(
    user?.full_name || [user?.first_name, user?.last_name].filter(Boolean).join(' ')
  );
  return DASHBOARD_COMPLETION_BLOCK_EMAILS.has(normalize(user?.email))
    || DASHBOARD_COMPLETION_BLOCK_NAMES.has(name);
}

function normalize(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

module.exports = {
  DASHBOARD_COMPLETION_BLOCK_EMAILS,
  DASHBOARD_COMPLETION_BLOCK_NAMES,
  DASHBOARD_COMPLETION_BLOCK_MESSAGE,
  isDashboardCompletionBlocked,
};
