const config = require('../config');

const OPENID_NS = 'http://specs.openid.net/auth/2.0';
const IDENTIFIER_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select';

function realmBase(req) {
  if (config.BASE_URL) return config.BASE_URL.replace(/\/$/, '');
  const protoHeader = req.headers['x-forwarded-proto'];
  const proto = protoHeader
    ? String(protoHeader).split(',')[0].trim()
    : req.secure
      ? 'https'
      : 'http';
  const host = req.headers.host || `localhost:${config.PORT}`;
  return `${proto}://${host}`;
}

function buildAuthUrl(realm, returnTo) {
  const params = new URLSearchParams();
  params.set('openid.ns', OPENID_NS);
  params.set('openid.mode', 'checkid_setup');
  params.set('openid.return_to', returnTo);
  params.set('openid.realm', realm);
  params.set('openid.identity', IDENTIFIER_SELECT);
  params.set('openid.claimed_id', IDENTIFIER_SELECT);
  return `${config.STEAM_OPENID_LOGIN}?${params.toString()}`;
}

async function verifyAssertion(query, realm) {
  const claimed = String(query['openid.claimed_id'] || query['openid.identity'] || '');
  const m = /\/openid\/id\/(\d{17,})$/.exec(claimed);
  if (!m) return null;
  const steamid = m[1];

  const returnTo = decodeURIComponent(String(query['openid.return_to'] || ''));
  if (!returnTo.startsWith(realm)) return null;

  const body = new URLSearchParams();
  const signed = String(query['openid.signed'] || '').split(/\s+/).filter(Boolean);
  const tracked = new Set(['ns', 'mode', 'return_to', 'claimed_id', 'identity', 'assoc_handle', 'signed', 'sig']);
  for (const key of Object.keys(query)) {
    if (key.startsWith('openid.')) body.set(key, String(query[key]));
  }
  for (const s of signed) tracked.add(s);
  body.set('openid.mode', 'check_authentication');

  const res = await fetch(config.STEAM_OPENID_LOGIN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const text = await res.text();
  if (!/is_valid\s*:\s*true/i.test(text)) return null;
  return steamid;
}

module.exports = { realmBase, buildAuthUrl, verifyAssertion };