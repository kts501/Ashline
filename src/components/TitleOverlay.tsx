import React from 'react';

interface TitleOverlayProps {
  onStart: () => void;
  onOpenFiles: () => void;
}

export const TitleOverlay: React.FC<TitleOverlayProps> = ({
  onStart,
  onOpenFiles,
}) => {
  return (
    <div
      className="fixed inset-0 z-20 flex flex-col justify-between p-8 md:p-14 pointer-events-none select-none"
      style={{
        background:
          'linear-gradient(90deg, rgba(16,18,20,0.88) 0%, rgba(16,18,20,0.58) 38%, rgba(16,18,20,0.08) 72%, rgba(16,18,20,0.0) 100%)',
      }}
    >
      <div className="max-w-xl pt-8 md:pt-16 pointer-events-auto">
        {/* Bespoke inline SVG Ashline Quarry/Quarantine Emblem & Wordmark */}
        <svg
          viewBox="0 0 360 96"
          className="w-72 md:w-84 h-auto mb-3"
          aria-label="ASHLINE"
          role="img"
        >
          <rect x="2" y="14" width="10" height="68" fill="#d98a36" />
          <path
            d="M22 14 L34 14 L22 82 L10 82 Z"
            fill="#d98a36"
            opacity="0.85"
          />
          <text
            x="48"
            y="62"
            fill="#f2ede4"
            fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
            fontWeight="800"
            fontSize="54"
            letterSpacing="6"
          >
            ASHLINE
          </text>
          <line
            x1="48"
            y1="78"
            x2="348"
            y2="78"
            stroke="#5a6065"
            strokeWidth="2"
          />
          <rect x="48" y="76" width="84" height="4" fill="#d98a36" />
        </svg>

        <p className="text-xs md:text-sm font-mono tracking-[0.18em] md:whitespace-nowrap uppercase text-[#c7beb0] mb-8 pl-0.5">
          COMBAT R2 · TWO-STAGE STRIKE &amp; STAGGER GYM
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onStart();
            }}
            className="px-7 py-3.5 bg-[#d98a36] hover:bg-[#e59b49] active:bg-[#c27828] text-[#121416] font-bold text-sm tracking-[0.14em] uppercase transition-colors cursor-pointer shadow-lg"
          >
            Enter Test Gym
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenFiles();
            }}
            className="px-5 py-3.5 bg-[#1b1f23] hover:bg-[#252b30] text-[#e5dfd5] border border-[#3e4449] font-semibold text-xs tracking-[0.14em] uppercase transition-colors cursor-pointer"
          >
            Godot 4 Stage 1 Files
          </button>
        </div>
      </div>

      <div className="pb-1 text-[11px] md:text-xs font-mono tracking-[0.14em] uppercase text-[#c4bdb1]">
        WASD / Arrows Move · Mouse / Drag Look · LMB Hook → Follow-Up · Shift Sprint · C / Ctrl Crouch &amp; Slide · Space Parkour · Esc Pause
      </div>
    </div>
  );
};
