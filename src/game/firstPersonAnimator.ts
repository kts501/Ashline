import type { CombatAttackType, CombatState } from './combatSystem';
import type { PlayerMovementState, StepEvents } from './movementPhysics';
import type { ParkourActionType, ParkourVariant } from './parkourDetector';

export interface Vec3Pose {
  x: number;
  y: number;
  z: number;
}

export interface ArmPose {
  /** Shoulder anchor offset relative to body/camera rig */
  shoulderPos: Vec3Pose;
  /** Shoulder Euler rotation (x: pitch raise +, y: yaw inward, z: roll out) */
  shoulderRot: Vec3Pose;
  /** Elbow flexion in radians (0 = straight, ~1.4 = deep athletic bend) */
  elbowBend: number;
  /** Forearm pronation/supination twist around forearm axis */
  forearmTwist: number;
  /** Wrist Euler adjustments (x: pitch flex/extend, y: yaw, z: tilt) */
  wristRot: Vec3Pose;
  /** Finger curl 0 (splayed open) -> 1 (tight fist) */
  fingerCurl: number;
  /** Thumb opposition curl 0 -> 1 */
  thumbCurl: number;
}

export interface FirstPersonPose {
  rigOffset: Vec3Pose;
  rigRot: Vec3Pose;
  torsoPitchOffset: number;
  leftArm: ArmPose;
  rightArm: ArmPose;
}

export interface FirstPersonAnimInput {
  movementState: PlayerMovementState;
  horizontalSpeed: number;
  verticalVelocity: number;
  grounded: boolean;
  isCrouching: boolean;
  isSliding?: boolean;
  pitch: number;
  yawDelta: number;
  pitchDelta: number;
  activeParkour: {
    type: ParkourActionType;
    variant?: ParkourVariant;
    progress: number; // 0..1
    hangRatio?: number;
    obstacleRelY?: number;
  } | null;
  combat?: {
    state: CombatState;
    attackType?: CombatAttackType;
    progress: number; // 0..1 across active attack cycle
    hitRegistered: boolean;
  } | null;
  events: Pick<StepEvents, 'landedImpactSpeed' | 'jumped' | 'parkourStarted' | 'parkourCompleted'>;
  walkSpeed: number;
  sprintSpeed: number;
}

export interface FirstPersonAnimState {
  time: number;
  stridePhase: number;
  sprintBlend: number;
  crouchBlend: number;
  slideBlend: number;
  airBlend: number;
  fallIntensity: number;
  landingImpact: number;
  landingImpactVel: number;
  jumpImpulse: number;
  lookSwayX: number;
  lookSwayY: number;
  combatBlend: number;
  currentPose: FirstPersonPose;
}

function makeDefaultArmPose(side: -1 | 1): ArmPose {
  return {
    shoulderPos: { x: side * 0.22, y: -0.22, z: 0.07 },
    shoulderRot: { x: 0.9, y: -side * 0.18, z: side * 0.12 },
    elbowBend: 1.28,
    forearmTwist: side * 0.16,
    wristRot: { x: 0.04, y: 0, z: -side * 0.06 },
    fingerCurl: 0.44,
    thumbCurl: 0.36,
  };
}

