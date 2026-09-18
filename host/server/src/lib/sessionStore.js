const fs = require('fs');
const path = require('path');
const config = require('../config');
const { Store } = require('express-session');

// Persistent file-backed express-session store.
//
// Single-process / single-LXC design. All get/set/touch/destroy operations run
// against one in-memory map; persistence is serialized through a write queue and
// written atomically (tmp + rename). This avoids the classic read-modify-write
// race where concurrent requests overwrite each other's changes.
//
// No dependencies, no daemon, no application database — sessions live under
// DATA_DIR (already persistent, writable, git-ignored and covered by backups).

const SESSIONS_FILE = path.join(config.DATA_DIR, 'sessions.json');
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // fallback for sessions with no usable cookie expiration
const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // hourly periodic cleanup

// Return a numeric ms expiration from a session's cookie when available.
// Prefer the cookie's own lifetime so server-side TTL cannot drift from the
// browser cookie. Falls back to a bounded default when unusable.
function expiryMs(session) {
  const cookie = session && session.cookie;
  if (cookie && cookie.expires) {
    const d = cookie.expires instanceof Date ? cookie.expires.getTime() : Date.parse(String(cookie.expires));
    if (!Number.isNaN(d)) return d;
  }
  if (cookie && Number.isFinite(cookie.maxAge)) {
    return Date.now() + cookie.maxAge;
  }
  return null;
}

function normalizeExpires(value) {
  if (!value) return null;
  const n = typeof value === 'number' ? value : Date.parse(String(value));
  return Number.isNaN(n) ? null : n;
}

class FileSessionStore extends Store {
  constructor(options) {
    super();
    this.file = (options && options.file) || SESSIONS_FILE;
    this._map = new Map();
    this._queue = Promise.resolve();
    this._sweepTimer = null;

    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    this._load();
    this._scheduleSweep();
  }

  // Load sessions.json into memory, dropping already-expired sessions. A
  // missing file starts an empty store; a malformed file logs a warning and
  // starts empty instead of crashing the server. Session contents are never
  // logged.
  _load() {
    let raw = null;
    try {
      raw = fs.readFileSync(this.file, 'utf8');
    } catch (err) {
      raw = null;
    }
    if (!raw) {
      this._map = new Map();
      return;
    }
    try {
      const obj = JSON.parse(raw);
      const now = Date.now();
      let pruned = false;
      for (const [sid, record] of Object.entries(obj || {})) {
        if (!record || typeof record !== 'object') continue;
        const expires = normalizeExpires(record.expires);
        if (expires && expires <= now) {
          pruned = true;
          continue;
        }
        this._map.set(sid, { data: record.data, expires });
      }
      if (pruned) this._persist(); // rewrite once so the file matches memory
    } catch (err) {
      this._map = new Map();
      console.error('[session-store] sessions.json is malformed; starting with an empty session store');
    }
  }

  _scheduleSweep() {
    if (this._sweepTimer) clearInterval(this._sweepTimer);
    this._sweepTimer = setInterval(() => this._sweep(), SWEEP_INTERVAL_MS);
    if (this._sweepTimer.unref) this._sweepTimer.unref(); // never block process shutdown
  }

  // Hourly sweep: drop expired entries. Only rewrites the file when something
  // actually changed.
  _sweep() {
    const now = Date.now();
    let changed = false;
    for (const [sid, record] of this._map) {
      if (record.expires && record.expires <= now) {
        this._map.delete(sid);
        changed = true;
      }
    }
    if (changed) this._persist();
  }

  // Serialize one full write of the current in-memory map through the queue.
  // Because the write reads the *live* map at write time, a later change can
  // never be overwritten by an older snapshot. Returns a promise; callers use it
  // to surface persistence errors through their express-session callback without
  // letting one failed write stall subsequent writes.
  _persist() {
    const run = this._queue.then(() => {
      const snapshot = {};
      for (const [sid, record] of this._map) {
        snapshot[sid] = { data: record.data, expires: record.expires };
      }
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(snapshot), 'utf8');
      fs.renameSync(tmp, this.file);
    });
    this._queue = run.catch(() => {});
    return run;
  }

  get(sid, callback) {
    const record = this._map.get(sid);
    if (!record) {
      process.nextTick(() => callback(null, null));
      return;
    }
    if (record.expires && record.expires <= Date.now()) {
      // Expired: remove, persist the removal, report no session.
      this._map.delete(sid);
      this._persist().then(
        () => callback(null, null),
        (err) => callback(err)
      );
      return;
    }
    process.nextTick(() => callback(null, record.data));
  }

  set(sid, session, callback) {
    const expires = expiryMs(session) || (Date.now() + DEFAULT_TTL_MS);
    this._map.set(sid, { data: session, expires });
    this._persist().then(
      () => callback(null),
      (err) => callback(err)
    );
  }

  destroy(sid, callback) {
    if (!this._map.delete(sid)) {
      process.nextTick(() => callback(null));
      return;
    }
    this._persist().then(
      () => callback(null),
      (err) => callback(err)
    );
  }

  // touch() is called by express-session (with resave:false) at the end of
  // requests that carried a session but did not modify it. The server-side
  // expiration should follow the session cookie so it cannot drift. With the
  // default (rolling:false) cookie the expires value is fixed at login, so
  // touch is normally a no-op and must NOT rewrite the file on every request.
  // If the cookie genuinely moved the expiration forward, update it; if it has
  // already expired, drop the stale session rather than extending it.
  touch(sid, session, callback) {
    const record = this._map.get(sid);
    if (!record) {
      process.nextTick(() => callback(null));
      return;
    }
    if (record.expires && record.expires <= Date.now()) {
      this._map.delete(sid);
      this._persist().then(
        () => callback(null),
        (err) => callback(err)
      );
      return;
    }
    const nextExpires = expiryMs(session) || record.expires;
    if (!nextExpires || nextExpires === record.expires) {
      process.nextTick(() => callback(null)); // nothing changed — no write
      return;
    }
    record.expires = nextExpires;
    record.data = session;
    this._persist().then(
      () => callback(null),
      (err) => callback(err)
    );
  }
}

module.exports = { FileSessionStore, SESSIONS_FILE };