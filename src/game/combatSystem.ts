import type { BoxCollider, GymColliders, RampCollider } from './gymLayout';
import type { PlayerMovementState } from './movementPhysics';

export type CombatAttackType = 'NONE' | 'RIGHT_HOOK' | 'FOLLOW_UP_STRIKE';
export type CombatState = 'IDLE' | 'ATTACKING' | 'CONTACT' | 'RECOVERY';
export type EnemyState =
  | 'IDLE'
  | 'ALERT'
  | 'STAGGERING'
  | 'FORWARD_STAGGER'
  | 'RECOVERING';
export type EnemyReactionType = 'NONE' | 'SIDEWAYS_STAGGER' | 'FORWARD_STAGGER';
export type EnemyForwardPhase =
  | 'NONE'
  | 'INITIAL_REACTION'
  | 'FORWARD_DISPLACEMENT'
  | 'BALANCE_RECOVERY'
  | 'RETURN_TO_STANCE';

// Attack 1: Right-Hand Hook timings
export const HOOK_WINDUP_END = 0.11;
export const HOOK_CONTACT_TIME = 0.2;
export const HOOK_CONTACT_WINDOW_START = 0.16;
export const HOOK_CONTACT_WINDOW_END = 0.25;
export const HOOK_RECOVERY_START = 0.27;
export const HOOK_TOTAL_DURATION = 0.48;
export const HOOK_COOLDOWN = 0.08;

// Combo Continuity Window (after Attack 1 impact -> brief post-hook grace)
export const HOOK_COMBO_WINDOW_START = 0.22;
export const HOOK_COMBO_CHAIN_TIME = 0.32;
export const HOOK_COMBO_POST_GRACE = 0.26;

// Attack 2: Left-Hand Follow-Up Body Strike timings
export const FOLLOWUP_WINDUP_END = 0.11;
export const FOLLOWUP_CONTACT_TIME = 0.21;
export const FOLLOWUP_CONTACT_WINDOW_START = 0.16;
export const FOLLOWUP_CONTACT_WINDOW_END = 0.26;
export const FOLLOWUP_RECOVERY_START = 0.29;
export const FOLLOWUP_TOTAL_DURATION = 0.5;
export const FOLLOWUP_COOLDOWN = 0.16;

// Enemy dimensions, reaction timings & collision bounds
export const ENEMY_RADIUS = 0.46;
export const PLAYER_RADIUS = 0.36;
export const ENEMY_CHEST_HEIGHT = 1.32;
export const ENEMY_MIDSECTION_HEIGHT = 1.1;
export const ENEMY_REACTION_DURATION = 0.64;
export const ENEMY_STAGGER_PEAK_RATIO = 0.28;

export const ENEMY_FORWARD_DURATION = 1.04;
export const ENEMY_FORWARD_MAX_STEP = 0.62;
export const ENEMY_ALERT_ENTER_DIST = 5.2;
export const ENEMY_ALERT_EXIT_DIST = 6.0;

// Strike detection geometry
export const HOOK_MAX_RANGE = 2.35;
export const FOLLOWUP_MAX_RANGE = 2.42;
export const HOOK_MIN_FACING_DOT = 0.5;
export const HOOK_MAX_VERTICAL_DIFF = 1.35;

const PARKOUR_BLOCKED_STATES: ReadonlySet<PlayerMovementState> = new Set([
  'VAULTING',
  'CLIMBING',
  'LEDGE_HANG',
  'MANTLING',
  'SLIDING',
]);

export interface EnemyPoseSnapshot {
  torsoRollZ: number;
  torsoYawY: number;
  torsoPitchX: number;
  headRollZ: number;
  headYawY: number;
  headPitchX: number;
}

export interface CombatSimState {
  state: CombatState;
  activeAttack: CombatAttackType;
  elapsed: number;
  duration: number;
  cooldownRemaining: number;
  comboWindowOpen: boolean;
  comboWindowRemaining: number;
  followUpQueued: boolean;
  contactChecked: boolean;
  contactRegistered: boolean;
  contactTimer: number;
  hitFlashTimer: number;
}

export interface EnemySimState {
  id: string;
  x: number;
  y: number;
  z: number;
  baseX: number;
  baseZ: number;
  /** Yaw in radians; enemy local +Z faces (sin(yaw), 0, cos(yaw)) */
  yaw: number;
  radius: number;
  height: number;
  valid: boolean;
  trackPlayer: boolean;
  state: EnemyState;
  reactionType: EnemyReactionType;
  forwardPhase: EnemyForwardPhase;
  reactionElapsed: number;
  reactionDuration: number;
  staggerStrength: number;
  lungeDirX: number;
  lungeDirZ: number;
  forwardAppliedDist: number;
  blendStartPose: EnemyPoseSnapshot;
  /** Enemy upper-body, head & leg pose outputs derived purely from enemy state */
  torsoRollZ: number;
  torsoYawY: number;
  torsoPitchX: number;
  headRollZ: number;
  headYawY: number;
  headPitchX: number;
  localStaggerX: number;
  hipDropY: number;
  stepStride: number;
  armFold: number;
  armBrace: number;
  alertBlend: number;
  hitFlash: number;
}

