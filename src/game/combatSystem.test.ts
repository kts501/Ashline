import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCombatSimState,
  createTestEnemyState,
  detectHookContact,
  detectStrikeContact,
  ENEMY_RADIUS,
  getEnemyLeftXZ,
  HOOK_TOTAL_DURATION,
  PLAYER_RADIUS,
  resolvePlayerEnemySeparation,
  stepCombatAndEnemy,
  type CombatAttackType,
  type EnemyForwardPhase,
} from './combatSystem';
import { createMovementGymColliders, type GymColliders } from './gymLayout';
import { createPlayerSimState, stepPlayerMovement } from './movementPhysics';
import { DEFAULT_MOVEMENT_TUNING } from './movementTuning';

test('right-hand hook transitions IDLE -> ATTACKING -> CONTACT -> RECOVERY -> IDLE with single contact per attack', () => {
  const colliders = createMovementGymColliders();
  const combat = createCombatSimState();
  const enemy = createTestEnemyState({ x: 0, y: 0, z: 18.6, yaw: 0, trackPlayer: false });
  const player = { x: 0, y: 0, z: 20.1, eyeHeight: 1.68, yaw: 0, movementState: 'IDLE' as const };

  let attackStarts = 0;
  let contactCount = 0;
  let attackFinishes = 0;
  let sawAttacking = false;
  let sawContact = false;
  let sawRecovery = false;
  let sawEnemyStagger = false;
  let sawEnemyRecover = false;
  let enemyRecoveredEvent = false;

  const dt = 0.02;
  for (let i = 0; i < 80; i++) {
    // Attempt to hold / spam attack press on frames 0..10 -> only frame 0 should trigger!
    const pressed = i < 10;
    const ev = stepCombatAndEnemy(combat, enemy, player, colliders, pressed, dt);
    if (ev.attackStarted) attackStarts++;
    if (ev.contactRegistered) contactCount++;
    if (ev.attackFinished) attackFinishes++;
    if (ev.enemyRecovered) enemyRecoveredEvent = true;

    if (combat.state === 'ATTACKING') sawAttacking = true;
    if (combat.state === 'CONTACT') sawContact = true;
    if (combat.state === 'RECOVERY') sawRecovery = true;
    if (enemy.state === 'STAGGERING') sawEnemyStagger = true;
    if (enemy.state === 'RECOVERING') sawEnemyRecover = true;
  }

  assert.equal(attackStarts, 1, 'Spamming attack input during swing/cooldown must not double-trigger');
  assert.equal(contactCount, 1, 'One attack must register at most one contact');
  assert.equal(attackFinishes, 1);
  assert.ok(sawAttacking && sawContact && sawRecovery, 'Expected full IDLE -> ATTACKING -> CONTACT -> RECOVERY lifecycle');
  assert.equal(combat.state, 'IDLE');
  assert.ok(sawEnemyStagger && sawEnemyRecover && enemyRecoveredEvent, 'Expected enemy stagger and full recovery');
  assert.equal(enemy.state, 'IDLE');
  assert.equal(enemy.torsoRollZ, 0);
  assert.equal(enemy.headRollZ, 0);
});

