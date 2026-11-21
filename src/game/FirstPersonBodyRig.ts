import * as THREE from 'three';
import type { ArmPose, FirstPersonPose } from './firstPersonAnimator';

interface FingerChain {
  proxPivot: THREE.Group;
  distPivot: THREE.Group;
  lengthScale: number;
}

interface ArmChain {
  side: -1 | 1;
  shoulderPivot: THREE.Group;
  elbowPivot: THREE.Group;
  forearmTwistPivot: THREE.Group;
  wristPivot: THREE.Group;
  thumbBasePivot: THREE.Group;
  thumbDistPivot: THREE.Group;
  fingers: FingerChain[];
}

export class FirstPersonBodyRig {
  public readonly root: THREE.Group;
  private readonly rigPivot: THREE.Group;
  private readonly torsoPivot: THREE.Group;
  private readonly leftArm: ArmChain;
  private readonly rightArm: ArmChain;
  private readonly disposables: Array<{ dispose: () => void }> = [];

  private readonly sleeveMat: THREE.MeshStandardMaterial;
  private readonly cuffMat: THREE.MeshStandardMaterial;
  private readonly skinMat: THREE.MeshStandardMaterial;
  private readonly gloveMat: THREE.MeshStandardMaterial;
  private readonly knuckleMat: THREE.MeshStandardMaterial;
  private readonly strapMat: THREE.MeshStandardMaterial;
  private readonly metalMat: THREE.MeshStandardMaterial;
  private readonly watchAccentMat: THREE.MeshStandardMaterial;
  private readonly watchDialMat: THREE.MeshStandardMaterial;

