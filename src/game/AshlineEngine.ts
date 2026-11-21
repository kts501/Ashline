import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createMovementGymColliders, type GymColliders } from './gymLayout';
import {
  createPlayerSimState,
  stepPlayerMovement,
  type PlayerMovementState,
  type PlayerSimInput,
  type PlayerSimState,
} from './movementPhysics';
import { DEFAULT_MOVEMENT_TUNING, type MovementTuning } from './movementTuning';
import type { ParkourActionType } from './parkourDetector';
import { createGymTextures, createStationPlaqueTexture, type GymTextures } from './proceduralTextures';
import { SoundEngine } from './soundEngine';
import {
  createFirstPersonAnimState,
  stepFirstPersonAnimation,
  type FirstPersonAnimState,
} from './firstPersonAnimator';
import { FirstPersonBodyRig } from './FirstPersonBodyRig';
import {
  createCombatSimState,
  createTestEnemyState,
  resolvePlayerEnemySeparation,
  stepCombatAndEnemy,
  type CombatAttackType,
  type CombatSimState,
  type CombatState,
  type EnemyForwardPhase,
  type EnemySimState,
  type EnemyState,
} from './combatSystem';
import { TestEnemyRig } from './TestEnemyRig';

export type GamePhase = 'title' | 'playing' | 'paused';

export interface HudSnapshot {
  movementState: PlayerMovementState;
  stamina: number;
  staminaMax: number;
  isExhausted: boolean;
  speed: number;
  grounded: boolean;
  onSteepSlope: boolean;
  isCrouching: boolean;
  pointerLocked: boolean;
  fps: number;
  posY: number;
  parkourPrompt: ParkourActionType | null;
  combatState: CombatState;
  activeAttack: CombatAttackType;
  comboWindowOpen: boolean;
  enemyState: EnemyState;
  forwardPhase: EnemyForwardPhase;
  hitMarkerActive: boolean;
}

export interface AshlineEngineCallbacks {
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onPauseRequested: () => void;
}

const _vec3A = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

export class AshlineEngine {
  private container: HTMLElement;
  private callbacks: AshlineEngineCallbacks;
  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private envTexture: THREE.Texture;
  private textures: GymTextures;
  private disposables: Array<{ dispose: () => void }> = [];

  private colliders: GymColliders;
  private tuning: MovementTuning;
  private player: PlayerSimState;
  private combat: CombatSimState;
  private enemy: EnemySimState;
  private enemyRig: TestEnemyRig;
  private sound = new SoundEngine();
  private fpAnim: FirstPersonAnimState;
  private fpRig: FirstPersonBodyRig;
  private prevYaw = 0;
  private prevPitch = 0;

  private phase: GamePhase = 'title';
  private keys = new Set<string>();
  private jumpQueued = false;
  private jumpReleasedQueued = false;
  private attackQueued = false;
  private leftMouseDown = false;
  private pitch = 0;
  private bobPhase = 0;
  private landingDipOffset = 0;
  private landingDipVel = 0;
  private combatImpactRollDeg = 0;
  private combatImpactPitch = 0;
  private currentRoll = 0;
  private currentFov = DEFAULT_MOVEMENT_TUNING.baseFov;
  private tourTime = 0;
  private isDraggingLook = false;
  private lastDragX = 0;
  private lastDragY = 0;
  private skipNextPointerLockMove = false;
  private ignorePointerMoveUntil = 0;

  private frameId = 0;
  private lastTimestamp = 0;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private currentFps = 60;
  private lastHudPush = 0;
  private destroyed = false;
  private resizeObserver: ResizeObserver;

  constructor(
    container: HTMLElement,
    initialTuning: MovementTuning,
    callbacks: AshlineEngineCallbacks
  ) {
    this.container = container;
    this.callbacks = callbacks;
    this.tuning = { ...initialTuning };
    this.colliders = createMovementGymColliders();
    this.player = createPlayerSimState(this.tuning);
    this.combat = createCombatSimState();
    this.enemy = createTestEnemyState({ x: 0, y: 0, z: 18.6, yaw: 0 });
    this.enemyRig = new TestEnemyRig();
    this.fpAnim = createFirstPersonAnimState();
    this.fpRig = new FirstPersonBodyRig();
    this.isSoftwareGl = detectSoftwareWebGL();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.container.appendChild(this.renderer.domElement);

    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);

    this.scene = new THREE.Scene();
    const skyFogColor = 0x7b8388;
    this.scene.background = new THREE.Color(skyFogColor);
    this.scene.fog = new THREE.FogExp2(skyFogColor, 0.0125);

