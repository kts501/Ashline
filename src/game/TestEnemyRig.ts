import * as THREE from 'three';
import type { EnemySimState } from './combatSystem';

function createSoftShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(
      size / 2,
      size / 2,
      size * 0.08,
      size / 2,
      size / 2,
      size * 0.48
    );
    grad.addColorStop(0, 'rgba(10, 12, 14, 0.56)');
    grad.addColorStop(0.55, 'rgba(10, 12, 14, 0.28)');
    grad.addColorStop(1, 'rgba(10, 12, 14, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface LegParts {
  side: -1 | 1;
  baseZ: number;
  thigh: THREE.Mesh;
  shin: THREE.Mesh;
  boot: THREE.Mesh;
}

export class TestEnemyRig {
  public readonly root: THREE.Group;
  private readonly lowerBodyGroup: THREE.Group;
  private readonly pelvisMesh: THREE.Mesh;
  private readonly leftLeg: LegParts;
  private readonly rightLeg: LegParts;
  private readonly upperBodyPivot: THREE.Group;
  private readonly headPivot: THREE.Group;
  private readonly leftArmPivot: THREE.Group;
  private readonly rightArmPivot: THREE.Group;
  private readonly contactRing: THREE.Mesh;
  private readonly shadowDisc: THREE.Mesh;

  private readonly jacketMat: THREE.MeshStandardMaterial;
  private readonly skinMat: THREE.MeshStandardMaterial;
  private readonly pantsMat: THREE.MeshStandardMaterial;
  private readonly bootMat: THREE.MeshStandardMaterial;
  private readonly harnessMat: THREE.MeshStandardMaterial;
  private readonly eyeMat: THREE.MeshStandardMaterial;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly shadowMat: THREE.MeshBasicMaterial;
  private readonly shadowTex: THREE.CanvasTexture;
  private readonly disposables: Array<{ dispose: () => void }> = [];

