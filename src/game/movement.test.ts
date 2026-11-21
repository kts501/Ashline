import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MOVEMENT_TUNING } from './movementTuning';
import { createMovementGymColliders } from './gymLayout';
import {
  createPlayerSimState,
  stepPlayerMovement,
  type PlayerSimInput,
} from './movementPhysics';
import {
  canSprint,
  consumeSprint,
  createStaminaState,
  tickStaminaRecovery,
} from './staminaSystem';

function idleInput(overrides: Partial<PlayerSimInput> = {}): PlayerSimInput {
  return {
    forward: 0,
    right: 0,
    sprintHeld: false,
    crouchHeld: false,
    jumpPressed: false,
    jumpHeld: false,
    jumpReleased: false,
    yaw: 0,
    ...overrides,
  };
}

test('stamina exhaustion locks sprinting until recovery threshold is met', () => {
  const tuning = { ...DEFAULT_MOVEMENT_TUNING };
  const stamina = createStaminaState(tuning);

  // Drain stamina completely
  for (let i = 0; i < 200; i++) {
    consumeSprint(stamina, tuning, 0.05);
    tickStaminaRecovery(stamina, tuning, 0.05);
  }
  assert.equal(stamina.current, 0);
  assert.equal(stamina.isExhausted, true);
  assert.equal(canSprint(stamina), false);

  // Advance past regen delay (0.9s), check recovery before 25% threshold
  for (let i = 0; i < 22; i++) {
    tickStaminaRecovery(stamina, tuning, 0.05);
  }
  assert.equal(stamina.isExhausted, true);
  assert.equal(canSprint(stamina), false);

  // Continue recovering past 25% (25 stamina)
  for (let i = 0; i < 30; i++) {
    tickStaminaRecovery(stamina, tuning, 0.05);
  }
  assert.ok(stamina.current >= 25);
  assert.equal(stamina.isExhausted, false);
  assert.equal(canSprint(stamina), true);
});

test('walking and sprinting reach target speeds and emit footsteps', () => {
  const tuning = { ...DEFAULT_MOVEMENT_TUNING };
  const colliders = createMovementGymColliders();
  const player = createPlayerSimState(tuning, { x: 0, y: 0, z: 14, yaw: 0 });

  let footsteps = 0;
  for (let i = 0; i < 40; i++) {
    const ev = stepPlayerMovement(player, idleInput({ forward: 1 }), tuning, colliders, 0.025);
    if (ev.footstep) footsteps++;
  }
  assert.equal(player.movementState, 'WALK');
  assert.ok(Math.abs(Math.hypot(player.vx, player.vz) - tuning.walkSpeed) < 0.2);
  assert.ok(footsteps >= 2);

  for (let i = 0; i < 40; i++) {
    stepPlayerMovement(
      player,
      idleInput({ forward: 1, sprintHeld: true }),
      tuning,
      colliders,
      0.025
    );
  }
  assert.equal(player.movementState, 'SPRINT');
  assert.ok(Math.abs(Math.hypot(player.vx, player.vz) - tuning.sprintSpeed) < 0.2);
  assert.ok(player.stamina.current < tuning.staminaMax);
});

test('coyote time allows jumping briefly after stepping off a 2m ledge', () => {
  const tuning = { ...DEFAULT_MOVEMENT_TUNING };
  const colliders = createMovementGymColliders();
  // Stand right at capsule overhang edge of 2m deck (z=-4..0, x=-14..-10)
  const player = createPlayerSimState(tuning, { x: -12, y: 2.0, z: -4.24, yaw: 0 });
  player.vz = -4.6;

  // Walk off the ledge for 2 frames (0.04s < 0.11s coyoteTime)
  for (let i = 0; i < 2; i++) {
    stepPlayerMovement(player, idleInput({ forward: 1 }), tuning, colliders, 0.02);
  }
  assert.equal(player.grounded, false);
  assert.ok(player.coyoteTimer > 0);

  // Press jump during coyote window
  const ev = stepPlayerMovement(
    player,
    idleInput({ forward: 1, jumpPressed: true, jumpHeld: true }),
    tuning,
    colliders,
    0.02
  );
  assert.equal(ev.jumped, true);
  assert.ok(player.vy > 5.0);
});