    this.camera = new THREE.PerspectiveCamera(this.tuning.baseFov, width / height, 0.05, 220);
    this.camera.add(this.fpRig.root);
    this.scene.add(this.camera);
    this.scene.add(this.enemyRig.root);
    this.enemyRig.applyState(this.enemy);
    this.fpRig.applyPose(this.fpAnim.currentPose, false);
    this.renderer.setSize(width, height, false);

    // Mandatory studio environment map via PMREMGenerator
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTexture;
    pmrem.dispose();

    this.textures = createGymTextures(this.renderer.capabilities.getMaxAnisotropy());
    this.buildLighting();
    this.buildEnvironment();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

    this.lastTimestamp = performance.now();
    this.scheduleNextFrame();
  }

  private buildLighting(): void {
    const hemi = new THREE.HemisphereLight(0x9fb3c4, 0x2c2925, 0.9);
    hemi.position.set(0, 50, 0);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffe1bd, 1.75);
    sun.position.set(24, 34, 20);
    if (!this.isSoftwareGl) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.near = 2;
      sun.shadow.camera.far = 110;
      const d = 46;
      sun.shadow.camera.left = -d;
      sun.shadow.camera.right = d;
      sun.shadow.camera.top = d;
      sun.shadow.camera.bottom = -d;
      sun.shadow.bias = -0.0005;
      sun.shadow.normalBias = 0.02;
    }
    this.scene.add(sun);
  }

  private buildEnvironment(): void {
    // Extended quarantine asphalt terrain (bounds outdoor arena naturally with fog + walls)
    const groundGeo = new THREE.PlaneGeometry(320, 320, 1, 1);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.asphaltMap,
      bumpMap: this.textures.asphaltBump,
      bumpScale: 0.03,
      roughness: 0.92,
      metalness: 0.05,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.disposables.push(groundGeo, groundMat);

    // Materials for gym obstacles
    const concreteMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.concreteMap,
      bumpMap: this.textures.concreteBump,
      bumpScale: 0.02,
      roughness: 0.88,
      metalness: 0.05,
    });
    const amberMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.amberMetricMap,
      roughness: 0.72,
      metalness: 0.08,
    });
    const steepRedMat = new THREE.MeshStandardMaterial({
      color: 0xb6423a,
      roughness: 0.78,
      metalness: 0.06,
    });
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.corrugatedMap,
      bumpMap: this.textures.corrugatedBump,
      bumpScale: 0.04,
      roughness: 0.56,
      metalness: 0.42,
    });
    const darkTrimMat = new THREE.MeshStandardMaterial({
      color: 0x26292c,
      roughness: 0.45,
      metalness: 0.65,
    });
    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0xff5a36,
      emissive: 0xff4520,
      emissiveIntensity: 1.6,
      roughness: 0.3,
    });
    const hazardMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.hazardChevronMap,
      roughness: 0.65,
      metalness: 0.15,
    });
    const ledgeTrimMat = new THREE.MeshStandardMaterial({
      color: 0xe39b3b,
      roughness: 0.6,
      metalness: 0.1,
    });
    this.disposables.push(concreteMat, amberMat, steepRedMat, steelMat, darkTrimMat, beaconMat, hazardMat, ledgeTrimMat);

    const matForTag = (tag: string): THREE.MeshStandardMaterial => {
      if (tag === 'amber') return amberMat;
      if (tag === 'steep_red') return steepRedMat;
      if (tag === 'steel') return steelMat;
      return concreteMat;
    };

    // Build all collider boxes
    for (const b of this.colliders.boxes) {
      const w = b.maxX - b.minX;
      const h = b.maxY - b.minY;
      const d = b.maxZ - b.minZ;
      const geo = new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geo, matForTag(b.material));
      mesh.position.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
      mesh.castShadow = !this.isSoftwareGl;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.disposables.push(geo);

      // Visual parkour ledge-edge highlight trim strip on climbable/mantleable tops (recessed 4.5mm below top face to avoid Z-fighting)
      if (b.parkourLedge && b.material !== 'amber') {
        const trimGeo = new THREE.BoxGeometry(w + 0.05, 0.075, d + 0.05);
        const trimMesh = new THREE.Mesh(trimGeo, ledgeTrimMat);
        trimMesh.position.set((b.minX + b.maxX) / 2, b.maxY - 0.042, (b.minZ + b.maxZ) / 2);
        this.scene.add(trimMesh);
        this.disposables.push(trimGeo);
      }
    }

    // Hazard chevron lintel strip on front & rear lip of 1.2m street crouch duct
    const lintelGeo = new THREE.BoxGeometry(4.84, 0.24, 0.12);
    const frontLintel = new THREE.Mesh(lintelGeo, hazardMat);
    frontLintel.position.set(0, 1.32, -5.96);
    const backLintel = new THREE.Mesh(lintelGeo, hazardMat);
    backLintel.position.set(0, 1.32, -14.04);
    this.scene.add(frontLintel, backLintel);
    this.disposables.push(lintelGeo);

    // Hazard chevron lintel strip on Rooftop B narrow HVAC crouch passage (y=5.25)
    const hvacLintelGeo = new THREE.BoxGeometry(3.84, 0.22, 0.12);
    const hvacFront = new THREE.Mesh(hvacLintelGeo, hazardMat);
    hvacFront.position.set(-24.9, 5.36, -8.46);
    const hvacBack = new THREE.Mesh(hvacLintelGeo, hazardMat);
    hvacBack.position.set(-24.9, 5.36, -14.54);
    this.scene.add(hvacFront, hvacBack);
    this.disposables.push(hvacLintelGeo);

    // Hazard chevron lintels on Vault-Lane Slide Gate and East Flow Slide Beam (1.12m clearance)
    const vaultSlideGeo = new THREE.BoxGeometry(4.44, 0.24, 0.12);
    const vaultSlideFront = new THREE.Mesh(vaultSlideGeo, hazardMat);
    vaultSlideFront.position.set(7.0, 1.24, 1.24);
    const vaultSlideBack = new THREE.Mesh(vaultSlideGeo, hazardMat);
    vaultSlideBack.position.set(7.0, 1.24, -0.64);
    this.scene.add(vaultSlideFront, vaultSlideBack);
    this.disposables.push(vaultSlideGeo);

    const flowSlideGeo = new THREE.BoxGeometry(6.04, 0.24, 0.12);
    const flowSlideFront = new THREE.Mesh(flowSlideGeo, hazardMat);
    flowSlideFront.position.set(33.0, 1.24, 14.44);
    const flowSlideBack = new THREE.Mesh(flowSlideGeo, hazardMat);
    flowSlideBack.position.set(33.0, 1.24, 12.16);
    this.scene.add(flowSlideFront, flowSlideBack);
    this.disposables.push(flowSlideGeo);

    // Build all ramps as custom extruded/wedge meshes matching exact slope math
    for (const r of this.colliders.ramps) {
      const shape = new THREE.Shape();
      const len = r.startZ - r.endZ;
      shape.moveTo(0, 0);
      shape.lineTo(len, 0);
      shape.lineTo(len, r.topY);
      shape.closePath();

      const extrudeGeo = new THREE.ExtrudeGeometry(shape, {
        depth: r.maxX - r.minX,
        bevelEnabled: false,
      });
      // Rotate so shape X runs along -Z and extrude depth runs along +X
      extrudeGeo.rotateY(Math.PI / 2);
      const mesh = new THREE.Mesh(extrudeGeo, matForTag(r.material));
      mesh.position.set(r.minX, r.baseY, r.startZ);
      mesh.castShadow = !this.isSoftwareGl;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.disposables.push(extrudeGeo);
    }

    // Composite Landmark 1: Towering Ward 4 Water Tower (8+ parts)
    this.scene.add(this.buildWaterTower(0, -45, darkTrimMat, steelMat, beaconMat));

    // Composite Props: Quarantine Yard Light Poles
    const poleCoords: Array<[number, number, number]> = [
      [-18, 12, Math.PI * 0.25],
      [18, 12, -Math.PI * 0.25],
      [-18, -22, Math.PI * 0.75],
      [18, -22, -Math.PI * 0.75],
    ];
    for (const [px, pz, rotY] of poleCoords) {
      this.scene.add(this.buildLightPole(px, pz, rotY, concreteMat, darkTrimMat));
    }

    // Distant Brutalist Quarantine Skyline Silhouettes with rooftop penthouses
    const skylineMat = new THREE.MeshStandardMaterial({
      color: 0x3b4044,
      roughness: 0.95,
      metalness: 0.05,
    });
    this.disposables.push(skylineMat);
    const towerSpecs: Array<[number, number, number, number, number]> = [
      [-54, -56, 18, 34, 16],
      [-26, -64, 20, 46, 18],
      [26, -62, 22, 40, 18],
      [56, -52, 16, 28, 16],
      [-60, 10, 18, 30, 22],
      [60, -8, 18, 36, 24],
    ];
    for (const [tx, tz, tw, th, td] of towerSpecs) {
      const tGroup = new THREE.Group();
      tGroup.position.set(tx, 0, tz);

      const tGeo = new THREE.BoxGeometry(tw, th, td);
      const tMesh = new THREE.Mesh(tGeo, skylineMat);
      tMesh.position.y = th / 2;
      tGroup.add(tMesh);

      const crownGeo = new THREE.BoxGeometry(tw + 0.8, 1.2, td + 0.8);
      const crown = new THREE.Mesh(crownGeo, darkTrimMat);
      crown.position.y = th + 0.4;
      tGroup.add(crown);

      const mechGeo = new THREE.BoxGeometry(tw * 0.42, 3.6, td * 0.42);
      const mech = new THREE.Mesh(mechGeo, skylineMat);
      mech.position.set(tw * 0.12, th + 2.4, 0);
      tGroup.add(mech);

      this.scene.add(tGroup);
      this.disposables.push(tGeo, crownGeo, mechGeo);
    }

    // Upright industrial station signposts (crisp, readable at eye level)
    this.scene.add(this.buildStationSign(-9.2, 6.5, 0.25, '0.5m STEPS', 'AUTO STEP-UP + 2m DECK', darkTrimMat));
    this.scene.add(this.buildStationSign(-3.8, 3.2, 0.15, '1.0m / 2.0m', 'VAULT + MANTLE METRIC', darkTrimMat));
    this.scene.add(this.buildStationSign(3.1, -5.6, -0.15, '1.2m DUCT', 'CROUCH + CEILING CHECK', darkTrimMat));
    this.scene.add(this.buildStationSign(4.5, -3.5, -0.25, '15°-50° RAMP', 'WALKABLE vs 50° SLIDE', darkTrimMat));
    this.scene.add(this.buildStationSign(10.2, 19.2, -0.3, 'VAULT LANE', 'SMALL -> MED -> SLIDE', darkTrimMat));
    this.scene.add(this.buildStationSign(10.2, 2.2, -0.25, 'SLIDE GATE', 'SPRINT + C / CTRL', darkTrimMat));
    this.scene.add(this.buildStationSign(-21.2, 18.0, 0.3, 'ROOFTOP RUN', 'CLIMB -> MANTLE -> HVAC', darkTrimMat));
    this.scene.add(this.buildStationSign(28.5, 21.8, -0.25, 'FLOW CIRCUIT', 'VAULT -> SLIDE -> LEDGE', darkTrimMat));
  }

  private buildWaterTower(
    x: number,
    z: number,
    steelFrameMat: THREE.Material,
    tankMat: THREE.Material,
    beaconMat: THREE.Material
  ): THREE.Group {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const legGeo = new THREE.CylinderGeometry(0.24, 0.34, 15.5, 8);
    const legOffsets: Array<[number, number, number, number]> = [
      [-2.4, -2.4, 0.09, -0.09],
      [2.4, -2.4, 0.09, 0.09],
      [-2.4, 2.4, -0.09, -0.09],
      [2.4, 2.4, -0.09, 0.09],
    ];
    for (const [lx, lz, rx, rz] of legOffsets) {
      const leg = new THREE.Mesh(legGeo, steelFrameMat);
      leg.position.set(lx, 7.6, lz);
      leg.rotation.set(rx, 0, rz);
      leg.castShadow = !this.isSoftwareGl;
      group.add(leg);
    }

    // Catwalk ring
    const deckGeo = new THREE.CylinderGeometry(3.8, 3.8, 0.45, 16);
    const deck = new THREE.Mesh(deckGeo, steelFrameMat);
    deck.position.y = 14.8;
    group.add(deck);

    // Main riveted water tank cylinder
    const tankGeo = new THREE.CylinderGeometry(3.1, 3.1, 5.4, 18);
    const tank = new THREE.Mesh(tankGeo, tankMat);
    tank.position.y = 17.7;
    tank.castShadow = !this.isSoftwareGl;
    group.add(tank);

    // Conical roof cap
    const coneGeo = new THREE.ConeGeometry(3.4, 2.1, 18);
    const cone = new THREE.Mesh(coneGeo, steelFrameMat);
    cone.position.y = 21.4;
    group.add(cone);

    // Aviation warning beacon
    const beaconGeo = new THREE.SphereGeometry(0.28, 10, 8);
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.y = 22.65;
    group.add(beacon);

    this.disposables.push(legGeo, deckGeo, tankGeo, coneGeo, beaconGeo);
    return group;
  }

  private buildLightPole(
    x: number,
    z: number,
    rotY: number,
    baseMat: THREE.Material,
    poleMat: THREE.Material
  ): THREE.Group {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotY;

    const plinthGeo = new THREE.BoxGeometry(0.8, 0.6, 0.8);
    const plinth = new THREE.Mesh(plinthGeo, baseMat);
    plinth.position.y = 0.3;
    group.add(plinth);

    const mastGeo = new THREE.CylinderGeometry(0.09, 0.14, 7.2, 8);
    const mast = new THREE.Mesh(mastGeo, poleMat);
    mast.position.y = 4.2;
    group.add(mast);

    const armGeo = new THREE.BoxGeometry(0.1, 0.1, 1.8);
    const arm = new THREE.Mesh(armGeo, poleMat);
    arm.position.set(0, 7.7, -0.8);
    group.add(arm);

    const bulbGeo = new THREE.BoxGeometry(0.32, 0.12, 0.55);
    const bulbMat = new THREE.MeshStandardMaterial({
      color: 0xffd089,
      emissive: 0xffa73b,
      emissiveIntensity: 1.4,
      roughness: 0.35,
    });
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(0, 7.62, -1.55);
    group.add(bulb);

    this.disposables.push(plinthGeo, mastGeo, armGeo, bulbGeo, bulbMat);
    return group;
  }

  private buildStationSign(
    x: number,
    z: number,
    rotY: number,
    title: string,
    subtitle: string,
    postMat: THREE.Material
  ): THREE.Group {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotY;

    const postGeo = new THREE.CylinderGeometry(0.045, 0.055, 1.35, 8);
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.y = 0.675;
    group.add(post);

    const backingGeo = new THREE.BoxGeometry(1.74, 0.68, 0.06);
    const backing = new THREE.Mesh(backingGeo, postMat);
    backing.position.y = 1.48;
    group.add(backing);

    const tex = createStationPlaqueTexture(title, subtitle);
    const faceGeo = new THREE.PlaneGeometry(1.66, 0.6);
    const faceMat = new THREE.MeshBasicMaterial({ map: tex });
    const face = new THREE.Mesh(faceGeo, faceMat);
    face.position.set(0, 1.48, 0.034);
    group.add(face);

    this.disposables.push(postGeo, backingGeo, tex, faceGeo, faceMat);
    return group;
  }

  private bindEvents(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onWindowBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('mousemove', this.onMouseMove);
    this.renderer.domElement.addEventListener('mousedown', this.onCanvasMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.phase !== 'playing') return;

    if (e.code === 'Space' && !e.repeat) {
      this.jumpQueued = true;
    }
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'Space') {
      this.jumpReleasedQueued = true;
    }
    this.keys.delete(e.code);
  };

  private onWindowBlur = (): void => {
    this.clearInputs();
  };

  private onVisibilityChange = (): void => {
    if (document.hidden) {
      this.clearInputs();
    }
  };

  private onPointerLockChange = (): void => {
    this.skipNextPointerLockMove = true;
    this.ignorePointerMoveUntil = performance.now() + 180;
    this.pushHudSnapshot(performance.now(), true);
  };

  private onCanvasMouseDown = (e: MouseEvent): void => {
    if (this.phase !== 'playing') return;
    this.sound.unlock();
    if (e.button === 0 && !this.leftMouseDown) {
      this.leftMouseDown = true;
      this.attackQueued = true;
    }
    if (document.pointerLockElement !== this.renderer.domElement) {
      try {
        void this.renderer.domElement.requestPointerLock?.();
      } catch {
        // Fallback drag look below if iframe blocks pointer lock
      }
      this.isDraggingLook = true;
      this.lastDragX = e.clientX;
      this.lastDragY = e.clientY;
    }
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) {
      this.leftMouseDown = false;
    }
    this.isDraggingLook = false;
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (this.phase !== 'playing') return;
    if (document.pointerLockElement === this.renderer.domElement) {
      if (this.skipNextPointerLockMove) {
        this.skipNextPointerLockMove = false;
        return;
      }
      if (performance.now() < this.ignorePointerMoveUntil) return;
      // Ignore synthetic cursor-warp spikes on pointer lock acquisition
      if (Math.abs(e.movementX) > 200 || Math.abs(e.movementY) > 200) return;
      this.player.yaw -= e.movementX * 0.0022;
      this.pitch = THREE.MathUtils.clamp(
        this.pitch - e.movementY * 0.0022,
        -1.48,
        1.48
      );
    } else if (this.isDraggingLook) {
      const dx = e.clientX - this.lastDragX;
      const dy = e.clientY - this.lastDragY;
      this.lastDragX = e.clientX;
      this.lastDragY = e.clientY;
      if (Math.abs(dx) > 200 || Math.abs(dy) > 200) return;
      this.player.yaw -= dx * 0.004;
      this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.004, -1.48, 1.48);
    }
  };

  public clearInputs(): void {
    this.keys.clear();
    this.jumpQueued = false;
    this.jumpReleasedQueued = false;
    this.attackQueued = false;
    this.leftMouseDown = false;
    this.isDraggingLook = false;
  }

  public setPhase(nextPhase: GamePhase): void {
    this.phase = nextPhase;
    if (nextPhase === 'playing') {
      this.clearInputs();
      this.sound.unlock();
      // Reset camera rig local offsets cleanly
      this.camera.rotation.order = 'YXZ';
      this.camera.fov = this.tuning.baseFov;
      this.camera.updateProjectionMatrix();
      this.pushHudSnapshot(performance.now(), true);
    } else {
      this.clearInputs();
      if (document.pointerLockElement === this.renderer.domElement) {
        document.exitPointerLock?.();
      }
    }
  }

  public resetPlayerSpawn(): void {
    this.player = createPlayerSimState(this.tuning);
    this.combat = createCombatSimState();
    this.enemy = createTestEnemyState({ x: 0, y: 0, z: 18.6, yaw: 0 });
    this.fpAnim = createFirstPersonAnimState();
    this.pitch = 0;
    this.prevYaw = this.player.yaw;
    this.prevPitch = 0;
    this.bobPhase = 0;
    this.landingDipOffset = 0;
    this.landingDipVel = 0;
    this.combatImpactRollDeg = 0;
    this.combatImpactPitch = 0;
    this.currentRoll = 0;
    this.currentFov = this.tuning.baseFov;
    this.enemyRig.applyState(this.enemy);
    this.fpRig.applyPose(this.fpAnim.currentPose, this.phase === 'playing');
    this.pushHudSnapshot(performance.now(), true);
  }

  public updateTuning(nextTuning: MovementTuning): void {
    this.tuning = { ...nextTuning };
  }

  public setMuted(muted: boolean): void {
    this.sound.setMuted(muted);
  }

  private handleResize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  private buildSimInput(dt: number): PlayerSimInput {
    // Support both WASD and Arrow keys; ArrowLeft/ArrowRight turn yaw if not strafing with A/D
    let forward = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) forward += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) forward -= 1;

    let right = 0;
    if (this.keys.has('KeyD')) right += 1;
    if (this.keys.has('KeyA')) right -= 1;

    if (this.keys.has('ArrowLeft')) this.player.yaw += 1.9 * dt;
    if (this.keys.has('ArrowRight')) this.player.yaw -= 1.9 * dt;

    const input: PlayerSimInput = {
      forward,
      right,
      sprintHeld: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
      crouchHeld:
        this.keys.has('KeyC') ||
        this.keys.has('ControlLeft') ||
        this.keys.has('ControlRight'),
      jumpPressed: this.jumpQueued,
      jumpHeld: this.keys.has('Space'),
      jumpReleased: this.jumpReleasedQueued,
      yaw: this.player.yaw,
    };

    this.jumpQueued = false;
    this.jumpReleasedQueued = false;
    return input;
  }

  private stepSimulation(rawDt: number, now: number): void {
    const frameDt = Math.min(Math.max(rawDt, 0.001), 0.25);

    if (this.phase === 'title') {
      this.fpRig.applyPose(this.fpAnim.currentPose, false);
      // Live world camera flyover framing Water Tower & Gym on right two-thirds
      this.tourTime += frameDt;
      const angle = 0.35 + Math.sin(this.tourTime * 0.14) * 0.28;
      this.camera.position.set(
        Math.sin(angle) * 23 - 6,
        9.5 + Math.sin(this.tourTime * 0.3) * 1.1,
        Math.cos(angle) * 20 + 4
      );
      _vec3A.set(4, 5.2, -16);
      this.camera.lookAt(_vec3A);
      this.camera.fov = 64;
      this.camera.updateProjectionMatrix();
      return;
    }

    if (this.phase === 'paused') {
      return;
    }

    // Fixed-cap sub-stepping ensures deterministic parkour/collision physics and 1:1 speed on older/low-FPS hardware
    const subSteps = Math.max(1, Math.ceil(frameDt / 0.02));
    const dt = frameDt / subSteps;

    const totalYawDelta = this.player.yaw - this.prevYaw;
    const totalPitchDelta = this.pitch - this.prevPitch;
    this.prevYaw = this.player.yaw;
    this.prevPitch = this.pitch;

    let bobY = 0;
    let bobX = 0;
    let lastRightInput = 0;
    let latestFpPose = this.fpAnim.currentPose;

    for (let s = 0; s < subSteps; s++) {
      const simInput = this.buildSimInput(dt);
      lastRightInput = simInput.right;
      const attackPressed = s === 0 && this.attackQueued;
      if (s === 0) this.attackQueued = false;

      const events = stepPlayerMovement(
        this.player,
        simInput,
        this.tuning,
        this.colliders,
        dt
      );
      resolvePlayerEnemySeparation(this.player, this.enemy);

      const combatEvents = stepCombatAndEnemy(
        this.combat,
        this.enemy,
        {
          x: this.player.x,
          y: this.player.y,
          z: this.player.z,
          eyeHeight: this.player.eyeHeight,
          yaw: this.player.yaw,
          movementState: this.player.movementState,
        },
        this.colliders,
        attackPressed,
        dt
      );

      if (combatEvents.attackStarted) {
        if (combatEvents.attackType === 'FOLLOW_UP_STRIKE') {
          this.sound.playFollowUpSwing();
        } else {
          this.sound.playHookSwing();
        }
      }
      if (combatEvents.contactRegistered) {
        if (combatEvents.contactAttackType === 'FOLLOW_UP_STRIKE') {
          this.sound.playFollowUpImpact();
          this.combatImpactRollDeg = 1.35;
          this.combatImpactPitch = -0.016;
        } else {
          this.sound.playHookImpact();
          this.combatImpactRollDeg = -1.65;
          this.combatImpactPitch = 0.018;
        }
      }

      if (events.jumped) this.sound.playJump();
      if (events.slideStarted) this.sound.playSlide();
      if (events.parkourStarted === 'VAULT') {
        this.sound.playVault();
      } else if (events.parkourStarted === 'CLIMB') {
        this.sound.playClimb();
      } else if (events.parkourStarted === 'MANTLE') {
        this.sound.playMantle();
        this.landingDipVel -= 2.2;
      }
      if (events.parkourCompleted !== null) {
        this.landingDipVel -= 1.6;
      }
      if (events.landedImpactSpeed !== null) {
        const dip = THREE.MathUtils.clamp(
          events.landedImpactSpeed * this.tuning.landingDipScale,
          0.02,
          0.24
        );
        this.landingDipVel -= dip * 18;
        this.sound.playLanding(events.landedImpactSpeed);
      }
      if (events.footstep) {
        this.sound.playFootstep(events.footstep.speedRatio, events.footstep.isSprinting);
      }
      if (events.becameExhausted) {
        this.sound.playExhausted();
      }

      // Spring-damped landing dip
      this.landingDipVel += (-this.landingDipOffset * 120 - this.landingDipVel * 18) * dt;
      this.landingDipOffset = THREE.MathUtils.clamp(
        this.landingDipOffset + this.landingDipVel * dt,
        -0.25,
        0.08
      );

      // Distance-synced head bob (suppressed while sliding)
      const horizSpeed = Math.hypot(this.player.vx, this.player.vz);
      if (this.player.grounded && !this.player.isSliding && horizSpeed > 0.25) {
        this.bobPhase += horizSpeed * this.tuning.headbobFrequency * dt;
        const amp =
          this.tuning.headbobAmplitude *
          (this.player.movementState === 'SPRINT'
            ? 1.25
            : this.player.isCrouching
              ? 0.55
              : 1.0);
        bobY = Math.abs(Math.sin(this.bobPhase)) * amp - amp * 0.5;
        bobX = Math.cos(this.bobPhase * 0.5) * amp * 0.45;
      } else {
        this.bobPhase = 0;
        bobY = 0;
        bobX = 0;
      }

      // Update articulated first-person body & hands animation pose
      const activeParkourInfo = this.player.activeParkour
        ? {
            type: this.player.activeParkour.opportunity.type,
            variant: this.player.activeParkour.opportunity.variant,
            progress: Math.min(
              1,
              this.player.activeParkour.elapsed /
                Math.max(0.05, this.player.activeParkour.opportunity.duration)
            ),
            hangRatio: this.player.activeParkour.opportunity.hangRatio,
            obstacleRelY: this.player.activeParkour.opportunity.obstacleTopY - this.player.y,
          }
        : null;

      latestFpPose = stepFirstPersonAnimation(
        this.fpAnim,
        {
          movementState: this.player.movementState,
          horizontalSpeed: horizSpeed,
          verticalVelocity: this.player.vy,
          grounded: this.player.grounded,
          isCrouching: this.player.isCrouching,
          isSliding: this.player.isSliding,
          pitch: this.pitch,
          yawDelta: totalYawDelta / subSteps,
          pitchDelta: totalPitchDelta / subSteps,
          activeParkour: activeParkourInfo,
          combat:
            this.combat.state !== 'IDLE'
              ? {
                  state: this.combat.state,
                  attackType: this.combat.activeAttack,
                  progress: Math.min(1, this.combat.elapsed / Math.max(0.05, this.combat.duration)),
                  hitRegistered: this.combat.contactRegistered,
                }
              : null,
          events,
          walkSpeed: this.tuning.walkSpeed,
          sprintSpeed: this.tuning.sprintSpeed,
        },
        dt
      );
    }

    this.fpRig.applyPose(latestFpPose, true);
    this.enemyRig.applyState(this.enemy);

    this.combatImpactRollDeg = THREE.MathUtils.damp(this.combatImpactRollDeg, 0, 16, frameDt);
    this.combatImpactPitch = THREE.MathUtils.damp(this.combatImpactPitch, 0, 16, frameDt);

    // Parkour & Slide camera feedback (controlled roll & pitch nod without losing aim control)
    let parkourRollDeg = 0;
    let parkourPitchOffset = 0;
    if (this.player.activeParkour) {
      const opp = this.player.activeParkour.opportunity;
      const p = Math.min(1, this.player.activeParkour.elapsed / opp.duration);
      const bell = Math.sin(p * Math.PI);
      if (opp.type === 'VAULT') {
        parkourRollDeg = opp.variant === 'MED_VAULT' ? 2.4 * bell : 3.4 * bell;
        parkourPitchOffset = opp.variant === 'MED_VAULT' ? -0.095 * bell : -0.07 * bell;
      } else if (opp.type === 'CLIMB') {
        parkourPitchOffset = -0.05 * bell;
      } else if (opp.type === 'MANTLE') {
        const hangR = opp.hangRatio > 0 ? opp.hangRatio : 0.28;
        if (p < hangR) {
          const hu = Math.sin((p / hangR) * Math.PI);
          parkourPitchOffset = 0.045 * hu;
          parkourRollDeg = -1.1 * hu;
        } else {
          const pu = (p - hangR) / (1 - hangR);
          const pBell = Math.sin(pu * Math.PI);
          parkourRollDeg = -1.9 * Math.sin(pu * Math.PI * 2);
          parkourPitchOffset = -0.14 * pBell;
        }
      }
    } else if (this.player.isSliding) {
      parkourRollDeg = -3.8;
      parkourPitchOffset = 0.03;
    }

    // Apply camera transform
    const cosY = Math.cos(this.player.yaw);
    const sinY = Math.sin(this.player.yaw);
    this.camera.position.set(
      this.player.x + cosY * bobX,
      this.player.y + this.player.eyeHeight + this.landingDipOffset + bobY,
      this.player.z - sinY * bobX
    );

    const targetRoll = THREE.MathUtils.degToRad(
      -lastRightInput * this.tuning.strafeTiltDeg + parkourRollDeg + this.combatImpactRollDeg
    );
    this.currentRoll = THREE.MathUtils.damp(this.currentRoll, targetRoll, 12, frameDt);

    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(
      THREE.MathUtils.clamp(this.pitch + parkourPitchOffset + this.combatImpactPitch, -1.5, 1.5),
      this.player.yaw,
      this.currentRoll
    );

    const targetFov = this.player.isSliding
      ? this.tuning.sprintFov + this.tuning.slideFovBoost
      : this.player.movementState === 'SPRINT' || this.player.movementState === 'VAULTING'
        ? this.tuning.sprintFov
        : this.player.isCrouching
          ? this.tuning.crouchFov
          : this.tuning.baseFov;
    const nextFov = THREE.MathUtils.damp(
      this.currentFov,
      targetFov,
      this.tuning.fovLerpSpeed,
      frameDt
    );
    if (Math.abs(nextFov - this.currentFov) > 0.01) {
      this.currentFov = nextFov;
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }

    // Throttled HUD update (~15 Hz)
    if (now - this.lastHudPush >= 65) {
      this.pushHudSnapshot(now, false);
    }
  }

  private pushHudSnapshot(now: number, force: boolean): void {
    if (!force && now - this.lastHudPush < 50) return;
    this.lastHudPush = now;
    this.callbacks.onHudUpdate({
      movementState: this.player.movementState,
      stamina: this.player.stamina.current,
      staminaMax: this.player.stamina.maximum,
      isExhausted: this.player.stamina.isExhausted,
      speed: Math.hypot(this.player.vx, this.player.vz),
      grounded: this.player.grounded,
      onSteepSlope: this.player.onSteepSlope,
      isCrouching: this.player.isCrouching,
      pointerLocked: document.pointerLockElement === this.renderer.domElement,
      fps: this.currentFps,
      posY: this.player.y,
      parkourPrompt: this.player.availableParkour?.type ?? null,
      combatState: this.combat.state,
      activeAttack: this.combat.activeAttack,
      comboWindowOpen: this.combat.comboWindowOpen,
      enemyState: this.enemy.state,
      forwardPhase: this.enemy.forwardPhase,
      hitMarkerActive: this.combat.hitFlashTimer > 0,
    });
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.destroyed) return;
        const status = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (status === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } else {
      this.frameId = window.setTimeout(cb, 80);
    }
  }

  private scheduleNextFrame(): void {
    if (this.destroyed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  private tick = (): void => {
    if (this.destroyed) return;
    const now = performance.now();
    const rawDt = Math.max(0.001, (now - this.lastTimestamp) / 1000);
    this.lastTimestamp = now;

    this.fpsAccum += rawDt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.currentFps = Math.round(this.fpsFrames / this.fpsAccum);
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }

    this.stepSimulation(rawDt, now);
    this.renderer.render(this.scene, this.camera);
    this.scheduleNextFrame();
  };

  public dispose(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.resizeObserver.disconnect();

    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('mousemove', this.onMouseMove);
    this.renderer.domElement.removeEventListener('mousedown', this.onCanvasMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);

    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock?.();
    }

    this.sound.dispose();
    this.fpRig.dispose();
    this.enemyRig.dispose();
    this.textures.dispose();
    this.envTexture.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