  constructor() {
    this.root = new THREE.Group();
    this.rigPivot = new THREE.Group();
    this.rigPivot.rotation.order = 'YXZ';
    this.root.add(this.rigPivot);

    // Distinct calibrated PBR materials (roughness spread >= 0.25 across sleeve/skin/leather/metal)
    this.sleeveMat = new THREE.MeshStandardMaterial({
      color: 0x424943,
      roughness: 0.88,
      metalness: 0.04,
    });
    this.cuffMat = new THREE.MeshStandardMaterial({
      color: 0x2c312e,
      roughness: 0.82,
      metalness: 0.05,
    });
    this.skinMat = new THREE.MeshStandardMaterial({
      color: 0xb98567,
      roughness: 0.68,
      metalness: 0.02,
    });
    this.gloveMat = new THREE.MeshStandardMaterial({
      color: 0x23262a,
      roughness: 0.5,
      metalness: 0.1,
    });
    this.knuckleMat = new THREE.MeshStandardMaterial({
      color: 0x8f5d32,
      roughness: 0.46,
      metalness: 0.08,
    });
    this.strapMat = new THREE.MeshStandardMaterial({
      color: 0x1a1d20,
      roughness: 0.6,
      metalness: 0.12,
    });
    this.metalMat = new THREE.MeshStandardMaterial({
      color: 0x8d959c,
      roughness: 0.26,
      metalness: 0.82,
    });
    this.watchAccentMat = new THREE.MeshStandardMaterial({
      color: 0xd98a36,
      roughness: 0.32,
      metalness: 0.65,
    });
    this.watchDialMat = new THREE.MeshStandardMaterial({
      color: 0x111518,
      emissive: 0x1d3b2c,
      emissiveIntensity: 0.45,
      roughness: 0.18,
      metalness: 0.2,
    });

    this.disposables.push(
      this.sleeveMat,
      this.cuffMat,
      this.skinMat,
      this.gloveMat,
      this.knuckleMat,
      this.strapMat,
      this.metalMat,
      this.watchAccentMat,
      this.watchDialMat
    );

    // Sculpted shared limb geometries (0.27m upper arm, 0.26m forearm, organic rolled cuff & rounded fingers)
    const upperArmGeo = this.createTaperedLimbLathe(0.275, [
      [0.0, 0.048],
      [0.06, 0.049],
      [0.16, 0.042],
      [0.24, 0.038],
      [0.275, 0.035],
    ]);
    const cuffGeo = this.createTaperedLimbLathe(0.05, [
      [0.0, 0.036],
      [0.012, 0.043],
      [0.036, 0.042],
      [0.048, 0.036],
    ]);
    const forearmGeo = this.createTaperedLimbLathe(0.265, [
      [0.0, 0.034],
      [0.045, 0.041],
      [0.13, 0.035],
      [0.21, 0.028],
      [0.26, 0.025],
    ]);
    const elbowCapGeo = new THREE.SphereGeometry(0.035, 10, 8);
    const knuckleSphereGeo = new THREE.SphereGeometry(0.0082, 8, 6);
    const proxPhalanxGeo = new THREE.CapsuleGeometry(0.0074, 0.022, 4, 8);
    const distPhalanxGeo = new THREE.CapsuleGeometry(0.0062, 0.018, 4, 8);
    const thumbProxGeo = new THREE.CapsuleGeometry(0.0086, 0.02, 4, 8);
    const thumbDistGeo = new THREE.CapsuleGeometry(0.007, 0.016, 4, 8);

    this.disposables.push(
      upperArmGeo,
      cuffGeo,
      forearmGeo,
      elbowCapGeo,
      knuckleSphereGeo,
      proxPhalanxGeo,
      distPhalanxGeo,
      thumbProxGeo,
      thumbDistGeo
    );

    // Lower torso / tactical chest rig (visible when looking down or pulling up)
    this.torsoPivot = this.buildTorso();
    this.rigPivot.add(this.torsoPivot);

    // Left & Right articulated arms
    this.leftArm = this.buildArm(-1, {
      upperArmGeo,
      cuffGeo,
      forearmGeo,
      elbowCapGeo,
      knuckleSphereGeo,
      proxPhalanxGeo,
      distPhalanxGeo,
      thumbProxGeo,
      thumbDistGeo,
    });
    this.rightArm = this.buildArm(1, {
      upperArmGeo,
      cuffGeo,
      forearmGeo,
      elbowCapGeo,
      knuckleSphereGeo,
      proxPhalanxGeo,
      distPhalanxGeo,
      thumbProxGeo,
      thumbDistGeo,
    });

    this.rigPivot.add(this.leftArm.shoulderPivot, this.rightArm.shoulderPivot);
  }

  private createTaperedLimbLathe(
    length: number,
    profile: Array<[number, number]>
  ): THREE.LatheGeometry {
    // Lathe revolves around +Y; invert Y so y runs from 0 (joint) down to -length (distal end)
    const pts = profile.map(([dist, radius]) => new THREE.Vector2(radius, -dist));
    pts.unshift(new THREE.Vector2(0.001, 0));
    pts.push(new THREE.Vector2(0.001, -length));
    const geo = new THREE.LatheGeometry(pts, 20);
    geo.computeVertexNormals();
    return geo;
  }

  private buildTorso(): THREE.Group {
    const group = new THREE.Group();
    group.position.set(0, -0.36, 0.04);

    // Sculpted beveled upper-chest jacket vest
    const chestShape = new THREE.Shape();
    chestShape.moveTo(-0.17, 0.22);
    chestShape.lineTo(0.17, 0.22);
    chestShape.lineTo(0.15, -0.24);
    chestShape.lineTo(-0.15, -0.24);
    chestShape.closePath();

    const chestGeo = new THREE.ExtrudeGeometry(chestShape, {
      depth: 0.14,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.02,
      bevelSegments: 2,
    });
    chestGeo.center();
    const chestMesh = new THREE.Mesh(chestGeo, this.sleeveMat);
    chestMesh.position.set(0, -0.02, 0.02);
    group.add(chestMesh);

    // Collar trim & tactical shoulder harness straps
    const collarGeo = new THREE.TorusGeometry(0.105, 0.024, 8, 16, Math.PI);
    const collar = new THREE.Mesh(collarGeo, this.cuffMat);
    collar.rotation.x = Math.PI / 2;
    collar.rotation.z = Math.PI;
    collar.position.set(0, 0.21, 0.02);
    group.add(collar);

    const strapGeo = new THREE.BoxGeometry(0.044, 0.42, 0.024);
    for (const side of [-1, 1] as const) {
      const strap = new THREE.Mesh(strapGeo, this.strapMat);
      strap.position.set(side * 0.095, 0.0, -0.068);
      strap.rotation.z = side * 0.06;
      group.add(strap);
    }

    const buckleGeo = new THREE.BoxGeometry(0.075, 0.042, 0.028);
    const buckle = new THREE.Mesh(buckleGeo, this.metalMat);
    buckle.position.set(0, 0.03, -0.076);
    group.add(buckle);

    this.disposables.push(chestGeo, collarGeo, strapGeo, buckleGeo);
    return group;
  }