export interface CombatStepEvents {
  attackStarted: boolean;
  attackType: CombatAttackType;
  contactRegistered: boolean;
  contactAttackType: CombatAttackType;
  attackFinished: boolean;
  enemyRecovered: boolean;
}

export interface ContactDetectionResult {
  hit: boolean;
  reason:
    | 'hit'
    | 'invalid'
    | 'ineligible_state'
    | 'out_of_range'
    | 'not_in_front'
    | 'vertical_mismatch'
    | 'occluded';
  distance: number;
  facingDot: number;
}

export interface PlayerCombatPoseInput {
  x: number;
  y: number;
  z: number;
  eyeHeight: number;
  yaw: number;
  movementState: PlayerMovementState;
}

function zeroPoseSnapshot(): EnemyPoseSnapshot {
  return {
    torsoRollZ: 0,
    torsoYawY: 0,
    torsoPitchX: 0,
    headRollZ: 0,
    headYawY: 0,
    headPitchX: 0,
  };
}

export function createCombatSimState(): CombatSimState {
  return {
    state: 'IDLE',
    activeAttack: 'NONE',
    elapsed: 0,
    duration: HOOK_TOTAL_DURATION,
    cooldownRemaining: 0,
    comboWindowOpen: false,
    comboWindowRemaining: 0,
    followUpQueued: false,
    contactChecked: false,
    contactRegistered: false,
    contactTimer: 0,
    hitFlashTimer: 0,
  };
}

export function createTestEnemyState(
  spawn: { x?: number; y?: number; z?: number; yaw?: number; trackPlayer?: boolean } = {}
): EnemySimState {
  const x = spawn.x ?? 0;
  const z = spawn.z ?? 18.6;
  return {
    id: 'test_infected_01',
    x,
    y: spawn.y ?? 0,
    z,
    baseX: x,
    baseZ: z,
    yaw: spawn.yaw ?? 0, // 0 faces +Z (South toward player spawn at z=24)
    radius: ENEMY_RADIUS,
    height: 1.78,
    valid: true,
    trackPlayer: spawn.trackPlayer ?? true,
    state: 'IDLE',
    reactionType: 'NONE',
    forwardPhase: 'NONE',
    reactionElapsed: 0,
    reactionDuration: ENEMY_REACTION_DURATION,
    staggerStrength: 1.0,
    lungeDirX: 0,
    lungeDirZ: 1,
    forwardAppliedDist: 0,
    blendStartPose: zeroPoseSnapshot(),
    torsoRollZ: 0,
    torsoYawY: 0,
    torsoPitchX: 0,
    headRollZ: 0,
    headYawY: 0,
    headPitchX: 0,
    localStaggerX: 0,
    hipDropY: 0,
    stepStride: 0,
    armFold: 0,
    armBrace: 0,
    alertBlend: 0,
    hitFlash: 0,
  };
}

/**
 * Enemy faces local +Z -> (sin(yaw), 0, cos(yaw)).
 * Standing inside the enemy looking along local +Z with +Y up:
 * Enemy's own LEFT side is local +X -> (cos(yaw), 0, -sin(yaw)).
 */