test('jump buffering fires on touchdown when pressed slightly before landing', () => {
  const tuning = { ...DEFAULT_MOVEMENT_TUNING };
  const colliders = createMovementGymColliders();
  const player = createPlayerSimState(tuning, { x: 0, y: 0.25, z: 14, yaw: 0 });
  player.grounded = false;
  player.coyoteTimer = 0;
  player.vy = -4.0;

  // Press jump 0.04s before touching ground
  stepPlayerMovement(player, idleInput({ jumpPressed: true, jumpHeld: true }), tuning, colliders, 0.02);
  assert.ok(player.jumpBufferTimer > 0);

  // Touch ground then next tick should trigger buffered jump
  let jumpedOnLanding = false;
  for (let i = 0; i < 6; i++) {
    const ev = stepPlayerMovement(player, idleInput({ jumpHeld: true }), tuning, colliders, 0.02);
    if (ev.jumped) jumpedOnLanding = true;
  }
  assert.equal(jumpedOnLanding, true);
});

test('crouch duct (1.2m roof) blocks uncrouching until player exits tunnel', () => {
  const tuning = { ...DEFAULT_MOVEMENT_TUNING };
  const colliders = createMovementGymColliders();
  // Place player inside crouch duct (x: -1.8..1.8, z: -14..-6, roof bottom y=1.2)
  const player = createPlayerSimState(tuning, { x: 0, y: 0, z: -10, yaw: 0 });

  // Crouch first
  stepPlayerMovement(player, idleInput({ crouchHeld: true }), tuning, colliders, 0.02);
  assert.equal(player.isCrouching, true);

  // Release crouch while still under 1.2m duct roof -> must remain crouched!
  stepPlayerMovement(player, idleInput({ crouchHeld: false }), tuning, colliders, 0.02);
  assert.equal(player.isCrouching, true);
  assert.equal(player.movementState, 'CROUCH');

  // Move out of duct (z < -15) and release crouch -> can now stand up
  player.z = -15.5;
  stepPlayerMovement(player, idleInput({ crouchHeld: false }), tuning, colliders, 0.02);
  assert.equal(player.isCrouching, false);
});

test('0.5m step climbs automatically while 1.0m waist block stops walking player', () => {
  const tuning = { ...DEFAULT_MOVEMENT_TUNING };
  const colliders = createMovementGymColliders();

  // Approach 0.5m step at z=6 from z=7
  const stepTester = createPlayerSimState(tuning, { x: -12, y: 0, z: 6.5, yaw: 0 });
  for (let i = 0; i < 30; i++) {
    stepPlayerMovement(stepTester, idleInput({ forward: 1 }), tuning, colliders, 0.025);
  }
  assert.ok(stepTester.y >= 0.49, `Expected step up to >= 0.5m, got ${stepTester.y}`);

  // Approach 1.0m waist block at z=2.2 from z=3.0
  const wallTester = createPlayerSimState(tuning, { x: -6, y: 0, z: 3.0, yaw: 0 });
  for (let i = 0; i < 30; i++) {
    stepPlayerMovement(wallTester, idleInput({ forward: 1 }), tuning, colliders, 0.025);
  }
  assert.ok(wallTester.z >= 2.5, `Expected player blocked in front of 1m block, got z=${wallTester.z}`);
});

test('steep 50-degree ramp prevents climbing and induces downward slide', () => {
  const tuning = { ...DEFAULT_MOVEMENT_TUNING };
  const colliders = createMovementGymColliders();
  // Place player partway up the 50deg ramp (x=22, startZ=-5, endZ=-9)
  const player = createPlayerSimState(tuning, { x: 22, y: 1.8, z: -6.5, yaw: 0 });

  for (let i = 0; i < 15; i++) {
    stepPlayerMovement(player, idleInput({ forward: 1 }), tuning, colliders, 0.025);
  }
  assert.equal(player.onSteepSlope, true);
  assert.ok(player.vz > 0, 'Expected positive Z slide velocity down steep 50deg ramp');
});
