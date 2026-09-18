const express = require('express');
const crypto = require('crypto');
const config = require('../config');
const { safeEqual } = require('../utils');
const { SteamApi } = require('../lib/steamApi');
const { realmBase, buildAuthUrl, verifyAssertion } = require('../lib/openid');
const { upsertUser } = require('../lib/storage');

const router = express.Router();
const api = new SteamApi(config.STEAM_API_KEY);

function ensureCsrf(req) {
  if (!req.session.csrf) {
    req.session.csrf = crypto.randomBytes(18).toString('hex');
  }
  return req.session.csrf;
}

router.get('/steam', (req, res) => {
  const realm = realmBase(req);
  const returnTo = `${realm}/api/auth/steam/callback`;
  res.redirect(buildAuthUrl(realm, returnTo));
});

router.get('/steam/callback', async (req, res) => {
  try {
    const realm = realmBase(req);
    const steamid = await verifyAssertion(req.query, realm);
    if (!steamid) {
      return res.status(400).send('Steam sign-in could not be verified.');
    }
    let persona = null;
    try {
      persona = await api.getPlayerSummaries(steamid);
    } catch (err) {
      persona = null;
    }
    upsertUser({
      steamid64: steamid,
      personaName: persona ? persona.personaName : `Steam ${steamid}`,
      avatarUrl: persona ? persona.avatarFullUrl : '',
      createdAt: new Date().toISOString(),
    });

    // postLogin is vestigial, but preserve it defensively across regeneration.
    const postLogin = typeof req.session.postLogin === 'string' ? req.session.postLogin : null;

    // Session fixation protection: regenerate AFTER OpenID verification succeeds.
    // The pre-authentication session (attacker-controllable ID) is destroyed and
    // replaced with a fresh session ID; steam identity + fresh csrf are written
    // only into the new session.
    req.session.regenerate((regErr) => {
      if (regErr) {
        return res.status(500).send('Steam sign-in error.');
      }
      req.session.steamid = steamid;
      req.session.persona = persona
        ? { name: persona.personaName, avatar: persona.avatarFullUrl }
        : { name: steamid, avatar: '' };
      ensureCsrf(req);

      const target = postLogin || '/';
      res.redirect(`${realm}${target}`);
    });
  } catch (err) {
    res.status(500).send('Steam sign-in error.');
  }
});

router.get('/me', (req, res) => {
  res.json({
    steamid: req.session.steamid || null,
    persona: req.session.persona || null,
    isAdmin: !!(req.session && req.session.isAdmin),
    isOwner: !!req.session.steamid && req.session.steamid === config.OWNER_STEAMID,
    csrf: req.session.csrf || null,
  });
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

router.post('/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (
    config.ADMIN_PASSWORD &&
    username &&
    safeEqual(username, config.ADMIN_USERNAME) &&
    safeEqual(password, config.ADMIN_PASSWORD)
  ) {
    // Session fixation protection: regenerate only after credentials validate.
    // An already-authenticated Steam user may log into the admin panel; preserve
    // their existing Steam identity while issuing a fresh session ID.
    const existingSteamid = req.session.steamid || null;
    const existingPersona = req.session.persona || null;

    req.session.regenerate((regErr) => {
      if (regErr) {
        return res.status(500).json({ ok: false, error: 'Session error' });
      }
      if (existingSteamid) req.session.steamid = existingSteamid;
      if (existingPersona) req.session.persona = existingPersona;
      ensureCsrf(req);
      req.session.isAdmin = true;
      return res.json({ ok: true });
    });
    return;
  }
  res.status(401).json({ ok: false, error: 'Invalid credentials' });
});

router.post('/admin/logout', (req, res) => {
  if (req.session) req.session.isAdmin = false;
  res.json({ ok: true });
});

module.exports = router;