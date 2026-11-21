import React, { useState } from 'react';
import { GODOT_STAGE1_FILES } from '../game/godotFilesCatalog';
import { DEFAULT_MOVEMENT_TUNING, type MovementTuning } from '../game/movementTuning';

interface PauseModalProps {
  canResume: boolean;
  tuning: MovementTuning;
  onUpdateTuning: (next: MovementTuning) => void;
  onResume: () => void;
  onResetSpawn: () => void;
  onReturnToTitle: () => void;
  initialTab?: 'tuning' | 'godot';
}

export const PauseModal: React.FC<PauseModalProps> = ({
  canResume,
  tuning,
  onUpdateTuning,
  onResume,
  onResetSpawn,
  onReturnToTitle,
  initialTab = 'tuning',
}) => {
  const [tab, setTab] = useState<'tuning' | 'godot'>(initialTab);

  const setField = <K extends keyof MovementTuning>(
    key: K,
    value: MovementTuning[K]
  ) => {
    onUpdateTuning({ ...tuning, [key]: value });
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#0d0f11]/82">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pause and Stage 1 Tuning"
        className="w-full max-w-2xl bg-[#16191c] border border-[#3a4046] border-t-4 border-t-[#d98a36] text-[#f2ede4] p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#2c3136] pb-4 mb-5">
          <div>
            <p className="text-[11px] font-mono tracking-[0.18em] uppercase text-[#d98a36]">
              ASHLINE // COMBAT R2
            </p>
            <h2 className="text-xl font-bold tracking-wide uppercase">
              {canResume ? 'Simulation Paused' : 'Godot 4 Stage 1 Codebase'}
            </h2>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab('tuning')}
              className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider border cursor-pointer ${
                tab === 'tuning'
                  ? 'bg-[#d98a36] text-[#121416] border-[#d98a36] font-bold'
                  : 'bg-[#1e2226] text-[#c7beb0] border-[#363c42]'
              }`}
            >
              Movement Tuning
            </button>
            <button
              type="button"
              onClick={() => setTab('godot')}
              className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider border cursor-pointer ${
                tab === 'godot'
                  ? 'bg-[#d98a36] text-[#121416] border-[#d98a36] font-bold'
                  : 'bg-[#1e2226] text-[#c7beb0] border-[#363c42]'
              }`}
            >
              Godot 4 Files
            </button>
          </div>
        </div>

        {tab === 'tuning' ? (
          <div className="space-y-4 mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block bg-[#1d2125] border border-[#2f353b] p-3">
                <div className="flex justify-between text-xs font-mono mb-1.5">
                  <span className="text-[#b8b0a3] uppercase">Walk Speed</span>
                  <span className="tabular-nums text-[#f2ede4]">{tuning.walkSpeed.toFixed(1)} m/s</span>
                </div>
                <input
                  type="range"
                  min={2.5}
                  max={7.0}
                  step={0.1}
                  value={tuning.walkSpeed}
                  onChange={(e) => setField('walkSpeed', parseFloat(e.target.value))}
                  className="w-full accent-[#d98a36]"
                />
              </label>

              <label className="block bg-[#1d2125] border border-[#2f353b] p-3">
                <div className="flex justify-between text-xs font-mono mb-1.5">
                  <span className="text-[#b8b0a3] uppercase">Sprint Speed</span>
                  <span className="tabular-nums text-[#f2ede4]">{tuning.sprintSpeed.toFixed(1)} m/s</span>
                </div>
                <input
                  type="range"
                  min={5.0}
                  max={10.5}
                  step={0.1}
                  value={tuning.sprintSpeed}
                  onChange={(e) => setField('sprintSpeed', parseFloat(e.target.value))}
                  className="w-full accent-[#d98a36]"
                />
              </label>

              <label className="block bg-[#1d2125] border border-[#2f353b] p-3">
                <div className="flex justify-between text-xs font-mono mb-1.5">
                  <span className="text-[#b8b0a3] uppercase">Jump Velocity</span>
                  <span className="tabular-nums text-[#f2ede4]">{tuning.jumpVelocity.toFixed(1)} m/s</span>
                </div>
                <input
                  type="range"
                  min={4.0}
                  max={9.0}
                  step={0.1}
                  value={tuning.jumpVelocity}
                  onChange={(e) => setField('jumpVelocity', parseFloat(e.target.value))}
                  className="w-full accent-[#d98a36]"
                />
              </label>

              <label className="block bg-[#1d2125] border border-[#2f353b] p-3">
                <div className="flex justify-between text-xs font-mono mb-1.5">
                  <span className="text-[#b8b0a3] uppercase">Gravity</span>
                  <span className="tabular-nums text-[#f2ede4]">{tuning.gravity.toFixed(1)} m/s²</span>
                </div>
                <input
                  type="range"
                  min={12.0}
                  max={28.0}
                  step={0.2}
                  value={tuning.gravity}
                  onChange={(e) => setField('gravity', parseFloat(e.target.value))}
                  className="w-full accent-[#d98a36]"
                />
              </label>

              <label className="block bg-[#1d2125] border border-[#2f353b] p-3">
                <div className="flex justify-between text-xs font-mono mb-1.5">
                  <span className="text-[#b8b0a3] uppercase">Coyote Time</span>
                  <span className="tabular-nums text-[#f2ede4]">{Math.round(tuning.coyoteTime * 1000)} ms</span>
                </div>
                <input
                  type="range"
                  min={0.04}
                  max={0.22}
                  step={0.01}
                  value={tuning.coyoteTime}
                  onChange={(e) => setField('coyoteTime', parseFloat(e.target.value))}
                  className="w-full accent-[#d98a36]"
                />
              </label>

              <label className="block bg-[#1d2125] border border-[#2f353b] p-3">
                <div className="flex justify-between text-xs font-mono mb-1.5">
                  <span className="text-[#b8b0a3] uppercase">Sprint Drain</span>
                  <span className="tabular-nums text-[#f2ede4]">{tuning.sprintDrainPerSec.toFixed(0)} /s</span>
                </div>
                <input
                  type="range"
                  min={6}
                  max={36}
                  step={1}
                  value={tuning.sprintDrainPerSec}
                  onChange={(e) => setField('sprintDrainPerSec', parseFloat(e.target.value))}
                  className="w-full accent-[#d98a36]"
                />
              </label>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => onUpdateTuning({ ...DEFAULT_MOVEMENT_TUNING })}
                className="px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-[#c7beb0] hover:text-[#f2ede4] bg-[#1e2226] border border-[#363c42] cursor-pointer"
              >
                Restore Stage 1 Defaults
              </button>
            </div>
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto space-y-2 mb-6 pr-1">
            {GODOT_STAGE1_FILES.map((file) => (
              <div
                key={file.path}
                className="bg-[#1d2125] border border-[#2f353b] px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5"
              >
                <div>
                  <div className="text-xs font-mono text-[#f2ede4]">{file.path}</div>
                  <div className="text-xs text-[#a5aeb4]">{file.summary}</div>
                </div>
                <span className="self-start sm:self-center shrink-0 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider bg-[#272c31] text-[#d98a36] border border-[#3a4046]">
                  {file.role}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#2c3136]">
          <div className="flex flex-wrap gap-2.5">
            {canResume && (
              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onResume();
                }}
                className="px-5 py-2.5 bg-[#d98a36] hover:bg-[#e59b49] text-[#121416] font-bold text-xs tracking-[0.14em] uppercase cursor-pointer"
              >
                Resume
              </button>
            )}
            {canResume && (
              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onResetSpawn();
                  onResume();
                }}
                className="px-4 py-2.5 bg-[#20252a] hover:bg-[#2a3036] border border-[#3a4046] text-[#ece6dc] font-semibold text-xs tracking-[0.12em] uppercase cursor-pointer"
              >
                Reset Position
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              onReturnToTitle();
            }}
            className="px-4 py-2.5 bg-[#1b1f23] hover:bg-[#252b30] border border-[#3a4046] text-[#c7beb0] font-semibold text-xs tracking-[0.12em] uppercase cursor-pointer"
          >
            {canResume ? 'Return to Title' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