test('enemy staggers consistently toward its own local left regardless of enemy orientation', () => {
  const colliders: GymColliders = { boxes: [], ramps: [], boundsRadius: 40 };

  const orientations = [0, Math.PI, Math.PI / 2, -Math.PI / 2];
  for (const enemyYaw of orientations) {
    const combat = createCombatSimState();
    const enemy = createTestEnemyState({
      x: 0,
      y: 0,
      z: 0,
      yaw: enemyYaw,
      trackPlayer: false,
    });
    const player = { x: 0, y: 0, z: 1.5, eyeHeight: 1.68, yaw: 0, movementState: 'IDLE' as const };

    let peakTorsoRoll = 0;
    let peakHeadRoll = 0;
    let peakTorsoYaw = 0;
    let maxLeftDot = -Infinity;
    const expectedLeft = getEnemyLeftXZ(enemyYaw);

    for (let i = 0; i < 45; i++) {
      stepCombatAndEnemy(combat, enemy, player, colliders, i === 0, 0.02);
      peakTorsoRoll = Math.min(peakTorsoRoll, enemy.torsoRollZ);
      peakHeadRoll = Math.min(peakHeadRoll, enemy.headRollZ);
      peakTorsoYaw = Math.max(peakTorsoYaw, enemy.torsoYawY);
      const dispX = enemy.x - enemy.baseX;
      const dispZ = enemy.z - enemy.baseZ;
      const dot = dispX * expectedLeft.x + dispZ * expectedLeft.z;
      maxLeftDot = Math.max(maxLeftDot, dot);
    }

    assert.ok(
      peakTorsoRoll < -0.2,
      `Expected negative local Z roll (lean toward enemy's own left +X) at yaw=${enemyYaw}, got ${peakTorsoRoll}`
    );
    assert.ok(peakHeadRoll < -0.15, `Expected head roll toward enemy's left at yaw=${enemyYaw}`);
    assert.ok(peakTorsoYaw > 0.15, `Expected torso yaw toward enemy's left at yaw=${enemyYaw}`);
    assert.ok(
      maxLeftDot > 0.18,
      `Expected world displacement along enemy's own left vector at yaw=${enemyYaw}, got dot=${maxLeftDot}`
    );
  }
});

test('missing attacks (out of range, facing away, invalid target) leave enemy unaffected', () => {
  const colliders = createMovementGymColliders();

  // 1. Out of range
  {
    const combat = createCombatSimState();
    const enemy = createTestEnemyState({ x: 0, y: 0, z: 18.6, yaw: 0, trackPlayer: false });
    const player = { x: 0, y: 0, z: 22.5, eyeHeight: 1.68, yaw: 0, movementState: 'IDLE' as const };
    let contacts = 0;
    for (let i = 0; i < 35; i++) {
      const ev = stepCombatAndEnemy(combat, enemy, player, colliders, i === 0, 0.02);
      if (ev.contactRegistered) contacts++;
    }
    assert.equal(contacts, 0);
    assert.equal(enemy.state, 'IDLE');
    assert.equal(combat.state, 'IDLE');
  }

  // 2. Facing away (180 degrees) within melee distance
  {
    const combat = createCombatSimState();
    const enemy = createTestEnemyState({ x: 0, y: 0, z: 18.6, yaw: 0, trackPlayer: false });
    const player = { x: 0, y: 0, z: 20.0, eyeHeight: 1.68, yaw: Math.PI, movementState: 'IDLE' as const };
    let contacts = 0;
    for (let i = 0; i < 35; i++) {
      const ev = stepCombatAndEnemy(combat, enemy, player, colliders, i === 0, 0.02);
      if (ev.contactRegistered) contacts++;
    }
    assert.equal(contacts, 0);
    assert.equal(enemy.state, 'IDLE');
  }

  // 3. Invalid enemy target
  {
    const enemy = createTestEnemyState({ x: 0, y: 0, z: 18.6, yaw: 0 });
    enemy.valid = false;
    const player = { x: 0, y: 0, z: 20.0, eyeHeight: 1.68, yaw: 0, movementState: 'IDLE' as const };
    const res = detectHookContact(player, enemy, colliders);
    assert.equal(res.hit, false);
    assert.equal(res.reason, 'invalid');
  }
});

test('solid walls block attack contact detection for both hook and follow-up strike', () => {
  const colliders = createMovementGymColliders();
  // occlude_wall_check sits at x:23..28, y:0..4, z:12..13
  const enemy = createTestEnemyState({ x: 25.5, y: 0, z: 11.4, yaw: 0, trackPlayer: false });
  const player = { x: 25.5, y: 0, z: 13.4, eyeHeight: 1.68, yaw: 0, movementState: 'IDLE' as const };

  const hookContact = detectHookContact(player, enemy, colliders);
  assert.equal(hookContact.hit, false);
  assert.equal(hookContact.reason, 'occluded');

  const followContact = detectStrikeContact(player, enemy, colliders, 'FOLLOW_UP_STRIKE');
  assert.equal(followContact.hit, false);
  assert.equal(followContact.reason, 'occluded');
});

