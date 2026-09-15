import React, { useEffect, useState } from 'react';
import { GameRecord, AchievementRecord } from '../types';
import { ArrowLeft, Trophy, Clock, CheckCircle2, Lock } from 'lucide-react';

interface GameDetailProps {
  gameSummary: GameRecord;
  steamid: string;
  onBack: () => void;
}

export const GameDetail: React.FC<GameDetailProps> = ({ gameSummary, steamid, onBack }) => {
  const [fullGame, setFullGame] = useState<GameRecord | null>(
    gameSummary.Achievements ? gameSummary : null
  );
  const [loading, setLoading] = useState(!gameSummary.Achievements);

  useEffect(() => {
    if (gameSummary.Achievements) {
      setFullGame(gameSummary);
      setLoading(false);
      return;
    }
    fetch(`/api/u/${steamid}/games/${gameSummary.AppId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: GameRecord) => {
        setFullGame(data);
        setLoading(false);
      })
      .catch(() => {
        setFullGame(gameSummary);
        setLoading(false);
      });
  }, [gameSummary, steamid]);

  const game = fullGame || gameSummary;
  const achievements: AchievementRecord[] = game.Achievements || [];

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-amber-300 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Games Library
      </button>

      {/* Game Header Banner */}
      <div className="relative rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-900/90 p-6 md:p-8 flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
        <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
          <img
            src={game.HeaderImageUrl || `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.AppId}/header.jpg`}
            alt={game.Name}
            className="w-full md:w-64 h-36 object-cover rounded-xl shadow-lg border border-neutral-800"
          />
          <div className="space-y-2">
            {game.IsPerfect && (
              <span className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 text-xs font-bold uppercase tracking-wider border border-amber-500/30">
                ★ 100% Perfect Completion
              </span>
            )}
            <span className={`inline-block px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider border ${
              game.Source === 1
                ? 'bg-sky-500/20 text-sky-300 border-sky-500/30'
                : 'bg-purple-500/20 text-purple-300 border-purple-500/30'
            }`}>
              {game.Source === 1 ? 'Steam (Owned)' : game.Source === 2 ? 'CloudRedirect (Pirated)' : game.Source === 3 ? 'BKV Cache (Pirated)' : 'VDF (Pirated)'}
            </span>
            <h2 className="text-2xl md:text-3xl font-bold font-serif text-neutral-100">{game.Name}</h2>
            <p className="text-xs text-neutral-400">Steam AppID: {game.AppId}</p>
            <div className="flex flex-wrap gap-4 text-xs text-neutral-300 pt-1">
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-neutral-500" />
                {Math.round(game.PlaytimeForeverMinutes / 60)} hours total
              </span>
              <span className="flex items-center gap-1.5">
                <Trophy className="w-4 h-4 text-amber-400" />
                {game.AchievementsUnlocked} / {game.AchievementsTotal} unlocked ({game.CompletionPercentage}%)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Achievements List */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold font-serif text-neutral-100">
          Achievements ({achievements.length})
        </h3>

        {loading ? (
          <p className="text-sm text-neutral-400">Loading achievement data...</p>
        ) : achievements.length === 0 ? (
          <p className="text-sm text-neutral-500">No achievements recorded for this game.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {achievements.map((ach, index) => (
              <div
                key={ach.apiname || index}
                className={`p-3 rounded-xl border flex items-center gap-3.5 transition-colors ${
                  ach.achieved
                    ? 'bg-neutral-900/80 border-neutral-800/80'
                    : 'bg-neutral-950/40 border-neutral-900/60 opacity-60'
                }`}
              >
                <div className={`w-12 h-12 rounded-lg bg-neutral-800 flex items-center justify-center shrink-0 border border-neutral-700 ${
                  ach.achieved ? 'text-emerald-400' : 'text-neutral-600'
                }`}>
                  {ach.achieved ? <CheckCircle2 className="w-6 h-6" /> : <Lock className="w-6 h-6" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className={`text-sm font-semibold truncate ${ach.achieved ? 'text-neutral-100' : 'text-neutral-400'}`}>
                      {ach.name}
                    </h4>
                    {ach.globalPercent != null && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 shrink-0">
                        {ach.globalPercent}%
                      </span>
                    )}
                  </div>
                  {ach.description && (
                    <p className="text-xs text-neutral-400 line-clamp-1 mt-0.5">{ach.description}</p>
                  )}
                  {ach.achieved && ach.unlockTimestamps && ach.unlockTimestamps.length > 0 && (
                    <span className="text-[10px] text-neutral-500 block mt-1">
                      Unlocked {new Date(ach.unlockTimestamps[0] * 1000).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};