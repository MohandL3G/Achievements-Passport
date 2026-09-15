import React, { useState, useMemo } from 'react';
import { GameRecord } from '../types';
import { Search, Clock, Filter } from 'lucide-react';

interface GamesListProps {
  games: GameRecord[];
  onSelectGame: (game: GameRecord) => void;
}

function isPirated(source: number): boolean {
  return source !== 1;
}

function sourceLabel(source: number): string {
  switch (source) {
    case 1: return 'Steam';
    case 2: return 'CloudRedirect';
    case 3: return 'BKV Cache';
    default: return 'VDF';
  }
}

export const GamesList: React.FC<GamesListProps> = ({ games, onSelectGame }) => {
  const [search, setSearch] = useState('');
  const [completionFilter, setCompletionFilter] = useState<'all' | 'perfect' | 'inprogress'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'steam' | 'pirated'>('all');
  const [sort, setSort] = useState<'completion' | 'playtime' | 'name'>('completion');

  const steamCount = useMemo(() => games.filter(g => !isPirated(g.Source)).length, [games]);
  const piratedCount = games.length - steamCount;
  const totalPlaytime = useMemo(() => Math.round(games.reduce((s, g) => s + g.PlaytimeForeverMinutes, 0) / 60), [games]);
  const totalTrophies = useMemo(() => games.reduce((s, g) => s + g.AchievementsUnlocked, 0), [games]);

  const filteredGames = useMemo(() => {
    let list = [...games];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(g => g.Name.toLowerCase().includes(q) || g.AppId.toString().includes(q));
    }

    if (completionFilter === 'perfect') {
      list = list.filter(g => g.IsPerfect);
    } else if (completionFilter === 'inprogress') {
      list = list.filter(g => !g.IsPerfect && g.AchievementsTotal > 0);
    }

    if (sourceFilter === 'steam') {
      list = list.filter(g => !isPirated(g.Source));
    } else if (sourceFilter === 'pirated') {
      list = list.filter(g => isPirated(g.Source));
    }

    list.sort((a, b) => {
      if (sort === 'completion') return b.CompletionPercentage - a.CompletionPercentage;
      if (sort === 'playtime') return b.PlaytimeForeverMinutes - a.PlaytimeForeverMinutes;
      return a.Name.localeCompare(b.Name);
    });

    return list;
  }, [games, search, completionFilter, sourceFilter, sort]);

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {/* Stats Strip */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-neutral-400 px-1">
        <span className="font-semibold text-neutral-300">{games.length} Total Games</span>
        <span>{steamCount} Steam Games</span>
        <span>{piratedCount} Pirated Games</span>
        <span>{totalTrophies.toLocaleString()} Trophies</span>
        <span>{totalPlaytime.toLocaleString()}h Playtime</span>
      </div>

      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-neutral-900/60 p-4 rounded-xl border border-neutral-800">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search by title or AppID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-neutral-950/80 border border-neutral-800 rounded-lg text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-amber-500/50"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Completion filter */}
          <div className="flex bg-neutral-950 p-1 rounded-lg border border-neutral-800 text-xs font-medium">
            <button
              onClick={() => setCompletionFilter('all')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                completionFilter === 'all' ? 'bg-amber-500/20 text-amber-300 font-semibold' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              All ({games.length})
            </button>
            <button
              onClick={() => setCompletionFilter('perfect')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                completionFilter === 'perfect' ? 'bg-amber-500/20 text-amber-300 font-semibold' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              ★ 100% ({games.filter(g => g.IsPerfect).length})
            </button>
            <button
              onClick={() => setCompletionFilter('inprogress')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                completionFilter === 'inprogress' ? 'bg-amber-500/20 text-amber-300 font-semibold' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              In Progress
            </button>
          </div>

          {/* Source filter */}
          <div className="flex bg-neutral-950 p-1 rounded-lg border border-neutral-800 text-xs font-medium">
            <button
              onClick={() => setSourceFilter('all')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                sourceFilter === 'all' ? 'bg-sky-500/20 text-sky-300 font-semibold' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Filter className="w-3 h-3 inline mr-1" />
              All
            </button>
            <button
              onClick={() => setSourceFilter('steam')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                sourceFilter === 'steam' ? 'bg-sky-500/20 text-sky-300 font-semibold' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Steam ({steamCount})
            </button>
            <button
              onClick={() => setSourceFilter('pirated')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                sourceFilter === 'pirated' ? 'bg-sky-500/20 text-sky-300 font-semibold' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Pirated ({piratedCount})
            </button>
          </div>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as any)}
            className="bg-neutral-950 text-neutral-300 text-xs font-medium border border-neutral-800 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500/50"
          >
            <option value="completion">Sort by Completion %</option>
            <option value="playtime">Sort by Playtime</option>
            <option value="name">Sort Alphabetically</option>
          </select>
        </div>
      </div>

      {/* Grid of Games */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {filteredGames.map((game) => (
          <div
            key={game.AppId}
            onClick={() => onSelectGame(game)}
            className={`group rounded-xl overflow-hidden border bg-neutral-900/70 hover:scale-[1.02] transition-all cursor-pointer flex flex-col justify-between ${
              game.IsPerfect
                ? 'border-amber-500/40 shadow-lg shadow-amber-950/20'
                : 'border-neutral-800/80 hover:border-neutral-700'
            }`}
          >
            <div>
              <div className="relative aspect-[16/9] w-full bg-neutral-950 overflow-hidden">
                <img
                  src={game.HeaderImageUrl || `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.AppId}/header.jpg`}
                  alt={game.Name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                {game.IsPerfect && (
                  <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-amber-500/90 text-neutral-950 font-bold text-[10px] tracking-wider uppercase shadow">
                    ★ 100% Perfect
                  </div>
                )}
                <div className={`absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase shadow ${
                  isPirated(game.Source)
                    ? 'bg-purple-500/90 text-white'
                    : 'bg-sky-500/90 text-white'
                }`}>
                  {sourceLabel(game.Source)}
                </div>
              </div>

              <div className="p-4 space-y-2">
                <h3 className="font-bold text-neutral-100 text-sm line-clamp-1 group-hover:text-amber-300 transition-colors">
                  {game.Name}
                </h3>
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-neutral-500" />
                    {Math.round(game.PlaytimeForeverMinutes / 60)} hrs
                  </span>
                  <span className="font-mono text-amber-400/90 font-semibold">
                    {game.CompletionPercentage}%
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${game.IsPerfect ? 'bg-amber-400' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(100, game.CompletionPercentage)}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="px-4 pb-4 pt-1 flex items-center justify-between text-[11px] text-neutral-500 border-t border-neutral-800/60">
              <span>{game.AchievementsUnlocked} / {game.AchievementsTotal} trophies</span>
              <span className="text-amber-400/80 group-hover:underline">View details →</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
