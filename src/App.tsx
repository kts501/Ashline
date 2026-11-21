import { useCallback, useEffect, useRef, useState } from 'react';
import { GameplayHud } from './components/GameplayHud';
import { PauseModal } from './components/PauseModal';
import { TitleOverlay } from './components/TitleOverlay';
import { AshlineEngine, type GamePhase, type HudSnapshot } from './game/AshlineEngine';
import { DEFAULT_MOVEMENT_TUNING, type MovementTuning } from './game/movementTuning';

const INITIAL_HUD: HudSnapshot = {
  movementState: 'IDLE',
  stamina: DEFAULT_MOVEMENT_TUNING.staminaMax,
  staminaMax: DEFAULT_MOVEMENT_TUNING.staminaMax,
  isExhausted: false,
  speed: 0,
  grounded: true,
  onSteepSlope: false,
  isCrouching: false,
  pointerLocked: false,
  fps: 60,
  posY: 0,
  parkourPrompt: null,
  combatState: 'IDLE',
  activeAttack: 'NONE',
  comboWindowOpen: false,
  enemyState: 'IDLE',
  forwardPhase: 'NONE',
  hitMarkerActive: false,
};

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<AshlineEngine | null>(null);

  const [phase, setPhase] = useState<GamePhase>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') return 'playing';
    }
    return 'title';
  });
  const [showFilesModalOnTitle, setShowFilesModalOnTitle] = useState(false);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [tuning, setTuning] = useState<MovementTuning>(DEFAULT_MOVEMENT_TUNING);
  const [muted, setMuted] = useState(false);

  const phaseRef = useRef<GamePhase>(phase);
  phaseRef.current = phase;

  const enterPlaying = useCallback(() => {
    setShowFilesModalOnTitle(false);
    setPhase('playing');
    engineRef.current?.setPhase('playing');
  }, []);

  const enterPaused = useCallback(() => {
    setPhase('paused');
    engineRef.current?.setPhase('paused');
  }, []);

  const returnToTitle = useCallback(() => {
    setShowFilesModalOnTitle(false);
    setPhase('title');
    engineRef.current?.resetPlayerSpawn();
    engineRef.current?.setPhase('title');
  }, []);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      engineRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const handleResetSpawn = useCallback(() => {
    engineRef.current?.resetPlayerSpawn();
  }, []);

  const handleUpdateTuning = useCallback((next: MovementTuning) => {
    setTuning(next);
    engineRef.current?.updateTuning(next);
  }, []);

  // Mirror game state to document.body.dataset.state
  useEffect(() => {
    document.body.dataset.state = phase;
  }, [phase]);

  // Mount Three.js engine once
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const engine = new AshlineEngine(container, DEFAULT_MOVEMENT_TUNING, {
      onHudUpdate: (snapshot) => setHud(snapshot),
      onPauseRequested: () => {
        setPhase('paused');
        engine.setPhase('paused');
      },
    });
    engineRef.current = engine;
    engine.setPhase(phaseRef.current);

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Global keyboard shortcuts across Title / Playing / Paused
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (phaseRef.current === 'title') {
        if (showFilesModalOnTitle && e.code === 'Escape') {
          e.preventDefault();
          setShowFilesModalOnTitle(false);
          return;
        }
        if (!showFilesModalOnTitle && (e.code === 'Enter' || e.code === 'Space')) {
          e.preventDefault();
          enterPlaying();
        }
        return;
      }

      if (phaseRef.current === 'paused') {
        if (e.code === 'Escape' || e.code === 'KeyP') {
          e.preventDefault();
          enterPlaying();
        }
        return;
      }

      if (phaseRef.current === 'playing') {
        if (e.code === 'Escape' || e.code === 'KeyP') {
          e.preventDefault();
          enterPaused();
          return;
        }
        if (e.code === 'KeyM' && !e.repeat) {
          handleToggleMute();
        } else if (e.code === 'KeyR' && !e.repeat) {
          handleResetSpawn();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enterPaused, enterPlaying, handleResetSpawn, handleToggleMute, showFilesModalOnTitle]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#1a1d20]">
      {/* Isolated WebGL canvas container */}
      <div
        ref={mountRef}
        data-testid="game-viewport"
        className="fixed inset-0 w-full h-full"
      />

      {phase === 'title' && !showFilesModalOnTitle && (
        <TitleOverlay
          onStart={enterPlaying}
          onOpenFiles={() => setShowFilesModalOnTitle(true)}
        />
      )}

      {phase === 'title' && showFilesModalOnTitle && (
        <PauseModal
          canResume={false}
          initialTab="godot"
          tuning={tuning}
          onUpdateTuning={handleUpdateTuning}
          onResume={enterPlaying}
          onResetSpawn={handleResetSpawn}
          onReturnToTitle={() => setShowFilesModalOnTitle(false)}
        />
      )}

      {phase === 'playing' && (
        <GameplayHud
          hud={hud}
          muted={muted}
          onToggleMute={handleToggleMute}
          onResetSpawn={handleResetSpawn}
          onPause={enterPaused}
        />
      )}

      {phase === 'paused' && (
        <PauseModal
          canResume={true}
          initialTab="tuning"
          tuning={tuning}
          onUpdateTuning={handleUpdateTuning}
          onResume={enterPlaying}
          onResetSpawn={handleResetSpawn}
          onReturnToTitle={returnToTitle}
        />
      )}
    </main>
  );
}
