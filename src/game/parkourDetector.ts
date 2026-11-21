import type { BoxCollider, GymColliders } from './gymLayout';
import type { MovementTuning } from './movementTuning';

export type ParkourActionType = 'VAULT' | 'CLIMB' | 'MANTLE';

export type ParkourVariant = 'QUICK_VAULT' | 'MED_VAULT' | 'CLIMB' | 'LEDGE_MANTLE';

export interface ParkourOpportunity {
  type: ParkourActionType;
  variant: ParkourVariant;
  targetBoxId: string;
  obstacleTopY: number;
  startX: number;
  startY: number;
  startZ: number;
  hangX: number;
  hangY: number;
  hangZ: number;
  hangRatio: number;
  apexX: number;
  apexY: number;
  apexZ: number;
  endX: number;
  endY: number;
  endZ: number;
  duration: number;
  requiredStamina: number;
  exitSpeed: number;
  faceNormalX: number;
  faceNormalZ: number;
}

interface RayBoxHit {
  box: BoxCollider;
  tEnter: number;
  tExit: number;
  normalX: number;
  normalZ: number;
}

const PLAYER_RADIUS = 0.36;

function intersectRayXZ(
  ox: number,
  oz: number,
  dx: number,
  dz: number,
  box: BoxCollider,
  pad: number
): { tEnter: number; tExit: number; normalX: number; normalZ: number } | null {
  const minX = box.minX - pad;
  const maxX = box.maxX + pad;
  const minZ = box.minZ - pad;
  const maxZ = box.maxZ + pad;

  let tMin = -Infinity;
  let tMax = Infinity;
  let normalX = 0;
  let normalZ = 0;

  if (Math.abs(dx) < 1e-6) {
    if (ox < minX || ox > maxX) return null;
  } else {
    const invDx = 1 / dx;
    let t1 = (minX - ox) * invDx;
    let t2 = (maxX - ox) * invDx;
    let n1 = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      n1 = 1;
    }
    if (t1 > tMin) {
      tMin = t1;
      normalX = n1;
      normalZ = 0;
    }
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return null;
  }

  if (Math.abs(dz) < 1e-6) {
    if (oz < minZ || oz > maxZ) return null;
  } else {
    const invDz = 1 / dz;
    let t1 = (minZ - oz) * invDz;
    let t2 = (maxZ - oz) * invDz;
    let n1 = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      n1 = 1;
    }
    if (t1 > tMin) {
      tMin = t1;
      normalX = 0;
      normalZ = n1;
    }
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return null;
  }

  if (tMax < 0) return null;
  return {
    tEnter: Math.max(0, tMin),
    tExit: tMax,
    normalX,
    normalZ,
  };
}

export function isSpaceClearForCapsule(
  x: number,
  y: number,
  z: number,
  height: number,
  colliders: GymColliders,
  ignoreBoxId?: string
): boolean {
  if (Math.abs(x) > colliders.boundsRadius || Math.abs(z) > colliders.boundsRadius) {
    return false;
  }
  const r = PLAYER_RADIUS * 0.88;
  const topY = y + height;

  for (const box of colliders.boxes) {
    if (box.id === ignoreBoxId) continue;
    if (
      x + r > box.minX &&
      x - r < box.maxX &&
      z + r > box.minZ &&
      z - r < box.maxZ &&
      topY > box.minY + 0.04 &&
      y + 0.06 < box.maxY
    ) {
      return false;
    }
  }
  return true;
}

function getGroundBelow(
  x: number,
  maxSearchY: number,
  z: number,
  colliders: GymColliders
): number {
  let floorY = 0;
  const r = PLAYER_RADIUS * 0.7;
  for (const box of colliders.boxes) {
    if (
      x + r > box.minX &&
      x - r < box.maxX &&
      z + r > box.minZ &&
      z - r < box.maxZ
    ) {
      if (box.maxY <= maxSearchY + 0.05 && box.maxY > floorY) {
        floorY = box.maxY;
      }
    }
  }
  return floorY;
}

