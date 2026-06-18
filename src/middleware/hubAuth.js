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

module.exports = {
  attachHubUser,
  requireHubApiAuth,
  requireHubPageAuth,
};
