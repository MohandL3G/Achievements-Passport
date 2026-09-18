const path = require('path');
const express = require('express');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const config = require('./config');
const { ensureDirs } = require('./lib/storage');
const { realmBase } = require('./lib/openid');

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://*.steamstatic.com",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '));
  if (req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  }
  next();
}

function sameOrigin(req, res, next) {
  const origin = req.headers.origin;
  if (!origin) return next();
  const expected = realmBase(req);
  if (origin === expected) return next();
  return res.status(403).json({ ok: false, error: 'Cross-origin request blocked' });
}

function createApp() {
  ensureDirs();
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(securityHeaders);
  app.use(express.json({ limit: '2mb' }));

  app.use(
    session({
      name: 'ap.sid',
      secret: config.COOKIE_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: 'auto',
        maxAge: 30 * 24 * 3600 * 1000,
      },
    })
  );

  const adminLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: 'Too many login attempts. Try again in 15 minutes.' },
  });
  app.use('/api/auth/admin/login', adminLoginLimiter);

  const generateLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: 'Too many generation requests. Wait a moment and retry.' },
  });
  app.use('/api/generate', generateLimiter);

  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/generate', sameOrigin, require('./routes/generate'));
  app.use('/api/admin', sameOrigin, require('./routes/admin'));
  app.use('/api', require('./routes/users'));
  app.use('/badge.svg', require('./routes/badge'));

  app.get('/api/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

  app.use(express.static(config.FRONTEND_DIST, { index: false, maxAge: '1h' }));

  app.use((req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/data/')) return next();
    res.sendFile(path.join(config.FRONTEND_DIST, 'index.html'));
  });

  app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      const map = {
        LIMIT_FILE_SIZE: 'File too large',
        LIMIT_FILE_COUNT: 'Too many files',
        LIMIT_UNEXPECTED_FILE: 'Unexpected file field',
      };
      return res.status(400).json({ ok: false, error: map[err.code] || err.message });
    }
    console.error('[error]', err);
    if (res.headersSent) return next(err);
    return res.status(err.status || 500).json({ ok: false, error: err.expose ? err.message : 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };