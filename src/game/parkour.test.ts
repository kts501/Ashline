import test from 'node:test';
import assert from 'node:assert/strict';
import { createMovementGymColliders } from './gymLayout';
import {
  createPlayerSimState,
  stepPlayerMovement,
  type PlayerSimInput,
} from './movementPhysics';
import { DEFAULT_MOVEMENT_TUNING } from './movementTuning';
import { detectParkourOpportunity } from './parkourDetector';

function makeInput(overrides: Partial<PlayerSimInput> = {}): PlayerSimInput {
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

test('vaulting over low barrier is smooth, non-teleporting, and preserves forward momentum', () => {
  const tuning = { ...DEFAULT_MOVEMENT_TUNING };
  const colliders = createMovementGymColliders();
  // vault_bar_1 is x: 5..9, z: 17.0..17.65, y: 0..0.92
  const player = createPlayerSimState(tuning, { x: 7.0, y: 0, z: 18.2, yaw: 0 });
  player.vz = -7.0; // sprinting forward

  const opp = detectParkourOpportunity(
    player.x,
    player.y,
    player.z,
    player.yaw,
    7.0,
    true,
    false,
    colliders,
    tuning
  );
  assert.ok(opp, 'Expected VAULT opportunity in front of vault_bar_1');
  assert.equal(opp.type, 'VAULT');

  const startEv = stepPlayerMovement(
    player,
    makeInput({ forward: 1, sprintHeld: true, jumpPressed: true, jumpHeld: true }),
    tuning,
    colliders,
    0.016
  );
  assert.equal(startEv.parkourStarted, 'VAULT');
  assert.equal(player.movementState, 'VAULTING');
  // Frame 1 must NOT teleport directly to endZ
  assert.ok(player.z > 17.6, `Should not teleport immediately past barrier: z=${player.z}`);

  let completed = false;
  let peakY = 0;
  for (let i = 0; i < 40; i++) {
    const ev = stepPlayerMovement(
      player,
      makeInput({ forward: 1, sprintHeld: true }),
      tuning,
      colliders,
      0.016
    );
    peakY = Math.max(peakY, player.y);
    if (ev.parkourCompleted === 'VAULT') {
      completed = true;
      break;
    }
  }

  assert.equal(completed, true);
  assert.ok(peakY > 0.92, `Expected vault arc to clear barrier height 0.92m, peakY=${peakY}`);
  assert.ok(player.z < 17.0, `Expected player to land on far side of barrier, z=${player.z}`);
  assert.equal(player.y, 0);
  assert.equal(player.grounded, true);
  assert.ok(Math.hypot(player.vx, player.vz) >= 5.0, 'Expected preserved forward momentum after vault');
});

test('climbing medium surface smoothly transitions onto platform top', () => {
  const tuning = { ...DEFAULT_MOVEMENT_TUNING };
  const colliders = createMovementGymColliders();
  // climb_crate_1 is x: -27.5..-23.5, z: 14.0..17.0, y: 0..1.1
  const player = createPlayerSimState(tuning, { x: -25.5, y: 0, z: 17.6, yaw: 0 });

  const startEv = stepPlayerMovement(
    player,
    makeInput({ forward: 1, jumpPressed: true, jumpHeld: true }),
    tuning,
    colliders,
    0.016
  );
  assert.equal(startEv.parkourStarted, 'CLIMB');
  assert.equal(player.movementState, 'CLIMBING');

  let completed = false;
  for (let i = 0; i < 40; i++) {
    const ev = stepPlayerMovement(player, makeInput({ forward: 1 }), tuning, colliders, 0.016);
    if (ev.parkourCompleted === 'CLIMB') {
      completed = true;
      break;
    }
  }

  assert.equal(completed, true);
  assert.equal(player.grounded, true);
  assert.ok(Math.abs(player.y - 1.1) < 0.01, `Expected player atop 1.1m crate, y=${player.y}`);
});

test('mantling high 2.0m wall pulls player cleanly onto ledge top', () => {
  const tuning = { ...DEFAULT_MOVEMENT_TUNING };
  const colliders = createMovementGymColliders();
  // wall_2m is x: -7.5..-4.0, z: -11.4..-9.3, y: 0..2.0
  const player = createPlayerSimState(tuning, { x: -5.75, y: 0, z: -8.6, yaw: 0 });

  const startEv = stepPlayerMovement(
    player,
    makeInput({ forward: 1, jumpPressed: true, jumpHeld: true }),
    tuning,
    colliders,
    0.016
  );
  assert.equal(startEv.parkourStarted, 'MANTLE');
  assert.equal(player.movementState, 'LEDGE_HANG');

  let sawHang = false;
  let sawMantlePull = false;
  let completed = false;
  for (let i = 0; i < 65; i++) {
    const ev = stepPlayerMovement(player, makeInput({ forward: 1 }), tuning, colliders, 0.016);
    const curState: string = player.movementState;
    if (curState === 'LEDGE_HANG') sawHang = true;
    if (curState === 'MANTLING') sawMantlePull = true;
    if (ev.parkourCompleted === 'MANTLE') {
      completed = true;
      break;
    }
  }

  assert.equal(sawHang, true, 'Expected visible brief LEDGE_HANG phase before pull-up');
  assert.equal(sawMantlePull, true, 'Expected MANTLING pull-up phase after hang');
  assert.equal(completed, true);
  assert.equal(player.grounded, true);
  assert.ok(Math.abs(player.y - 2.0) < 0.01, `Expected player atop 2.0m wall, y=${player.y}`);
});

test('mid-air ledge catch triggers mantle onto high rooftop when holding jump', () => {
  const tuning = { ...DEFAULT_MOVEMENT_TUNING };
  const colliders = createMovementGymColliders();
  // rooftop_c_midledge is x: -14.5..-10.5, z: -17.5..-15.5, y: 0..3.7
  // Simulate player jumping from gap_plat_2 (y=2.0) approaching at y=2.15 in air
  const player = createPlayerSimState(tuning, { x: -12.5, y: 2.15, z: -14.75, yaw: 0 });
  player.grounded = false;
  player.vy = 1.4;
  player.vz = -5.5;

  const ev = stepPlayerMovement(
    player,
    makeInput({ forward: 1, jumpHeld: true }),
    tuning,
    colliders,
    0.016
  );
  assert.equal(ev.parkourStarted, 'MANTLE');

  for (let i = 0; i < 60; i++) {
    stepPlayerMovement(player, makeInput({ forward: 1 }), tuning, colliders, 0.016);
  }
  assert.equal(player.grounded, true);
  assert.ok(Math.abs(player.y - 3.7) < 0.01);
});

test('wall occlusion prevents triggering vault/climb on obstacles behind solid walls', () => {
  const tuning = { ...DEFAULT_MOVEMENT_TUNING };
  const colliders = createMovementGymColliders();
  // occlude_wall_check is x: 23..28, z: 12..13, y: 0..4.0
  // occlude_box_behind is x: 24..27, z: 10.4..11.4, y: 0..1.1
  const player = createPlayerSimState(tuning, { x: 25.5, y: 0, z: 13.6, yaw: 0 });

  const opp = detectParkourOpportunity(
    player.x,
    player.y,
    player.z,
    player.yaw,
    4.6,
    true,
    false,
    colliders,
    tuning
  );
  assert.equal(opp, null, 'Must never detect parkourable box behind an intervening 4m wall');
});

test('chaining sprint and 3 consecutive vaults traverses entire vault lane seamlessly', () => {
  const tuning = { ...DEFAULT_MOVEMENT_TUNING };
  const colliders = createMovementGymColliders();
  // Vault barriers at z=17.0..17.65, z=11.2..11.85, z=5.4..6.15 along x=7.0
  const player = createPlayerSimState(tuning, { x: 7.0, y: 0, z: 20.5, yaw: 0 });

  let vaultCount = 0;
  for (let i = 0; i < 240; i++) {
    const nearVault = player.availableParkour?.type === 'VAULT';
    const ev = stepPlayerMovement(
      player,
      makeInput({
        forward: 1,
        sprintHeld: true,
        jumpPressed: nearVault,
        jumpHeld: nearVault,
      }),
      tuning,
      colliders,
      0.016
    );
    if (ev.parkourCompleted === 'VAULT') {
      vaultCount++;
    }
    if (player.z < 3.5) break;
  }

  assert.equal(vaultCount, 3, `Expected 3 chained vaults across vault lane, got ${vaultCount}`);
  assert.ok(player.z < 5.0, `Expected player past final barrier, z=${player.z}`);
});

test('rooftop narrow HVAC crouch duct enforces crouch clearance at y=4.1m', () => {
  const tuning = { ...DEFAULT_MOVEMENT_TUNING };
  const colliders = createMovementGymColliders();
  // Inside rooftop_b HVAC duct (x: -26.0..-23.8, z: -14.5..-8.5, floor y=4.1, roof minY=5.25)
  const player = createPlayerSimState(tuning, { x: -24.9, y: 4.1, z: -11.5, yaw: 0 });

  stepPlayerMovement(player, makeInput({ crouchHeld: true }), tuning, colliders, 0.02);
  assert.equal(player.isCrouching, true);

  // Release crouch inside HVAC duct -> must stay crouched
  stepPlayerMovement(player, makeInput({ crouchHeld: false }), tuning, colliders, 0.02);
  assert.equal(player.isCrouching, true);
  assert.equal(player.movementState, 'CROUCH');
});

test('sprint-into-contact vault retains sprint momentum even after brief barrier touch', () => {
  const tuning = { ...DEFAULT_MOVEMENT_TUNING };
  const colliders = createMovementGymColliders();
  // vault_bar_1 front face is z=17.65; start just outside and sprint straight into contact
  const player = createPlayerSimState(tuning, { x: 7.0, y: 0, z: 18.08, yaw: 0 });
  player.vz = -7.2;

  // Frame 1 hits barrier so resolveHorizontalBoxes zeroes vz
  stepPlayerMovement(
    player,
    makeInput({ forward: 1, sprintHeld: true }),
    tuning,
    colliders,
    0.016
  );
  assert.equal(player.vz, 0);

  // Frame 2 presses Space right after contact
  const ev = stepPlayerMovement(
    player,
    makeInput({ forward: 1, sprintHeld: true, jumpPressed: true, jumpHeld: true }),
    tuning,
    colliders,
    0.016
  );
  assert.equal(ev.parkourStarted, 'VAULT');
  assert.ok(
    player.activeParkour!.opportunity.exitSpeed >= 6.0,
    `Expected preserved sprint vault speed >= 6.0, got ${player.activeParkour!.opportunity.exitSpeed}`
  );
});

test('mid-air jump hold catches climb-height rooftop ledges cleanly', () => {
  const tuning = { ...DEFAULT_MOVEMENT_TUNING };
  const colliders = createMovementGymColliders();
  // rooftop_b is x: -29..-20.5, z: -16.5..-4.7, topY = 4.1
  // Simulate player jumping across gap from rooftop_a arriving at y=3.1 (1.0m below ledge -> CLIMB)
  const player = createPlayerSimState(tuning, { x: -25.0, y: 3.1, z: -4.0, yaw: 0 });
  player.grounded = false;
  player.vy = 0.5;
  player.vz = -5.2;

  const ev = stepPlayerMovement(
    player,
    makeInput({ forward: 1, jumpHeld: true }),
    tuning,
    colliders,
    0.016
  );
  assert.equal(ev.parkourStarted, 'CLIMB');
});

test('small vs medium obstacles produce distinct vaults while oversized walls are rejected', () => {
  const tuning = { ...DEFAULT_MOVEMENT_TUNING };
  const colliders = createMovementGymColliders();

  // Small 0.85m flow barrier -> QUICK_VAULT
  const quickOpp = detectParkourOpportunity(33.0, 0, 20.0, 0, 7.2, true, false, colliders, tuning);
  assert.ok(quickOpp);
  assert.equal(quickOpp.type, 'VAULT');
  assert.equal(quickOpp.variant, 'QUICK_VAULT');

  // Medium 1.15m flow barrier -> MED_VAULT (slower & higher clearance than QUICK_VAULT)
  const medOpp = detectParkourOpportunity(33.0, 0, 8.1, 0, 7.2, true, false, colliders, tuning);
  assert.ok(medOpp);
  assert.equal(medOpp.type, 'VAULT');
  assert.equal(medOpp.variant, 'MED_VAULT');
  assert.ok(medOpp.duration > quickOpp.duration, 'Expected medium vault to be more deliberate than quick vault');
  assert.ok(medOpp.exitSpeed < quickOpp.exitSpeed, 'Expected quick vault to retain higher speed');

  // Oversized 3.05m flow_plat_b from ground -> rejected cleanly
  const tooTall = detectParkourOpportunity(33.0, 0, -3.5, 0, 7.2, true, false, colliders, tuning);
  assert.equal(tooTall, null, 'Must never vault or climb oversized 3.05m wall from ground');
});

test('sprint slide preserves momentum, steers gently, clears 1.12m slide gate, and stops on solid walls', () => {
  const tuning = { ...DEFAULT_MOVEMENT_TUNING };
  const colliders = createMovementGymColliders();
  // Approach vault_slide_roof (x: 4.8..9.2, z: -0.6..1.2, clearance 1.12m) at sprint speed
  const player = createPlayerSimState(tuning, { x: 7.0, y: 0, z: 3.2, yaw: 0 });
  player.vz = -7.4;

  const startEv = stepPlayerMovement(
    player,
    makeInput({ forward: 1, sprintHeld: true, crouchHeld: true }),
    tuning,
    colliders,
    0.02
  );
  assert.equal(startEv.slideStarted, true);
  assert.equal(player.movementState, 'SLIDING');
  assert.ok(player.slideSpeed >= 7.4, 'Expected initial sprint momentum preserved/boosted');

  // Steer slightly right and hold crouch through the 1.12m gate
  let minEyeHeight = Infinity;
  let passedUnderGate = false;
  for (let i = 0; i < 45; i++) {
    stepPlayerMovement(
      player,
      makeInput({ forward: 1, right: 0.5, sprintHeld: true, crouchHeld: i < 26 }),
      tuning,
      colliders,
      0.02
    );
    minEyeHeight = Math.min(minEyeHeight, player.eyeHeight);
    if (player.z < -0.6 && player.z > -3.0) passedUnderGate = true;
  }

  assert.ok(minEyeHeight < 0.88, `Expected low slide camera eye height, got ${minEyeHeight}`);
  assert.equal(passedUnderGate, true, `Expected slide to traverse beneath 1.12m gate, z=${player.z}`);
  // After clearing gate with crouch released and Shift+W held, player smoothly stands & runs/sprints
  for (let i = 0; i < 15; i++) {
    stepPlayerMovement(player, makeInput({ forward: 1, sprintHeld: true }), tuning, colliders, 0.02);
  }
  assert.equal(player.isCrouching, false);
  assert.equal(player.isSliding, false);
  assert.equal(player.movementState, 'SPRINT');

  // Solid wall safety check: sliding straight into wall_2m (z=-9.3, height 2.0m) stops cleanly without clipping
  const wallSlider = createPlayerSimState(tuning, { x: -5.75, y: 0, z: -8.3, yaw: 0 });
  wallSlider.vz = -7.4;
  for (let i = 0; i < 20; i++) {
    stepPlayerMovement(wallSlider, makeInput({ forward: 1, crouchHeld: true }), tuning, colliders, 0.02);
  }
  assert.ok(wallSlider.z >= -9.3 + 0.34, `Must never slide through solid 2m wall, z=${wallSlider.z}`);
});

test('continuous parkour flow: Sprint -> Jump -> Ledge Grab -> Muscle-up -> Sprint across elevated gap', () => {
  const tuning = { ...DEFAULT_MOVEMENT_TUNING };
  const colliders = createMovementGymColliders();
  // Stand on flow_launch_a (y=1.15m, z: -1.5..2.2), sprint & jump across 2.7m gap to flow_plat_b (y=3.05m, z: -11.5..-4.2)
  const player = createPlayerSimState(tuning, { x: 33.0, y: 1.15, z: 1.4, yaw: 0 });
  player.vz = -7.4;

  let jumped = false;
  let sawHang = false;
  let sawMantle = false;
  let sprintAfterMantle = false;

  for (let i = 0; i < 150; i++) {
    const nearEdge = !jumped && player.z <= -1.0;
    const ev = stepPlayerMovement(
      player,
      makeInput({
        forward: 1,
        sprintHeld: true,
        jumpPressed: nearEdge,
        jumpHeld: false, // Even without holding Space mid-air, forward jump grabs reachable ledge
      }),
      tuning,
      colliders,
      0.016
    );
    if (ev.jumped) jumped = true;
    if (player.movementState === 'LEDGE_HANG') sawHang = true;
    if (player.movementState === 'MANTLING') sawMantle = true;
    if (sawMantle && player.grounded && player.movementState === 'SPRINT') {
      sprintAfterMantle = true;
      break;
    }
  }

  assert.equal(jumped, true, 'Expected launch jump from flow_launch_a edge');
  assert.equal(sawHang, true, 'Expected mid-air ledge catch into LEDGE_HANG');
  assert.equal(sawMantle, true, 'Expected muscle-up pull into MANTLING');
  assert.equal(sprintAfterMantle, true, 'Expected continuous transition back into SPRINT atop flow_plat_b');
  assert.ok(Math.abs(player.y - 3.05) < 0.02, `Expected player atop 3.05m flow_plat_b, y=${player.y}`);
});

test('Sprint -> Jump -> Vault -> Landing -> Running flow executes seamlessly', () => {
  const tuning = { ...DEFAULT_MOVEMENT_TUNING };
  const colliders = createMovementGymColliders();
  // Sprint and jump 3.2m before flow_med_vault (z: 6.5..7.45, y: 0..1.15) so jump arrives mid-air at barrier chest height
  const player = createPlayerSimState(tuning, { x: 33.0, y: 0, z: 10.8, yaw: 0 });
  player.vz = -7.4;

  let jumped = false;
  let vaulted = false;
  let runningAfterVault = false;

  for (let i = 0; i < 120; i++) {
    const shouldJump = i === 2;
    const ev = stepPlayerMovement(
      player,
      makeInput({
        forward: 1,
        sprintHeld: true,
        jumpPressed: shouldJump,
        jumpHeld: false,
      }),
      tuning,
      colliders,
      0.016
    );
    if (ev.jumped) jumped = true;
    if (ev.parkourStarted === 'VAULT') vaulted = true;
    if (vaulted && player.grounded && (player.movementState === 'SPRINT' || player.movementState === 'WALK')) {
      runningAfterVault = true;
      break;
    }
  }

  assert.equal(jumped, true);
  assert.equal(vaulted, true, 'Expected airborne jump-into-vault over quick barrier');
  assert.equal(runningAfterVault, true, 'Expected smooth landing straight back into running');
  assert.ok(player.z < 18.8, `Expected player past barrier, z=${player.z}`);
});

