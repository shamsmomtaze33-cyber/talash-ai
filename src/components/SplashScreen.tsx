import { useState } from 'react';
import cosmicEarthBg from '../assets/images/talash_cosmic_earth_bg_1795684790270.jpg';
import { TalashLogoMark } from './TalashLogo';

interface SplashScreenProps {
  fadingOut?: boolean;
}

export function SplashScreen({ fadingOut = false }: SplashScreenProps) {
  const [bgFailed, setBgFailed] = useState(false);

  return (
    <div
      role="status"
      aria-label="Loading TALASH Ai"
      className={`fixed inset-0 z-50 flex flex-col items-center justify-between bg-[#030712] text-white px-6 py-10 overflow-hidden transition-opacity duration-300 ${
        fadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Cosmic Glowing Earth Atmosphere Backdrop */}
      {!bgFailed && (
        <img
          src={cosmicEarthBg}
          alt=""
          aria-hidden="true"
          loading="eager"
          decoding="sync"
          fetchPriority="high"
          referrerPolicy="no-referrer"
          onError={() => setBgFailed(true)}
          className="absolute inset-0 w-full h-full object-cover object-center opacity-75 pointer-events-none select-none"
        />
      )}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(5,12,28,0.38)_0%,rgba(3,7,18,0.88)_78%)] pointer-events-none"
      />

      <div aria-hidden="true" className="relative h-4" />

      <div className="relative z-10 flex flex-col items-center text-center space-y-6 animate-talash-reveal max-w-md w-full">
        {/* Large Glowing Robot Helmet Mascot */}
        <div className="relative flex items-center justify-center">
          <div
            aria-hidden="true"
            className="absolute -inset-6 rounded-full bg-sky-500/25 blur-2xl animate-talash-glow"
          />
          <div
            aria-hidden="true"
            className="absolute -inset-1.5 rounded-full border border-cyan-400/45 shadow-[0_0_28px_rgba(34,211,238,0.45)]"
          />
          <TalashLogoMark className="relative w-32 h-32 sm:w-40 sm:h-40 rounded-full shadow-[0_0_45px_rgba(37,99,235,0.5)]" />
        </div>

        {/* Title & Horizontal Cyan Divider Subtitle */}
        <div className="space-y-2.5 w-full">
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-white drop-shadow-[0_4px_24px_rgba(56,189,248,0.45)]">
            TALASH <span className="text-sky-400 italic">Ai</span>
          </h1>
          <div className="flex items-center justify-center gap-3 px-4">
            <span aria-hidden="true" className="h-px flex-1 max-w-[56px] bg-gradient-to-r from-transparent to-cyan-400" />
            <p className="text-xs sm:text-sm font-medium italic text-slate-200 tracking-wide whitespace-nowrap">
              Your Intelligent AI Assistant
            </p>
            <span aria-hidden="true" className="h-px flex-1 max-w-[56px] bg-gradient-to-l from-transparent to-cyan-400" />
          </div>
        </div>

        {/* Animated Circular Glowing Blue Loading Spinner */}
        <div className="flex flex-col items-center gap-2.5 pt-2">
          <div className="relative w-10 h-10 flex items-center justify-center">
            <div
              aria-hidden="true"
              className="absolute inset-0 rounded-full border-2 border-sky-950"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-400 border-r-sky-500 animate-talash-spin shadow-[0_0_16px_rgba(56,189,248,0.55)]"
            />
          </div>
          <span className="text-xs font-medium text-slate-300 tracking-wide">
            Loading...
          </span>
        </div>
      </div>

      <div className="relative z-10 flex items-center justify-center gap-3 text-xs tracking-wide w-full max-w-xs">
        <span aria-hidden="true" className="h-px flex-1 bg-gradient-to-r from-transparent to-sky-500/40" />
        <p className="text-slate-400 whitespace-nowrap">
          Created by: <span className="text-sky-400 font-semibold">Shams Talash</span>
        </p>
        <span aria-hidden="true" className="h-px flex-1 bg-gradient-to-l from-transparent to-sky-500/40" />
      </div>
    </div>
  );
}
