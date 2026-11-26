import { useId, useState } from 'react';
import talashHelmetMascot from '../assets/images/talash_helmet_mascot_1795684789738.jpg';

export function TalashLogoMark({ className = 'w-9 h-9' }: { className?: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  const uid = useId().replace(/:/g, '');
  const bgId = `talash-bg-${uid}`;
  const shellId = `talash-shell-${uid}`;
  const visorId = `talash-visor-${uid}`;
  const glowId = `talash-glow-${uid}`;

  if (!imgFailed) {
    return (
      <img
        src={talashHelmetMascot}
        alt="TALASH Ai Logo"
        loading="eager"
        decoding="sync"
        fetchPriority="high"
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={`object-cover object-top select-none bg-[#030712] ring-1 ring-sky-400/60 shadow-[0_0_18px_rgba(56,189,248,0.35)] ${className}`}
      />
    );
  }

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id={bgId} x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#030712" />
          <stop offset="55%" stopColor="#0A1428" />
          <stop offset="100%" stopColor="#040812" />
        </linearGradient>
        <linearGradient id={shellId} x1="16" y1="12" x2="48" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F8FAFC" />
          <stop offset="48%" stopColor="#94A3B8" />
          <stop offset="100%" stopColor="#1E293B" />
        </linearGradient>
        <linearGradient id={visorId} x1="18" y1="24" x2="46" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#030712" />
          <stop offset="100%" stopColor="#0B1B36" />
        </linearGradient>
        <linearGradient id={glowId} x1="20" y1="30" x2="44" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22D3EE" />
          <stop offset="50%" stopColor="#E0F2FE" />
          <stop offset="100%" stopColor="#1D6BFF" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill={`url(#${bgId})`} />
      <circle cx="32" cy="32" r="27" stroke="#38BDF8" strokeOpacity="0.65" strokeWidth="1.5" />
      <rect x="11" y="26" width="5.5" height="14" rx="2.75" fill="#1E293B" stroke="#38BDF8" strokeWidth="1.2" />
      <rect x="47.5" y="26" width="5.5" height="14" rx="2.75" fill="#1E293B" stroke="#38BDF8" strokeWidth="1.2" />
      <path
        d="M32 12.5C22.2 12.5 15.5 19.6 15.5 29.8V39.2C15.5 44.5 18.8 49 24.4 50.8L28.8 52.2C30.9 52.9 33.1 52.9 35.2 52.2L39.6 50.8C45.2 49 48.5 44.5 48.5 39.2V29.8C48.5 19.6 41.8 12.5 32 12.5Z"
        fill={`url(#${shellId})`}
        stroke="#E2E8F0"
        strokeWidth="1.2"
      />
      <path
        d="M19.5 27.2C19.5 24.8 21.3 23 23.8 23H40.2C42.7 23 44.5 24.8 44.5 27.2V34.6C44.5 37.9 41.9 40.3 38.6 40.3H25.4C22.1 40.3 19.5 37.9 19.5 34.6V27.2Z"
        fill={`url(#${visorId})`}
        stroke="#38BDF8"
        strokeWidth="1.4"
      />
      <path d="M23.2 31.4C24.4 29.7 27.4 29.7 28.9 31.4C27.4 33.1 24.4 33.1 23.2 31.4Z" fill={`url(#${glowId})`} />
      <path d="M35.1 31.4C36.6 29.7 39.6 29.7 40.8 31.4C39.6 33.1 36.6 33.1 35.1 31.4Z" fill={`url(#${glowId})`} />
    </svg>
  );
}

export function NeuralBrainBanner({
  tagline = 'Smarter. Faster. Better.',
}: {
  tagline?: string;
}) {
  return (
    <div className="relative flex flex-col items-center justify-center py-2 select-none">
      {/* Ambient Radial Blue Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-6 top-2 bottom-2 rounded-full bg-sky-500/15 blur-2xl"
      />

      {/* Glowing Circuit Brain SVG */}
      <div className="relative z-10 -mb-4">
        <svg
          viewBox="0 0 180 112"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          className="w-32 h-20 sm:w-40 sm:h-24 drop-shadow-[0_0_18px_rgba(34,211,238,0.65)]"
        >
          <defs>
            <linearGradient id="brain-cyan" x1="20" y1="10" x2="160" y2="100" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#38BDF8" />
              <stop offset="50%" stopColor="#E0F2FE" />
              <stop offset="100%" stopColor="#2563EB" />
            </linearGradient>
          </defs>
          {/* Left Hemisphere */}
          <path
            d="M86 90C80 95 66 96 58 88C43 87 30 74 33 58C26 47 32 31 45 27C49 14 66 10 78 16C82 14 86 15 86 21V90Z"
            fill="#07152D"
            fillOpacity="0.82"
            stroke="url(#brain-cyan)"
            strokeWidth="2.5"
          />
          {/* Right Hemisphere */}
          <path
            d="M94 90C100 95 114 96 122 88C137 87 150 74 147 58C154 47 148 31 135 27C131 14 114 10 102 16C98 14 94 15 94 21V90Z"
            fill="#07152D"
            fillOpacity="0.82"
            stroke="url(#brain-cyan)"
            strokeWidth="2.5"
          />
          {/* Neural Circuit Traces */}
          <path d="M86 34H67L59 26M86 52H56L48 60M86 70H63L56 77" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" />
          <path d="M94 34H113L121 26M94 52H124L132 60M94 70H117L124 77" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" />
          <circle cx="58" cy="25" r="2.6" fill="#E0F2FE" />
          <circle cx="47" cy="61" r="2.6" fill="#E0F2FE" />
          <circle cx="55" cy="78" r="2.6" fill="#E0F2FE" />
          <circle cx="122" cy="25" r="2.6" fill="#E0F2FE" />
          <circle cx="133" cy="61" r="2.6" fill="#E0F2FE" />
          <circle cx="125" cy="78" r="2.6" fill="#E0F2FE" />
          <circle cx="90" cy="48" r="4.5" fill="#22D3EE" />
          <line x1="90" y1="20" x2="90" y2="92" stroke="#38BDF8" strokeOpacity="0.7" strokeWidth="1.8" strokeDasharray="3 3" />
        </svg>
      </div>

      {/* Hexagonal Neon Frame */}
      <div className="relative w-full max-w-md px-6 pt-7 pb-5 text-center rounded-2xl border border-sky-400/45 bg-gradient-to-b from-[#0a1938]/85 via-[#071127]/90 to-[#050b18]/90 shadow-[0_0_32px_rgba(37,99,235,0.28),inset_0_0_24px_rgba(56,189,248,0.12)] overflow-hidden">
        {/* Corner Accent Nodes */}
        <span aria-hidden="true" className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-8 bg-cyan-400 rounded-r-full shadow-[0_0_12px_#22d3ee]" />
        <span aria-hidden="true" className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-8 bg-cyan-400 rounded-l-full shadow-[0_0_12px_#22d3ee]" />

        <p className="font-display text-lg sm:text-xl font-bold italic tracking-tight text-white drop-shadow-[0_2px_10px_rgba(56,189,248,0.4)]">
          {tagline}
        </p>

        <div className="mt-2 flex items-center justify-center gap-3">
          <span aria-hidden="true" className="h-px w-10 bg-gradient-to-r from-transparent to-cyan-400" />
          <span className="font-display text-xs sm:text-sm font-bold tracking-wide text-slate-100">
            TALASH <span className="text-sky-400">Ai</span>
          </span>
          <span aria-hidden="true" className="h-px w-10 bg-gradient-to-l from-transparent to-cyan-400" />
        </div>
      </div>
    </div>
  );
}
