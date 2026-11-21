import type { GymColliders } from './gymLayout';
import type { MovementTuning } from './movementTuning';
import {
  detectParkourOpportunity,
  type ParkourActionType,
  type ParkourOpportunity,
} from './parkourDetector';
import {
  canSprint,
  consumeSprint,
  createStaminaState,
  tickStaminaRecovery,
  tryConsumeCost,
  tryConsumeJump,
  type StaminaState,
} from './staminaSystem';

export type PlayerMovementState =
  | 'IDLE'
  | 'WALK'
  | 'SPRINT'
  | 'CROUCH'
  | 'SLIDING'
  | 'AIRBORNE'
  | 'VAULTING'
  | 'CLIMBING'
  | 'LEDGE_HANG'
  | 'MANTLING';

export interface ActiveParkourState {
  opportunity: ParkourOpportunity;
  elapsed: number;
  entryYaw: number;
}

export interface PlayerSimInput {
  forward: number; // +1 forward, -1 backward
  right: number;   // +1 right, -1 left
  sprintHeld: boolean;
  crouchHeld: boolean;
  jumpPressed: boolean;
  jumpHeld: boolean;
  jumpReleased: boolean;
  yaw: number; // radians
}

export interface PlayerSimState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  grounded: boolean;
  onSteepSlope: boolean;
  isCrouching: boolean;
  isSliding: boolean;
  slideTimer: number;
  slideCooldown: number;
  slideDirX: number;
  slideDirZ: number;
  slideSpeed: number;
  movementState: PlayerMovementState;
  coyoteTimer: number;
  jumpBufferTimer: number;
  lastFallSpeed: number;
  footstepDistance: number;
  eyeHeight: number;
  stamina: StaminaState;
  activeParkour: ActiveParkourState | null;
  availableParkour: ParkourOpportunity | null;
  recentHorizSpeed: number;
  recentHorizTimer: number;
}

export interface StepEvents {
  landedImpactSpeed: number | null;
  footstep: { speedRatio: number; isSprinting: boolean } | null;
  jumped: boolean;
  slideStarted: boolean;
  parkourStarted: ParkourActionType | null;
  parkourCompleted: ParkourActionType | null;
  becameExhausted: boolean;
}

const PLAYER_RADIUS = 0.36;
const STEP_UP_HEIGHT = 0.54;

export function createPlayerSimState(
  tuning: MovementTuning,
  spawn: { x: number; y: number; z: number; yaw?: number } = { x: 0, y: 0, z: 24, yaw: 0 }
): PlayerSimState {
  return {
    x: spawn.x,
    y: spawn.y,
    z: spawn.z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: spawn.yaw ?? 0,
    grounded: true,
    onSteepSlope: false,
    isCrouching: false,
    isSliding: false,
    slideTimer: 0,
    slideCooldown: 0,
    slideDirX: 0,
    slideDirZ: -1,
    slideSpeed: 0,
    movementState: 'IDLE',
    coyoteTimer: tuning.coyoteTime,
    jumpBufferTimer: 0,
    lastFallSpeed: 0,
    footstepDistance: 0,
    eyeHeight: tuning.standEyeHeight,
    stamina: createStaminaState(tuning),
    activeParkour: null,
    availableParkour: null,
    recentHorizSpeed: 0,
    recentHorizTimer: 0,
  };
}

export function getRampSurfaceY(
  x: number,
  z: number,
  colliders: GymColliders
): { y: number; angleDeg: number } | null {
  for (const ramp of colliders.ramps) {
    if (x + PLAYER_RADIUS * 0.5 < ramp.minX || x - PLAYER_RADIUS * 0.5 > ramp.maxX) {
      continue;
    }
    if (z <= ramp.startZ + 0.15 && z >= ramp.endZ - 0.15) {
      const t = Math.max(0, Math.min(1, (ramp.startZ - z) / (ramp.startZ - ramp.endZ)));
      return {
        y: ramp.baseY + t * (ramp.topY - ramp.baseY),
        angleDeg: ramp.angleDeg,
      };
    }
  }
  return null;
}

