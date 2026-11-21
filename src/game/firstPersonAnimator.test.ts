import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFirstPersonAnimState,
  stepFirstPersonAnimation,
  type FirstPersonAnimInput,
} from './firstPersonAnimator';

function makeAnimInput(overrides: Partial<FirstPersonAnimInput> = {}): FirstPersonAnimInput {
  return {
    movementState: 'IDLE',
    horizontalSpeed: 0,
    verticalVelocity: 0,
    grounded: true,
    isCrouching: false,
    pitch: 0,
    yawDelta: 0,
    pitchDelta: 0,
    activeParkour: null,
    events: {
      landedImpactSpeed: null,
      jumped: false,
      parkourStarted: null,
      parkourCompleted: null,
    },
    walkSpeed: 4.6,
    sprintSpeed: 7.4,
    ...overrides,
  };
}

test('walking and sprinting produce opposite-phase arm swing and athletic sprint curl', () => {
  const anim = createFirstPersonAnimState();
  let minLeft = Infinity;
  let maxLeft = -Infinity;
  let maxDiff = 0;

  for (let i = 0; i < 40; i++) {
    const pose = stepFirstPersonAnimation(
      anim,
      makeAnimInput({ movementState: 'WALK', horizontalSpeed: 4.6 }),
      0.02
    );
    minLeft = Math.min(minLeft, pose.leftArm.shoulderRot.x);
    maxLeft = Math.max(maxLeft, pose.leftArm.shoulderRot.x);
    maxDiff = Math.max(maxDiff, Math.abs(pose.leftArm.shoulderRot.x - pose.rightArm.shoulderRot.x));
  }
  assert.ok(maxLeft - minLeft > 0.12, 'Expected cyclic shoulder pitch swing during walk');
  assert.ok(maxDiff > 0.12, 'Expected opposite-phase left/right arm swing');

  let sprintPose = stepFirstPersonAnimation(
    anim,
    makeAnimInput({ movementState: 'SPRINT', horizontalSpeed: 7.4 }),
    0.02
  );
  for (let i = 0; i < 30; i++) {
    sprintPose = stepFirstPersonAnimation(
      anim,
      makeAnimInput({ movementState: 'SPRINT', horizontalSpeed: 7.4 }),
      0.02
    );
  }
  assert.ok(sprintPose.leftArm.elbowBend > 1.15, `Expected deeper sprint elbow bend, got ${sprintPose.leftArm.elbowBend}`);
  assert.ok(sprintPose.leftArm.fingerCurl > 0.65, `Expected clenched sprint fingers, got ${sprintPose.leftArm.fingerCurl}`);
});

test('crouching lowers rig and tucks shoulders tighter than idle', () => {
  const idleAnim = createFirstPersonAnimState();
  const crouchAnim = createFirstPersonAnimState();

  let idlePose = stepFirstPersonAnimation(idleAnim, makeAnimInput(), 0.02);
  let crouchPose = stepFirstPersonAnimation(
    crouchAnim,
    makeAnimInput({ movementState: 'CROUCH', isCrouching: true }),
    0.02
  );
  for (let i = 0; i < 25; i++) {
    idlePose = stepFirstPersonAnimation(idleAnim, makeAnimInput(), 0.02);
    crouchPose = stepFirstPersonAnimation(
      crouchAnim,
      makeAnimInput({ movementState: 'CROUCH', isCrouching: true }),
      0.02
    );
  }

  assert.ok(crouchPose.rigOffset.y < idlePose.rigOffset.y - 0.02);
  assert.ok(Math.abs(crouchPose.leftArm.shoulderPos.x) < Math.abs(idlePose.leftArm.shoulderPos.x));
});

test('falling splays fingers open and landing triggers downward absorption dip', () => {
  const anim = createFirstPersonAnimState();

  let fallPose = stepFirstPersonAnimation(
    anim,
    makeAnimInput({ movementState: 'AIRBORNE', grounded: false, verticalVelocity: -9.5 }),
    0.02
  );
  for (let i = 0; i < 25; i++) {
    fallPose = stepFirstPersonAnimation(
      anim,
      makeAnimInput({ movementState: 'AIRBORNE', grounded: false, verticalVelocity: -9.5 }),
      0.02
    );
  }
  assert.ok(fallPose.leftArm.fingerCurl < 0.25, `Expected splayed fingers while falling, got ${fallPose.leftArm.fingerCurl}`);
  assert.ok(fallPose.leftArm.shoulderRot.z < -0.2, 'Expected left arm to flare outward during fall');

  let minLandY = Infinity;
  for (let i = 0; i < 20; i++) {
    const pose = stepFirstPersonAnimation(
      anim,
      makeAnimInput({
        events: {
          landedImpactSpeed: i === 0 ? 9.5 : null,
          jumped: false,
          parkourStarted: null,
          parkourCompleted: null,
        },
      }),
      0.02
    );
    minLandY = Math.min(minLandY, pose.rigOffset.y);
  }
  assert.ok(minLandY < -0.03, `Expected downward landing absorption dip, got minY=${minLandY}`);
});

