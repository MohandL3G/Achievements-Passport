import React, { useEffect, useState } from 'react';
import { CrSource, GenerateResult, Me, UserS3Config, UserS3Status } from '../types';
import { generate, myS3Status, saveMyS3, startSteamLogin, testMyS3 } from '../api';
import {
  CloudUpload,
  FileArchive,
  Server,
  CircleOff,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Pencil,
  Plug,
} from 'lucide-react';

interface GenerateWizardProps {
  me: Me | null;
  onGenerated: () => void;
}

const emptyS3Form: UserS3Config = {
  endpoint: '',
  bucket: '',
  region: 'us-east-1',
  prefix: '',
  accessKeyId: '',
  secretAccessKey: '',
  forcePathStyle: true,
};

export const GenerateWizard: React.FC<GenerateWizardProps> = ({ me, onGenerated }) => {
  const [includeSteam, setIncludeSteam] = useState(true);
  const [crSource, setCrSource] = useState<CrSource>('none');
  const [dirFiles, setDirFiles] = useState<File[]>([]);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);

  const [s3Status, setS3Status] = useState<UserS3Status | null>(null);
  const [s3Loaded, setS3Loaded] = useState(false);
  const [editingS3, setEditingS3] = useState(false);
  const [s3Form, setS3Form] = useState<UserS3Config>(emptyS3Form);
  const [s3Busy, setS3Busy] = useState(false);
  const [s3Msg, setS3Msg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    myS3Status()
      .then((st) => {
        if (cancelled) return;
        setS3Status(st);
        if (st.configured && st.bucket) {
          setS3Form({
            ...emptyS3Form,
            endpoint: st.endpoint || '',
            bucket: st.bucket || '',
            region: st.region || 'us-east-1',
            prefix: st.prefix || '',
            forcePathStyle: st.forcePathStyle !== false,
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setS3Loaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleFolder = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDirFiles(Array.from(e.target.files || []));
    setZipFile(null);
  };

  const handleZip = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0];
    setZipFile(f || null);
    setDirFiles([]);
  };

  const selectSource = (key: CrSource) => {
    setCrSource(key);
    setError(null);
    setResult(null);
    setS3Msg(null);
  };

  const noSource = !includeSteam && crSource === 'none';
  const canSubmit = !noSource && (crSource !== 'folder' || dirFiles.length > 0);

  const submit = async () => {
    if (!me?.steamid) {
      startSteamLogin();
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await generate({
        includeSteam,
        crSource,
        zip: crSource === 'zip' && zipFile ? zipFile : undefined,
        files: crSource === 'folder' ? dirFiles : undefined,
      });
      setResult(r);
      if (r.ok) onGenerated();
    } catch (err) {
      setError((err as Error).message || 'Generation failed');
    } finally {
      setBusy(false);
    }
  };

  const onSaveTest = async () => {
    setS3Busy(true);
    setS3Msg(null);
    try {
      await saveMyS3(s3Form);
      await testMyS3(s3Form);
      const st = await myS3Status();
      setS3Status(st);
      setEditingS3(false);
      setS3Msg({ kind: 'ok', text: `Connected to ${s3Form.bucket}` });
    } catch (err) {
      setS3Msg({ kind: 'err', text: (err as Error).message || 'Save/Test failed' });
    } finally {
      setS3Busy(false);
    }
  };

  const onTestS3 = async () => {
    setS3Busy(true);
    setS3Msg(null);
    try {
      await testMyS3(s3Form);
      setS3Msg({ kind: 'ok', text: 'S3 connection OK' });
    } catch (err) {
      setS3Msg({ kind: 'err', text: (err as Error).message || 'Test failed' });
    } finally {
      setS3Busy(false);
    }
  };

  const crOptions: { key: CrSource; title: string; icon: React.ReactNode; desc: string }[] = [
    {
      key: 'none',
      title: 'None',
      icon: <CircleOff className="w-5 h-5" />,
      desc: 'Skip CloudRedirect data. Useful when rebuilding from Steam alone.',
    },
    {
      key: 'folder',
      title: 'Upload CloudRedirect File(s)',
      icon: <CloudUpload className="w-5 h-5" />,
      desc: 'Upload one consolidated stats.json for all your games, or individual per-game JSONs (stats/<accountId>/&lt;appid&gt;.json).',
    },
    {
      key: 'zip',
      title: 'Upload a Zip',
      icon: <FileArchive className="w-5 h-5" />,
      desc: 'Upload a .zip of CloudRedirect JSON files. Only *.json entries inside are used.',
    },
    {
      key: 's3',
      title: 'Pull from S3 / RustFS',
      icon: <Server className="w-5 h-5" />,
      desc: 'Auto-pull your CloudRedirect data straight from your own object storage (S3/RustFS).',
    },
  ];

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="font-serif text-2xl font-bold text-neutral-100">Generate Your Card</h2>
        <p className="text-sm text-neutral-400 mt-1">
          Pick what to include in your passport. Automatic updates refresh daily at 00:00.
        </p>
      </div>

      <div>
        <label
          className={`flex items-start gap-3 p-5 rounded-xl border cursor-pointer select-none ${
            includeSteam
              ? 'border-amber-500/50 bg-amber-500/5 shadow-lg shadow-amber-950/20'
              : 'border-neutral-800 bg-neutral-900/60 hover:border-neutral-700'
          }`}
        >
          <input
            type="checkbox"
            checked={includeSteam}
            onChange={(e) => {
              setIncludeSteam(e.target.checked);
              setError(null);
              setResult(null);
            }}
            className="mt-1 w-4 h-4 accent-amber-500"
          />
          <span>
            <span className="block font-semibold text-sm text-neutral-100">Include my Steam data</span>
            <span className="block text-xs text-neutral-500 leading-relaxed mt-0.5">
              Merge your public Steam profile: owned games, playtime, and achievement progress. Turn off to build
              purely from CloudRedirect data (no Steam API calls).
            </span>
          </span>
        </label>
      </div>

      <div>
        <div className="mb-2">
          <span className="font-semibold text-sm text-neutral-200">CloudRedirect source</span>
          <span className="text-xs text-neutral-500 block mt-0.5">Optional — where your CloudRedirect data comes from.</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {crOptions.map((opt) => {
            const selected = crSource === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => selectSource(opt.key)}
                className={`p-5 rounded-xl border text-left transition-all ${
                  selected
                    ? 'border-amber-500/50 bg-amber-500/5 shadow-lg shadow-amber-950/20'
                    : 'border-neutral-800 bg-neutral-900/60 hover:border-neutral-700'
                }`}
              >
                <div className={`flex items-center gap-3 mb-2 ${selected ? 'text-amber-300' : 'text-neutral-300'}`}>
                  {opt.icon}
                  <span className="font-semibold text-sm">{opt.title}</span>
                </div>
                <p className="text-xs text-neutral-500 leading-relaxed">{opt.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {(crSource === 'folder' || crSource === 'zip') && (
        <div className="p-5 rounded-xl border border-dashed border-neutral-700 bg-neutral-900/40">
          {crSource === 'folder' ? (
            <>
              <label className="block text-sm font-medium text-neutral-300 mb-2">CloudRedirect JSON file(s)</label>
              <input
                type="file"
                multiple
                accept=".json,application/json"
                onChange={handleFolder}
                className="block w-full text-xs text-neutral-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-amber-500 file:text-neutral-950 file:font-semibold hover:file:bg-amber-400"
              />
              {dirFiles.length > 0 && (
                <p className="text-xs text-neutral-500 mt-2">{dirFiles.length} JSON file(s) selected.</p>
              )}
            </>
          ) : (
            <>
              <label className="block text-sm font-medium text-neutral-300 mb-2">Zip with CloudRedirect JSONs</label>
              <input
                type="file"
                accept=".zip,.json"
                onChange={handleZip}
                className="block w-full text-xs text-neutral-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-amber-500 file:text-neutral-950 file:font-semibold hover:file:bg-amber-400"
              />
              {zipFile && <p className="text-xs text-neutral-500 mt-2">{zipFile.name} selected.</p>}
            </>
          )}
        </div>
      )}

      {crSource === 's3' && !s3Loaded && (
        <p className="text-xs text-neutral-500 animate-pulse">Loading your S3 / RustFS connection...</p>
      )}

      {crSource === 's3' && s3Loaded && (
        <div className="p-5 rounded-xl border border-neutral-800 bg-neutral-900/40 space-y-4">
          {s3Status?.configured && !editingS3 ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-emerald-300">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  Connected to <span className="font-semibold">{s3Status.bucket}</span>
                </span>
              </div>
              <button
                onClick={() => {
                  setEditingS3(true);
                  setS3Msg(null);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-neutral-800 text-neutral-300 text-xs hover:border-amber-500/40"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
            </div>
          ) : (
            <>
              <p className="text-xs text-neutral-400">
                Enter your own S3/RustFS connection. Stored encrypted at rest and only used by you. Leave key fields
                empty to keep the saved credentials.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block text-xs font-medium text-neutral-400">
                  Endpoint (e.g. http://10.99.0.2:9000)
                  <input
                    value={s3Form.endpoint}
                    onChange={(e) => setS3Form({ ...s3Form, endpoint: e.target.value })}
                    className="mt-1 w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-200 focus:outline-none focus:border-amber-500/50"
                  />
                </label>
                <label className="block text-xs font-medium text-neutral-400">
                  Bucket
                  <input
                    value={s3Form.bucket}
                    onChange={(e) => setS3Form({ ...s3Form, bucket: e.target.value })}
                    className="mt-1 w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-200 focus:outline-none focus:border-amber-500/50"
                  />
                </label>
                <label className="block text-xs font-medium text-neutral-400">
                  Region (default us-east-1)
                  <input
                    value={s3Form.region}
                    onChange={(e) => setS3Form({ ...s3Form, region: e.target.value })}
                    className="mt-1 w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-200 focus:outline-none focus:border-amber-500/50"
                  />
                </label>
                <label className="block text-xs font-medium text-neutral-400">
                  Prefix (optional, e.g. stats)
                  <input
                    value={s3Form.prefix}
                    onChange={(e) => setS3Form({ ...s3Form, prefix: e.target.value })}
                    className="mt-1 w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-200 focus:outline-none focus:border-amber-500/50"
                  />
                </label>
                <label className="block text-xs font-medium text-neutral-400">
                  Access Key
                  <input
                    value={s3Form.accessKeyId}
                    onChange={(e) => setS3Form({ ...s3Form, accessKeyId: e.target.value })}
                    className="mt-1 w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs font-mono text-neutral-200 focus:outline-none focus:border-amber-500/50"
                  />
                </label>
                <label className="block text-xs font-medium text-neutral-400">
                  Secret Key
                  <input
                    type="password"
                    value={s3Form.secretAccessKey}
                    onChange={(e) => setS3Form({ ...s3Form, secretAccessKey: e.target.value })}
                    className="mt-1 w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs font-mono text-neutral-200 focus:outline-none focus:border-amber-500/50"
                  />
                </label>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-neutral-300">
                  <input
                    type="checkbox"
                    checked={s3Form.forcePathStyle}
                    onChange={(e) => setS3Form({ ...s3Form, forcePathStyle: e.target.checked })}
                    className="accent-amber-500"
                  />
                  Path-style (required for RustFS / MinIO)
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={onSaveTest}
                  disabled={s3Busy}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-neutral-950 font-semibold text-xs hover:bg-amber-400 disabled:opacity-50"
                >
                  {s3Busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  Save &amp; Test Connection
                </button>
                <button
                  onClick={onTestS3}
                  disabled={s3Busy}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-neutral-800 text-neutral-300 text-xs hover:border-amber-500/40 disabled:opacity-50"
                >
                  <Plug className="w-3.5 h-3.5" /> Test Connection
                </button>
              </div>
            </>
          )}

          {s3Msg && (
            <div
              className={`p-4 rounded-xl border text-sm flex items-start gap-2 ${
                s3Msg.kind === 'ok'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-red-500/30 bg-red-500/10 text-red-300'
              }`}
            >
              {s3Msg.kind === 'ok' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              {s3Msg.text}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {result && result.ok && (
        <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-sm flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Card regenerated: {result.games} games, {result.perfect} perfect. Generated {result.generatedAt}.
            {result.privateProfile ? ' (Steam profile is private - showing uploaded data only.)' : ''}
          </span>
        </div>
      )}

      {noSource && (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>At least one source is required: enable Steam data or pick a CloudRedirect source.</span>
        </div>
      )}

      <div className="flex items-center gap-4">
        <button
          onClick={submit}
          disabled={busy || !canSubmit}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-500 text-neutral-950 font-semibold text-sm hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-500/20"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {busy ? 'Generating...' : 'Generate / Refresh Card'}
        </button>
        <span className="text-xs text-neutral-500">
          Rebuilds from the selected sources and updates your live passport.
        </span>
      </div>
    </div>
  );
};