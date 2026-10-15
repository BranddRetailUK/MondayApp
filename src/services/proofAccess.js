const EMAILS = new Set(['production@ultimatepromotions.co.uk', 'charlie@ultimatepromotions.co.uk']);

function isProofGeneratorUser(user) {
  return user?.access_scope !== 'dtf_only'
    && EMAILS.has(String(user?.email || '').trim().toLowerCase());
}

function isProofSandboxUser(user) {
  return isProofGeneratorUser(user) && String(user.email).trim().toLowerCase() === 'charlie@ultimatepromotions.co.uk';
}

function isProductionProofUser(user) {
  return isProofGeneratorUser(user) && !isProofSandboxUser(user);
}

function prepareSandboxBrief(user, brief) {
  if (!isProofSandboxUser(user)) return brief;
  if (brief.proofDesignId || brief.proofSourceOrderId) throw new Error('Sandbox proofs cannot access production designs or jobs.');
  for (const key of ['proofDesignId','proofSourceOrderId','proofRevision','proofSaveKey']) delete brief[key];
  brief.reference = 'SANDBOX';
  return brief;
}

module.exports = { isProofGeneratorUser, isProofSandboxUser, isProductionProofUser, prepareSandboxBrief };
