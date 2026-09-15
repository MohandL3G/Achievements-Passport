const crypto = require('crypto');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a ?? '')).digest();
  const hb = crypto.createHash('sha256').update(String(b ?? '')).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function isValidSteamId64(v) {
  return typeof v === 'string' && /^\d{17}$/.test(v) && Number(v) >= 76561197960265728;
}

function toAccountId(steamid64) {
  return String(BigInt(steamid64) - 76561197960265728n);
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      out[i] = await fn(items[i], i);
    }
  }
  const workers = [];
  const n = Math.max(1, Math.min(limit, items.length));
  for (let w = 0; w < n; w += 1) workers.push(worker());
  await Promise.all(workers);
  return out;
}

function nowIso() {
  return new Date().toISOString();
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function parseAppId(filename) {
  const m = /^(\d+)\.json$/i.exec(filename.trim());
  return m ? m[1] : null;
}

function escapeXml(s) {
  return String(s ?? '').replace(/[<>&'"]/g, (c) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  })[c]);
}

module.exports = { sleep, safeEqual, isValidSteamId64, toAccountId, mapLimit, nowIso, clamp, parseAppId, escapeXml };