  constructor() {
    this.root = new THREE.Group();

    // Distinct calibrated PBR materials (roughness spread >= 0.25)
    this.jacketMat = new THREE.MeshStandardMaterial({
      color: 0x3b413c,
      roughness: 0.86,
      metalness: 0.04,
      emissive: 0x000000,
    });
    this.skinMat = new THREE.MeshStandardMaterial({
      color: 0x8c9281,
      roughness: 0.62,
      metalness: 0.02,
      emissive: 0x000000,
    });
    this.pantsMat = new THREE.MeshStandardMaterial({
      color: 0x262a2e,
      roughness: 0.88,
      metalness: 0.04,
    });
    this.bootMat = new THREE.MeshStandardMaterial({
      color: 0x16181a,
      roughness: 0.48,
      metalness: 0.14,
    });
    this.harnessMat = new THREE.MeshStandardMaterial({
      color: 0xd98a36,
      roughness: 0.55,
      metalness: 0.12,
    });
    this.eyeMat = new THREE.MeshStandardMaterial({
      color: 0xc9c0a6,
      emissive: 0x9c6020,
      emissiveIntensity: 0.45,
      roughness: 0.26,
      metalness: 0.05,
    });

    this.shadowTex = createSoftShadowTexture();
    this.shadowMat = new THREE.MeshBasicMaterial({
      map: this.shadowTex,
      transparent: true,
      depthWrite: false,
    });
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xf29f46,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.disposables.push(
      this.jacketMat,
      this.skinMat,
      this.pantsMat,
      this.bootMat,
      this.harnessMat,
      this.eyeMat,
      this.shadowTex,
      this.shadowMat,
      this.ringMat
    );

    // Soft radial contact shadow grounded at y = 0.015
    const shadowGeo = new THREE.CircleGeometry(0.62, 24);
    this.shadowDisc = new THREE.Mesh(shadowGeo, this.shadowMat);
    this.shadowDisc.rotation.x = -Math.PI / 2;
    this.shadowDisc.position.y = 0.015;
    this.root.add(this.shadowDisc);
    this.disposables.push(shadowGeo);

    // Lower body (grounded at y = 0, pelvic mount at y = 0.89)
    this.lowerBodyGroup = new THREE.Group();
    this.root.add(this.lowerBodyGroup);

    const bootGeo = new THREE.BoxGeometry(0.135, 0.14, 0.25);
    const shinGeo = new THREE.CapsuleGeometry(0.072, 0.34, 6, 12);
    const thighGeo = new THREE.CapsuleGeometry(0.088, 0.32, 6, 12);
    const pelvisGeo = new THREE.CapsuleGeometry(0.155, 0.14, 6, 14);
    this.disposables.push(bootGeo, shinGeo, thighGeo, pelvisGeo);

    const buildLeg = (side: -1 | 1): LegParts => {
      const baseZ = side === -1 ? -0.07 : 0.08;
      const boot = new THREE.Mesh(bootGeo, this.bootMat);
      const shin = new THREE.Mesh(shinGeo, this.pantsMat);
      const thigh = new THREE.Mesh(thighGeo, this.pantsMat);
      this.lowerBodyGroup.add(boot, shin, thigh);
      return { side, baseZ, thigh, shin, boot };
    };

    // -1 = enemy RIGHT leg, +1 = enemy LEFT leg
    this.rightLeg = buildLeg(-1);
    this.leftLeg = buildLeg(1);

    this.pelvisMesh = new THREE.Mesh(pelvisGeo, this.pantsMat);
    this.pelvisMesh.rotation.z = Math.PI / 2;
    this.pelvisMesh.position.set(0, 0.89, 0.0);
    this.lowerBodyGroup.add(this.pelvisMesh);

    // Articulated Upper Body Pivot at waist (y = 0.90m)
    // Enemy faces local +Z; enemy's own LEFT is local +X
    this.upperBodyPivot = new THREE.Group();
    this.upperBodyPivot.position.set(0, 0.9, 0);
    this.upperBodyPivot.rotation.order = 'YXZ';
    this.root.add(this.upperBodyPivot);

    // Sculpted beveled jacket torso overlapping waist seamlessly
    const torsoShape = new THREE.Shape();
    torsoShape.moveTo(-0.155, -0.03);
    torsoShape.lineTo(0.155, -0.03);
    torsoShape.lineTo(0.225, 0.49);
    torsoShape.lineTo(-0.225, 0.49);
    torsoShape.closePath();

    const torsoGeo = new THREE.ExtrudeGeometry(torsoShape, {
      depth: 0.18,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.03,
      bevelSegments: 2,
    });
    torsoGeo.translate(0, 0, -0.09);
    const torsoMesh = new THREE.Mesh(torsoGeo, this.jacketMat);
    this.upperBodyPivot.add(torsoMesh);

    // Tactical chest harness strap + collar trim
    const beltGeo = new THREE.BoxGeometry(0.42, 0.065, 0.255);
    const belt = new THREE.Mesh(beltGeo, this.bootMat);
    belt.position.set(0, 0.02, 0.0);
    this.upperBodyPivot.add(belt);

    const chestBandGeo = new THREE.BoxGeometry(0.45, 0.06, 0.26);
    const chestBand = new THREE.Mesh(chestBandGeo, this.bootMat);
    chestBand.position.set(0, 0.31, 0.0);
    this.upperBodyPivot.add(chestBand);

    const collarGeo = new THREE.TorusGeometry(0.105, 0.032, 8, 16);
    const collar = new THREE.Mesh(collarGeo, this.bootMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, 0.505, 0.005);
    this.upperBodyPivot.add(collar);

    // Neck cylinder
    const neckGeo = new THREE.CylinderGeometry(0.062, 0.078, 0.14, 12);
    const neckMesh = new THREE.Mesh(neckGeo, this.skinMat);
    neckMesh.position.set(0, 0.55, 0.015);
    this.upperBodyPivot.add(neckMesh);

    this.disposables.push(torsoGeo, beltGeo, chestBandGeo, collarGeo, neckGeo);

    // Articulated Head Pivot at neck top (y = 0.60 above waist -> ~1.50m ground height)
    this.headPivot = new THREE.Group();
    this.headPivot.position.set(0, 0.6, 0.02);
    this.headPivot.rotation.order = 'YXZ';
    this.upperBodyPivot.add(this.headPivot);

    const craniumGeo = new THREE.CapsuleGeometry(0.104, 0.095, 6, 14);
    const cranium = new THREE.Mesh(craniumGeo, this.skinMat);
    cranium.position.set(0, 0.145, 0);
    this.headPivot.add(cranium);

    const jawGeo = new THREE.CapsuleGeometry(0.068, 0.045, 6, 12);
    const jaw = new THREE.Mesh(jawGeo, this.skinMat);
    jaw.position.set(0, 0.045, 0.028);
    jaw.scale.set(0.94, 1, 0.92);
    this.headPivot.add(jaw);

    const browGeo = new THREE.BoxGeometry(0.132, 0.024, 0.045);
    const brow = new THREE.Mesh(browGeo, this.jacketMat);
    brow.position.set(0, 0.18, 0.092);
    this.headPivot.add(brow);

    const eyeGeo = new THREE.SphereGeometry(0.016, 8, 6);
    for (const side of [-1, 1] as const) {
      const eye = new THREE.Mesh(eyeGeo, this.eyeMat);
      eye.position.set(side * 0.038, 0.148, 0.102);
      this.headPivot.add(eye);
    }

    this.disposables.push(craniumGeo, jawGeo, browGeo, eyeGeo);

    // Articulated arms in tense zombie/sparring forward guard stance
    const shoulderCapGeo = new THREE.SphereGeometry(0.072, 10, 8);
    const armUpperGeo = new THREE.CapsuleGeometry(0.058, 0.22, 5, 10);
    const armForeGeo = new THREE.CapsuleGeometry(0.045, 0.23, 5, 10);
    const fistGeo = new THREE.SphereGeometry(0.046, 10, 8);
    const armbandGeo = new THREE.CylinderGeometry(0.063, 0.061, 0.065, 12);
    this.disposables.push(shoulderCapGeo, armUpperGeo, armForeGeo, fistGeo, armbandGeo);

    const buildEnemyArm = (side: -1 | 1): THREE.Group => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.265, 0.455, 0.0);

