import React, { useEffect, useState, useCallback } from 'react';
import { Me, PassportData, GameRecord, PublicUser } from './types';
import { getMe, fetchPassport, fetchPublicUsers, logout, adminLogout, startSteamLogin } from './api';
import { Navbar, TabKind } from './components/Navbar';
import { SignIn } from './components/SignIn';
import { PassportCard } from './components/PassportCard';
import { GamesList } from './components/GamesList';
import { GameDetail } from './components/GameDetail';
import { GenerateWizard } from './components/GenerateWizard';
import { AdminPanel } from './components/AdminPanel';
import { Award } from 'lucide-react';

export const App: React.FC = () => {
  const [me, setMe] = useState<Me | null>(null);
  const [booted, setBooted] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKind>('passport');
  const [card, setCard] = useState<PassportData | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const [loadingCard, setLoadingCard] = useState(false);
  const [selectedGame, setSelectedGame] = useState<GameRecord | null>(null);
  const [usersList, setUsersList] = useState<PublicUser[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  const refreshMe = useCallback(async () => {
    const m = await getMe();
    setMe(m);
    return m;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const m = await refreshMe();
        const mAll = /^\/u\/(\d+)/.exec(window.location.pathname);
        setViewing(mAll ? mAll[1] : m && m.steamid ? m.steamid : null);
        if (m) {
          fetchPublicUsers()
            .then(setUsersList)
            .catch(() => {});
        }
      } catch {
        setMe(null);
        setViewing(null);
      } finally {
        setBooted(true);
      }
    })();
  }, [refreshMe]);

  useEffect(() => {
    if (!viewing) {
      setCard(null);
      setCardError(null);
      setLoadingCard(false);
      return;
    }
    let cancelled = false;
    setLoadingCard(true);
    setCardError(null);
    fetchPassport(viewing)
      .then((c) => {
        if (!cancelled) setCard(c);
      })
      .catch((e) => {
        if (!cancelled) {
          setCard(null);
          setCardError((e as Error).message || 'No card for this account yet');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCard(false);
      });
    return () => {
      cancelled = true;
    };
  }, [viewing, reloadKey]);

  const switchUser = (steamid: string) => {
    setViewing(steamid);
    window.history.replaceState(null, '', `/u/${steamid}`);
    setTab('passport');
    setSelectedGame(null);
  };

  const switchSelf = () => {
    setViewing(me ? me.steamid : null);
    window.history.replaceState(null, '', '/');
    setTab('passport');
    setSelectedGame(null);
  };

  const onGenerated = () => {
    setReloadKey((k) => k + 1);
    if (me && viewing !== me.steamid) switchSelf();
  };

  const onSelectTab = (t: TabKind) => {
    setTab(t);
    setSelectedGame(null);
  };

  const loggedOut = booted && !me?.steamid;

  const renderCard = () => {
    if (loadingCard) {
      return <div className="flex items-center justify-center h-64 text-neutral-400">Loading passport...</div>;
    }
    if (cardError || !card) {
      return (
        <div className="text-center py-20 space-y-4 max-w-lg mx-auto">
          <h2 className="text-2xl font-serif font-bold text-amber-300">No Card Yet</h2>
          <p className="text-sm text-neutral-400">
            {cardError || 'This account has not generated a passport yet.'}
          </p>
          {me && me.steamid === viewing && (
            <button
              onClick={() => onSelectTab('generate')}
              className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 text-neutral-950 font-semibold text-sm hover:bg-amber-400"
            >
              Generate my card
            </button>
          )}
        </div>
      );
    }
    return <PassportCard data={card} onViewAllGames={() => onSelectTab('games')} />;
  };

  const renderGames = () => {
    if (!card) return renderCard();
    if (selectedGame) {
      return (
        <GameDetail
          key={selectedGame.AppId}
          gameSummary={selectedGame}
          steamid={viewing || ''}
          onBack={() => setSelectedGame(null)}
        />
      );
    }
    return <GamesList games={card.Games} onSelectGame={(g) => setSelectedGame(g)} />;
  };

  if (!booted) {
    return (
      <div className="min-h-screen flex items-center justify-center text-neutral-500 text-sm">
        Loading Achievements Passport...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-neutral-950 text-neutral-100 selection:bg-amber-500/20">
      {loggedOut ? (
        <header className="sticky top-0 z-50 backdrop-blur-md bg-neutral-950/80 border-b border-neutral-800/80 px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-neutral-950 font-bold">
                <Award className="w-5 h-5" />
              </div>
              <h1 className="font-serif text-lg font-bold tracking-tight text-neutral-100">
                ACHIEVEMENTS PASSPORT
              </h1>
            </div>
            <button
              onClick={startSteamLogin}
              className="px-4 py-2 rounded-lg bg-[#1b2838] hover:bg-[#2a475e] text-white text-sm font-semibold border border-white/10"
            >
              Sign in through Steam
            </button>
          </div>
        </header>
      ) : (
        me && (
          <Navbar
            me={me}
            usersList={usersList}
            activeTab={tab}
            viewing={viewing || me.steamid || ''}
            onSelectTab={onSelectTab}
            onSwitchUser={switchUser}
            onSwitchSelf={switchSelf}
            onSignOut={() => {
              void logout();
            }}
          />
        )
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8">
        {loggedOut ? (
          viewing ? (
            tab === 'passport' ? (
              renderCard()
            ) : (
              renderGames()
            )
          ) : (
            <SignIn />
          )
        ) : selectedGame ? (
          renderGames()
        ) : tab === 'passport' ? (
          renderCard()
        ) : tab === 'games' ? (
          renderGames()
        ) : tab === 'generate' ? (
          <GenerateWizard isOwner={!!me?.isOwner} onGenerated={onGenerated} />
        ) : (
          <AdminPanel
            meAdmin={!!me?.isAdmin}
            onAuthChanged={() => {
              void refreshMe().then(() => {
                fetchPublicUsers()
                  .then(setUsersList)
                  .catch(() => {});
              });
            }}
            onSignOutAdmin={() => {
              void adminLogout().then(() => void refreshMe());
            }}
          />
        )}
      </main>

      <footer className="border-t border-neutral-900 py-6 text-center text-xs text-neutral-500">
        Achievements Passport • Self-Hosted Archive • Updates refresh daily at 00:00
      </footer>
    </div>
  );
};