test('combat coexists cleanly with movement states and blocks during committed parkour', () => {
  const colliders = createMovementGymColliders();
  const tuning = DEFAULT_MOVEMENT_TUNING;
  const player = createPlayerSimState(tuning, { x: 0, y: 0, z: 21.0, yaw: 0 });
  const enemy = createTestEnemyState({ x: 0, y: 0, z: 18.6, yaw: 0 });
  const combat = createCombatSimState();

  let hitWhileWalking = false;
  for (let i = 0; i < 65; i++) {
    stepPlayerMovement(
      player,
      {
        forward: 1,
        right: 0,
        sprintHeld: false,
        crouchHeld: false,
        jumpPressed: false,
        jumpHeld: false,
        jumpReleased: false,
        yaw: 0,
      },
      tuning,
      colliders,
      0.02
    );
    resolvePlayerEnemySeparation(player, enemy);
    const ev = stepCombatAndEnemy(
      combat,
      enemy,
      {
        x: player.x,
        y: player.y,
        z: player.z,
        eyeHeight: player.eyeHeight,
        yaw: player.yaw,
        movementState: player.movementState,
      },
      colliders,
      i === 20,
      0.02
    );
    if (ev.contactRegistered) hitWhileWalking = true;
    const dist = Math.hypot(player.x - enemy.x, player.z - enemy.z);
    assert.ok(dist >= 0.72, `Expected player to remain outside enemy body radius, got dist=${dist}`);
  }
  assert.ok(hitWhileWalking, 'Expected right hook to connect while walking up to enemy');

  const blockedCombat = createCombatSimState();
  const blockedEv = stepCombatAndEnemy(
    blockedCombat,
    enemy,
    { x: 0, y: 0, z: 20.0, eyeHeight: 1.68, yaw: 0, movementState: 'VAULTING' },
    colliders,
    true,
    0.02
  );
  assert.equal(blockedEv.attackStarted, false);
  assert.equal(blockedCombat.state, 'IDLE');
});

test('combat timing and contact registration work reliably across different frame rates', () => {
  const colliders = createMovementGymColliders();

  const runAtDt = (dt: number) => {
    const combat = createCombatSimState();
    const enemy = createTestEnemyState({ x: 0, y: 0, z: 18.6, yaw: 0, trackPlayer: false });
    const player = { x: 0, y: 0, z: 20.1, eyeHeight: 1.68, yaw: 0, movementState: 'IDLE' as const };
    let contacts = 0;
    const totalSteps = Math.ceil((HOOK_TOTAL_DURATION + 0.8) / dt);
    for (let i = 0; i < totalSteps; i++) {
      const ev = stepCombatAndEnemy(combat, enemy, player, colliders, i === 0, dt);
      if (ev.contactRegistered) contacts++;
    }
    return { contacts, combatState: combat.state, enemyState: enemy.state };
  };

  const fast60 = runAtDt(1 / 60);
  const mod30 = runAtDt(1 / 30);
  const slow20 = runAtDt(0.05);

  assert.equal(fast60.contacts, 1);
  assert.equal(mod30.contacts, 1);
  assert.equal(slow20.contacts, 1);
  assert.equal(fast60.combatState, 'IDLE');
  assert.equal(mod30.combatState, 'IDLE');
  assert.equal(slow20.combatState, 'IDLE');
  assert.equal(fast60.enemyState, 'IDLE');
  assert.equal(slow20.enemyState, 'IDLE');
});