  private buildArm(
    side: -1 | 1,
    geos: {
      upperArmGeo: THREE.BufferGeometry;
      cuffGeo: THREE.BufferGeometry;
      forearmGeo: THREE.BufferGeometry;
      elbowCapGeo: THREE.BufferGeometry;
      knuckleSphereGeo: THREE.BufferGeometry;
      proxPhalanxGeo: THREE.BufferGeometry;
      distPhalanxGeo: THREE.BufferGeometry;
      thumbProxGeo: THREE.BufferGeometry;
      thumbDistGeo: THREE.BufferGeometry;
    }
  ): ArmChain {
    const shoulderPivot = new THREE.Group();
    shoulderPivot.rotation.order = 'YXZ';

    const upperArmMesh = new THREE.Mesh(geos.upperArmGeo, this.sleeveMat);
    shoulderPivot.add(upperArmMesh);

    const cuffMesh = new THREE.Mesh(geos.cuffGeo, this.cuffMat);
    cuffMesh.position.set(0, -0.218, 0);
    shoulderPivot.add(cuffMesh);

    // Elbow joint at -0.27m along upper arm
    const elbowPivot = new THREE.Group();
    elbowPivot.position.set(0, -0.27, 0);
    shoulderPivot.add(elbowPivot);

    const elbowCap = new THREE.Mesh(geos.elbowCapGeo, this.skinMat);
    elbowPivot.add(elbowCap);

    // Forearm twist container around forearm Y axis
    const forearmTwistPivot = new THREE.Group();
    elbowPivot.add(forearmTwistPivot);

    const forearmMesh = new THREE.Mesh(geos.forearmGeo, this.skinMat);
    forearmTwistPivot.add(forearmMesh);

    // Wrist accessory: Tactical altimeter watch on Left wrist, athletic tape wrap on Right
    if (side === -1) {
      const watchStrapGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.024, 12);
      const watchStrap = new THREE.Mesh(watchStrapGeo, this.strapMat);
      watchStrap.position.set(0, -0.222, 0);
      forearmTwistPivot.add(watchStrap);

      const watchCaseGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.01, 12);
      const watchCase = new THREE.Mesh(watchCaseGeo, this.watchAccentMat);
      watchCase.rotation.z = Math.PI / 2;
      watchCase.position.set(-0.026, -0.222, -0.008);
      forearmTwistPivot.add(watchCase);

