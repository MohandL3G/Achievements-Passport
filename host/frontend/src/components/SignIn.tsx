import React from 'react';
import { startSteamLogin } from '../api';
import { Award, ShieldCheck } from 'lucide-react';

export const SignIn: React.FC = () => {
  return (
    <div className="flex items-center justify-center flex-1 px-6 py-24">
      <div className="w-full max-w-md text-center space-y-8 animate-in fade-in duration-500">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-neutral-950 shadow-2xl shadow-amber-500/30">
          <Award className="w-9 h-9" />
        </div>

        <div className="space-y-3">
          <h1 className="font-serif text-4xl md:text-5xl font-bold tracking-tight text-neutral-100">
            ACHIEVEMENTS<br />PASSPORT
          </h1>
          <p className="text-neutral-400 text-sm max-w-sm mx-auto leading-relaxed">
            Your gaming legacy, archive-verified. Sign in to generate your passport, build your card, and share it with the world.
          </p>
        </div>

        <button
          onClick={startSteamLogin}
          className="inline-flex items-center gap-3 px-8 py-4 rounded-xl bg-[#1b2838] hover:bg-[#2a475e] text-white font-semibold text-sm transition-colors shadow-2xl shadow-black/40 border border-white/10"
        >
          <img
            src="https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/480/steam.png"
            alt=""
            className="w-6 h-6 rounded"
            onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
          />
          Sign in through Steam
        </button>

        <p className="text-[11px] text-neutral-600 max-w-sm mx-auto flex items-start gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5 text-neutral-600" />
          Steam OpenID only confirms who you are - no password is ever shared, and nothing is posted to Steam. Reading your card
          requires a public Steam profile; CloudRedirect uploads always work.
        </p>
      </div>
    </div>
  );
};