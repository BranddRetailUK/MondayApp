const EMAILS = new Set(['production@ultimatepromotions.co.uk', 'charlie@ultimatepromotions.co.uk', 'melvyn@ultimatepromotions.co.uk']);

function isProofGeneratorUser(user) {
  return user?.access_scope !== 'dtf_only'
    && EMAILS.has(String(user?.email || '').trim().toLowerCase());
}

function isProductionProofUser(user) {
  return isProofGeneratorUser(user);
}

function prepareSandboxBrief(brief) {
  if (brief.proofDesignId || brief.proofSourceOrderId) throw new Error('Sandbox proofs cannot access production designs or jobs.');
  for (const key of ['proofDesignId','proofSourceOrderId','proofRevision','proofSaveKey']) delete brief[key];
  brief.reference = 'SANDBOX';
  return brief;
}

module.exports = { isProofGeneratorUser, isProductionProofUser, prepareSandboxBrief };