test('vault animation plants open left hand forward while right arm counter-balances', () => {
  const anim = createFirstPersonAnimState();
  let plantPose = stepFirstPersonAnimation(
    anim,
    makeAnimInput({
      movementState: 'VAULTING',
      grounded: false,
      activeParkour: { type: 'VAULT', progress: 0.3 },
    }),
    0.02
  );
  for (let i = 0; i < 12; i++) {
    plantPose = stepFirstPersonAnimation(
      anim,
      makeAnimInput({
        movementState: 'VAULTING',
        grounded: false,
        activeParkour: { type: 'VAULT', progress: 0.3 },
      }),
      0.02
    );
  }

  assert.ok(plantPose.leftArm.fingerCurl < 0.22, 'Expected open palm during vault plant');
  assert.ok(plantPose.leftArm.shoulderRot.x > plantPose.rightArm.shoulderRot.x + 0.4);
});

test('climb animation reaches forward with staggered hands and pulls upward', () => {
  const anim = createFirstPersonAnimState();
  let reachPose = stepFirstPersonAnimation(
    anim,
    makeAnimInput({
      movementState: 'CLIMBING',
      grounded: false,
      activeParkour: { type: 'CLIMB', progress: 0.22 },
    }),
    0.02
  );
  for (let i = 0; i < 10; i++) {
    reachPose = stepFirstPersonAnimation(
      anim,
      makeAnimInput({
        movementState: 'CLIMBING',
        grounded: false,
        activeParkour: { type: 'CLIMB', progress: 0.22 },
      }),
      0.02
    );
  }
  assert.ok(reachPose.leftArm.shoulderRot.x > 0.75, 'Expected left arm reaching up to crate ledge');
  assert.ok(reachPose.leftArm.shoulderRot.x > reachPose.rightArm.shoulderRot.x, 'Expected staggered left-lead climb');
});

test('mantle muscle-up reaches high for ledge catch then bends elbows and presses down', () => {
  const anim = createFirstPersonAnimState();

  // Phase 1: Ledge reach & grip (p=0.14..0.24)
  let catchPose = stepFirstPersonAnimation(
    anim,
    makeAnimInput({
      movementState: 'LEDGE_HANG',
      grounded: false,
      activeParkour: { type: 'MANTLE', variant: 'LEDGE_MANTLE', progress: 0.22, hangRatio: 0.28, obstacleRelY: 1.6 },
    }),
    0.02
  );
  for (let i = 0; i < 12; i++) {
    catchPose = stepFirstPersonAnimation(
      anim,
      makeAnimInput({
        movementState: 'LEDGE_HANG',
        grounded: false,
        activeParkour: { type: 'MANTLE', variant: 'LEDGE_MANTLE', progress: 0.22, hangRatio: 0.28, obstacleRelY: 1.6 },
      }),
      0.02
    );
  }
  assert.ok(catchPose.leftArm.shoulderRot.x > 1.05, `Expected high overhead ledge catch, got ${catchPose.leftArm.shoulderRot.x}`);
  assert.ok(catchPose.leftArm.elbowBend < 0.55, 'Expected extended arms during initial ledge grip');
  assert.ok(catchPose.leftArm.fingerCurl > 0.6, `Expected curled fingers gripping ledge, got ${catchPose.leftArm.fingerCurl}`);
  const catchElbow = catchPose.leftArm.elbowBend;

  // Phase 2: Pull-up (p=0.52) -> elbows bend sharply as player pulls chest up
  let pullPose = catchPose;
  for (let i = 0; i < 12; i++) {
    pullPose = stepFirstPersonAnimation(
      anim,
      makeAnimInput({
        movementState: 'MANTLING',
        grounded: false,
        activeParkour: { type: 'MANTLE', variant: 'LEDGE_MANTLE', progress: 0.52, hangRatio: 0.28, obstacleRelY: 1.1 },
      }),
      0.02
    );
  }
  assert.ok(pullPose.leftArm.elbowBend > catchElbow + 0.35, 'Expected elbows bending during pull-up');
  const pullShoulderX = pullPose.leftArm.shoulderRot.x;

  // Phase 3: Muscle-up top-out press (p=0.80) -> shoulders press downward
  let pressPose = pullPose;
  for (let i = 0; i < 12; i++) {
    pressPose = stepFirstPersonAnimation(
      anim,
      makeAnimInput({
        movementState: 'MANTLING',
        grounded: false,
        activeParkour: { type: 'MANTLE', variant: 'LEDGE_MANTLE', progress: 0.8, hangRatio: 0.28, obstacleRelY: 0.2 },
      }),
      0.02
    );
  }
  assert.ok(pressPose.leftArm.shoulderRot.x < pullShoulderX - 0.3, 'Expected arms pressing down during muscle-up top-out');
});