export function hasCeilingClearance(
  x: number,
  y: number,
  z: number,
  standHeight: number,
  colliders: GymColliders
): boolean {
  const headTop = y + standHeight;
  const checkRadius = PLAYER_RADIUS * 0.85;
  for (const box of colliders.boxes) {
    if (
      x + checkRadius > box.minX &&
      x - checkRadius < box.maxX &&
      z + checkRadius > box.minZ &&
      z - checkRadius < box.maxZ
    ) {
      if (headTop > box.minY + 0.02 && y + 0.4 < box.maxY) {
        return false;
      }
    }
  }
  return true;
}

function getFloorSupportY(
  x: number,
  y: number,
  z: number,
  colliders: GymColliders,
  maxSlopeDeg: number
): { floorY: number; steep: boolean } {
  let bestY = 0;
  let steep = false;

  for (const box of colliders.boxes) {
    if (
      x + PLAYER_RADIUS * 0.75 > box.minX &&
      x - PLAYER_RADIUS * 0.75 < box.maxX &&
      z + PLAYER_RADIUS * 0.75 > box.minZ &&
      z - PLAYER_RADIUS * 0.75 < box.maxZ
    ) {
      if (box.maxY <= y + STEP_UP_HEIGHT && box.maxY > bestY) {
        bestY = box.maxY;
        steep = false;
      }
    }
  }

  const rampHit = getRampSurfaceY(x, z, colliders);
  if (rampHit && rampHit.y <= y + STEP_UP_HEIGHT && rampHit.y >= bestY - 0.05) {
    bestY = rampHit.y;
    steep = rampHit.angleDeg > maxSlopeDeg;
  }

  return { floorY: bestY, steep };
}

function resolveHorizontalBoxes(
  x: number,
  y: number,
  z: number,
  playerHeight: number,
  colliders: GymColliders
): { x: number; z: number } {
  let rx = x;
  let rz = z;
  const topY = y + playerHeight;

  for (const box of colliders.boxes) {
    if (y >= box.maxY - 0.05 || topY <= box.minY + 0.02) {
      continue;
    }
    if (box.maxY - y <= STEP_UP_HEIGHT) {
      continue;
    }

    const closestX = Math.max(box.minX, Math.min(rx, box.maxX));
    const closestZ = Math.max(box.minZ, Math.min(rz, box.maxZ));
    const dx = rx - closestX;
    const dz = rz - closestZ;
    const distSq = dx * dx + dz * dz;

    if (distSq < PLAYER_RADIUS * PLAYER_RADIUS) {
      const dist = Math.sqrt(distSq);
      if (dist > 0.0001) {
        const push = PLAYER_RADIUS - dist;
        rx += (dx / dist) * push;
        rz += (dz / dist) * push;
      } else {
        const penLeft = Math.abs(rx - box.minX);
        const penRight = Math.abs(box.maxX - rx);
        const penFront = Math.abs(rz - box.minZ);
        const penBack = Math.abs(box.maxZ - rz);
        const minPen = Math.min(penLeft, penRight, penFront, penBack);
        if (minPen === penLeft) rx = box.minX - PLAYER_RADIUS;
        else if (minPen === penRight) rx = box.maxX + PLAYER_RADIUS;
        else if (minPen === penFront) rz = box.minZ - PLAYER_RADIUS;
        else rz = box.maxZ + PLAYER_RADIUS;
      }
    }
  }

  return { x: rx, z: rz };
}

