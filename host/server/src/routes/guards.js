const config = require('../config');
const { readSettings } = require('../lib/storage');

function requireLogin(req, res, next) {
  if (!req.session || !req.session.steamid) {
    return res.status(401).json({ ok: false, error: 'Sign in required' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.isAdmin) {
    return res.status(403).json({ ok: false, error: 'Admin access required' });
  }
  next();
}

function requireCsrf(req, res, next) {
  if (req.session && req.session.csrf && req.headers['x-csrf-token'] === req.session.csrf) {
    return next();
  }
  res.status(403).json({ ok: false, error: 'Invalid CSRF token' });
}

function requireGenerateAllowed(req, res, next) {
  if (!req.session.steamid) return res.status(401).json({ ok: false, error: 'Sign in required' });
  if (req.session.steamid === config.OWNER_STEAMID) return next();
  const settings = readSettings();
  if ((settings.gateMode || 'protected') === 'open') return next();
  if (settings.whitelist.includes(req.session.steamid)) return next();
  return res
    .status(403)
    .json({ ok: false, error: 'Your account is not on the whitelist yet. Ask the site owner to add your Steam ID.' });
}

module.exports = { requireLogin, requireAdmin, requireCsrf, requireGenerateAllowed };