      const watchDialGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.011, 12);
      const watchDial = new THREE.Mesh(watchDialGeo, this.watchDialMat);
      watchDial.rotation.z = Math.PI / 2;
      watchDial.position.set(-0.027, -0.222, -0.008);
      forearmTwistPivot.add(watchDial);

      this.disposables.push(watchStrapGeo, watchCaseGeo, watchDialGeo);
    } else {
      const wrapGeo = new THREE.CylinderGeometry(0.0275, 0.027, 0.044, 12);
      const wrap = new THREE.Mesh(wrapGeo, this.cuffMat);
      wrap.position.set(0, -0.222, 0);
      forearmTwistPivot.add(wrap);
      this.disposables.push(wrapGeo);
    }

    // Wrist pivot at -0.26m along forearm
    const wristPivot = new THREE.Group();
    wristPivot.position.set(0, -0.26, 0);
    wristPivot.rotation.order = 'YXZ';
    forearmTwistPivot.add(wristPivot);

    // Sculpted beveled palm + fingerless glove wrap (palm faces inward: -side * X)
    const palmShape = new THREE.Shape();
    palmShape.moveTo(-0.036, 0.0);
    palmShape.lineTo(0.036, 0.0);
    palmShape.lineTo(0.041, -0.072);
    palmShape.lineTo(-0.038, -0.072);
    palmShape.closePath();

    const palmGeo = new THREE.ExtrudeGeometry(palmShape, {
      depth: 0.022,
      bevelEnabled: true,
      bevelThickness: 0.006,
      bevelSize: 0.006,
      bevelSegments: 2,
    });
    // Orient depth along X (palm thickness), height along -Y (wrist->knuckles), width along Z (thumb->pinky)
    palmGeo.rotateY(Math.PI / 2);
    palmGeo.translate(-0.011, 0, 0);
    const palmMesh = new THREE.Mesh(palmGeo, this.gloveMat);
    wristPivot.add(palmMesh);

    // Reinforced knuckle protector bar on dorsal outer face (+side * X)
    const knuckleBarGeo = new THREE.BoxGeometry(0.014, 0.022, 0.078);
    const knuckleBar = new THREE.Mesh(knuckleBarGeo, this.knuckleMat);
    knuckleBar.position.set(side * 0.014, -0.065, 0.001);
    wristPivot.add(knuckleBar);

    // Wrist glove strap & metal D-ring buckle on outer wrist
    const gloveCuffGeo = new THREE.BoxGeometry(0.036, 0.026, 0.066);
    const gloveCuff = new THREE.Mesh(gloveCuffGeo, this.strapMat);
    gloveCuff.position.set(0, -0.01, 0);
    wristPivot.add(gloveCuff);

    const buckleGeo = new THREE.BoxGeometry(0.008, 0.018, 0.018);
    const buckle = new THREE.Mesh(buckleGeo, this.metalMat);
    buckle.position.set(side * 0.019, -0.01, -0.012);
    wristPivot.add(buckle);

    this.disposables.push(palmGeo, knuckleBarGeo, gloveCuffGeo, buckleGeo);

    // Thumb chain on thumb (-Z) & palmar (-side * X) edge
    const thumbBasePivot = new THREE.Group();
    thumbBasePivot.position.set(-side * 0.008, -0.026, -0.036);
    thumbBasePivot.rotation.set(0.55, 0, -side * 0.42);
    wristPivot.add(thumbBasePivot);

    const thumbKnuckle = new THREE.Mesh(geos.knuckleSphereGeo, this.gloveMat);
    thumbBasePivot.add(thumbKnuckle);

    const thumbProxMesh = new THREE.Mesh(geos.thumbProxGeo, this.gloveMat);
    thumbProxMesh.position.set(0, -0.016, 0);
    thumbBasePivot.add(thumbProxMesh);

    const thumbDistPivot = new THREE.Group();
    thumbDistPivot.position.set(0, -0.032, 0);
    thumbBasePivot.add(thumbDistPivot);

    const thumbDistMesh = new THREE.Mesh(geos.thumbDistGeo, this.skinMat);
    thumbDistMesh.position.set(0, -0.013, 0);
    thumbDistPivot.add(thumbDistMesh);

    // 4 Articulated Fingers (Index -> Pinky across Z from -0.027 to +0.028)
    const fingerSpecs: Array<{ z: number; scale: number; splayZ: number }> = [
      { z: -0.027, scale: 1.0, splayZ: 0.06 },
      { z: -0.009, scale: 1.08, splayZ: 0.015 },
      { z: 0.01, scale: 1.0, splayZ: -0.02 },
      { z: 0.028, scale: 0.82, splayZ: -0.065 },
    ];

    const fingers: FingerChain[] = fingerSpecs.map((spec) => {
      const proxPivot = new THREE.Group();
      proxPivot.position.set(0, -0.075, spec.z);
      proxPivot.rotation.x = spec.splayZ;
      wristPivot.add(proxPivot);

      const mcpJoint = new THREE.Mesh(geos.knuckleSphereGeo, this.gloveMat);
      proxPivot.add(mcpJoint);

      const proxMesh = new THREE.Mesh(geos.proxPhalanxGeo, this.gloveMat);
      proxMesh.scale.set(1, spec.scale, 1);
      proxMesh.position.set(0, -0.017 * spec.scale, 0);
      proxPivot.add(proxMesh);

      const distPivot = new THREE.Group();
      distPivot.position.set(0, -0.034 * spec.scale, 0);
      proxPivot.add(distPivot);

      const pipJoint = new THREE.Mesh(geos.knuckleSphereGeo, this.skinMat);
      pipJoint.scale.setScalar(0.84);
      distPivot.add(pipJoint);

      const distMesh = new THREE.Mesh(geos.distPhalanxGeo, this.skinMat);
      distMesh.scale.set(1, spec.scale, 1);
      distMesh.position.set(0, -0.014 * spec.scale, 0);
      distPivot.add(distMesh);

      return {
        proxPivot,
        distPivot,
        lengthScale: spec.scale,
      };
    });

    return {
      side,
      shoulderPivot,
      elbowPivot,
      forearmTwistPivot,
      wristPivot,
      thumbBasePivot,
      thumbDistPivot,
      fingers,
    };
  }

  private applyArmPose(chain: ArmChain, pose: ArmPose): void {
    chain.shoulderPivot.position.set(pose.shoulderPos.x, pose.shoulderPos.y, pose.shoulderPos.z);
    chain.shoulderPivot.rotation.set(pose.shoulderRot.x, pose.shoulderRot.y, pose.shoulderRot.z);
    chain.elbowPivot.rotation.set(pose.elbowBend, 0, 0);
    chain.forearmTwistPivot.rotation.set(0, pose.forearmTwist, 0);
    chain.wristPivot.rotation.set(pose.wristRot.x, pose.wristRot.y, pose.wristRot.z);

    // Curl fingers inward toward palm (-side * X) around Z axis
    const proxAngle = -chain.side * (0.18 + pose.fingerCurl * 1.15);
    const distAngle = -chain.side * (0.22 + pose.fingerCurl * 1.25);
    for (let i = 0; i < chain.fingers.length; i++) {
      const f = chain.fingers[i];
      // Slight cascade offset so index-to-pinky curl feels organic rather than robotic
      const cascade = 1 + i * 0.07;
      f.proxPivot.rotation.z = proxAngle * cascade;
      f.distPivot.rotation.z = distAngle * cascade;
    }

    // Thumb opposes naturally across palm
    chain.thumbBasePivot.rotation.set(
      0.48 - pose.thumbCurl * 0.36,
      -chain.side * pose.thumbCurl * 0.42,
      -chain.side * (0.42 + pose.thumbCurl * 0.62)
    );
    chain.thumbDistPivot.rotation.z = -chain.side * (0.18 + pose.thumbCurl * 0.9);
  }

  public applyPose(pose: FirstPersonPose, visible: boolean): void {
    this.root.visible = visible;
    if (!visible) return;

    this.rigPivot.position.set(pose.rigOffset.x, pose.rigOffset.y, pose.rigOffset.z);
    this.rigPivot.rotation.set(
      pose.rigRot.x + pose.torsoPitchOffset,
      pose.rigRot.y,
      pose.rigRot.z
    );
    this.torsoPivot.rotation.x = pose.torsoPitchOffset * 1.25;

    this.applyArmPose(this.leftArm, pose.leftArm);
    this.applyArmPose(this.rightArm, pose.rightArm);
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
