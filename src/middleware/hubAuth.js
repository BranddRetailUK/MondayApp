const { currentUser } = require('../services/hubAuth');

async function attachHubUser(req, _res, next) {
  try {
    req.hubUser = await currentUser(req);
    next();
  } catch (err) {
    next(err);
  }
}

function requireHubApiAuth(req, res, next) {
  if (req.hubUser) return next();
  return res.status(401).json({ error: 'Login required' });
}

function requireHubPageAuth(req, res, next) {
  if (req.hubUser) return next();
  const nextPath = encodeURIComponent(req.originalUrl || '/');
  return res.redirect(`/login?next=${nextPath}`);
}

function hasFullHubAccess(user) {
  return Boolean(user) && user.access_scope !== 'dtf_only';
}

function requireHubFullApiAccess(req, res, next) {
  if (!req.hubUser) return res.status(401).json({ error: 'Login required' });
  if (hasFullHubAccess(req.hubUser)) return next();
  return res.status(403).json({ error: 'Full dashboard access required' });
}

function requireHubFullPageAccess(req, res, next) {
  if (!req.hubUser) return requireHubPageAuth(req, res, next);
  if (hasFullHubAccess(req.hubUser)) return next();
  return res.redirect('/?tab=dtf-uploader');
}

module.exports = {
  attachHubUser,
  hasFullHubAccess,
  requireHubApiAuth,
  requireHubFullApiAccess,
  requireHubFullPageAccess,
  requireHubPageAuth,
};
