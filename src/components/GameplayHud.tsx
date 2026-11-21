import React from 'react';
import type { HudSnapshot } from '../game/AshlineEngine';

interface GameplayHudProps {
  hud: HudSnapshot;
  muted: boolean;
  onToggleMute: () => void;
  onResetSpawn: () => void;
  onPause: () => void;
}

export const GameplayHud: React.FC<GameplayHudProps> = ({
  hud,
  muted,
  onToggleMute,
  onResetSpawn,
  onPause,
}) => {
  const staminaPct = Math.max(
    0,
    Math.min(100, (hud.stamina / Math.max(1, hud.staminaMax)) * 100)
  );
  const isParkourActive =
    hud.movementState === 'VAULTING' ||
    hud.movementState === 'CLIMBING' ||
    hud.movementState === 'LEDGE_HANG' ||
    hud.movementState === 'MANTLING';
  const reticleGap =
    hud.movementState === 'SPRINT' ||
    hud.movementState === 'SLIDING' ||
    hud.movementState === 'AIRBORNE' ||
    isParkourActive
      ? 7
      : 4;

  return (
    <div className="fixed inset-0 z-10 pointer-events-none select-none">
      {/* Center (0,0) tactical reticle */}
      <div
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        aria-hidden="true"
      >
        <svg width="28" height="28" viewBox="0 0 28 28">
          <circle
            cx="14"
            cy="14"
            r={hud.parkourPrompt ? 2.2 : 1.5}
            fill={hud.parkourPrompt ? '#d98a36' : '#f2ede4'}
            opacity="0.95"
          />
          <line
            x1="14"
            y1={14 - reticleGap - 4}
            x2="14"
            y2={14 - reticleGap}
            stroke={hud.parkourPrompt ? '#d98a36' : '#f2ede4'}
            strokeWidth="1.4"
            opacity="0.7"
          />
          <line
            x1="14"
            y1={14 + reticleGap}
            x2="14"
            y2={14 + reticleGap + 4}
            stroke={hud.parkourPrompt ? '#d98a36' : '#f2ede4'}
            strokeWidth="1.4"
            opacity="0.7"
          />
          <line
            x1={14 - reticleGap - 4}
            y1="14"
            x2={14 - reticleGap}
            y2="14"
            stroke={hud.parkourPrompt ? '#d98a36' : '#f2ede4'}
            strokeWidth="1.4"
            opacity="0.7"
          />
          <line
            x1={14 + reticleGap}
            y1="14"
            x2={14 + reticleGap + 4}
            y2="14"
            stroke={hud.parkourPrompt ? '#d98a36' : '#f2ede4'}
            strokeWidth="1.4"
            opacity="0.7"
          />
          {hud.hitMarkerActive && (
            <g data-testid="hud-hit-marker" stroke="#d98a36" strokeWidth="1.8" strokeLinecap="round">
              <line x1="6" y1="6" x2="10" y2="10" />
              <line x1="22" y1="6" x2="18" y2="10" />
              <line x1="6" y1="22" x2="10" y2="18" />
              <line x1="22" y1="22" x2="18" y2="18" />
            </g>
          )}
        </svg>
      </div>

      {/* Gaze-routed Parkour Action Prompt directly below reticle */}
      {hud.parkourPrompt && (
        <div
          data-testid="hud-parkour-prompt"
          className="fixed left-1/2 top-[calc(50%+26px)] -translate-x-1/2 px-2.5 py-0.5 bg-[#141719]/90 border border-[#d98a36] text-[10px] font-mono font-bold tracking-[0.16em] uppercase text-[#f2ede4]"
        >
          [SPACE] {hud.parkourPrompt}
        </div>
      )}

      {/* Top-right compact utility icon cluster */}
      <div className="fixed top-5 right-5 flex items-center gap-2 pointer-events-auto">
        <button
          type="button"
          tabIndex={-1}
          aria-label={muted ? 'Unmute audio' : 'Mute audio'}
          title="Mute [M]"
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleMute();
          }}
          className="w-10 h-10 flex items-center justify-center bg-[#141719]/90 hover:bg-[#22272b] border border-[#3a4046] text-[#ece6dc] cursor-pointer"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" opacity="0.25" />
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            {muted ? (
              <>
                <line x1="22" y1="9" x2="16" y2="15" stroke="#d9534f" />
                <line x1="16" y1="9" x2="22" y2="15" stroke="#d9534f" />
              </>
            ) : (
              <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            )}
          </svg>
        </button>

        <button
          type="button"
          tabIndex={-1}
          aria-label="Reset player position"
          title="Reset Spawn [R]"
          onClick={(e) => {
            e.currentTarget.blur();
            onResetSpawn();
          }}
          className="w-10 h-10 flex items-center justify-center bg-[#141719]/90 hover:bg-[#22272b] border border-[#3a4046] text-[#ece6dc] cursor-pointer"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <polyline points="3 3 3 8 8 8" />
          </svg>
        </button>

        <button
          type="button"
          tabIndex={-1}
          aria-label="Pause and tuning menu"
          title="Pause / Tuning [P / Esc]"
          onClick={(e) => {
            e.currentTarget.blur();
            onPause();
          }}
          className="w-10 h-10 flex items-center justify-center bg-[#141719]/90 hover:bg-[#22272b] border border-[#3a4046] text-[#ece6dc] cursor-pointer"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        </button>
      </div>

      {/* Bottom-left compact diegetic Stamina & Movement State cluster */}
      <div
        className="fixed bottom-5 left-5 w-76 bg-[#141719]/90 border-l-4 border-[#d98a36] px-4 py-3 text-[#f2ede4]"
        style={{ boxShadow: '0 6px 20px rgba(0,0,0,0.45)' }}
      >
        <div className="flex items-baseline justify-between mb-1.5">
          <div className="flex items-baseline gap-2">
            <span
              data-testid="hud-movement-state"
              data-combat-state={hud.combatState}
              data-active-attack={hud.activeAttack}
              data-combo-window={hud.comboWindowOpen ? 'open' : 'closed'}
              data-enemy-state={hud.enemyState}
              data-forward-phase={hud.forwardPhase}
              className={`text-lg font-extrabold tracking-wider font-mono tabular-nums ${
                isParkourActive ? 'text-[#d98a36]' : 'text-[#f2ede4]'
              }`}
            >
              {hud.movementState}
            </span>
            {(hud.combatState !== 'IDLE' || hud.comboWindowOpen) && (
              <span
                data-testid="hud-combat-badge"
                className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#d98a36]"
              >
                {hud.combatState === 'CONTACT'
                  ? 'HIT'
                  : hud.activeAttack === 'FOLLOW_UP_STRIKE'
                    ? 'FOLLOW-UP'
                    : hud.combatState === 'IDLE' && hud.comboWindowOpen
                      ? 'CHAIN'
                      : 'HOOK'}
              </span>
            )}
            {hud.onSteepSlope && (
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#e06153]">
                SLIDE
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-3 text-xs font-mono tabular-nums text-[#b8b0a3]">
            <span data-testid="hud-altitude">ALT {hud.posY.toFixed(1)}m</span>
            <span data-testid="hud-speed">{hud.speed.toFixed(1)} m/s</span>
          </div>
        </div>

        {/* Stamina bar with trailing drain ghost bar */}
        <div className="relative h-2.5 w-full bg-[#24292e] overflow-hidden border border-[#363d44]">
          <div
            className="absolute inset-y-0 left-0 bg-[#f0c994]/45 transition-all duration-300"
            style={{ width: `${staminaPct}%` }}
          />
          <div
            data-testid="hud-stamina-fill"
            className="relative h-full transition-colors duration-150"
            style={{
              width: `${staminaPct}%`,
              backgroundColor: hud.isExhausted ? '#c94a3f' : '#d98a36',
            }}
          />
        </div>

        <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono tracking-[0.14em] uppercase">
          <span className={hud.isExhausted ? 'text-[#e06153] font-bold' : 'text-[#9ea6ac]'}>
            {hud.isExhausted ? 'EXHAUSTED' : 'STAMINA'}
          </span>
          <span data-testid="hud-stamina-value" className="tabular-nums text-[#d8d1c5]">
            {Math.round(hud.stamina)} / {Math.round(hud.staminaMax)}
          </span>
        </div>
      </div>

      {/* Subtle bottom-right click-to-look & combat hint only when pointer is not locked */}
      {!hud.pointerLocked && (
        <div className="fixed bottom-5 right-5 px-3 py-1.5 bg-[#141719]/85 border border-[#353b40] text-[10px] font-mono tracking-[0.12em] uppercase text-[#c4bdb1]">
          LMB Hook → Follow-Up · Space Parkour · Esc Pause
        </div>
      )}
    </div>
  );
};