export function detectParkourOpportunity(
  x: number,
  y: number,
  z: number,
  yaw: number,
  horizontalSpeed: number,
  grounded: boolean,
  isCrouching: boolean,
  colliders: GymColliders,
  tuning: MovementTuning
): ParkourOpportunity | null {
  if (isCrouching) return null;

  const dirX = -Math.sin(yaw);
  const dirZ = -Math.cos(yaw);
  const maxReach = grounded ? 1.24 : tuning.mantleReachDistance;

  // Gather ALL ray hits along player's forward vector that overlap player's vertical body/reach band
  const hits: RayBoxHit[] = [];
  for (const box of colliders.boxes) {
    // Ignore floors near/below feet or high overhangs above arm reach
    if (box.maxY <= y + (grounded ? 0.32 : 0.06)) continue;
    if (box.minY >= y + tuning.standHeight + 0.3) continue;

    const hit = intersectRayXZ(x, z, dirX, dirZ, box, PLAYER_RADIUS * 0.65);
    if (!hit) continue;
    if (hit.tEnter > maxReach || hit.tEnter <= 0.01) continue;

    hits.push({
      box,
      tEnter: hit.tEnter,
      tExit: hit.tExit,
      normalX: hit.normalX,
      normalZ: hit.normalZ,
    });
  }

  if (hits.length === 0) return null;

  // Sort nearest-first so an intervening wall ALWAYS occludes anything behind it
  hits.sort((a, b) => a.tEnter - b.tEnter);
  const nearest = hits[0];
  const box = nearest.box;

  // Player must genuinely face the obstacle face
  const facingDot = dirX * nearest.normalX + dirZ * nearest.normalZ;
  if (facingDot > -0.45) return null;

  const relHeight = box.maxY - y;
  // Oversized / too tall -> blocked cleanly, never climb through tall walls
  if (relHeight > tuning.mantleMaxHeight) {
    return null;
  }

  // Ensure no low ceiling directly above player prevents lifting up
  if (!isSpaceClearForCapsule(x, y + 0.35, z, tuning.standHeight + 0.45, colliders, box.id)) {
    return null;
  }

  const entrySpeedFactor = Math.min(1, Math.max(0, horizontalSpeed / tuning.sprintSpeed));
  const rawDepth = Math.max(0.2, nearest.tExit - nearest.tEnter);
  const trueDepth = Math.max(0.15, rawDepth - PLAYER_RADIUS * 1.3);

  // 1. VAULT CHECK (grounded or airborne jump-into-vault):
  // Differentiates small obstacles (QUICK_VAULT) vs medium obstacles (MED_VAULT).
  const minVaultRel = grounded ? tuning.vaultMinHeight : 0.06;
  if (
    relHeight >= minVaultRel &&
    relHeight <= tuning.vaultMaxHeight &&
    rawDepth <= tuning.vaultMaxDepth
  ) {
    const farDist = nearest.tExit + 0.6;
    const landX = x + dirX * farDist;
    const landZ = z + dirZ * farDist;
    const landFloorY = getGroundBelow(landX, box.maxY - 0.15, landZ, colliders);

    if (
      landFloorY <= box.maxY - 0.25 &&
      landFloorY >= y - 2.4 &&
      isSpaceClearForCapsule(landX, landFloorY, landZ, tuning.standHeight, colliders)
    ) {
      const isSmall = relHeight <= tuning.vaultSmallMaxHeight && trueDepth <= 0.78;
      const apexDist = (nearest.tEnter + nearest.tExit) * 0.5;
      const apexX = x + dirX * apexDist;
      const apexZ = z + dirZ * apexDist;
      const apexY = box.maxY + (isSmall ? 0.14 : 0.22);

      if (isSpaceClearForCapsule(apexX, apexY, apexZ, tuning.crouchHeight, colliders, box.id)) {
        const duration = isSmall
          ? 0.34 - entrySpeedFactor * 0.08
          : 0.48 - entrySpeedFactor * 0.07;
        const exitSpeed = isSmall
          ? Math.max(tuning.walkSpeed * 1.24, horizontalSpeed * 0.97)
          : Math.max(tuning.walkSpeed * 1.04, horizontalSpeed * 0.87);

        return {
          type: 'VAULT',
          variant: isSmall ? 'QUICK_VAULT' : 'MED_VAULT',
          targetBoxId: box.id,
          obstacleTopY: box.maxY,
          startX: x,
          startY: y,
          startZ: z,
          hangX: apexX,
          hangY: apexY,
          hangZ: apexZ,
          hangRatio: 0,
          apexX,
          apexY,
          apexZ,
          endX: landX,
          endY: landFloorY,
          endZ: landZ,
          duration,
          requiredStamina: tuning.vaultStaminaCost,
          exitSpeed,
          faceNormalX: nearest.normalX,
          faceNormalZ: nearest.normalZ,
        };
      }
    }
  }

  // Helper for Climb / Ledge Mantle top-out point clamped safely onto target platform
  const stepOnDist = nearest.tEnter + 0.64;
  const rawEndX = x + dirX * stepOnDist;
  const rawEndZ = z + dirZ * stepOnDist;
  const margin = Math.min(0.42, (box.maxX - box.minX) * 0.35, (box.maxZ - box.minZ) * 0.35);
  const endX = Math.max(box.minX + margin, Math.min(box.maxX - margin, rawEndX));
  const endZ = Math.max(box.minZ + margin, Math.min(box.maxZ - margin, rawEndZ));

  // Verify enough standing headroom atop the platform
  if (!isSpaceClearForCapsule(endX, box.maxY, endZ, tuning.standHeight, colliders, box.id)) {
    return null;
  }

  // 2. CLIMB CHECK: medium-height surface (too deep or tall for vault)
  if (relHeight >= tuning.vaultMinHeight && relHeight <= tuning.climbMaxHeight) {
    const apexX = x + dirX * (nearest.tEnter + 0.16);
    const apexZ = z + dirZ * (nearest.tEnter + 0.16);
    const apexY = box.maxY + 0.12;
    const duration = 0.34 - entrySpeedFactor * 0.06;
    const exitSpeed = Math.max(tuning.walkSpeed * 0.94, horizontalSpeed * 0.84);

    return {
      type: 'CLIMB',
      variant: 'CLIMB',
      targetBoxId: box.id,
      obstacleTopY: box.maxY,
      startX: x,
      startY: y,
      startZ: z,
      hangX: apexX,
      hangY: apexY,
      hangZ: apexZ,
      hangRatio: 0,
      apexX,
      apexY,
      apexZ,
      endX,
      endY: box.maxY,
      endZ,
      duration,
      requiredStamina: tuning.climbStaminaCost,
      exitSpeed,
      faceNormalX: nearest.normalX,
      faceNormalZ: nearest.normalZ,
    };
  }

  // 3. LEDGE GRAB -> BRIEF HANG -> MUSCLE-UP (MANTLE)
  if (relHeight > tuning.climbMaxHeight && relHeight <= tuning.mantleMaxHeight) {
    const hangDist = Math.max(0.04, nearest.tEnter - 0.1);
    const hangX = x + dirX * hangDist;
    const hangZ = z + dirZ * hangDist;

    // Ensure vertical clearance along the wall face during hang and pull-up
    if (
      !isSpaceClearForCapsule(
        hangX,
        Math.max(y, box.maxY - 1.5),
        hangZ,
        tuning.standHeight,
        colliders,
        box.id
      )
    ) {
      return null;
    }

    // Settle feet near arm's-length below ledge lip during brief hang without ever dropping below current y
    const hangY = Math.max(y, box.maxY - 1.54);
    const apexX = hangX + dirX * 0.24;
    const apexZ = hangZ + dirZ * 0.24;
    const apexY = box.maxY + 0.09;

    const heightRatio = Math.min(1, (relHeight - tuning.climbMaxHeight) / 1.25);
    const hangRatio = 0.3 - entrySpeedFactor * 0.06; // 0.24..0.30 brief hang phase before upward pull
    const duration = 0.72 + heightRatio * 0.14 - entrySpeedFactor * 0.09;
    const exitSpeed = Math.max(tuning.walkSpeed * 1.0, horizontalSpeed * 0.74);

    return {
      type: 'MANTLE',
      variant: 'LEDGE_MANTLE',
      targetBoxId: box.id,
      obstacleTopY: box.maxY,
      startX: x,
      startY: y,
      startZ: z,
      hangX,
      hangY,
      hangZ,
      hangRatio,
      apexX,
      apexY,
      apexZ,
      endX,
      endY: box.maxY,
      endZ,
      duration,
      requiredStamina: tuning.mantleStaminaCost,
      exitSpeed,
      faceNormalX: nearest.normalX,
      faceNormalZ: nearest.normalZ,
    };
  }

  return null;
}
