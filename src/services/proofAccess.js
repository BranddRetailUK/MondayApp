const EMAILS = new Set(['production@ultimatepromotions.co.uk', 'charlie@ultimatepromotions.co.uk']);

function isProofGeneratorUser(user) {
  return user?.access_scope !== 'dtf_only'
    && EMAILS.has(String(user?.email || '').trim().toLowerCase());
}

module.exports = { isProofGeneratorUser };