export function getEnemyForwardXZ(yaw: number): { x: number; z: number } {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

export function getEnemyLeftXZ(yaw: number): { x: number; z: number } {
  return { x: Math.cos(yaw), z: -Math.sin(yaw) };
}

export function canStartRightHook(
  combat: CombatSimState,
  movementState: PlayerMovementState
): boolean {
  if (combat.state !== 'IDLE') return false;
  if (combat.cooldownRemaining > 0) return false;
  if (PARKOUR_BLOCKED_STATES.has(movementState)) return false;
  return true;
}

export function tryStartRightHook(
  combat: CombatSimState,
  movementState: PlayerMovementState
): boolean {
  if (!canStartRightHook(combat, movementState)) return false;
  combat.state = 'ATTACKING';
  combat.activeAttack = 'RIGHT_HOOK';
  combat.elapsed = 0;
  combat.duration = HOOK_TOTAL_DURATION;
  combat.comboWindowOpen = false;
  combat.comboWindowRemaining = 0;
  combat.followUpQueued = false;
  combat.contactChecked = false;
  combat.contactRegistered = false;
  combat.contactTimer = 0;
  return true;
}

function startFollowUpStrike(combat: CombatSimState): void {
  combat.state = 'ATTACKING';
  combat.activeAttack = 'FOLLOW_UP_STRIKE';
  combat.elapsed = 0;
  combat.duration = FOLLOWUP_TOTAL_DURATION;
  combat.comboWindowOpen = false;
  combat.comboWindowRemaining = 0;
  combat.followUpQueued = false;
  combat.contactChecked = false;
  combat.contactRegistered = false;
  combat.contactTimer = 0;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function normalizeAngle(rad: number): number {
  let a = rad;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function segmentIntersectsBox(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  box: BoxCollider
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;

  let tMin = 0;
  let tMax = 1;

  const checkAxis = (p0: number, d: number, minB: number, maxB: number): boolean => {
    if (Math.abs(d) < 1e-6) {
      return p0 >= minB && p0 <= maxB;
    }
    let t1 = (minB - p0) / d;
    let t2 = (maxB - p0) / d;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    return tMin <= tMax;
  };

  if (!checkAxis(ax, dx, box.minX, box.maxX)) return false;
  if (!checkAxis(ay, dy, box.minY, box.maxY)) return false;
  if (!checkAxis(az, dz, box.minZ, box.maxZ)) return false;
  return tMax > 0.02 && tMin < 0.98;
}

function segmentIntersectsRamp(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  ramp: RampCollider
): boolean {
  const steps = 8;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = ax + (bx - ax) * t;
    const py = ay + (by - ay) * t;
    const pz = az + (bz - az) * t;
    if (px >= ramp.minX && px <= ramp.maxX && pz <= ramp.startZ && pz >= ramp.endZ) {
      const u = clamp((ramp.startZ - pz) / Math.max(0.01, ramp.startZ - ramp.endZ), 0, 1);
      const surfY = ramp.baseY + u * (ramp.topY - ramp.baseY);
      if (py >= ramp.baseY && py <= surfY) {
        return true;
      }
    }
  }
  return false;
}

export function isLineOfSightBlocked(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  colliders: GymColliders
): boolean {
  for (const box of colliders.boxes) {
    if (segmentIntersectsBox(ax, ay, az, bx, by, bz, box)) {
      return true;
    }
  }
  for (const ramp of colliders.ramps) {
    if (segmentIntersectsRamp(ax, ay, az, bx, by, bz, ramp)) {
      return true;
    }
  }
  return false;
}

export function isEnemyEligibleForAttack(
  enemy: EnemySimState,
  attackType: CombatAttackType
): boolean {
  if (!enemy.valid) return false;
  if (attackType === 'RIGHT_HOOK') {
    // Allow starting a fresh hook when idle/alert or finishing recovery, never interrupting active peak stagger or forward lunge
    if (enemy.state === 'IDLE' || enemy.state === 'ALERT') return true;
    if (enemy.state === 'RECOVERING' && enemy.reactionType === 'SIDEWAYS_STAGGER') return true;
    return false;
  }
  if (attackType === 'FOLLOW_UP_STRIKE') {
    // Eligible if idle/alert or reacting/recovering from the opening sideways stagger;
    // Ineligible if already in or recovering from the forward stagger!
    if (enemy.reactionType === 'FORWARD_STAGGER') return false;
    return (
      enemy.state === 'IDLE' ||
      enemy.state === 'ALERT' ||
      enemy.state === 'STAGGERING' ||
      enemy.state === 'RECOVERING'
    );
  }
  return false;
}

export function detectStrikeContact(
  player: Pick<PlayerCombatPoseInput, 'x' | 'y' | 'z' | 'eyeHeight' | 'yaw'>,
  enemy: EnemySimState | null,
  colliders: GymColliders,
  attackType: CombatAttackType = 'RIGHT_HOOK'
): ContactDetectionResult {
  if (!enemy || !enemy.valid) {
    return { hit: false, reason: 'invalid', distance: Infinity, facingDot: 0 };
  }

  const dx = enemy.x - player.x;
  const dz = enemy.z - player.z;
  const horizDist = Math.hypot(dx, dz);

  // Player looks along (-sin(yaw), 0, -cos(yaw))
  const fwdX = -Math.sin(player.yaw);
  const fwdZ = -Math.cos(player.yaw);
  const dirX = horizDist > 1e-4 ? dx / horizDist : fwdX;
  const dirZ = horizDist > 1e-4 ? dz / horizDist : fwdZ;
  const facingDot = fwdX * dirX + fwdZ * dirZ;

  const maxRange = attackType === 'FOLLOW_UP_STRIKE' ? FOLLOWUP_MAX_RANGE : HOOK_MAX_RANGE;
  if (horizDist > maxRange) {
    return { hit: false, reason: 'out_of_range', distance: horizDist, facingDot };
  }

  if (horizDist > 0.25 && facingDot < HOOK_MIN_FACING_DOT) {
    return { hit: false, reason: 'not_in_front', distance: horizDist, facingDot };
  }

  const playerEyeY = player.y + player.eyeHeight;
  const targetHeight =
    attackType === 'FOLLOW_UP_STRIKE' ? ENEMY_MIDSECTION_HEIGHT : ENEMY_CHEST_HEIGHT;
  const enemyTargetY = enemy.y + targetHeight;
  if (Math.abs(enemyTargetY - playerEyeY) > HOOK_MAX_VERTICAL_DIFF) {
    return { hit: false, reason: 'vertical_mismatch', distance: horizDist, facingDot };
  }

  if (
    isLineOfSightBlocked(
      player.x,
      playerEyeY,
      player.z,
      enemy.x,
      enemyTargetY,
      enemy.z,
      colliders
    )
  ) {
    return { hit: false, reason: 'occluded', distance: horizDist, facingDot };
  }

  if (!isEnemyEligibleForAttack(enemy, attackType)) {
    return { hit: false, reason: 'ineligible_state', distance: horizDist, facingDot };
  }

  return { hit: true, reason: 'hit', distance: horizDist, facingDot };
}

export function detectHookContact(
  player: Pick<PlayerCombatPoseInput, 'x' | 'y' | 'z' | 'eyeHeight' | 'yaw'>,
  enemy: EnemySimState | null,
  colliders: GymColliders
): ContactDetectionResult {
  return detectStrikeContact(player, enemy, colliders, 'RIGHT_HOOK');
}

export function triggerEnemyLeftStagger(enemy: EnemySimState): void {
  if (!enemy.valid) return;
  enemy.state = 'STAGGERING';
  enemy.reactionType = 'SIDEWAYS_STAGGER';
  enemy.forwardPhase = 'NONE';
  enemy.reactionElapsed = 0;
  enemy.reactionDuration = ENEMY_REACTION_DURATION;
  enemy.staggerStrength = 1.0;
  enemy.forwardAppliedDist = 0;
  enemy.hitFlash = 1.0;
}

export function triggerEnemyForwardStagger(
  enemy: EnemySimState,
  player?: Pick<PlayerCombatPoseInput, 'x' | 'z'>
): void {
  if (!enemy.valid) return;

  // Capture current pose so entering forward stagger from sideways stagger/recovery has zero snap
  enemy.blendStartPose = {
    torsoRollZ: enemy.torsoRollZ,
    torsoYawY: enemy.torsoYawY,
    torsoPitchX: enemy.torsoPitchX,
    headRollZ: enemy.headRollZ,
    headYawY: enemy.headYawY,
    headPitchX: enemy.headPitchX,
  };

  // Anchor base position to current spot so forward step displaces smoothly from actual world position
  enemy.baseX = enemy.x;
  enemy.baseZ = enemy.z;
  enemy.forwardAppliedDist = 0;

  // Compute horizontal lunge direction toward the player (or along enemy's facing vector)
  const fwd = getEnemyForwardXZ(enemy.yaw);
  let dirX = fwd.x;
  let dirZ = fwd.z;
  if (player) {
    const px = player.x - enemy.x;
    const pz = player.z - enemy.z;
    const len = Math.hypot(px, pz);
    if (len > 0.05) {
      dirX = px / len;
      dirZ = pz / len;
    }
  }
  enemy.lungeDirX = dirX;
  enemy.lungeDirZ = dirZ;

  enemy.state = 'FORWARD_STAGGER';
  enemy.reactionType = 'FORWARD_STAGGER';
  enemy.forwardPhase = 'INITIAL_REACTION';
  enemy.reactionElapsed = 0;
  enemy.reactionDuration = ENEMY_FORWARD_DURATION;
  enemy.staggerStrength = 1.0;
  enemy.hitFlash = 1.0;
}

/**
 * Resolves enemy horizontal movement against gym walls/obstacles, ramps (tall ledges), arena perimeter,
 * and the player's collision cylinder so the enemy never clips through walls or passes through the player.
 */
function resolveEnemyStepCollision(
  candX: number,
  candY: number,
  candZ: number,
  enemy: EnemySimState,
  player: Pick<PlayerCombatPoseInput, 'x' | 'y' | 'z'>,
  colliders: GymColliders
): { x: number; z: number } {
  let rx = candX;
  let rz = candZ;
  const r = enemy.radius;
  const topY = candY + enemy.height;
  const stepTolerance = 0.25;

  // 1. Prevent passing through player cylinder
  if (player.y <= candY + enemy.height && player.y + 1.8 >= candY) {
    const dx = rx - player.x;
    const dz = rz - player.z;
    const dist = Math.hypot(dx, dz);
    const minDist = PLAYER_RADIUS + r;
    if (dist < minDist) {
      if (dist > 1e-4) {
        rx = player.x + (dx / dist) * minDist;
        rz = player.z + (dz / dist) * minDist;
      } else {
        rx -= enemy.lungeDirX * minDist;
        rz -= enemy.lungeDirZ * minDist;
      }
    }
  }

  // 2. Resolve solid boxes (walls, crates, pillars, barriers)
  for (const box of colliders.boxes) {
    if (candY >= box.maxY - 0.05 || topY <= box.minY + 0.02) {
      continue;
    }
    if (box.maxY - candY <= stepTolerance) {
      continue;
    }
    const closestX = clamp(rx, box.minX, box.maxX);
    const closestZ = clamp(rz, box.minZ, box.maxZ);
    const dx = rx - closestX;
    const dz = rz - closestZ;
    const distSq = dx * dx + dz * dz;
    if (distSq < r * r) {
      const dist = Math.sqrt(distSq);
      if (dist > 1e-4) {
        const push = r - dist;
        rx += (dx / dist) * push;
        rz += (dz / dist) * push;
      } else {
        const penLeft = Math.abs(rx - box.minX);
        const penRight = Math.abs(box.maxX - rx);
        const penFront = Math.abs(rz - box.minZ);
        const penBack = Math.abs(box.maxZ - rz);
        const minPen = Math.min(penLeft, penRight, penFront, penBack);
        if (minPen === penLeft) rx = box.minX - r;
        else if (minPen === penRight) rx = box.maxX + r;
        else if (minPen === penFront) rz = box.minZ - r;
        else rz = box.maxZ + r;
      }
    }
  }

  // 3. Re-enforce player separation if a wall push squeezed near the player
  if (player.y <= candY + enemy.height && player.y + 1.8 >= candY) {
    const dx = rx - player.x;
    const dz = rz - player.z;
    const dist = Math.hypot(dx, dz);
    const minDist = PLAYER_RADIUS + r;
    if (dist < minDist) {
      // Fall back to previous valid enemy spot if wedged between player and wall
      const prevDist = Math.hypot(enemy.x - player.x, enemy.z - player.z);
      if (prevDist >= minDist - 0.01) {
        rx = enemy.x;
        rz = enemy.z;
      }
    }
  }

  // 4. Arena bounds clamp
  const distFromCenter = Math.hypot(rx, rz);
  const maxR = Math.max(5, colliders.boundsRadius - r);
  if (distFromCenter > maxR && distFromCenter > 1e-4) {
    const scale = maxR / distFromCenter;
    rx *= scale;
    rz *= scale;
  }

  return { x: rx, z: rz };
}

export function stepCombatAndEnemy(
  combat: CombatSimState,
  enemy: EnemySimState,
  player: PlayerCombatPoseInput,
  colliders: GymColliders,
  attackPressed: boolean,
  rawDt: number
): CombatStepEvents {
  const dt = clamp(rawDt, 0.0001, 0.05);
  const events: CombatStepEvents = {
    attackStarted: false,
    attackType: 'NONE',
    contactRegistered: false,
    contactAttackType: 'NONE',
    attackFinished: false,
    enemyRecovered: false,
  };

  if (combat.cooldownRemaining > 0) {
    combat.cooldownRemaining = Math.max(0, combat.cooldownRemaining - dt);
  }
  if (combat.hitFlashTimer > 0) {
    combat.hitFlashTimer = Math.max(0, combat.hitFlashTimer - dt);
  }

  // Tick post-hook combo grace window while IDLE
  if (combat.state === 'IDLE' && combat.comboWindowRemaining > 0) {
    combat.comboWindowRemaining = Math.max(0, combat.comboWindowRemaining - dt);
    if (combat.comboWindowRemaining <= 0) {
      combat.comboWindowOpen = false;
    }
  }

  // Cancel active attack or combo window cleanly if player enters a committed parkour/slide state
  if (PARKOUR_BLOCKED_STATES.has(player.movementState)) {
    if (combat.state !== 'IDLE') {
      combat.state = 'IDLE';
      combat.activeAttack = 'NONE';
      combat.elapsed = 0;
      combat.contactChecked = false;
      combat.contactRegistered = false;
      combat.contactTimer = 0;
      combat.cooldownRemaining = HOOK_COOLDOWN;
    }
    combat.comboWindowOpen = false;
    combat.comboWindowRemaining = 0;
    combat.followUpQueued = false;
  }

  // Handle attack input edge:
  // 1) During post-hook IDLE combo grace window -> immediately trigger FOLLOW_UP_STRIKE
  // 2) During RIGHT_HOOK active combo window (>= HOOK_COMBO_WINDOW_START) -> queue FOLLOW_UP_STRIKE cleanly
  // 3) Pressing too early during hook windup (< HOOK_COMBO_WINDOW_START) -> ignored (no unpredictable queue)
  // 4) Otherwise while IDLE -> trigger RIGHT_HOOK
  if (attackPressed && !PARKOUR_BLOCKED_STATES.has(player.movementState)) {
    if (combat.state === 'IDLE' && combat.comboWindowOpen && combat.comboWindowRemaining > 0) {
      startFollowUpStrike(combat);
      events.attackStarted = true;
      events.attackType = 'FOLLOW_UP_STRIKE';
    } else if (
      combat.state !== 'IDLE' &&
      combat.activeAttack === 'RIGHT_HOOK' &&
      combat.elapsed >= HOOK_COMBO_WINDOW_START
    ) {
      combat.comboWindowOpen = true;
      combat.followUpQueued = true;
    } else if (tryStartRightHook(combat, player.movementState)) {
      events.attackStarted = true;
      events.attackType = 'RIGHT_HOOK';
    }
  }

  // Step Combat State Machine
  if (combat.state !== 'IDLE') {
    combat.elapsed += dt;

    const isHook = combat.activeAttack === 'RIGHT_HOOK';
    const contactStart = isHook ? HOOK_CONTACT_WINDOW_START : FOLLOWUP_CONTACT_WINDOW_START;
    const contactApex = isHook ? HOOK_CONTACT_TIME : FOLLOWUP_CONTACT_TIME;
    const contactEnd = isHook ? HOOK_CONTACT_WINDOW_END : FOLLOWUP_CONTACT_WINDOW_END;
    const recoveryStart = isHook ? HOOK_RECOVERY_START : FOLLOWUP_RECOVERY_START;
    const totalDur = isHook ? HOOK_TOTAL_DURATION : FOLLOWUP_TOTAL_DURATION;

    if (isHook && combat.elapsed >= HOOK_COMBO_WINDOW_START) {
      combat.comboWindowOpen = true;
    }

    // Single contact registration check inside the active strike window
    if (
      !combat.contactRegistered &&
      !combat.contactChecked &&
      combat.elapsed >= contactStart &&
      combat.elapsed <= contactEnd
    ) {
      const result = detectStrikeContact(player, enemy, colliders, combat.activeAttack);
      if (result.hit) {
        combat.contactRegistered = true;
        combat.contactChecked = true;
        combat.state = 'CONTACT';
        combat.contactTimer = 0;
        combat.hitFlashTimer = isHook ? 0.16 : 0.19;
        if (isHook) {
          triggerEnemyLeftStagger(enemy);
        } else {
          triggerEnemyForwardStagger(enemy, player);
        }
        events.contactRegistered = true;
        events.contactAttackType = combat.activeAttack;
      } else if (combat.elapsed >= contactApex) {
        combat.contactChecked = true;
      }
    } else if (!combat.contactChecked && combat.elapsed > contactEnd) {
      combat.contactChecked = true;
    }

    // If follow-up strike was validly queued inside RIGHT_HOOK's combo window,
    // chain cleanly right after the hook's impact punch beat (HOOK_COMBO_CHAIN_TIME)
    if (isHook && combat.followUpQueued && combat.elapsed >= HOOK_COMBO_CHAIN_TIME) {
      startFollowUpStrike(combat);
      events.attackStarted = true;
      events.attackType = 'FOLLOW_UP_STRIKE';
    } else {
      if (combat.state === 'CONTACT') {
        combat.contactTimer += dt;
        if (combat.elapsed >= recoveryStart) {
          combat.state = 'RECOVERY';
        }
      } else if (combat.state === 'ATTACKING' && combat.elapsed >= recoveryStart) {
        combat.state = 'RECOVERY';
      }

      if (combat.elapsed >= totalDur) {
        const finishedHook = combat.activeAttack === 'RIGHT_HOOK';
        combat.state = 'IDLE';
        combat.activeAttack = 'NONE';
        combat.elapsed = 0;
        events.attackFinished = true;
        if (finishedHook) {
          combat.cooldownRemaining = 0;
          combat.comboWindowOpen = true;
          combat.comboWindowRemaining = HOOK_COMBO_POST_GRACE;
          combat.followUpQueued = false;
        } else {
          combat.cooldownRemaining = FOLLOWUP_COOLDOWN;
          combat.comboWindowOpen = false;
          combat.comboWindowRemaining = 0;
          combat.followUpQueued = false;
        }
      }
    }
  }

  // Step Enemy Orientation, Alertness & Stagger Reactions
  if (enemy.hitFlash > 0) {
    enemy.hitFlash = Math.max(0, enemy.hitFlash - dt * 5.5);
  }

  if (enemy.state === 'IDLE' || enemy.state === 'ALERT') {
    const dx = player.x - enemy.x;
    const dz = player.z - enemy.z;
    const dist = Math.hypot(dx, dz);

    if (enemy.trackPlayer) {
      if (enemy.state === 'IDLE' && dist <= ENEMY_ALERT_ENTER_DIST) {
        enemy.state = 'ALERT';
      } else if (enemy.state === 'ALERT' && dist > ENEMY_ALERT_EXIT_DIST) {
        enemy.state = 'IDLE';
      }

      if (dist > 0.2) {
        const targetYaw = Math.atan2(dx, dz); // local +Z faces (sin(yaw), cos(yaw))
        const diff = normalizeAngle(targetYaw - enemy.yaw);
        const turnRate = enemy.state === 'ALERT' ? 4.2 : 3.0;
        enemy.yaw = normalizeAngle(enemy.yaw + diff * (1 - Math.exp(-turnRate * dt)));
      }
    }

    const alertTarget = enemy.state === 'ALERT' ? 1 : 0;
    enemy.alertBlend += (alertTarget - enemy.alertBlend) * (1 - Math.exp(-8 * dt));

    const dampAlpha = 1 - Math.exp(-12 * dt);
    enemy.torsoRollZ *= 1 - dampAlpha;
    enemy.torsoYawY *= 1 - dampAlpha;
    enemy.torsoPitchX *= 1 - dampAlpha;
    enemy.headRollZ *= 1 - dampAlpha;
    enemy.headYawY *= 1 - dampAlpha;
    enemy.headPitchX *= 1 - dampAlpha;
    enemy.localStaggerX *= 1 - dampAlpha;
    enemy.hipDropY *= 1 - dampAlpha;
    enemy.stepStride *= 1 - dampAlpha;
    enemy.armFold *= 1 - dampAlpha;
    enemy.armBrace *= 1 - dampAlpha;

    // Gentle spring back to home stand spot after lateral sideways stagger (only if offset)
    const homeCandX = enemy.x + (enemy.baseX - enemy.x) * (1 - Math.exp(-6 * dt));
    const homeCandZ = enemy.z + (enemy.baseZ - enemy.z) * (1 - Math.exp(-6 * dt));
    const resolvedHome = resolveEnemyStepCollision(
      homeCandX,
      enemy.y,
      homeCandZ,
      enemy,
      player,
      colliders
    );
    enemy.x = resolvedHome.x;
    enemy.z = resolvedHome.z;
  } else if (enemy.reactionType === 'SIDEWAYS_STAGGER') {
    enemy.reactionElapsed += dt;
    const p = clamp(enemy.reactionElapsed / Math.max(0.05, enemy.reactionDuration), 0, 1);

    if (p >= ENEMY_STAGGER_PEAK_RATIO && enemy.state === 'STAGGERING') {
      enemy.state = 'RECOVERING';
    }

    const snapIn = clamp(p / 0.18, 0, 1);
    const snapEase = 1 - Math.pow(1 - snapIn, 3);
    const recoverOut =
      p <= 0.24 ? 1 : 1 - Math.pow(clamp((p - 0.24) / 0.76, 0, 1), 1.45);
    const envelope = snapEase * recoverOut;
    const instability = Math.sin(p * Math.PI * 3.5) * 0.14 * (1 - p) * (p > 0.14 ? 1 : 0);

    enemy.torsoRollZ = -(0.34 * envelope + instability);
    enemy.torsoYawY = 0.26 * envelope + instability * 0.45;
    enemy.torsoPitchX = -0.14 * envelope;

    const headSnap = 1 - Math.pow(1 - clamp(p / 0.13, 0, 1), 3);
    const headRecover =
      p <= 0.18 ? 1 : 1 - Math.pow(clamp((p - 0.18) / 0.82, 0, 1), 1.35);
    const headEnv = headSnap * headRecover;
    enemy.headRollZ = -(0.28 * headEnv + instability * 0.8);
    enemy.headYawY = 0.36 * headEnv;
    enemy.headPitchX = -0.12 * headEnv;

    enemy.hipDropY = -0.025 * envelope;
    enemy.stepStride = 0;
    enemy.armFold = 0;
    enemy.armBrace = 0;

    // Subtle step/shift toward enemy's own left in world space (collision-checked)
    const leftVec = getEnemyLeftXZ(enemy.yaw);
    const targetShift = 0.28 * envelope;
    enemy.localStaggerX = targetShift;
    const candX = enemy.baseX + leftVec.x * targetShift;
    const candZ = enemy.baseZ + leftVec.z * targetShift;
    const resolvedSide = resolveEnemyStepCollision(candX, enemy.y, candZ, enemy, player, colliders);
    enemy.x = resolvedSide.x;
    enemy.z = resolvedSide.z;

    if (p >= 1) {
      enemy.state = 'IDLE';
      enemy.reactionType = 'NONE';
      enemy.forwardPhase = 'NONE';
      enemy.reactionElapsed = 0;
      enemy.torsoRollZ = 0;
      enemy.torsoYawY = 0;
      enemy.torsoPitchX = 0;
      enemy.headRollZ = 0;
      enemy.headYawY = 0;
      enemy.headPitchX = 0;
      enemy.localStaggerX = 0;
      enemy.hipDropY = 0;
      enemy.x = enemy.baseX;
      enemy.z = enemy.baseZ;
      events.enemyRecovered = true;
    }
  } else if (enemy.reactionType === 'FORWARD_STAGGER') {
    enemy.reactionElapsed += dt;
    const p = clamp(enemy.reactionElapsed / Math.max(0.05, enemy.reactionDuration), 0, 1);

    // 4-Phase Forward Lunge Breakdown:
    // Phase A (0.00 -> 0.14): INITIAL_REACTION — upper body snaps/folds forward over midsection blow
    // Phase B (0.14 -> 0.48): FORWARD_DISPLACEMENT — center of balance tips forward; enemy steps toward player
    // Phase C (0.48 -> 0.78): BALANCE_RECOVERY — front foot plants, torso catches itself & struggles upright
    // Phase D (0.78 -> 1.00): RETURN_TO_STANCE — legs settle, upper body blends cleanly back to stance
    if (p < 0.14) {
      enemy.forwardPhase = 'INITIAL_REACTION';
      enemy.state = 'FORWARD_STAGGER';
    } else if (p < 0.48) {
      enemy.forwardPhase = 'FORWARD_DISPLACEMENT';
      enemy.state = 'FORWARD_STAGGER';
    } else if (p < 0.78) {
      enemy.forwardPhase = 'BALANCE_RECOVERY';
      enemy.state = 'RECOVERING';
    } else {
      enemy.forwardPhase = 'RETURN_TO_STANCE';
      enemy.state = 'RECOVERING';
    }

    // Smoothly orient yaw toward the lunge direction during initial fold & displacement
    if (p < 0.5) {
      const lungeYaw = Math.atan2(enemy.lungeDirX, enemy.lungeDirZ);
      const yawDiff = normalizeAngle(lungeYaw - enemy.yaw);
      enemy.yaw = normalizeAngle(enemy.yaw + yawDiff * (1 - Math.exp(-10 * dt)));
    }

    // Smooth blend weight out of any prior sideways-stagger pose during first 0.16 of forward stagger
    const priorBlend = 1 - smoothstep(0.0, 0.16, p);

    // Upper body forward fold curve (+X rotation pitches +Y toward +Z front!)
    const foldIn = smoothstep(0.0, 0.16, p);
    const foldDeep = smoothstep(0.14, 0.36, p) * (1 - smoothstep(0.46, 0.76, p));
    const foldOut = 1 - smoothstep(0.44, 0.94, p);
    const foldAmt = clamp(foldIn * foldOut + foldDeep * 0.22, 0, 1.15);

    // Controlled forward balance wobble during displacement & recovery
    const swayEnv = smoothstep(0.12, 0.24, p) * (1 - smoothstep(0.7, 0.96, p));
    const swayOsc = Math.sin((p - 0.12) * Math.PI * 3.2) * swayEnv;

    const targetTorsoPitchX = 0.48 * foldAmt;
    const targetTorsoRollZ = swayOsc * 0.11;
    const targetTorsoYawY = -0.1 * foldIn * foldOut + swayOsc * 0.08;

    // Head whips slightly back/down on initial gut fold, then cranes forward during recovery
    const headInitialDip = smoothstep(0.0, 0.12, p) * (1 - smoothstep(0.18, 0.48, p));
    const headLookUp = smoothstep(0.32, 0.58, p) * (1 - smoothstep(0.76, 1.0, p));
    const targetHeadPitchX = 0.28 * headInitialDip - 0.16 * headLookUp;
    const targetHeadRollZ = -swayOsc * 0.09;
    const targetHeadYawY = -0.08 * swayOsc;

    enemy.torsoPitchX = lerp(targetTorsoPitchX, enemy.blendStartPose.torsoPitchX, priorBlend);
    enemy.torsoRollZ = lerp(targetTorsoRollZ, enemy.blendStartPose.torsoRollZ, priorBlend);
    enemy.torsoYawY = lerp(targetTorsoYawY, enemy.blendStartPose.torsoYawY, priorBlend);
    enemy.headPitchX = lerp(targetHeadPitchX, enemy.blendStartPose.headPitchX, priorBlend);
    enemy.headRollZ = lerp(targetHeadRollZ, enemy.blendStartPose.headRollZ, priorBlend);
    enemy.headYawY = lerp(targetHeadYawY, enemy.blendStartPose.headYawY, priorBlend);
    enemy.localStaggerX *= priorBlend;

    // Arms pull toward abdomen on Phase A, then reach slightly forward to catch balance in Phase B/C
    enemy.armFold = smoothstep(0.0, 0.15, p) * (1 - smoothstep(0.28, 0.62, p));
    enemy.armBrace = smoothstep(0.18, 0.4, p) * (1 - smoothstep(0.68, 0.96, p));

    // Pelvis dip & forward stumbling stride synchronized with forward displacement
    const dipEnv = smoothstep(0.04, 0.24, p) * (1 - smoothstep(0.58, 0.94, p));
    enemy.hipDropY = -0.085 * dipEnv;

    // Step stride peaks in Phase B (right/left involuntary forward step) and recovers cleanly in Phase C/D
    const strideForward = smoothstep(0.1, 0.44, p) * (1 - smoothstep(0.56, 0.88, p));
    enemy.stepStride = strideForward;

    // Grounded forward world displacement along lungeDir (peaks at Phase B end ~0.50, holds valid new spot)
    const dispProgress = smoothstep(0.1, 0.48, p);
    const desiredTotalDisp = ENEMY_FORWARD_MAX_STEP * dispProgress;
    const stepDelta = desiredTotalDisp - enemy.forwardAppliedDist;
    if (Math.abs(stepDelta) > 1e-5) {
      const candX = enemy.x + enemy.lungeDirX * stepDelta;
      const candZ = enemy.z + enemy.lungeDirZ * stepDelta;
      const resolved = resolveEnemyStepCollision(candX, enemy.y, candZ, enemy, player, colliders);
      const actualMoveX = resolved.x - enemy.x;
      const actualMoveZ = resolved.z - enemy.z;
      const actualProj = actualMoveX * enemy.lungeDirX + actualMoveZ * enemy.lungeDirZ;
      enemy.x = resolved.x;
      enemy.z = resolved.z;
      enemy.forwardAppliedDist += Math.max(0, actualProj);
    }

    if (p >= 1) {
      // Lock recovered home position to the newly stepped valid world spot (no sliding back!)
      enemy.baseX = enemy.x;
      enemy.baseZ = enemy.z;
      enemy.state = 'IDLE';
      enemy.reactionType = 'NONE';
      enemy.forwardPhase = 'NONE';
      enemy.reactionElapsed = 0;
      enemy.forwardAppliedDist = 0;
      enemy.torsoRollZ = 0;
      enemy.torsoYawY = 0;
      enemy.torsoPitchX = 0;
      enemy.headRollZ = 0;
      enemy.headYawY = 0;
      enemy.headPitchX = 0;
      enemy.localStaggerX = 0;
      enemy.hipDropY = 0;
      enemy.stepStride = 0;
      enemy.armFold = 0;
      enemy.armBrace = 0;
      events.enemyRecovered = true;
    }
  }

  return events;
}

/**
 * Prevents the player from walking directly inside the test enemy cylinder.
 */
export function resolvePlayerEnemySeparation(
  player: { x: number; y: number; z: number },
  enemy: EnemySimState,
  playerRadius = PLAYER_RADIUS
): void {
  if (!enemy.valid) return;
  if (player.y > enemy.y + enemy.height || player.y + 1.8 < enemy.y) return;

  const dx = player.x - enemy.x;
  const dz = player.z - enemy.z;
  const dist = Math.hypot(dx, dz);
  const minDist = playerRadius + enemy.radius;
  if (dist < minDist) {
    if (dist > 1e-4) {
      const push = minDist - dist;
      player.x += (dx / dist) * push;
      player.z += (dz / dist) * push;
    } else {
      player.z += minDist;
    }
  }
}
