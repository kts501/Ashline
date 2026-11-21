import type { MovementTuning } from './movementTuning';

export interface StaminaState {
  current: number;
  maximum: number;
  isExhausted: boolean;
  regenDelayTimer: number;
  drainedThisTick: boolean;
}

export function createStaminaState(tuning: MovementTuning): StaminaState {
  return {
    current: tuning.staminaMax,
    maximum: tuning.staminaMax,
    isExhausted: false,
    regenDelayTimer: 0,
    drainedThisTick: false,
  };
}

export function canSprint(state: StaminaState): boolean {
  return !state.isExhausted && state.current > 0.5;
}

export function consumeSprint(
  state: StaminaState,
  tuning: MovementTuning,
  dt: number
): boolean {
  if (dt <= 0) return false;
  let becameExhausted = false;
  state.drainedThisTick = true;
  state.regenDelayTimer = tuning.staminaRegenDelay;
  state.current = Math.max(0, state.current - tuning.sprintDrainPerSec * dt);
  if (state.current <= 0 && !state.isExhausted) {
    state.isExhausted = true;
    becameExhausted = true;
  }
  return becameExhausted;
}

export function tryConsumeCost(
  state: StaminaState,
  tuning: MovementTuning,
  cost: number
): { allowed: boolean; becameExhausted: boolean } {
  if (state.isExhausted || state.current < 1.0) {
    return { allowed: false, becameExhausted: false };
  }
  let becameExhausted = false;
  state.drainedThisTick = true;
  state.regenDelayTimer = tuning.staminaRegenDelay;
  state.current = Math.max(0, state.current - cost);
  if (state.current <= 0 && !state.isExhausted) {
    state.isExhausted = true;
    becameExhausted = true;
  }
  return { allowed: true, becameExhausted };
}

export function tryConsumeJump(
  state: StaminaState,
  tuning: MovementTuning
): { allowed: boolean; becameExhausted: boolean } {
  return tryConsumeCost(state, tuning, tuning.jumpStaminaCost);
}

export function tickStaminaRecovery(
  state: StaminaState,
  tuning: MovementTuning,
  dt: number
): void {
  state.maximum = tuning.staminaMax;
  if (dt <= 0) return;

  if (state.drainedThisTick) {
    state.drainedThisTick = false;
    return;
  }

  if (state.regenDelayTimer > 0) {
    state.regenDelayTimer = Math.max(0, state.regenDelayTimer - dt);
    return;
  }

  if (state.current < tuning.staminaMax) {
    state.current = Math.min(
      tuning.staminaMax,
      state.current + tuning.staminaRegenPerSec * dt
    );
    const recoveryFloor = tuning.staminaMax * tuning.exhaustionRecoveryRatio;
    if (state.isExhausted && state.current >= recoveryFloor) {
      state.isExhausted = false;
    }
  }
}
