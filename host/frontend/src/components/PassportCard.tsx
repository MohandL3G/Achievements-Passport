import React from 'react';
import { PassportData } from '../types';
import { Trophy, CheckCircle2, Clock, Sparkles, ArrowRight, ShieldCheck, Github, Image as ImageIcon, Download } from 'lucide-react';
import { badgeUrl, cardUrl } from '../api';

interface PassportCardProps {
  data: PassportData;
  onViewAllGames: () => void;
}

function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  return Promise.resolve();
}

function githubMarkdown(steamid: string): string {
  return `[![Achievements Passport](${badgeUrl(steamid)})](${cardUrl(steamid)})`;
}

function renderPng(data: PassportData): void {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const bg = ctx.createLinearGradient(0, 0, 0, 630);
  bg.addColorStop(0, '#14100a');
  bg.addColorStop(1, '#0a0a0a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1200, 630);

  ctx.fillStyle = '#e3b341';
  ctx.fillRect(0, 0, 1200, 8);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#e3b341';
  ctx.font = '600 30px sans-serif';
  ctx.fillText('A C H I E V E M E N T S   P A S S P O R T', 600, 80);

  if (data.Player.avatarFullUrl) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(600, 205, 60, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, 540, 145, 120, 120);
      ctx.restore();
      ctx.strokeStyle = '#e3b341';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(600, 205, 60, 0, Math.PI * 2);
      ctx.stroke();
      finish();
    };
    img.onerror = finish;
    img.src = data.Player.avatarFullUrl;
  } else {
    finish();
  }

  function finish() {
    ctx.fillStyle = '#f5f0e6';
    ctx.font = 'bold 56px serif';
    ctx.fillText(data.Player.personaName, 600, 330);

    const summary = data.Summary;
    const rows: [string, string][] = [
      ['GAMES', String(summary.TotalGames)],
      ['PERFECT', String(summary.PerfectGames)],
      ['COMPLETION', `${summary.CompletionPercentage}%`],
      ['TROPHIES', summary.TotalAchievementsUnlocked.toLocaleString()],
    ];
    const cols = 4;
    const cellW = 240;
    const startX = 600 - (cols * cellW) / 2;
    const y = 430;
    rows.forEach(([label, value], i) => {
      const x = startX + i * cellW + cellW / 2;
      ctx.fillStyle = '#8b8370';
      ctx.font = '26px sans-serif';
      ctx.fillText(label, x, y);
      ctx.fillStyle = '#f0e9d8';
      ctx.font = 'bold 44px sans-serif';
      ctx.fillText(value, x, y + 60);
    });

    ctx.fillStyle = '#6b6456';
    ctx.font = '28px sans-serif';
    ctx.fillText(`Generated ${data.GeneratedAtFormatted}`, 600, 580);

    const a = document.createElement('a');
    a.download = `passport-${data.Player.steamid64}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  }
}

export const PassportCard: React.FC<PassportCardProps> = ({ data, onViewAllGames }) => {
  const { Player, Summary, HighlightGames } = data;
  const totalHours = Math.round(Summary.TotalPlaytimeMinutes / 60);
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    await copyText(githubMarkdown(Player.steamid64));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Luxury Corpus-Style Passport Container */}
      <div className="relative rounded-2xl p-8 md:p-10 border border-amber-500/30 bg-gradient-to-br from-neutral-900 via-neutral-950 to-neutral-900 shadow-2xl shadow-amber-950/20 overflow-hidden">
        <div className="absolute -right-16 -top-16 w-96 h-96 rounded-full bg-amber-500/5 blur-3xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 w-96 h-96 rounded-full bg-amber-600/5 blur-3xl pointer-events-none" />

        {data.PrivateProfile && (
          <div className="mb-6 px-4 py-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-200 text-sm">
            Your Steam profile is private, so Steam data can't be read. This card shows only uploaded CloudRedirect data.
            Make your profile public to include your Steam library, or keep uploading files.
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-neutral-800/80 pb-8">
          <div className="flex items-center gap-5">
            {Player.avatarFullUrl ? (
              <img
                src={Player.avatarFullUrl}
                alt={Player.personaName}
                className="w-20 h-20 rounded-full border-2 border-amber-500/60 shadow-lg object-cover"
              />
            ) : (
              <div className="w-20 h-20 rounded-full border-2 border-amber-500/60 bg-neutral-800 flex items-center justify-center text-2xl font-bold font-serif text-amber-300">
                {Player.personaName.charAt(0)}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs uppercase tracking-widest text-amber-400/90 font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Achievements Passport
                </span>
              </div>
              <h2 className="font-serif text-3xl md:text-4xl font-bold text-neutral-100 tracking-tight">
                {Player.personaName}
              </h2>
              <p className="text-sm text-neutral-400 font-medium">
                ID: {Player.steamid64 || 'Unlinked'}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-start md:items-end gap-2">
            <span className="text-xs uppercase tracking-wider text-neutral-500 font-mono">Issued</span>
            <span className="text-sm font-medium text-neutral-300">{data.GeneratedAtFormatted}</span>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-800/80 border border-neutral-700 text-neutral-200 font-semibold text-xs hover:border-amber-500/40 transition-colors"
                title="Copy GitHub badge markdown"
              >
                {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Github className="w-3.5 h-3.5" />}
                {copied ? 'Copied!' : 'Copy GitHub Badge'}
              </button>
              <button
                onClick={() => renderPng(data)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-800/80 border border-neutral-700 text-neutral-200 font-semibold text-xs hover:border-amber-500/40 transition-colors"
                title="Download passport as PNG"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                Save as PNG
              </button>
              <button
                onClick={onViewAllGames}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500 text-neutral-950 font-semibold text-xs hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/20"
              >
                Browse All Games
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Big Statistics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 my-8">
          <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800/80 flex flex-col justify-between">
            <span className="text-xs uppercase font-semibold tracking-wider text-neutral-400 flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              100% Perfect
            </span>
            <span className="text-3xl font-bold text-amber-300 mt-3 font-mono">{Summary.PerfectGames}</span>
          </div>

          <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800/80 flex flex-col justify-between">
            <span className="text-xs uppercase font-semibold tracking-wider text-neutral-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              Trophies
            </span>
            <span className="text-3xl font-bold text-neutral-100 mt-3 font-mono">
              {Summary.TotalAchievementsUnlocked.toLocaleString()}
            </span>
          </div>

          <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800/80 flex flex-col justify-between">
            <span className="text-xs uppercase font-semibold tracking-wider text-neutral-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-sky-400" />
              Completion Rate
            </span>
            <span className="text-3xl font-bold text-emerald-400 mt-3 font-mono">{Summary.CompletionPercentage}%</span>
          </div>

          <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800/80 flex flex-col justify-between">
            <span className="text-xs uppercase font-semibold tracking-wider text-neutral-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              Total Playtime
            </span>
            <span className="text-3xl font-bold text-neutral-200 mt-3 font-mono">{totalHours.toLocaleString()}h</span>
          </div>

          <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800/80 flex flex-col justify-between col-span-2 sm:col-span-1">
            <span className="text-xs uppercase font-semibold tracking-wider text-neutral-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              Rare (&lt;10%)
            </span>
            <span className="text-3xl font-bold text-purple-300 mt-3 font-mono">{Summary.RareAchievementsCount}</span>
          </div>
        </div>

        {/* Featured Showcase Games */}
        {HighlightGames && HighlightGames.length > 0 && (
          <div className="space-y-4 pt-4 border-t border-neutral-800/60">
            <h3 className="font-serif text-lg font-bold text-amber-300/90 tracking-wide flex items-center gap-2">
              FEATURED MILESTONES
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {HighlightGames.slice(0, 3).map((game) => (
                <div
                  key={game.AppId}
                  className="rounded-xl overflow-hidden border border-neutral-800 bg-neutral-900/80 hover:border-amber-500/40 transition-all p-4 flex flex-col justify-between group"
                >
                  <div>
                    {game.HeaderImageUrl && (
                      <img src={game.HeaderImageUrl} alt={game.Name} className="w-full h-32 object-cover rounded-lg mb-3 shadow" />
                    )}
                    <h4 className="font-bold text-neutral-100 text-sm line-clamp-1 group-hover:text-amber-300 transition-colors">
                      {game.Name}
                    </h4>
                    <span className="text-xs font-mono text-amber-400/90 font-semibold block mt-1">
                      {game.IsPerfect ? '★ 100% PERFECT' : `${game.CompletionPercentage}% Completed`}
                    </span>
                  </div>

                  <div className="mt-4 pt-3 border-t border-neutral-800/80 flex items-center justify-between text-xs text-neutral-400">
                    <span>{game.AchievementsUnlocked} / {game.AchievementsTotal} trophies</span>
                    <span>{Math.round(game.PlaytimeForeverMinutes / 60)}h played</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Auto-update sidenote */}
      <div className="flex items-center justify-center gap-2 text-xs text-neutral-500">
        <Download className="w-3.5 h-3.5" />
        Automatic updates refresh daily at 00:00. Upload or pull new data to see changes right away.
      </div>
    </div>
  );
};