export function createFirstPersonAnimState(): FirstPersonAnimState {
  return {
    time: 0,
    stridePhase: 0,
    sprintBlend: 0,
    crouchBlend: 0,
    slideBlend: 0,
    airBlend: 0,
    fallIntensity: 0,
    landingImpact: 0,
    landingImpactVel: 0,
    jumpImpulse: 0,
    lookSwayX: 0,
    lookSwayY: 0,
    combatBlend: 0,
    currentPose: {
      rigOffset: { x: 0, y: 0, z: 0 },
      rigRot: { x: 0, y: 0, z: 0 },
      torsoPitchOffset: 0,
      leftArm: makeDefaultArmPose(-1),
      rightArm: makeDefaultArmPose(1),
    },
  };
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

function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

function dampVec3(cur: Vec3Pose, tgt: Vec3Pose, lambda: number, dt: number): void {
  const alpha = 1 - Math.exp(-lambda * dt);
  cur.x = lerp(cur.x, tgt.x, alpha);
  cur.y = lerp(cur.y, tgt.y, alpha);
  cur.z = lerp(cur.z, tgt.z, alpha);
}

function dampArm(cur: ArmPose, tgt: ArmPose, lambda: number, dt: number): void {
  const alpha = 1 - Math.exp(-lambda * dt);
  dampVec3(cur.shoulderPos, tgt.shoulderPos, lambda, dt);
  dampVec3(cur.shoulderRot, tgt.shoulderRot, lambda, dt);
  cur.elbowBend = lerp(cur.elbowBend, tgt.elbowBend, alpha);
  cur.forearmTwist = lerp(cur.forearmTwist, tgt.forearmTwist, alpha);
  dampVec3(cur.wristRot, tgt.wristRot, lambda, dt);
  cur.fingerCurl = lerp(cur.fingerCurl, tgt.fingerCurl, alpha);
  cur.thumbCurl = lerp(cur.thumbCurl, tgt.thumbCurl, alpha);
}

function computeLocomotionTargets(
  anim: FirstPersonAnimState,
  input: FirstPersonAnimInput
): {
  rigOffset: Vec3Pose;
  rigRot: Vec3Pose;
  left: ArmPose;
  right: ArmPose;
} {
  const speedRatio = clamp(input.horizontalSpeed / Math.max(1, input.sprintSpeed), 0, 1.15);
  const walkRatio = clamp(input.horizontalSpeed / Math.max(1, input.walkSpeed), 0, 1);

  const breathe = Math.sin(anim.time * 1.9);
  const breatheAlt = Math.cos(anim.time * 1.9);

  const rigOffset: Vec3Pose = {
    x: anim.lookSwayX * 0.024 - anim.slideBlend * 0.02,
    y:
      breathe * 0.003 * (1 - walkRatio * 0.7) -
      anim.crouchBlend * 0.032 -
      anim.slideBlend * 0.042 -
      anim.landingImpact * 0.12 +
      anim.jumpImpulse * 0.025,
    z: -anim.landingImpact * 0.04 - anim.slideBlend * 0.03,
  };

  const rigRot: Vec3Pose = {
    x: anim.lookSwayY * 0.045 - anim.landingImpact * 0.14 + anim.jumpImpulse * 0.05 + anim.slideBlend * 0.06,
    y: anim.lookSwayX * 0.06 + anim.slideBlend * 0.05,
    z: -anim.slideBlend * 0.055,
  };

  const buildSide = (side: -1 | 1): ArmPose => {
    const phase = anim.stridePhase + (side === 1 ? Math.PI : 0);
    const swing = Math.sin(phase);
    const lift = Math.cos(phase);
    const moveStrength = input.grounded && anim.slideBlend < 0.2 ? clamp(walkRatio, 0, 1) : 0.1;

    // Base athletic stance with true shoulder offset (below/behind camera lens)
    let sx = side * (0.22 - anim.crouchBlend * 0.018 + anim.airBlend * 0.04);
    let sy = -0.22 + breathe * 0.0035 - anim.crouchBlend * 0.03;
    let sz = 0.07 + anim.sprintBlend * 0.015;

    let rx = 0.9 + anim.sprintBlend * 0.14 + anim.crouchBlend * 0.1;
    let ry = -side * (0.18 + anim.sprintBlend * 0.1);
    let rz = side * (0.12 + anim.airBlend * 0.22 * anim.fallIntensity);

    let elbow = 1.28 + anim.sprintBlend * 0.14 + anim.crouchBlend * 0.12;
    let twist = side * (0.16 + anim.sprintBlend * 0.16);
    let wx = 0.04 + anim.sprintBlend * 0.08;
    let wy = 0;
    let wz = -side * 0.06;

    let fingerCurl = lerp(0.42, 0.85, anim.sprintBlend);
    let thumbCurl = lerp(0.34, 0.74, anim.sprintBlend);

    // Walking + Sprinting cyclic arm pump
    if (moveStrength > 0.01 && anim.slideBlend < 0.85) {
      const slideDamp = 1 - anim.slideBlend;
      const walkSwingAmp = 0.15 * moveStrength * (1 - anim.sprintBlend * 0.45) * slideDamp;
      const sprintSwingAmp = 0.3 * anim.sprintBlend * slideDamp;
      const totalAmp = walkSwingAmp + sprintSwingAmp;

      rx += swing * totalAmp;
      ry += -side * swing * (0.06 * moveStrength + 0.15 * anim.sprintBlend) * slideDamp;
      sy += Math.max(0, swing) * (0.018 * moveStrength + 0.032 * anim.sprintBlend) * slideDamp;
      sz -= swing * (0.02 * moveStrength + 0.035 * anim.sprintBlend) * slideDamp;
      elbow += (Math.max(0, -swing) * 0.12 * anim.sprintBlend + lift * 0.05 * moveStrength) * slideDamp;
      rigOffset.y +=
        Math.abs(Math.cos(anim.stridePhase)) *
        (0.007 * moveStrength + 0.012 * anim.sprintBlend) *
        slideDamp;
    }

    // Slide brace posture: left hand reaches low-forward for balance, right arm trails wide/low
    if (anim.slideBlend > 0.02) {
      const sb = anim.slideBlend;
      const skim = Math.sin(anim.time * 18) * 0.004 * sb;
      if (side === -1) {
        sx = lerp(sx, -0.19, sb);
        sy = lerp(sy, -0.24 + skim, sb);
        sz = lerp(sz, 0.02, sb);
        rx = lerp(rx, 1.24, sb);
        ry = lerp(ry, 0.22, sb);
        rz = lerp(rz, -0.22, sb);
        elbow = lerp(elbow, 0.62, sb);
        twist = lerp(twist, -0.82, sb);
        wx = lerp(wx, -0.32, sb);
        fingerCurl = lerp(fingerCurl, 0.2, sb);
        thumbCurl = lerp(thumbCurl, 0.18, sb);
      } else {
        sx = lerp(sx, 0.25, sb);
        sy = lerp(sy, -0.26 + skim, sb);
        sz = lerp(sz, 0.09, sb);
        rx = lerp(rx, 0.56, sb);
        ry = lerp(ry, -0.28, sb);
        rz = lerp(rz, 0.26, sb);
        elbow = lerp(elbow, 0.92, sb);
        twist = lerp(twist, 0.35, sb);
        wx = lerp(wx, 0.08, sb);
        fingerCurl = lerp(fingerCurl, 0.58, sb);
        thumbCurl = lerp(thumbCurl, 0.45, sb);
      }
    }

    // Jump upward lift & Falling brace
    if (anim.airBlend > 0.02) {
      const fall = anim.fallIntensity;
      rx += anim.jumpImpulse * 0.28 + fall * (0.28 + Math.sin(anim.time * 7.5 + side) * 0.04);
      ry += side * fall * 0.16;
      sy += anim.airBlend * 0.04 + fall * 0.035;
      elbow = lerp(elbow, 0.68, fall * 0.72);
      twist = lerp(twist, side * 0.05, fall * 0.75);
      wx += fall * -0.18;
      fingerCurl = lerp(fingerCurl, 0.1, anim.airBlend * (0.4 + 0.6 * fall));
      thumbCurl = lerp(thumbCurl, 0.12, anim.airBlend * (0.4 + 0.6 * fall));
    }

    // Landing shock absorption dip
    if (anim.landingImpact > 0.01) {
      const imp = anim.landingImpact;
      sy -= imp * 0.075;
      sz -= imp * 0.045;
      rx += imp * 0.22;
      elbow += imp * 0.24;
      wx -= imp * 0.24;
      fingerCurl = lerp(fingerCurl, 0.22, clamp(imp, 0, 1));
    }

    // Subtle idle life (stable, calm)
    if (speedRatio < 0.05 && anim.airBlend < 0.05 && anim.slideBlend < 0.05) {
      sy += breatheAlt * 0.0015;
      elbow += breathe * 0.012;
    }

    return {
      shoulderPos: { x: sx, y: sy, z: sz },
      shoulderRot: { x: rx, y: ry, z: rz },
      elbowBend: clamp(elbow, 0.12, 1.85),
      forearmTwist: twist,
      wristRot: { x: wx, y: wy, z: wz },
      fingerCurl: clamp(fingerCurl, 0.04, 0.96),
      thumbCurl: clamp(thumbCurl, 0.04, 0.92),
    };
  };

  return {
    rigOffset,
    rigRot,
    left: buildSide(-1),
    right: buildSide(1),
  };
}

function computeVaultTarget(
  p: number,
  variant: ParkourVariant = 'QUICK_VAULT',
  obstacleRelY = 0.9
): {
  rigOffset: Vec3Pose;
  rigRot: Vec3Pose;
  left: ArmPose;
  right: ArmPose;
} {
  const isMedium = variant === 'MED_VAULT';
  const heightBias = clamp((obstacleRelY - 0.85) * 0.24, -0.16, 0.16);
  const plant = isMedium
    ? smoothstep(0.0, 0.26, p) * (1 - smoothstep(0.58, 0.92, p))
    : smoothstep(0.0, 0.28, p) * (1 - smoothstep(0.5, 0.88, p));
  const pushOff = smoothstep(0.36, 0.64, p) * (1 - smoothstep(0.68, 1.0, p));

  const left: ArmPose = {
    shoulderPos: {
      x: lerp(-0.22, -0.15, plant),
      y: lerp(-0.22, -0.14 + heightBias * 0.15, plant) - pushOff * 0.06,
      z: lerp(0.07, -0.02, plant),
    },
    shoulderRot: {
      x: lerp(0.9, 1.48 + heightBias, plant) - pushOff * 0.48,
      y: lerp(0.18, -0.24, plant),
      z: lerp(-0.12, 0.08, plant),
    },
    elbowBend: lerp(1.28, isMedium ? 0.36 : 0.44, plant) + pushOff * 0.35,
    forearmTwist: lerp(-0.15, -1.35, plant),
    wristRot: {
      x: lerp(0.04, -0.6, plant),
      y: 0,
      z: lerp(0.06, 0.16, plant),
    },
    fingerCurl: lerp(0.42, 0.07, plant),
    thumbCurl: lerp(0.34, 0.1, plant),
  };

  const right: ArmPose = isMedium
    ? {
        shoulderPos: {
          x: lerp(0.22, 0.17, plant),
          y: lerp(-0.22, -0.17 + heightBias * 0.12, plant) - pushOff * 0.05,
          z: lerp(0.07, 0.0, plant),
        },
        shoulderRot: {
          x: lerp(0.9, 1.24 + heightBias * 0.7, plant) - pushOff * 0.4,
          y: lerp(-0.18, 0.18, plant),
          z: lerp(0.12, -0.04, plant),
        },
        elbowBend: lerp(1.28, 0.56, plant) + pushOff * 0.35,
        forearmTwist: lerp(0.16, 1.25, plant),
        wristRot: {
          x: lerp(0.04, -0.5, plant),
          y: 0,
          z: lerp(-0.06, -0.14, plant),
        },
        fingerCurl: lerp(0.42, 0.14, plant),
        thumbCurl: lerp(0.34, 0.16, plant),
      }
    : {
        shoulderPos: {
          x: lerp(0.22, 0.28, plant),
          y: lerp(-0.22, -0.25, plant),
          z: lerp(0.07, 0.1, plant),
        },
        shoulderRot: {
          x: lerp(0.9, 0.18, plant) + pushOff * 0.5,
          y: lerp(-0.18, -0.28, plant),
          z: lerp(0.12, 0.3, plant),
        },
        elbowBend: lerp(1.28, 1.4, plant),
        forearmTwist: 0.28,
        wristRot: { x: 0.06, y: 0, z: -0.1 },
        fingerCurl: lerp(0.45, 0.72, plant),
        thumbCurl: 0.55,
      };

  return {
    rigOffset: {
      x: isMedium ? -0.01 * plant : -0.025 * plant,
      y: -0.025 * plant + pushOff * 0.02,
      z: -0.035 * plant,
    },
    rigRot: {
      x: -0.055 * plant,
      y: isMedium ? 0.015 * plant : 0.035 * plant,
      z: isMedium ? 0.022 * plant : 0.045 * plant,
    },
    left,
    right,
  };
}

function computeClimbTarget(p: number, obstacleRelY = 1.1): {
  rigOffset: Vec3Pose;
  rigRot: Vec3Pose;
  left: ArmPose;
  right: ArmPose;
} {
  const heightBias = clamp((obstacleRelY - 1.0) * 0.2, -0.12, 0.18);
  const leftReach = smoothstep(0.0, 0.28, p) * (1 - smoothstep(0.42, 0.78, p));
  const rightReach = smoothstep(0.1, 0.38, p) * (1 - smoothstep(0.5, 0.86, p));
  const pullDown = smoothstep(0.36, 0.74, p) * (1 - smoothstep(0.78, 1.0, p));

  const buildClimbArm = (side: -1 | 1, reach: number): ArmPose => ({
    shoulderPos: {
      x: side * lerp(0.22, 0.18, reach),
      y: lerp(-0.22, -0.14 + heightBias * 0.12, reach) - pullDown * 0.09,
      z: lerp(0.07, 0.0, reach),
    },
    shoulderRot: {
      x: lerp(0.9, 1.52 + heightBias, reach) - pullDown * 0.52,
      y: -side * lerp(0.18, 0.22, reach),
      z: side * lerp(0.12, 0.05, reach),
    },
    elbowBend: lerp(1.28, 0.36, reach) + pullDown * 0.72,
    forearmTwist: side * lerp(0.16, 0.55, reach),
    wristRot: {
      x: lerp(0.04, -0.42, reach) - pullDown * 0.2,
      y: 0,
      z: -side * 0.06,
    },
    fingerCurl: lerp(0.38, 0.62, reach * 0.6 + pullDown * 0.4),
    thumbCurl: lerp(0.32, 0.55, reach),
  });

  return {
    rigOffset: {
      x: (leftReach - rightReach) * 0.015,
      y: -0.025 * pullDown,
      z: -0.03 * Math.max(leftReach, rightReach),
    },
    rigRot: {
      x: -0.07 * pullDown,
      y: (rightReach - leftReach) * 0.03,
      z: (leftReach - rightReach) * 0.025,
    },
    left: buildClimbArm(-1, leftReach),
    right: buildClimbArm(1, rightReach),
  };
}

function computeMantleTarget(
  p: number,
  hangRatio = 0.28,
  obstacleRelY = 1.6
): {
  rigOffset: Vec3Pose;
  rigRot: Vec3Pose;
  left: ArmPose;
  right: ArmPose;
} {
  const hEnd = clamp(hangRatio, 0.16, 0.4);
  const pullEnd = 0.74;
  const reach = smoothstep(0.0, hEnd * 0.5, p) * (1 - smoothstep(hEnd + 0.06, pullEnd - 0.1, p));
  const grip = smoothstep(hEnd * 0.38, hEnd * 0.75, p) * (1 - smoothstep(pullEnd - 0.1, pullEnd + 0.08, p));
  const pull = smoothstep(hEnd, pullEnd - 0.06, p) * (1 - smoothstep(pullEnd - 0.04, pullEnd + 0.14, p));
  const press = smoothstep(pullEnd - 0.08, 0.86, p) * (1 - smoothstep(0.9, 1.0, p));
  const ledgePitchBias = clamp((obstacleRelY - 1.35) * 0.22, -0.2, 0.2);

  const buildMantleArm = (side: -1 | 1): ArmPose => {
    const asym = side === -1 ? 0 : 0.02;
    const r = smoothstep(0.0, hEnd * 0.5 + asym, p) * (1 - smoothstep(hEnd + 0.06 + asym, pullEnd - 0.1, p));

    return {
      shoulderPos: {
        x: side * lerp(0.22, 0.18, r) + side * press * 0.04,
        y: lerp(-0.22, -0.15 + ledgePitchBias * 0.12, r) - pull * 0.1 - press * 0.1,
        z: lerp(0.07, 0.01, r) - pull * 0.03 + press * 0.04,
      },
      shoulderRot: {
        x: lerp(0.9, 1.76 + ledgePitchBias, r) - pull * 0.62 - press * 0.86,
        y: -side * lerp(0.18, 0.22, r),
        z: side * lerp(0.12, 0.04, r) + side * press * 0.16,
      },
      elbowBend: lerp(1.28, 0.22, r) + pull * 1.18 - press * 0.72,
      forearmTwist: side * (lerp(0.16, 0.78, r) + press * 0.62),
      wristRot: {
        x: lerp(0.04, -0.34, r) + pull * 0.34 - press * 0.74,
        y: 0,
        z: -side * 0.08,
      },
      fingerCurl: clamp(lerp(0.24, 0.86, grip) - press * 0.58, 0.1, 0.92),
      thumbCurl: clamp(lerp(0.22, 0.74, grip) - press * 0.48, 0.1, 0.86),
    };
  };

  return {
    rigOffset: {
      x: 0,
      y: 0.035 * reach - 0.02 * grip - 0.06 * pull - 0.04 * press,
      z: -0.055 * reach - 0.03 * pull,
    },
    rigRot: {
      x: 0.06 * reach - 0.12 * pull - 0.08 * press,
      y: 0,
      z: 0,
    },
    left: buildMantleArm(-1),
    right: buildMantleArm(1),
  };
}

function lerpArmPose(a: ArmPose, b: ArmPose, t: number): ArmPose {
  return {
    shoulderPos: {
      x: lerp(a.shoulderPos.x, b.shoulderPos.x, t),
      y: lerp(a.shoulderPos.y, b.shoulderPos.y, t),
      z: lerp(a.shoulderPos.z, b.shoulderPos.z, t),
    },
    shoulderRot: {
      x: lerp(a.shoulderRot.x, b.shoulderRot.x, t),
      y: lerp(a.shoulderRot.y, b.shoulderRot.y, t),
      z: lerp(a.shoulderRot.z, b.shoulderRot.z, t),
    },
    elbowBend: lerp(a.elbowBend, b.elbowBend, t),
    forearmTwist: lerp(a.forearmTwist, b.forearmTwist, t),
    wristRot: {
      x: lerp(a.wristRot.x, b.wristRot.x, t),
      y: lerp(a.wristRot.y, b.wristRot.y, t),
      z: lerp(a.wristRot.z, b.wristRot.z, t),
    },
    fingerCurl: lerp(a.fingerCurl, b.fingerCurl, t),
    thumbCurl: lerp(a.thumbCurl, b.thumbCurl, t),
  };
}

function computeRightHookTarget(
  p: number,
  hitRegistered: boolean,
  locomotion: { rigOffset: Vec3Pose; rigRot: Vec3Pose; left: ArmPose; right: ArmPose }
): {
  rigOffset: Vec3Pose;
  rigRot: Vec3Pose;
  left: ArmPose;
  right: ArmPose;
} {
  const windup = smoothstep(0.0, 0.22, p) * (1 - smoothstep(0.2, 0.36, p));
  const strike = smoothstep(0.2, 0.44, p) * (1 - smoothstep(0.52, 0.96, p));
  const follow = smoothstep(0.42, 0.58, p) * (1 - smoothstep(0.68, 1.0, p));
  const guardWeight = smoothstep(0.0, 0.16, p) * (1 - smoothstep(0.62, 1.0, p));
  const impactBeat = hitRegistered
    ? smoothstep(0.38, 0.44, p) * (1 - smoothstep(0.47, 0.62, p))
    : 0;

  const guardLeft: ArmPose = {
    shoulderPos: { x: -0.2, y: -0.18, z: 0.045 },
    shoulderRot: { x: 1.08, y: 0.24, z: -0.14 },
    elbowBend: 1.54,
    forearmTwist: -0.25,
    wristRot: { x: 0.08, y: -0.05, z: 0.08 },
    fingerCurl: 0.78,
    thumbCurl: 0.68,
  };
  const left = lerpArmPose(locomotion.left, guardLeft, guardWeight * 0.85);

  const rightHookPose: ArmPose = {
    shoulderPos: {
      x: 0.22 + windup * 0.05 - strike * 0.035 - follow * 0.02,
      y: -0.22 + windup * 0.015 + strike * 0.035 - follow * 0.01,
      z: 0.07 + windup * 0.035 - strike * 0.065 + impactBeat * 0.016,
    },
    shoulderRot: {
      x: 0.9 + windup * 0.24 + strike * 0.48 - follow * 0.14 - impactBeat * 0.04,
      y: -0.18 - windup * 0.58 + strike * 0.88 + follow * 0.22 - impactBeat * 0.1,
      z: 0.12 + windup * 0.38 + strike * 0.58 - follow * 0.12,
    },
    elbowBend: clamp(
      1.28 + windup * 0.22 - strike * 0.12 + follow * 0.1 + impactBeat * 0.1,
      0.92,
      1.72
    ),
    forearmTwist: 0.16 - windup * 0.28 - strike * 0.82 - follow * 0.1,
    wristRot: {
      x: 0.04 - strike * 0.06,
      y: 0.08 * strike,
      z: -0.06 - strike * 0.14,
    },
    fingerCurl: lerp(0.44, 0.94, clamp(windup + strike * 1.1, 0, 1)),
    thumbCurl: lerp(0.36, 0.88, clamp(windup + strike * 1.1, 0, 1)),
  };

  const hookEnvelope = smoothstep(0.0, 0.12, p) * (1 - smoothstep(0.68, 1.0, p));
  const right = lerpArmPose(locomotion.right, rightHookPose, hookEnvelope);

  return {
    rigOffset: {
      x: locomotion.rigOffset.x + windup * 0.014 - strike * 0.022 + impactBeat * 0.008,
      y: locomotion.rigOffset.y - impactBeat * 0.012,
      z: locomotion.rigOffset.z - strike * 0.018 + impactBeat * 0.015,
    },
    rigRot: {
      x: locomotion.rigRot.x - strike * 0.022 + impactBeat * 0.018,
      y: locomotion.rigRot.y - windup * 0.032 + strike * 0.055 - impactBeat * 0.015,
      z: locomotion.rigRot.z + windup * 0.02 - strike * 0.035,
    },
    left,
    right,
  };
}

/**
 * Attack 2: Left-Hand Driving Body Strike (FOLLOW_UP_STRIKE).
 * Coils smoothly from the left guard pose of Attack 1, drives forward & inward toward
 * the opponent's midsection while the right hand retracts into compact guard,
 * then blends cleanly back to idle/locomotion.
 */
function computeFollowUpStrikeTarget(
  p: number,
  hitRegistered: boolean,
  locomotion: { rigOffset: Vec3Pose; rigRot: Vec3Pose; left: ArmPose; right: ArmPose }
): {
  rigOffset: Vec3Pose;
  rigRot: Vec3Pose;
  left: ArmPose;
  right: ArmPose;
} {
  // 0.00 -> 0.22 : Coil left shoulder down/outward (+Y rot) from guard
  // 0.20 -> 0.50 : Drive left fist forward/inward (-Y rot, extended elbow) into body height
  // 0.40 -> 0.58 : Crisp contact accent when hitRegistered
  // 0.58 -> 1.00 : Smooth recovery to resting stance
  const windup = smoothstep(0.0, 0.22, p) * (1 - smoothstep(0.19, 0.34, p));
  const strike = smoothstep(0.2, 0.44, p) * (1 - smoothstep(0.54, 0.96, p));
  const follow = smoothstep(0.42, 0.6, p) * (1 - smoothstep(0.7, 1.0, p));
  const guardWeight = smoothstep(0.0, 0.16, p) * (1 - smoothstep(0.64, 1.0, p));
  const impactBeat = hitRegistered
    ? smoothstep(0.38, 0.44, p) * (1 - smoothstep(0.48, 0.64, p))
    : 0;

  // Compact protective right-hand guard during left-hand body strike
  const guardRight: ArmPose = {
    shoulderPos: { x: 0.2, y: -0.18, z: 0.045 },
    shoulderRot: { x: 1.08, y: -0.24, z: 0.14 },
    elbowBend: 1.54,
    forearmTwist: 0.25,
    wristRot: { x: 0.08, y: 0.05, z: -0.08 },
    fingerCurl: 0.78,
    thumbCurl: 0.68,
  };
  const right = lerpArmPose(locomotion.right, guardRight, guardWeight * 0.85);

  // Left arm (side = -1): +Y rot draws outward left; -Y rot drives inward across center toward +X!
  // Negative forearmTwist on left arm rotates dorsal armored knuckles forward/up toward enemy midsection.
  const leftStrikePose: ArmPose = {
    shoulderPos: {
      x: -0.22 - windup * 0.04 + strike * 0.065 + follow * 0.02,
      y: -0.22 - windup * 0.035 - strike * 0.01,
      z: 0.07 + windup * 0.03 - strike * 0.11 + impactBeat * 0.018,
    },
    shoulderRot: {
      x: 0.9 - windup * 0.18 + strike * 0.38 - follow * 0.08 - impactBeat * 0.03,
      y: 0.18 + windup * 0.34 - strike * 0.64 - follow * 0.12 + impactBeat * 0.08,
      z: -0.12 - windup * 0.16 - strike * 0.24 + follow * 0.06,
    },
    elbowBend: clamp(
      1.28 + windup * 0.22 - strike * 0.66 + follow * 0.2 + impactBeat * 0.12,
      0.56,
      1.68
    ),
    forearmTwist: -0.16 - windup * 0.14 - strike * 0.78 - follow * 0.08,
    wristRot: {
      x: 0.04 - strike * 0.08,
      y: -0.06 * strike,
      z: 0.06 - strike * 0.14,
    },
    fingerCurl: lerp(0.44, 0.94, clamp(windup + strike * 1.15, 0, 1)),
    thumbCurl: lerp(0.36, 0.88, clamp(windup + strike * 1.15, 0, 1)),
  };

  const strikeEnvelope = smoothstep(0.0, 0.12, p) * (1 - smoothstep(0.68, 1.0, p));
  const left = lerpArmPose(locomotion.left, leftStrikePose, strikeEnvelope);

  return {
    rigOffset: {
      x: locomotion.rigOffset.x - windup * 0.012 + strike * 0.024 - impactBeat * 0.008,
      y: locomotion.rigOffset.y - windup * 0.01 - impactBeat * 0.014,
      z: locomotion.rigOffset.z - strike * 0.028 + impactBeat * 0.018,
    },
    rigRot: {
      x: locomotion.rigRot.x - strike * 0.024 + impactBeat * 0.016,
      y: locomotion.rigRot.y + windup * 0.028 - strike * 0.058 + impactBeat * 0.014,
      z: locomotion.rigRot.z - windup * 0.018 + strike * 0.032,
    },
    left,
    right,
  };
}

export function stepFirstPersonAnimation(
  anim: FirstPersonAnimState,
  input: FirstPersonAnimInput,
  rawDt: number
): FirstPersonPose {
  const dt = clamp(rawDt, 0.001, 0.05);
  anim.time += dt;

  // 1. Update blend channels & impulses
  const sliding = input.isSliding ?? input.movementState === 'SLIDING';
  const isSprinting =
    !sliding &&
    (input.movementState === 'SPRINT' ||
      (input.grounded && !input.isCrouching && input.horizontalSpeed > input.walkSpeed * 1.25));
  anim.sprintBlend = damp(anim.sprintBlend, isSprinting ? 1 : 0, 9, dt);
  anim.crouchBlend = damp(anim.crouchBlend, input.isCrouching && !sliding ? 1 : 0, 12, dt);
  anim.slideBlend = damp(anim.slideBlend, sliding ? 1 : 0, 15, dt);

  const inAirNonParkour = !input.grounded && input.activeParkour === null;
  anim.airBlend = damp(anim.airBlend, inAirNonParkour ? 1 : 0, 11, dt);
  const fallTarget =
    inAirNonParkour && input.verticalVelocity < -0.5
      ? clamp((-input.verticalVelocity - 0.5) / 9.5, 0, 1)
      : 0;
  anim.fallIntensity = damp(anim.fallIntensity, fallTarget, 8, dt);

  // Jump & Landing impact spring
  if (input.events.jumped) {
    anim.jumpImpulse = 1.0;
  } else {
    anim.jumpImpulse = damp(anim.jumpImpulse, 0, 10, dt);
  }

  if (input.events.landedImpactSpeed !== null) {
    const strength = clamp(input.events.landedImpactSpeed / 9.5, 0.3, 1.25);
    anim.landingImpactVel += strength * 19;
  }
  if (input.events.parkourCompleted !== null) {
    anim.landingImpactVel += 5.0;
  }

  // Second-order spring for landing shock absorption
  anim.landingImpactVel += (-anim.landingImpact * 95 - anim.landingImpactVel * 15) * dt;
  anim.landingImpact = clamp(anim.landingImpact + anim.landingImpactVel * dt, -0.1, 1.0);

  // Stride phase advances proportionally to ground speed
  if (input.grounded && !sliding && input.horizontalSpeed > 0.25) {
    const cadence = lerp(1.9, 2.35, anim.sprintBlend);
    anim.stridePhase = (anim.stridePhase + input.horizontalSpeed * cadence * dt) % (Math.PI * 2);
  }

  // Look inertia sway
  const targetSwayX = clamp(-input.yawDelta * 2.2, -1, 1);
  const targetSwayY = clamp(-input.pitchDelta * 2.2, -1, 1);
  anim.lookSwayX = damp(anim.lookSwayX, targetSwayX, 14, dt);
  anim.lookSwayY = damp(anim.lookSwayY, targetSwayY, 14, dt);

  // 2. Compute target pose from active parkour, combat strike, or locomotion
  let target: {
    rigOffset: Vec3Pose;
    rigRot: Vec3Pose;
    left: ArmPose;
    right: ArmPose;
  };
  let blendRate = 14;

  const isCombatActive =
    input.activeParkour === null &&
    input.combat != null &&
    input.combat.state !== 'IDLE';
  anim.combatBlend = damp(anim.combatBlend, isCombatActive ? 1 : 0, 22, dt);

  if (input.activeParkour) {
    const p = clamp(input.activeParkour.progress, 0, 1);
    const relY = input.activeParkour.obstacleRelY;
    if (input.activeParkour.type === 'VAULT') {
      target = computeVaultTarget(p, input.activeParkour.variant ?? 'QUICK_VAULT', relY ?? 0.9);
      blendRate = 24;
    } else if (input.activeParkour.type === 'CLIMB') {
      target = computeClimbTarget(p, relY ?? 1.1);
      blendRate = 22;
    } else {
      target = computeMantleTarget(p, input.activeParkour.hangRatio ?? 0.28, relY ?? 1.6);
      blendRate = 24;
    }
  } else if (isCombatActive && input.combat) {
    const locomotion = computeLocomotionTargets(anim, input);
    const p = clamp(input.combat.progress, 0, 1);
    if (input.combat.attackType === 'FOLLOW_UP_STRIKE') {
      target = computeFollowUpStrikeTarget(p, input.combat.hitRegistered, locomotion);
    } else {
      target = computeRightHookTarget(p, input.combat.hitRegistered, locomotion);
    }
    blendRate = 26;
  } else {
    target = computeLocomotionTargets(anim, input);
    blendRate = sliding ? 17 : 14;
  }

  // 3. Smoothly damp current pose toward target pose (no rigid snapping)
  dampVec3(anim.currentPose.rigOffset, target.rigOffset, blendRate, dt);
  dampVec3(anim.currentPose.rigRot, target.rigRot, blendRate, dt);
  anim.currentPose.torsoPitchOffset = damp(
    anim.currentPose.torsoPitchOffset,
    -input.pitch * 0.34,
    18,
    dt
  );
  dampArm(anim.currentPose.leftArm, target.left, blendRate, dt);
  dampArm(anim.currentPose.rightArm, target.right, blendRate, dt);

  return anim.currentPose;
}