function moveToward(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function advanceActiveParkour(
  state: PlayerSimState,
  tuning: MovementTuning,
  dt: number,
  events: StepEvents
): void {
  const active = state.activeParkour!;
  const opp = active.opportunity;
  active.elapsed += dt;
  const p = Math.min(1, active.elapsed / opp.duration);

  if (opp.type === 'VAULT') {
    const isSmall = opp.variant === 'QUICK_VAULT';
    const split = isSmall ? 0.46 : 0.5;
    if (p <= split) {
      const u = smoothstep(p / split);
      state.x = lerp(opp.startX, opp.apexX, p / split);
      state.z = lerp(opp.startZ, opp.apexZ, p / split);
      state.y = lerp(opp.startY, opp.apexY, u);
    } else {
      const u = (p - split) / (1 - split);
      const su = smoothstep(u);
      state.x = lerp(opp.apexX, opp.endX, u);
      state.z = lerp(opp.apexZ, opp.endZ, u);
      state.y = lerp(opp.apexY, opp.endY, su);
    }
    state.movementState = 'VAULTING';
    const targetVaultEye = isSmall ? tuning.crouchEyeHeight + 0.36 : tuning.crouchEyeHeight + 0.22;
    state.eyeHeight += (targetVaultEye - state.eyeHeight) * (1 - Math.exp(-15 * dt));
  } else if (opp.type === 'CLIMB') {
    const split = 0.52;
    if (p <= split) {
      const u = smoothstep(p / split);
      state.x = lerp(opp.startX, opp.apexX, u);
      state.z = lerp(opp.startZ, opp.apexZ, u);
      state.y = lerp(opp.startY, opp.apexY, u);
    } else {
      const u = smoothstep((p - split) / (1 - split));
      state.x = lerp(opp.apexX, opp.endX, u);
      state.z = lerp(opp.apexZ, opp.endZ, u);
      state.y = lerp(opp.apexY, opp.endY, u);
    }
    state.movementState = 'CLIMBING';
    state.eyeHeight += (tuning.standEyeHeight - state.eyeHeight) * (1 - Math.exp(-12 * dt));
  } else {
    // LEDGE GRAB -> BRIEF HANG -> MUSCLE-UP -> TOP-OUT
    const hangRatio = opp.hangRatio > 0 ? opp.hangRatio : 0.28;
    const pullEnd = 0.74;

    if (p < hangRatio) {
      // Phase 1: Reach forward, grip ledge, settle into brief physical hang
      const reachEnd = hangRatio * 0.45;
      const u = smoothstep(p / Math.max(0.05, reachEnd));
      state.x = lerp(opp.startX, opp.hangX, u);
      state.z = lerp(opp.startZ, opp.hangZ, u);
      state.y = lerp(opp.startY, opp.hangY, u);
      state.movementState = 'LEDGE_HANG';
      const hangEye = tuning.standEyeHeight - 0.1;
      state.eyeHeight += (hangEye - state.eyeHeight) * (1 - Math.exp(-16 * dt));
    } else if (p < pullEnd) {
      // Phase 2: Pull body upward past ledge lip while camera rises naturally
      const u = smoothstep((p - hangRatio) / (pullEnd - hangRatio));
      state.x = lerp(opp.hangX, opp.apexX, u);
      state.z = lerp(opp.hangZ, opp.apexZ, u);
      state.y = lerp(opp.hangY, opp.apexY, u);
      state.movementState = 'MANTLING';
      state.eyeHeight += (tuning.standEyeHeight - state.eyeHeight) * (1 - Math.exp(-12 * dt));
    } else {
      // Phase 3: Press over edge and step onto platform top
      const u = smoothstep((p - pullEnd) / (1 - pullEnd));
      state.x = lerp(opp.apexX, opp.endX, u);
      state.z = lerp(opp.apexZ, opp.endZ, u);
      state.y = lerp(opp.apexY, opp.endY, u);
      state.movementState = 'MANTLING';
      state.eyeHeight += (tuning.standEyeHeight - state.eyeHeight) * (1 - Math.exp(-14 * dt));
    }
  }

  state.grounded = false;
  state.onSteepSlope = false;
  state.lastFallSpeed = 0;

  if (p >= 1) {
    state.x = opp.endX;
    state.y = opp.endY;
    state.z = opp.endZ;
    const dirX = -Math.sin(state.yaw);
    const dirZ = -Math.cos(state.yaw);
    state.vx = dirX * opp.exitSpeed;
    state.vz = dirZ * opp.exitSpeed;
    state.vy = 0;
    state.grounded = true;
    state.coyoteTimer = tuning.coyoteTime;
    state.recentHorizSpeed = opp.exitSpeed;
    state.recentHorizTimer = 0.25;
    state.activeParkour = null;
    events.parkourCompleted = opp.type;
    events.footstep = { speedRatio: 0.75, isSprinting: opp.type === 'VAULT' };
  }

  tickStaminaRecovery(state.stamina, tuning, dt);
}

export function stepPlayerMovement(
  state: PlayerSimState,
  input: PlayerSimInput,
  tuning: MovementTuning,
  colliders: GymColliders,
  rawDt: number
): StepEvents {
  const dt = Math.min(Math.max(rawDt, 0), 0.05);
  const events: StepEvents = {
    landedImpactSpeed: null,
    footstep: null,
    jumped: false,
    slideStarted: false,
    parkourStarted: null,
    parkourCompleted: null,
    becameExhausted: false,
  };

  if (dt <= 0) return events;

  state.yaw = input.yaw;
  state.slideCooldown = Math.max(0, state.slideCooldown - dt);

  // Continue active parkour traversal smoothly until completion
  if (state.activeParkour !== null) {
    state.availableParkour = null;
    advanceActiveParkour(state, tuning, dt, events);
    return events;
  }

  // Scan for valid parkour opportunity ahead of the player (wall-occluded)
  const preHorizSpeed = Math.hypot(state.vx, state.vz);
  const approachSpeed = Math.max(
    preHorizSpeed,
    state.recentHorizTimer > 0 ? state.recentHorizSpeed : 0
  );
  state.availableParkour = detectParkourOpportunity(
    state.x,
    state.y,
    state.z,
    state.yaw,
    approachSpeed,
    state.grounded,
    state.isCrouching || state.isSliding,
    colliders,
    tuning
  );

  // Trigger Parkour:
  // - Ground Space press or buffered jump into obstacle
  // - Mid-air ledge catch (Space held/pressed, or forward jump into reachable ledge)
  // - Mid-air vault catch (Sprint -> Jump -> Vault over low/medium barrier)
  const airLedgeCatch =
    !state.grounded &&
    state.vy < 3.2 &&
    (((input.jumpHeld || input.jumpPressed) &&
      (state.availableParkour?.type === 'MANTLE' || state.availableParkour?.type === 'CLIMB')) ||
      (input.forward > 0.25 && state.vy <= 1.2 && state.availableParkour?.type === 'MANTLE'));

  const airVaultCatch =
    !state.grounded &&
    state.vy < 4.5 &&
    state.availableParkour?.type === 'VAULT' &&
    (input.jumpHeld ||
      input.jumpPressed ||
      (input.forward > 0.25 && approachSpeed > tuning.walkSpeed * 0.85));

  const groundParkourTrigger =
    state.grounded &&
    state.availableParkour !== null &&
    (input.jumpPressed || (state.jumpBufferTimer > 0 && input.forward > 0.1));

  if (state.availableParkour && (groundParkourTrigger || airLedgeCatch || airVaultCatch)) {
    const spend = tryConsumeCost(
      state.stamina,
      tuning,
      state.availableParkour.requiredStamina
    );
    if (spend.becameExhausted) events.becameExhausted = true;
    if (spend.allowed) {
      const opp = state.availableParkour;
      state.activeParkour = {
        opportunity: opp,
        elapsed: 0,
        entryYaw: state.yaw,
      };
      state.availableParkour = null;
      state.jumpBufferTimer = 0;
      state.coyoteTimer = 0;
      state.isSliding = false;
      state.isCrouching = false;
      state.vy = 0;
      state.movementState =
        opp.type === 'VAULT'
          ? 'VAULTING'
          : opp.type === 'CLIMB'
            ? 'CLIMBING'
            : 'LEDGE_HANG';
      events.parkourStarted = opp.type;
      return events;
    }
  }

  // Jump buffer update
  if (input.jumpPressed) {
    state.jumpBufferTimer = tuning.jumpBufferTime;
  } else {
    state.jumpBufferTimer = Math.max(0, state.jumpBufferTimer - dt);
  }

  // Slide vs Crouch handling (Sprint + Crouch -> Slide; otherwise Crouch with ceiling check)
  if (!state.isSliding) {
    const canStartSlide =
      !state.isCrouching &&
      state.grounded &&
      !state.onSteepSlope &&
      input.crouchHeld &&
      state.slideCooldown <= 0 &&
      (preHorizSpeed >= tuning.slideTriggerSpeed ||
        (state.recentHorizTimer > 0 &&
          state.recentHorizSpeed >= tuning.slideTriggerSpeed &&
          input.forward > 0.2));

    if (canStartSlide && preHorizSpeed > 0.5) {
      state.isSliding = true;
      state.isCrouching = false;
      state.slideTimer = 0;
      state.slideDirX = state.vx / preHorizSpeed;
      state.slideDirZ = state.vz / preHorizSpeed;
      state.slideSpeed = Math.min(
        8.8,
        Math.max(preHorizSpeed, tuning.sprintSpeed * 0.92) * tuning.slideInitialBoost
      );
      events.slideStarted = true;
    } else if (input.crouchHeld && !state.isCrouching) {
      state.isCrouching = true;
    } else if (
      !input.crouchHeld &&
      state.isCrouching &&
      hasCeilingClearance(state.x, state.y, state.z, tuning.standHeight, colliders)
    ) {
      state.isCrouching = false;
    }
  } else {
    state.slideTimer += dt;

    // Limited steering left/right during slide
    if (Math.abs(input.right) > 0.05) {
      const steerAngle = -input.right * tuning.slideSteerRate * dt;
      const cs = Math.cos(steerAngle);
      const sn = Math.sin(steerAngle);
      const nx = state.slideDirX * cs + state.slideDirZ * sn;
      const nz = -state.slideDirX * sn + state.slideDirZ * cs;
      const nLen = Math.hypot(nx, nz) || 1;
      state.slideDirX = nx / nLen;
      state.slideDirZ = nz / nLen;
    }

    // Gradual slide friction
    state.slideSpeed = Math.max(0, state.slideSpeed - tuning.slideFriction * dt);

    const standClear = hasCeilingClearance(
      state.x,
      state.y,
      state.z,
      tuning.standHeight,
      colliders
    );

    // Jump-out of slide if headroom is clear
    if (state.jumpBufferTimer > 0 && standClear) {
      const jumpSpend = tryConsumeJump(state.stamina, tuning);
      if (jumpSpend.becameExhausted) events.becameExhausted = true;
      if (jumpSpend.allowed) {
        state.isSliding = false;
        state.slideCooldown = 0.28;
        state.vy = tuning.jumpVelocity;
        state.grounded = false;
        state.coyoteTimer = 0;
        state.jumpBufferTimer = 0;
        events.jumped = true;
      }
    } else if (
      !state.grounded ||
      state.slideSpeed < tuning.slideMinSpeed ||
      state.slideTimer >= tuning.slideMaxDuration ||
      (!input.crouchHeld && state.slideTimer >= 0.22)
    ) {
      state.isSliding = false;
      state.slideCooldown = 0.26;
      state.isCrouching = input.crouchHeld || !standClear;
    }
  }

  // Coyote time update
  if (state.grounded && !state.onSteepSlope) {
    state.coyoteTimer = tuning.coyoteTime;
  } else {
    state.coyoteTimer = Math.max(0, state.coyoteTimer - dt);
    if (state.vy < 0) {
      state.lastFallSpeed = Math.max(state.lastFallSpeed, -state.vy);
    }
  }

  // Execute Jump if buffered and coyote available
  if (
    state.jumpBufferTimer > 0 &&
    state.coyoteTimer > 0 &&
    !state.isCrouching &&
    !state.isSliding
  ) {
    const jumpSpend = tryConsumeJump(state.stamina, tuning);
    if (jumpSpend.becameExhausted) events.becameExhausted = true;
    if (jumpSpend.allowed) {
      state.vy = tuning.jumpVelocity;
      state.grounded = false;
      state.coyoteTimer = 0;
      state.jumpBufferTimer = 0;
      events.jumped = true;
    }
  }

  // Variable jump cut
  if (!state.grounded && input.jumpReleased && state.vy > 0) {
    state.vy *= tuning.jumpCutMultiplier;
  }

  // World-space desired direction from yaw
  const sinY = Math.sin(state.yaw);
  const cosY = Math.cos(state.yaw);
  let moveX = -sinY * input.forward + cosY * input.right;
  let moveZ = -cosY * input.forward - sinY * input.right;
  const moveLen = Math.hypot(moveX, moveZ);
  if (moveLen > 0.001) {
    moveX /= moveLen;
    moveZ /= moveLen;
  } else {
    moveX = 0;
    moveZ = 0;
  }

  const wantsSprint =
    input.sprintHeld &&
    input.forward > 0.1 &&
    !state.isCrouching &&
    !state.isSliding &&
    state.grounded &&
    !state.onSteepSlope;
  const isSprinting = wantsSprint && canSprint(state.stamina);

  if (state.isSliding) {
    state.vx = state.slideDirX * state.slideSpeed;
    state.vz = state.slideDirZ * state.slideSpeed;
  } else {
    let targetSpeed = tuning.walkSpeed;
    if (state.isCrouching) {
      targetSpeed = tuning.crouchSpeed;
    } else if (isSprinting && moveLen > 0.01) {
      targetSpeed = tuning.sprintSpeed;
      if (consumeSprint(state.stamina, tuning, dt)) {
        events.becameExhausted = true;
      }
    }

    const targetVx = moveX * targetSpeed;
    const targetVz = moveZ * targetSpeed;

    const accel = state.grounded
      ? moveLen > 0.01
        ? tuning.groundAcceleration
        : tuning.groundDeceleration
      : tuning.airAcceleration;

    const dvx = targetVx - state.vx;
    const dvz = targetVz - state.vz;
    const dvLen = Math.hypot(dvx, dvz);
    const maxStep = accel * dt;
    if (dvLen <= maxStep) {
      state.vx = targetVx;
      state.vz = targetVz;
    } else if (dvLen > 0.0001) {
      state.vx += (dvx / dvLen) * maxStep;
      state.vz += (dvz / dvLen) * maxStep;
    }
  }

  // Steep slope slide push (+Z down the ramp) and prevent uphill climb
  if (state.onSteepSlope) {
    if (state.vz < 0) state.vz = 0;
    state.vz = Math.min(8.5, state.vz + 14.0 * dt);
    state.vx = moveToward(state.vx, 0, 8.0 * dt);
  }

  // Gravity
  if (!state.grounded || state.onSteepSlope) {
    state.vy -= tuning.gravity * dt;
  }

  const activeHeight =
    state.isCrouching || state.isSliding ? tuning.crouchHeight : tuning.standHeight;

  // Record brief momentum memory before wall collision zeroes velocity
  const preResolveSpeed = Math.hypot(state.vx, state.vz);
  if (preResolveSpeed > 0.25) {
    state.recentHorizSpeed = Math.max(
      preResolveSpeed,
      state.recentHorizTimer > 0 ? state.recentHorizSpeed * 0.96 : 0
    );
    state.recentHorizTimer = 0.22;
  } else {
    state.recentHorizTimer = Math.max(0, state.recentHorizTimer - dt);
  }

  // Integrate horizontal & resolve box collisions
  const nextX = state.x + state.vx * dt;
  const nextZ = state.z + state.vz * dt;
  const resolved = resolveHorizontalBoxes(nextX, state.y, nextZ, activeHeight, colliders);
  if (Math.abs(resolved.x - nextX) > 0.0005) state.vx = 0;
  if (Math.abs(resolved.z - nextZ) > 0.0005) state.vz = 0;
  state.x = resolved.x;
  state.z = resolved.z;

  if (state.isSliding) {
    const postSlideSpeed = Math.hypot(state.vx, state.vz);
    if (postSlideSpeed < tuning.slideMinSpeed * 0.65) {
      // Blocked by solid obstacle -> stop slide cleanly without penetrating
      state.isSliding = false;
      state.slideCooldown = 0.26;
      state.isCrouching =
        input.crouchHeld ||
        !hasCeilingClearance(state.x, state.y, state.z, tuning.standHeight, colliders);
    } else {
      state.slideSpeed = postSlideSpeed;
    }
  }

  // Integrate vertical & check ceiling/floor support
  state.y += state.vy * dt;

  for (const box of colliders.boxes) {
    if (
      state.x + PLAYER_RADIUS * 0.75 > box.minX &&
      state.x - PLAYER_RADIUS * 0.75 < box.maxX &&
      state.z + PLAYER_RADIUS * 0.75 > box.minZ &&
      state.z - PLAYER_RADIUS * 0.75 < box.maxZ
    ) {
      if (state.vy > 0 && state.y + activeHeight > box.minY && state.y < box.minY) {
        state.y = box.minY - activeHeight;
        state.vy = 0;
      }
    }
  }

  const support = getFloorSupportY(
    state.x,
    state.y,
    state.z,
    colliders,
    tuning.maxSlopeAngleDeg
  );

  const wasGrounded = state.grounded;
  if (state.y <= support.floorY + 0.04 && state.vy <= 0.1) {
    state.y = support.floorY;
    state.vy = 0;
    state.grounded = !support.steep;
    state.onSteepSlope = support.steep;

    if (!wasGrounded && state.grounded && state.lastFallSpeed > 2.5) {
      events.landedImpactSpeed = state.lastFallSpeed;
    }
    if (state.grounded) {
      state.lastFallSpeed = 0;
    }
  } else {
    state.grounded = false;
    state.onSteepSlope = false;
  }

  // Smooth eye height interpolation
  const targetEye = state.isSliding
    ? tuning.slideEyeHeight
    : state.isCrouching
      ? tuning.crouchEyeHeight
      : tuning.standEyeHeight;
  state.eyeHeight +=
    (targetEye - state.eyeHeight) * (1 - Math.exp(-tuning.crouchTransitionSpeed * dt));

  // Tick stamina recovery
  tickStaminaRecovery(state.stamina, tuning, dt);

  // Resolve HSM state
  const horizSpeed = Math.hypot(state.vx, state.vz);
  if (!state.grounded) {
    state.movementState = 'AIRBORNE';
  } else if (state.isSliding) {
    state.movementState = 'SLIDING';
  } else if (state.isCrouching) {
    state.movementState = 'CROUCH';
  } else if (isSprinting && horizSpeed > tuning.walkSpeed * 0.9) {
    state.movementState = 'SPRINT';
  } else if (horizSpeed > 0.25) {
    state.movementState = 'WALK';
  } else {
    state.movementState = 'IDLE';
  }

  // Footstep distance accumulator (suppressed while sliding)
  if (state.grounded && !state.isSliding && horizSpeed > 0.6) {
    state.footstepDistance += horizSpeed * dt;
    const interval = isSprinting ? 1.75 : state.isCrouching ? 1.35 : 1.55;
    if (state.footstepDistance >= interval) {
      state.footstepDistance = 0;
      events.footstep = {
        speedRatio: Math.min(1, horizSpeed / tuning.sprintSpeed),
        isSprinting,
      };
    }
  } else {
    state.footstepDistance = 0;
  }

  return events;
}
