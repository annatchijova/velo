export function VeloLogo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 48" className={className} role="img" aria-label="VELO">
      <defs>
        <linearGradient id="velo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22D3EE" />
          <stop offset="100%" stopColor="#6366F1" />
        </linearGradient>
      </defs>
      {/* crescent moon — the private side */}
      <path
        d="M42 6 A18 18 0 1 0 42 42 A13 13 0 1 1 42 6 Z"
        fill="url(#velo-g)"
        opacity="0.95"
      />
      {/* the visible verdict — an eye in the moon's opening */}
      <path d="M6 21 Q20 14 34 21 Q20 28 6 21 Z" fill="url(#velo-g)" />
      <circle cx="20" cy="21" r="2.6" fill="#fff" />
      {/* ledger line */}
      <rect x="4" y="36" width="26" height="2.4" rx="1.2" fill="url(#velo-g)" opacity="0.75" />
    </svg>
  );
}

export function VeloWordmark({ subtitle = "Midnight" }: { subtitle?: string }) {
  return (
    <span className="flex flex-col leading-none">
      <span className="brand-text text-[19px] font-extrabold tracking-tight">VELO</span>
      <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">
        {subtitle}
      </span>
    </span>
  );
}