test('two-hit combo sequence triggers follow-up strike and 4-phase enemy forward lunge toward player', () => {
  const colliders = createMovementGymColliders();
  const combat = createCombatSimState();
  const enemy = createTestEnemyState({ x: 0, y: 0, z: 18.4, yaw: 0, trackPlayer: false });
  const player = { x: 0, y: 0, z: 20.2, eyeHeight: 1.68, yaw: 0, movementState: 'IDLE' as const };

  const startedAttacks: CombatAttackType[] = [];
  const contactAttacks: CombatAttackType[] = [];
  const forwardPhases = new Set<EnemyForwardPhase>();
  let peakTorsoPitchX = 0;
  let peakHipDrop = 0;
  let peakStride = 0;
  let maxEnemyZ = enemy.z;

  const dt = 0.02;
  for (let i = 0; i < 120; i++) {
    // Press LMB on frame 0 (Right Hook) and frame 14 (0.28s -> valid combo window)
    const pressed = i === 0 || i === 14;
    const ev = stepCombatAndEnemy(combat, enemy, player, colliders, pressed, dt);
    if (ev.attackStarted) startedAttacks.push(ev.attackType);
    if (ev.contactRegistered) contactAttacks.push(ev.contactAttackType);
    if (enemy.forwardPhase !== 'NONE') forwardPhases.add(enemy.forwardPhase);

    peakTorsoPitchX = Math.max(peakTorsoPitchX, enemy.torsoPitchX);
    peakHipDrop = Math.min(peakHipDrop, enemy.hipDropY);
    peakStride = Math.max(peakStride, enemy.stepStride);
    maxEnemyZ = Math.max(maxEnemyZ, enemy.z);
  }

  assert.deepEqual(startedAttacks, ['RIGHT_HOOK', 'FOLLOW_UP_STRIKE']);
  assert.deepEqual(contactAttacks, ['RIGHT_HOOK', 'FOLLOW_UP_STRIKE']);
  assert.ok(forwardPhases.has('INITIAL_REACTION'), 'Expected Phase A initial reaction');
  assert.ok(forwardPhases.has('FORWARD_DISPLACEMENT'), 'Expected Phase B forward displacement');
  assert.ok(forwardPhases.has('BALANCE_RECOVERY'), 'Expected Phase C balance recovery');
  assert.ok(forwardPhases.has('RETURN_TO_STANCE'), 'Expected Phase D return to stance');
  assert.ok(peakTorsoPitchX > 0.35, `Expected upper body forward fold (+X pitch), got ${peakTorsoPitchX}`);
  assert.ok(peakHipDrop < -0.04, `Expected grounded hip dip during step/fold, got ${peakHipDrop}`);
  assert.ok(peakStride > 0.6, `Expected forward leg stride, got ${peakStride}`);
  assert.ok(maxEnemyZ > 18.85, `Expected enemy to displace forward toward player (z=${maxEnemyZ})`);
  assert.equal(enemy.state, 'IDLE');
  assert.equal(enemy.forwardPhase, 'NONE');
  assert.equal(enemy.torsoPitchX, 0);
  assert.ok(enemy.z > 18.85, 'Expected enemy to remain at newly stepped grounded position after recovery');
});

test('combo window rejects too-early and too-late presses and never triggers a 3rd attack', () => {
  const colliders = createMovementGymColliders();

  // 1. Too early (frame 3 = 0.06s during hook windup) must NOT chain FOLLOW_UP_STRIKE
  {
    const combat = createCombatSimState();
    const enemy = createTestEnemyState({ x: 0, y: 0, z: 18.6, yaw: 0, trackPlayer: false });
    const player = { x: 0, y: 0, z: 20.1, eyeHeight: 1.68, yaw: 0, movementState: 'IDLE' as const };
    const attacks: CombatAttackType[] = [];
    for (let i = 0; i < 40; i++) {
      const ev = stepCombatAndEnemy(combat, enemy, player, colliders, i === 0 || i === 3, 0.02);
      if (ev.attackStarted) attacks.push(ev.attackType);
    }
    assert.deepEqual(attacks, ['RIGHT_HOOK'], 'Early click during windup must not queue follow-up strike');
  }

  // 2. Too late (after 0.74s post-hook grace) starts a fresh RIGHT_HOOK instead of FOLLOW_UP_STRIKE
  {
    const combat = createCombatSimState();
    const enemy = createTestEnemyState({ x: 0, y: 0, z: 18.6, yaw: 0, trackPlayer: false });
    const player = { x: 0, y: 0, z: 20.1, eyeHeight: 1.68, yaw: 0, movementState: 'IDLE' as const };
    const attacks: CombatAttackType[] = [];
    for (let i = 0; i < 90; i++) {
      // Frame 42 = 0.84s (well past 0.48s hook + 0.26s grace = 0.74s)
      const ev = stepCombatAndEnemy(combat, enemy, player, colliders, i === 0 || i === 42, 0.02);
      if (ev.attackStarted) attacks.push(ev.attackType);
    }
    assert.deepEqual(attacks, ['RIGHT_HOOK', 'RIGHT_HOOK']);
  }

  // 3. Pressing after FOLLOW_UP_STRIKE completes starts a fresh RIGHT_HOOK (never a 3rd combo hit)
  {
    const combat = createCombatSimState();
    const enemy = createTestEnemyState({ x: 0, y: 0, z: 18.0, yaw: 0, trackPlayer: false });
    const player = { x: 0, y: 0, z: 20.2, eyeHeight: 1.68, yaw: 0, movementState: 'IDLE' as const };
    const attacks: CombatAttackType[] = [];
    for (let i = 0; i < 110; i++) {
      // Frame 0: Hook -> Frame 14: Follow-Up -> Frame 65 (~1.30s, after follow-up + cooldown): fresh Hook
      const ev = stepCombatAndEnemy(
        combat,
        enemy,
        player,
        colliders,
        i === 0 || i === 14 || i === 65,
        0.02
      );
      if (ev.attackStarted) attacks.push(ev.attackType);
    }
    assert.deepEqual(attacks, ['RIGHT_HOOK', 'FOLLOW_UP_STRIKE', 'RIGHT_HOOK']);
  }
});