      const cap = new THREE.Mesh(shoulderCapGeo, this.jacketMat);
      shoulder.add(cap);

      const upper = new THREE.Mesh(armUpperGeo, this.jacketMat);
      upper.position.set(0, -0.135, 0.015);
      shoulder.add(upper);

      // Subtle tactical amber armband on enemy's left arm (+X)
      if (side === 1) {
        const armband = new THREE.Mesh(armbandGeo, this.harnessMat);
        armband.position.set(0, -0.14, 0.015);
        shoulder.add(armband);
      }

      const fore = new THREE.Mesh(armForeGeo, this.skinMat);
      fore.position.set(0, -0.34, 0.115);
      fore.rotation.x = -0.62;
      shoulder.add(fore);

      const fist = new THREE.Mesh(fistGeo, this.skinMat);
      fist.position.set(0, -0.45, 0.205);
      shoulder.add(fist);

      shoulder.rotation.x = -0.26;
      shoulder.rotation.z = side * 0.11;
      this.upperBodyPivot.add(shoulder);
      return shoulder;
    };

    // +X is enemy LEFT, -X is enemy RIGHT
    this.leftArmPivot = buildEnemyArm(1);
    this.rightArmPivot = buildEnemyArm(-1);

    // Subtle spatial contact pulse ring on target impact plane (visible briefly on hit)
    const ringGeo = new THREE.RingGeometry(0.045, 0.075, 18);
    this.contactRing = new THREE.Mesh(ringGeo, this.ringMat);
    this.contactRing.position.set(0.06, 0.42, 0.185);
    this.upperBodyPivot.add(this.contactRing);
    this.disposables.push(ringGeo);

    // Initialize default stance leg alignment
    this.updateLegPose(this.leftLeg, 0, 0, 0);
    this.updateLegPose(this.rightLeg, 0, 0, 0);
  }

  private updateLegPose(
    leg: LegParts,
    hipDropY: number,
    footOffsetZ: number,
    footLiftY: number
  ): void {
    const hipX = leg.side * 0.13;
    const hipY = 0.87 + hipDropY;
    const hipZ = leg.baseZ * 0.4;

    const footX = leg.side * 0.145;
    const ankleY = 0.14 + footLiftY;
    const footZ = leg.baseZ + footOffsetZ;

    // Boot sits flush on ground at footLiftY = 0 (boot center at 0.07m, height 0.14m -> bottom at 0.00m)
    leg.boot.position.set(footX, 0.07 + footLiftY, footZ + 0.04);
    leg.boot.rotation.x = -footLiftY * 2.2;

    // Natural forward knee bend proportional to hip dip & stride
    const kneeBendBias = Math.max(0.04, -hipDropY * 1.4 + Math.abs(footOffsetZ) * 0.22);
    const kneeX = (hipX + footX) * 0.5;
    const kneeY = (hipY + ankleY) * 0.5 + 0.015;
    const kneeZ = (hipZ + footZ) * 0.5 + kneeBendBias;

    // Thigh segment (hip -> knee)
    leg.thigh.position.set((hipX + kneeX) * 0.5, (hipY + kneeY) * 0.5, (hipZ + kneeZ) * 0.5);
    leg.thigh.rotation.x = Math.atan2(-(kneeZ - hipZ), -(kneeY - hipY));

    // Shin segment (knee -> ankle)
    leg.shin.position.set((kneeX + footX) * 0.5, (kneeY + ankleY) * 0.5, (kneeZ + footZ) * 0.5);
    leg.shin.rotation.x = Math.atan2(-(footZ - kneeZ), -(ankleY - kneeY));
  }

  public applyState(enemy: EnemySimState): void {
    this.root.visible = enemy.valid;
    if (!enemy.valid) return;

    this.root.position.set(enemy.x, enemy.y, enemy.z);
    this.root.rotation.y = enemy.yaw;

    // Pelvis & waist pivot drop smoothly together on forward fold / stance brace
    this.pelvisMesh.position.set(0, 0.89 + enemy.hipDropY, enemy.stepStride * 0.04);
    this.upperBodyPivot.position.set(0, 0.9 + enemy.hipDropY, enemy.stepStride * 0.04);

    // Involuntary stumbling stride: left leg steps forward (+Z) while right leg pushes back (-Z)
    const stride = enemy.stepStride;
    const leftLift = Math.sin(stride * Math.PI) * 0.048;
    const rightLift = stride > 0.55 ? Math.sin(((stride - 0.55) / 0.45) * Math.PI) * 0.025 : 0;
    this.updateLegPose(this.leftLeg, enemy.hipDropY, stride * 0.22, leftLift);
    this.updateLegPose(this.rightLeg, enemy.hipDropY, -stride * 0.15, rightLift);

    // Shadow disc subtly shifts with center of balance
    this.shadowDisc.position.set(enemy.localStaggerX * 0.2, 0.015, stride * 0.06);

    this.upperBodyPivot.rotation.set(
      enemy.torsoPitchX,
      enemy.torsoYawY,
      enemy.torsoRollZ
    );
    this.headPivot.rotation.set(
      enemy.headPitchX,
      enemy.headYawY,
      enemy.headRollZ
    );

    // Arm motion blends alertness, sideways stagger counterbalance, and forward-lunge gut-fold/brace
    const sideStagger = enemy.reactionType === 'SIDEWAYS_STAGGER' ? Math.abs(enemy.torsoRollZ) : 0;
    const alertRaise = enemy.alertBlend * 0.16;
    const fold = enemy.armFold;
    const brace = enemy.armBrace;

    // Base guard (-0.26) -> Alert raises slightly -> Fold pulls inward over gut -> Brace reaches forward to catch balance
    this.leftArmPivot.rotation.z =
      0.11 + sideStagger * 1.15 - fold * 0.24 + brace * 0.16;
    this.leftArmPivot.rotation.x =
      -0.26 - alertRaise - sideStagger * 0.55 + fold * 0.28 - brace * 0.62;

    this.rightArmPivot.rotation.z =
      -0.11 + sideStagger * 0.85 + fold * 0.24 - brace * 0.18;
    this.rightArmPivot.rotation.x =
      -0.26 - alertRaise + sideStagger * 0.72 + fold * 0.34 - brace * 0.52;

    // Subtle brief impact read on hit without cartoony flashing
    const flash = enemy.hitFlash;
    this.jacketMat.emissive.setRGB(flash * 0.22, flash * 0.11, flash * 0.04);
    this.skinMat.emissive.setRGB(flash * 0.28, flash * 0.14, flash * 0.05);

    if (flash > 0.02) {
      if (enemy.reactionType === 'FORWARD_STAGGER') {
        this.contactRing.position.set(-0.02, 0.16, 0.195);
      } else {
        this.contactRing.position.set(0.06, 0.42, 0.185);
      }
      this.contactRing.visible = true;
      const expand = 1 + (1 - flash) * 0.95;
      this.contactRing.scale.setScalar(expand);
      this.ringMat.opacity = flash * 0.55;
    } else {
      this.contactRing.visible = false;
      this.ringMat.opacity = 0;
    }
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
