import React, { useState } from 'react';
import { GenerateMode, GenerateResult } from '../types';
import { generate } from '../api';
import { CloudUpload, FileArchive, Server, Sparkles, CheckCircle2, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';

interface GenerateWizardProps {
  isOwner: boolean;
  onGenerated: () => void;
}

export const GenerateWizard: React.FC<GenerateWizardProps> = ({ isOwner, onGenerated }) => {
  const [mode, setMode] = useState<GenerateMode>('steam');
  const [dirFiles, setDirFiles] = useState<File[]>([]);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);

  const handleFolder = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDirFiles(Array.from(e.target.files || []));
    setZipFile(null);
  };

  const handleZip = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0];
    setZipFile(f || null);
    setDirFiles([]);
  };

  const canSubmit =
    mode !== 'folder' || dirFiles.length > 0;

  const submit = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await generate(mode, {
        zip: mode === 'zip' && zipFile ? zipFile : undefined,
        files: mode === 'folder' ? dirFiles : undefined,
      });
      setResult(r);
      if (r.ok) onGenerated();
    } catch (err) {
      setError((err as Error).message || 'Generation failed');
    } finally {
      setBusy(false);
    }
  };

  const options: { key: GenerateMode; title: string; icon: React.ReactNode; desc: string; ownerOnly?: boolean }[] = [
    {
      key: 'steam',
      title: 'From Steam',
      icon: <Sparkles className="w-5 h-5" />,
      desc: 'Rebuild from your public Steam profile only. Works if your profile is public.',
    },
    {
      key: 'folder',
      title: 'Drop a Folder',
      icon: <CloudUpload className="w-5 h-5" />,
      desc: 'Drag a folder of CloudRedirect JSONs (stats/<accountId>/&lt;appid&gt;.json).',
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
      desc: 'Auto-pull your CloudRedirect data straight from your object storage (owner only).',
      ownerOnly: true,
    },
  ];

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="font-serif text-2xl font-bold text-neutral-100">Generate Your Card</h2>
        <p className="text-sm text-neutral-400 mt-1">
          Pick a data source to build/refresh your passport. Automatic updates refresh daily at 00:00.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {options.map((opt) => {
          if (opt.ownerOnly && !isOwner) return null;
          const selected = mode === opt.key;
          return (
            <button
              key={opt.key}
              onClick={() => { setMode(opt.key); setError(null); setResult(null); }}
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

      {(mode === 'folder' || mode === 'zip') && (
        <div className="p-5 rounded-xl border border-dashed border-neutral-700 bg-neutral-900/40">
          {mode === 'folder' ? (
            <>
              <label className="block text-sm font-medium text-neutral-300 mb-2">CloudRedirect folder</label>
              <input
                type="file"
                multiple
                webkitdirectory
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
          Rebuilds from the selected source and updates your live passport.
        </span>
      </div>
    </div>
  );
};