test('follow-up strike out of range or while enemy is already recovering from forward lunge does not re-trigger forward reaction', () => {
  const colliders = createMovementGymColliders();

  // 1. Out of range on both strikes -> Follow-up animation plays, zero forward stagger
  {
    const combat = createCombatSimState();
    const enemy = createTestEnemyState({ x: 0, y: 0, z: 16.0, yaw: 0, trackPlayer: false });
    const player = { x: 0, y: 0, z: 20.2, eyeHeight: 1.68, yaw: 0, movementState: 'IDLE' as const };
    const attacks: CombatAttackType[] = [];
    let contacts = 0;
    for (let i = 0; i < 65; i++) {
      const ev = stepCombatAndEnemy(combat, enemy, player, colliders, i === 0 || i === 14, 0.02);
      if (ev.attackStarted) attacks.push(ev.attackType);
      if (ev.contactRegistered) contacts++;
    }
    assert.deepEqual(attacks, ['RIGHT_HOOK', 'FOLLOW_UP_STRIKE']);
    assert.equal(contacts, 0);
    assert.equal(enemy.state, 'IDLE');
    assert.equal(enemy.z, 16.0);
  }

  // 2. Enemy already recovering from FORWARD_STAGGER is ineligible for another follow-up hit
  {
    const enemy = createTestEnemyState({ x: 0, y: 0, z: 18.6, yaw: 0, trackPlayer: false });
    enemy.state = 'RECOVERING';
    enemy.reactionType = 'FORWARD_STAGGER';
    enemy.forwardPhase = 'BALANCE_RECOVERY';
    const player = { x: 0, y: 0, z: 20.0, eyeHeight: 1.68, yaw: 0, movementState: 'IDLE' as const };
    const res = detectStrikeContact(player, enemy, colliders, 'FOLLOW_UP_STRIKE');
    assert.equal(res.hit, false);
    assert.equal(res.reason, 'ineligible_state');
  }
});