test('sliding pose braces left arm low-forward and tilts rig naturally', () => {
  const anim = createFirstPersonAnimState();
  let slidePose = stepFirstPersonAnimation(
    anim,
    makeAnimInput({ movementState: 'SLIDING', isSliding: true, horizontalSpeed: 7.5 }),
    0.02
  );
  for (let i = 0; i < 20; i++) {
    slidePose = stepFirstPersonAnimation(
      anim,
      makeAnimInput({ movementState: 'SLIDING', isSliding: true, horizontalSpeed: 6.5 }),
      0.02
    );
  }
  assert.ok(slidePose.rigOffset.y < -0.02, 'Expected lowered body rig during slide');
  assert.ok(slidePose.rigRot.z < -0.03, 'Expected subtle slide roll tilt');
  assert.ok(slidePose.leftArm.shoulderRot.x > slidePose.rightArm.shoulderRot.x + 0.4, 'Expected left arm bracing forward while right trails');
});

test('medium vault assists with right arm while quick vault keeps right arm counter-balanced back', () => {
  const quickAnim = createFirstPersonAnimState();
  const medAnim = createFirstPersonAnimState();

  let quickPose = stepFirstPersonAnimation(
    quickAnim,
    makeAnimInput({
      movementState: 'VAULTING',
      grounded: false,
      activeParkour: { type: 'VAULT', variant: 'QUICK_VAULT', progress: 0.32, obstacleRelY: 0.85 },
    }),
    0.02
  );
  let medPose = stepFirstPersonAnimation(
    medAnim,
    makeAnimInput({
      movementState: 'VAULTING',
      grounded: false,
      activeParkour: { type: 'VAULT', variant: 'MED_VAULT', progress: 0.32, obstacleRelY: 1.15 },
    }),
    0.02
  );
  for (let i = 0; i < 12; i++) {
    quickPose = stepFirstPersonAnimation(
      quickAnim,
      makeAnimInput({
        movementState: 'VAULTING',
        grounded: false,
        activeParkour: { type: 'VAULT', variant: 'QUICK_VAULT', progress: 0.32, obstacleRelY: 0.85 },
      }),
      0.02
    );
    medPose = stepFirstPersonAnimation(
      medAnim,
      makeAnimInput({
        movementState: 'VAULTING',
        grounded: false,
        activeParkour: { type: 'VAULT', variant: 'MED_VAULT', progress: 0.32, obstacleRelY: 1.15 },
      }),
      0.02
    );
  }
  assert.ok(
    medPose.rightArm.shoulderRot.x > quickPose.rightArm.shoulderRot.x + 0.5,
    'Expected right assist arm raised forward during medium vault compared to quick vault sweep'
  );
});

