import React from 'react';
import { Award, Library, FileText, ShieldCheck, LogOut, User } from 'lucide-react';
import { Me, PublicUser } from '../types';

export type TabKind = 'passport' | 'games' | 'generate' | 'admin';

interface NavbarProps {
  me: Me;
  usersList: PublicUser[];
  activeTab: TabKind;
  viewing: string;
  onSelectTab: (tab: TabKind) => void;
  onSwitchUser: (steamid: string) => void;
  onSwitchSelf: () => void;
  onSignOut: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  me,
  usersList,
  activeTab,
  viewing,
  onSelectTab,
  onSwitchUser,
  onSwitchSelf,
  onSignOut,
}) => {
  const tabDefs: { key: TabKind; label: string; icon: React.ReactNode }[] = [
    { key: 'passport', label: 'Passport', icon: <Award className="w-4 h-4" /> },
    { key: 'games', label: 'All Games', icon: <Library className="w-4 h-4" /> },
    { key: 'generate', label: 'Generate', icon: <FileText className="w-4 h-4" /> },
  ];
  if (me.isAdmin) {
    tabDefs.push({ key: 'admin', label: 'Admin', icon: <ShieldCheck className="w-4 h-4" /> });
  }

  const isSelf = viewing === me.steamid;
  const switcherUsers = usersList.length
    ? usersList
    : [{ steamid64: me.steamid || '', personaName: me.persona?.name || 'Me' }];

  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-neutral-950/80 border-b border-neutral-800/80 px-6 py-3">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-neutral-950 shadow-lg shadow-amber-500/20 font-bold">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-serif text-lg font-bold tracking-tight text-neutral-100 leading-tight">
              ACHIEVEMENTS PASSPORT
            </h1>
            <p className="text-[11px] text-neutral-500">
              {isSelf ? `Your archive · ${me.persona?.name || ''}` : 'Viewing a shared card'}
            </p>
          </div>
        </div>

        <nav className="flex items-center gap-2 bg-neutral-900/90 border border-neutral-800 p-1 rounded-xl order-3 md:order-2 w-full md:w-auto">
          {tabDefs.map((t) => (
            <button
              key={t.key}
              onClick={() => onSelectTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === t.key
                  ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30 shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2 order-2 md:order-3">
          <div className="flex items-center gap-2 bg-neutral-900/90 border border-neutral-800 rounded-xl px-2 py-1.5">
            <User className="w-3.5 h-3.5 text-neutral-500" />
            <select
              value={viewing}
              onChange={(e) => {
                const id = e.target.value;
                if (id === me.steamid) onSwitchSelf();
                else onSwitchUser(id);
              }}
              className="bg-transparent text-xs text-neutral-300 focus:outline-none max-w-[120px] truncate"
            >
              <option value={me.steamid ?? ''}>My card</option>
              {switcherUsers
                .filter((u) => u.steamid64 !== me.steamid)
                .map((u) => (
                  <option key={u.steamid64} value={u.steamid64}>
                    {u.personaName}
                  </option>
                ))}
            </select>
          </div>
          <button
            onClick={onSignOut}
            title="Sign out"
            className="p-2 rounded-lg border border-neutral-800 text-neutral-400 hover:text-red-300 hover:border-red-500/40 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};