test('enemy forward lunge stops cleanly at walls and never passes through the player', () => {
  const colliders = createMovementGymColliders();

  // 1. Enemy near solid wall (occlude_wall_check has minZ=12, maxZ=13, x=23..28)
  // Place enemy on south side facing player at z=14.6, wait -> place enemy north of wall at z=11.4? No, wall is z=12..13!
  // Let's test wall collision directly in front of lunge: enemy at z=11.45 lunging toward +Z hits wall at z=12.0 - enemy.radius (11.62)
  {
    const wallColliders: GymColliders = {
      boxes: [
        {
          id: 'test_wall',
          minX: -5,
          maxX: 5,
          minY: 0,
          maxY: 3,
          minZ: 12.0,
          maxZ: 13.0,
          material: 'concrete',
        },
      ],
      ramps: [],
      boundsRadius: 40,
    };
    const combat = createCombatSimState();
    const enemy = createTestEnemyState({ x: 0, y: 0, z: 11.4, yaw: 0, trackPlayer: false });
    // Even if we trigger forward stagger directly toward +Z wall:
    const player = { x: 0, y: 0, z: 13.5, eyeHeight: 1.68, yaw: 0, movementState: 'IDLE' as const };
    // Simulate no-LOS check trigger via open detect? Wait: wall blocks LOS, so simulate enemy lunging toward a low curb/obstacle box (maxY=0.9) OR step enemy with forward stagger directly!
    wallColliders.boxes[0].maxY = 0.9; // chest height (1.1m) clears sightline, body box (0..0.9m) blocks enemy feet/torso!
    for (let i = 0; i < 95; i++) {
      stepCombatAndEnemy(combat, enemy, player, wallColliders, i === 0 || i === 14, 0.02);
      assert.ok(
        enemy.z <= 12.0 - ENEMY_RADIUS + 0.005,
        `Expected enemy to stop cleanly against obstacle wall at z<=11.62, got z=${enemy.z}`
      );
    }
  }

  // 2. Enemy close to player (0.95m away) must stop before passing through player cylinder
  {
    const combat = createCombatSimState();
    const enemy = createTestEnemyState({ x: 0, y: 0, z: 19.05, yaw: 0, trackPlayer: false });
    const player = { x: 0, y: 0, z: 20.0, eyeHeight: 1.68, yaw: 0, movementState: 'IDLE' as const };
    const minAllowed = PLAYER_RADIUS + ENEMY_RADIUS;

    for (let i = 0; i < 100; i++) {
      stepCombatAndEnemy(combat, enemy, player, colliders, i === 0 || i === 14, 0.02);
      const dist = Math.hypot(player.x - enemy.x, player.z - enemy.z);
      assert.ok(
        dist >= minAllowed - 0.005,
        `Expected enemy forward lunge never to overlap player (dist=${dist} < ${minAllowed})`
      );
      assert.ok(enemy.z < player.z, 'Expected enemy never to pass through player');
    }
  }
});

test('player can walk during two-hit combo and return cleanly to normal movement afterward', () => {
  const colliders = createMovementGymColliders();
  const tuning = DEFAULT_MOVEMENT_TUNING;
  const player = createPlayerSimState(tuning, { x: 0, y: 0, z: 21.2, yaw: 0 });
  const enemy = createTestEnemyState({ x: 0, y: 0, z: 18.6, yaw: 0 });
  const combat = createCombatSimState();

  const contacts: CombatAttackType[] = [];
  for (let i = 0; i < 110; i++) {
    // Walk forward into range for first 35 frames, then stand, then strafe right after combo completes
    const moveFwd = i < 35 ? 1 : 0;
    const moveRight = i > 85 ? 1 : 0;
    stepPlayerMovement(
      player,
      {
        forward: moveFwd,
        right: moveRight,
        sprintHeld: false,
        crouchHeld: false,
        jumpPressed: false,
        jumpHeld: false,
        jumpReleased: false,
        yaw: 0,
      },
      tuning,
      colliders,
      0.02
    );
    resolvePlayerEnemySeparation(player, enemy);
    const ev = stepCombatAndEnemy(
      combat,
      enemy,
      {
        x: player.x,
        y: player.y,
        z: player.z,
        eyeHeight: player.eyeHeight,
        yaw: player.yaw,
        movementState: player.movementState,
      },
      colliders,
      i === 22 || i === 36,
      0.02
    );
    if (ev.contactRegistered) contacts.push(ev.contactAttackType);
  }

  assert.deepEqual(contacts, ['RIGHT_HOOK', 'FOLLOW_UP_STRIKE']);
  assert.equal(combat.state, 'IDLE');
  assert.ok(player.x > 0.6, `Expected normal movement to resume cleanly after combo, got x=${player.x}`);
});

