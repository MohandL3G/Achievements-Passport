import React, { useState, useEffect } from 'react';
import { AdminState, AdminUser } from '../types';
import { adminLogin, adminState, adminPost, adminDelete } from '../api';
import { Lock, ShieldAlert, Users, Timer, Server, LogOut, Trash2, RefreshCw, Play, Save, Plug } from 'lucide-react';

interface AdminPanelProps {
  meAdmin: boolean;
  onAuthChanged: () => void;
  onSignOutAdmin: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ meAdmin, onAuthChanged, onSignOutAdmin }) => {
  const [username, setUsername] = useState('MohandL3G');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);

  const [state, setState] = useState<AdminState | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [whitelistText, setWhitelistText] = useState('');
  const [gateMode, setGateMode] = useState<'open' | 'protected'>('protected');
  const [cron, setCron] = useState('0 0 * * *');
  const [schedEnabled, setSchedEnabled] = useState(true);

  const [s3, setS3] = useState({
    endpoint: '',
    bucket: '',
    region: 'us-east-1',
    prefix: '',
    accessKeyId: '',
    secretAccessKey: '',
    forcePathStyle: true,
  });

const flash = (ok: boolean, m: string) => {
    setMsg(ok ? m : null);
    setErr(ok ? m : null);
    setTimeout(() => { setMsg(null); setErr(null); }, 4000);
  };

  const s3Payload = () => ({
    ...s3,
    accessKeyId: s3.accessKeyId === '••••••••' ? '' : s3.accessKeyId,
    secretAccessKey: s3.secretAccessKey === '••••••••' ? '' : s3.secretAccessKey,
  });

  const load = async () => {
    try {
      const st = await adminState();
      setState(st);
      setGateMode(st.gate.mode);
      setWhitelistText(st.gate.whitelist.join('\n'));
      setCron(st.scheduler.cron);
      setSchedEnabled(st.scheduler.enabled);
      setS3({
        endpoint: st.s3.endpoint || '',
        bucket: st.s3.bucket || '',
        region: st.s3.region || 'us-east-1',
        prefix: st.s3.prefix || '',
        accessKeyId: st.s3.configured ? '••••••••' : '',
        secretAccessKey: st.s3.configured ? '••••••••' : '',
        forcePathStyle: st.s3.forcePathStyle !== false,
      });
    } catch (e) {
      flash(false, (e as Error).message);
    }
  };

  useEffect(() => {
    if (meAdmin) load();
  }, [meAdmin]);

  if (!meAdmin) {
    return (
      <div className="w-full max-w-sm mx-auto py-16 space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-xl bg-neutral-800 flex items-center justify-center text-amber-300">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="font-serif text-xl font-bold text-neutral-100">Admin Access</h2>
          <p className="text-xs text-neutral-500">Restricted area. Sign in with the site owner credentials.</p>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setLoginBusy(true);
            setLoginError(null);
            try {
              await adminLogin(username, password);
              setPassword('');
              onAuthChanged();
            } catch (err) {
              setLoginError((err as Error).message);
            } finally {
              setLoginBusy(false);
            }
          }}
          className="space-y-4 p-6 rounded-2xl border border-neutral-800 bg-neutral-900/60"
        >
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-neutral-100 focus:outline-none focus:border-amber-500/50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-neutral-100 focus:outline-none focus:border-amber-500/50"
            />
          </div>
          {loginError && (
            <p className="text-xs text-red-400 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5" /> {loginError} (rate-limited: 10 tries / 15 min)
            </p>
          )}
          <button
            type="submit"
            disabled={loginBusy}
            className="w-full py-2.5 rounded-lg bg-amber-500 text-neutral-950 font-semibold text-sm hover:bg-amber-400 disabled:opacity-50"
          >
            {loginBusy ? 'Signing in...' : 'Sign in to Admin Panel'}
          </button>
        </form>
      </div>
    );
  }

  if (!state) {
    return <div className="py-16 text-center text-neutral-500">Loading admin state...</div>;
  }

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-2xl font-bold text-neutral-100 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-300" />
            Admin Panel
          </h2>
          <p className="text-xs text-neutral-500 mt-1">Owner SteamID64: {state.ownerSteamid || '(not set in .env)'}</p>
        </div>
        <button
          onClick={onSignOutAdmin}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-800 text-neutral-300 text-xs hover:border-red-500/40 hover:text-red-300 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" /> Sign out
        </button>
      </div>

      {err && <p className="px-4 py-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-sm">{err}</p>}
      {msg && <p className="px-4 py-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-sm">{msg}</p>}

      {/* Gate + whitelist */}
      <section className="p-5 rounded-2xl border border-neutral-800 bg-neutral-900/50 space-y-4">
        <h3 className="font-bold text-sm text-neutral-100 flex items-center gap-2">
          <Users className="w-4 h-4 text-amber-300" /> Access Gate
        </h3>
        <div className="flex rounded-xl overflow-hidden border border-neutral-800 bg-neutral-950 text-xs font-medium w-fit">
          <button
            onClick={() => setGateMode('protected')}
            className={`px-5 py-2.5 ${gateMode === 'protected' ? 'bg-amber-500/20 text-amber-300 font-semibold' : 'text-neutral-400'}`}
          >
            Protected (whitelist)
          </button>
          <button
            onClick={() => setGateMode('open')}
            className={`px-5 py-2.5 ${gateMode === 'open' ? 'bg-amber-500/20 text-amber-300 font-semibold' : 'text-neutral-400'}`}
          >
            Open (anyone signed-in)
          </button>
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-400 mb-1">
            Whitelist (one SteamID64 per line)
          </label>
          <textarea
            value={whitelistText}
            onChange={(e) => setWhitelistText(e.target.value)}
            rows={5}
            placeholder="7656119..."
            className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs font-mono text-neutral-200 focus:outline-none focus:border-amber-500/50"
          />
        </div>
        <button
          onClick={async () => {
            try {
              const r = await adminPost('/gate', { mode: gateMode, whitelistText });
              flash(true, `Gate saved (${r.gateMode}, ${r.whitelist.length} whitelisted).`);
              load();
            } catch (e) {
              flash(false, (e as Error).message);
            }
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-neutral-950 font-semibold text-xs hover:bg-amber-400"
        >
          <Save className="w-3.5 h-3.5" /> Save Gate
        </button>
      </section>

      {/* Scheduler */}
      <section className="p-5 rounded-2xl border border-neutral-800 bg-neutral-900/50 space-y-4">
        <h3 className="font-bold text-sm text-neutral-100 flex items-center gap-2">
          <Timer className="w-4 h-4 text-amber-300" /> Auto-Update Scheduler
        </h3>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={schedEnabled}
              onChange={(e) => setSchedEnabled(e.target.checked)}
              className="accent-amber-500"
            />
            Enabled
          </label>
          <input
            value={cron}
            onChange={(e) => setCron(e.target.value)}
            className="px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs font-mono text-neutral-200 w-40 focus:outline-none focus:border-amber-500/50"
            placeholder="0 0 * * *"
          />
          <span className="text-xs text-neutral-500">cron (server local time) â€” default: daily 00:00</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              try {
                await adminPost('/scheduler', { enabled: schedEnabled, cron });
                flash(true, 'Scheduler settings saved and reloaded.');
                load();
              } catch (e) {
                flash(false, (e as Error).message);
              }
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-neutral-950 font-semibold text-xs hover:bg-amber-400"
          >
            <Save className="w-3.5 h-3.5" /> Save Scheduler
          </button>
          <span className="text-xs text-neutral-500">
            Regenerates users who have auto-update enabled. Owner pulls S3/CR first.
          </span>
        </div>
      </section>

      {/* S3 */}
      <section className="p-5 rounded-2xl border border-neutral-800 bg-neutral-900/50 space-y-4">
        <h3 className="font-bold text-sm text-neutral-100 flex items-center gap-2">
          <Server className="w-4 h-4 text-amber-300" /> S3 / RustFS Connection
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block text-xs font-medium text-neutral-400">
            Endpoint (e.g. http://10.99.0.2:9000)
            <input
              value={s3.endpoint}
              onChange={(e) => setS3({ ...s3, endpoint: e.target.value })}
              className="mt-1 w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-200 focus:outline-none focus:border-amber-500/50"
            />
          </label>
          <label className="block text-xs font-medium text-neutral-400">
            Bucket
            <input
              value={s3.bucket}
              onChange={(e) => setS3({ ...s3, bucket: e.target.value })}
              className="mt-1 w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-200 focus:outline-none focus:border-amber-500/50"
            />
          </label>
          <label className="block text-xs font-medium text-neutral-400">
            Region (default us-east-1)
            <input
              value={s3.region}
              onChange={(e) => setS3({ ...s3, region: e.target.value })}
              className="mt-1 w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-200 focus:outline-none focus:border-amber-500/50"
            />
          </label>
          <label className="block text-xs font-medium text-neutral-400">
            Prefix (optional, e.g. stats)
            <input
              value={s3.prefix}
              onChange={(e) => setS3({ ...s3, prefix: e.target.value })}
              className="mt-1 w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-200 focus:outline-none focus:border-amber-500/50"
            />
          </label>
          <label className="block text-xs font-medium text-neutral-400">
            Access Key
            <input
              value={s3.accessKeyId}
              onChange={(e) => setS3({ ...s3, accessKeyId: e.target.value })}
              className="mt-1 w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs font-mono text-neutral-200 focus:outline-none focus:border-amber-500/50"
            />
          </label>
          <label className="block text-xs font-medium text-neutral-400">
            Secret Key
            <input
              type="password"
              value={s3.secretAccessKey}
              onChange={(e) => setS3({ ...s3, secretAccessKey: e.target.value })}
              className="mt-1 w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs font-mono text-neutral-200 focus:outline-none focus:border-amber-500/50"
            />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={s3.forcePathStyle}
              onChange={(e) => setS3({ ...s3, forcePathStyle: e.target.checked })}
              className="accent-amber-500"
            />
            Path-style (required for RustFS / MinIO)
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={async () => {
              try {
                await adminPost('/s3', s3Payload());
                flash(true, 'S3 settings saved (encrypted at rest).');
                load();
              } catch (e) {
                flash(false, (e as Error).message);
              }
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-neutral-950 font-semibold text-xs hover:bg-amber-400"
          >
            <Save className="w-3.5 h-3.5" /> Save S3
          </button>
          <button
            onClick={async () => {
              try {
                await adminPost('/s3/test', s3Payload());
                flash(true, 'S3 connection OK.');
              } catch (e) {
                flash(false, `S3 test failed: ${(e as Error).message}`);
              }
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-neutral-800 text-neutral-300 text-xs hover:border-amber-500/40"
          >
            <Plug className="w-3.5 h-3.5" /> Test Connection
          </button>
          <button
            onClick={async () => {
              try {
                const r = await adminPost('/s3/pull-check', {});
                flash(true, `Pull check found ${r.files} JSON file(s) for the owner (prefix: ${r.prefix || 'auto'}).`);
              } catch (e) {
                flash(false, `Pull check failed: ${(e as Error).message}`);
              }
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-neutral-800 text-neutral-300 text-xs hover:border-amber-500/40"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Pull Check (Owner)
          </button>
        </div>
      </section>

      {/* Users */}
      <section className="p-5 rounded-2xl border border-neutral-800 bg-neutral-900/50 space-y-4">
        <h3 className="font-bold text-sm text-neutral-100">
          Users ({state.users.length})
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-neutral-500 uppercase tracking-wider">
              <tr className="border-b border-neutral-800">
                <th className="py-2 pr-4">User</th>
                <th className="py-2 pr-4">SteamID64</th>
                <th className="py-2 pr-4">Card</th>
                <th className="py-2 pr-4">Auto-update</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {state.users.map((u: AdminUser) => (
                <tr key={u.steamid64} className="border-b border-neutral-900 align-middle">
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-2">
                      {u.avatarUrl && (
                        <img src={u.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
                      )}
                      <span className="font-medium text-neutral-200">{u.personaName}</span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-neutral-500">{u.steamid64}</td>
                  <td className="py-2.5 pr-4 text-neutral-400">{u.gamesCount ?? 'â€”'} games</td>
                  <td className="py-2.5 pr-4">
                    <button
                      onClick={async () => {
                        try {
                          await adminPost(`/users/${u.steamid64}`, { autoUpdate: !u.autoUpdate });
                          load();
                        } catch (e) {
                          flash(false, (e as Error).message);
                        }
                      }}
                      className={`px-2.5 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider transition-colors ${
                        u.autoUpdate
                          ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                          : 'border-neutral-700 text-neutral-500 hover:border-neutral-600'
                      }`}
                    >
                      {u.autoUpdate ? 'On' : 'Off'}
                    </button>
                  </td>
                  <td className="py-2.5 pr-4">
                    <button
                      onClick={async () => {
                        try {
                          await adminPost(`/users/${u.steamid64}`, { disabled: !u.disabled });
                          load();
                        } catch (e) {
                          flash(false, (e as Error).message);
                        }
                      }}
                      className={`px-2.5 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider transition-colors ${
                        u.disabled
                          ? 'border-red-500/40 bg-red-500/10 text-red-300'
                          : 'border-neutral-700 text-neutral-500 hover:border-neutral-600'
                      }`}
                    >
                      {u.disabled ? 'Disabled' : 'Enabled'}
                    </button>
                  </td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-1.5">
                      <button
                        title="Regenerate now"
                        onClick={async () => {
                          try {
                            const r = await adminPost(`/users/${u.steamid64}/regenerate`, {});
                            flash(true, `Regenerated ${u.personaName}: ${r.games} games.`);
                            load();
                          } catch (e) {
                            flash(false, (e as Error).message);
                          }
                        }}
                        className="p-1.5 rounded-md border border-neutral-800 text-neutral-400 hover:text-amber-300 hover:border-amber-500/40"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        title="Delete user card"
                        onClick={async () => {
                          if (!window.confirm(`Delete ${u.personaName}'s card and all data?`)) return;
                          try {
                            await adminDelete(`/users/${u.steamid64}`);
                            flash(true, `Deleted ${u.personaName}.`);
                            load();
                          } catch (e) {
                            flash(false, (e as Error).message);
                          }
                        }}
                        className="p-1.5 rounded-md border border-neutral-800 text-neutral-500 hover:text-red-400 hover:border-red-500/40"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {state.users.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-neutral-600">
                    No users yet. Ask someone to sign in through Steam.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Logs */}
      <section className="p-5 rounded-2xl border border-neutral-800 bg-neutral-900/50 space-y-2">
        <h3 className="font-bold text-sm text-neutral-100 flex items-center gap-2">
          <Play className="w-4 h-4 text-amber-300" /> Scheduler Log
        </h3>
        <pre className="text-[10px] font-mono text-neutral-500 whitespace-pre-wrap max-h-64 overflow-y-auto bg-neutral-950 rounded-lg p-3">
          {state.log.length > 0 ? state.log.join('\n') : '(no log entries yet)'}
        </pre>
      </section>
    </div>
  );
};