test('right-hand hook winds up, swings across target, guards left hand, and returns smoothly to idle', () => {
  const anim = createFirstPersonAnimState();
  let pose = stepFirstPersonAnimation(anim, makeAnimInput(), 0.02);
  for (let i = 0; i < 20; i++) {
    pose = stepFirstPersonAnimation(anim, makeAnimInput(), 0.02);
  }
  const baseRightY = pose.rightArm.shoulderRot.y;
  const baseRightX = pose.rightArm.shoulderRot.x;

  // Windup phase (p ~ 0.18): right arm pulls outward/back (-Y rot) & closes fist
  for (let i = 0; i < 6; i++) {
    pose = stepFirstPersonAnimation(
      anim,
      makeAnimInput({
        combat: { state: 'ATTACKING', progress: 0.18, hitRegistered: false },
      }),
      0.02
    );
  }
  const windupRotY = pose.rightArm.shoulderRot.y;
  assert.ok(
    windupRotY < baseRightY - 0.15,
    `Expected right shoulder windup outward, got ${windupRotY} vs ${baseRightY}`
  );
  assert.ok(pose.rightArm.fingerCurl > 0.72, 'Expected tight fist curl during hook windup');

  // Contact swing peak (p ~ 0.44): right arm sweeps forward (+X) & inward (+Y) across target while left arm guards
  for (let i = 0; i < 8; i++) {
    pose = stepFirstPersonAnimation(
      anim,
      makeAnimInput({
        combat: { state: 'CONTACT', progress: 0.44, hitRegistered: true },
      }),
      0.02
    );
  }
  const contactRotY = pose.rightArm.shoulderRot.y;
  const contactRotX = pose.rightArm.shoulderRot.x;
  assert.ok(
    contactRotY > windupRotY + 0.45,
    `Expected right hook arc sweeping inward across upper-body target (${contactRotY} vs ${windupRotY})`
  );
  assert.ok(
    contactRotX > baseRightX + 0.25,
    'Expected right arm raised toward upper-body impact zone'
  );
  assert.ok(
    pose.leftArm.elbowBend > 1.32,
    'Expected left arm raised into compact supporting guard'
  );

  // Return to idle after attack ends
  for (let i = 0; i < 35; i++) {
    pose = stepFirstPersonAnimation(anim, makeAnimInput({ combat: null }), 0.02);
  }
  assert.ok(
    Math.abs(pose.rightArm.shoulderRot.y - baseRightY) < 0.03,
    `Expected right arm to recover cleanly back to idle (${pose.rightArm.shoulderRot.y} vs ${baseRightY})`
  );
});

test('follow-up strike uses distinct left-hand body thrust, guards right hand, and recovers smoothly', () => {
  const anim = createFirstPersonAnimState();
  let pose = stepFirstPersonAnimation(anim, makeAnimInput(), 0.02);
  for (let i = 0; i < 20; i++) {
    pose = stepFirstPersonAnimation(anim, makeAnimInput(), 0.02);
  }
  const baseLeftY = pose.leftArm.shoulderRot.y;
  const baseLeftX = pose.leftArm.shoulderRot.x;
  const baseLeftElbow = pose.leftArm.elbowBend;

  // Load phase (p ~ 0.18): left arm coils outward (+Y rot) & closes fist
  for (let i = 0; i < 6; i++) {
    pose = stepFirstPersonAnimation(
      anim,
      makeAnimInput({
        combat: { state: 'ATTACKING', attackType: 'FOLLOW_UP_STRIKE', progress: 0.18, hitRegistered: false },
      }),
      0.02
    );
  }
  const windupLeftY = pose.leftArm.shoulderRot.y;
  assert.ok(
    windupLeftY > baseLeftY + 0.1,
    `Expected left arm windup outward (+Y rot), got ${windupLeftY} vs ${baseLeftY}`
  );
  assert.ok(pose.leftArm.fingerCurl > 0.72, 'Expected tight fist curl on follow-up strike');

  // Driving thrust contact (p ~ 0.44): left arm punches forward/inward (-Y rot, extended elbow) while right arm guards
  for (let i = 0; i < 8; i++) {
    pose = stepFirstPersonAnimation(
      anim,
      makeAnimInput({
        combat: { state: 'CONTACT', attackType: 'FOLLOW_UP_STRIKE', progress: 0.44, hitRegistered: true },
      }),
      0.02
    );
  }
  assert.ok(
    pose.leftArm.shoulderRot.y < windupLeftY - 0.35,
    `Expected left follow-up strike driving inward toward center (${pose.leftArm.shoulderRot.y} vs ${windupLeftY})`
  );
  assert.ok(
    pose.leftArm.shoulderRot.x > baseLeftX + 0.25,
    'Expected left arm driving forward into target'
  );
  assert.ok(
    pose.leftArm.elbowBend < baseLeftElbow - 0.2,
    `Expected elbow extension during driving body strike, got ${pose.leftArm.elbowBend}`
  );
  assert.ok(
    pose.rightArm.elbowBend > 1.32,
    'Expected right arm raised into compact supporting guard during left strike'
  );

  // Smooth recovery to idle
  for (let i = 0; i < 35; i++) {
    pose = stepFirstPersonAnimation(anim, makeAnimInput({ combat: null }), 0.02);
  }
  assert.ok(
    Math.abs(pose.leftArm.shoulderRot.y - baseLeftY) < 0.03,
    `Expected left arm to recover cleanly back to idle (${pose.leftArm.shoulderRot.y} vs ${baseLeftY})`
  );
});

