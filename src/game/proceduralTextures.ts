import * as THREE from 'three';

export interface GymTextures {
  asphaltMap: THREE.CanvasTexture;
  asphaltBump: THREE.CanvasTexture;
  concreteMap: THREE.CanvasTexture;
  concreteBump: THREE.CanvasTexture;
  amberMetricMap: THREE.CanvasTexture;
  hazardChevronMap: THREE.CanvasTexture;
  corrugatedMap: THREE.CanvasTexture;
  corrugatedBump: THREE.CanvasTexture;
  dispose: () => void;
}

function configureTexture(
  tex: THREE.CanvasTexture,
  isColor: boolean,
  repeatX: number,
  repeatY: number,
  anisotropy: number
): THREE.CanvasTexture {
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createGymTextures(maxAnisotropy: number): GymTextures {
  const aniso = Math.min(8, Math.max(1, maxAnisotropy));

  // 1. Weathered Asphalt Yard (512x512, crisp hairline expansion joints)
  const asphaltCanvas = document.createElement('canvas');
  asphaltCanvas.width = 512;
  asphaltCanvas.height = 512;
  const actx = asphaltCanvas.getContext('2d')!;
  actx.fillStyle = '#36393c';
  actx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 6500; i++) {
    const x = (i * 131) % 512;
    const y = (i * 257) % 512;
    const v = 46 + ((i * 29) % 24);
    actx.fillStyle = `rgb(${v},${v + 1},${v + 2})`;
    actx.fillRect(x, y, 2, 2);
  }
  actx.strokeStyle = 'rgba(18, 20, 22, 0.35)';
  actx.lineWidth = 2;
  actx.strokeRect(0, 0, 512, 512);
  actx.strokeStyle = 'rgba(72, 76, 80, 0.18)';
  actx.lineWidth = 1;
  actx.beginPath();
  actx.moveTo(256, 0);
  actx.lineTo(256, 512);
  actx.moveTo(0, 256);
  actx.lineTo(512, 256);
  actx.stroke();

  const asphaltBumpCanvas = document.createElement('canvas');
  asphaltBumpCanvas.width = 512;
  asphaltBumpCanvas.height = 512;
  const abctx = asphaltBumpCanvas.getContext('2d')!;
  abctx.fillStyle = '#808080';
  abctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 6500; i++) {
    const x = (i * 131) % 512;
    const y = (i * 257) % 512;
    const g = 96 + ((i * 31) % 64);
    abctx.fillStyle = `rgb(${g},${g},${g})`;
    abctx.fillRect(x, y, 2, 2);
  }

  // 2. Architectural Concrete (with formwork seams)
  const concCanvas = document.createElement('canvas');
  concCanvas.width = 256;
  concCanvas.height = 256;
  const cctx = concCanvas.getContext('2d')!;
  cctx.fillStyle = '#73787c';
  cctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i++) {
    const x = (i * 59) % 256;
    const y = (i * 113) % 256;
    const v = 102 + ((i * 19) % 24);
    cctx.fillStyle = `rgb(${v},${v + 2},${v + 3})`;
    cctx.fillRect(x, y, 3, 2);
  }
  cctx.strokeStyle = 'rgba(38, 40, 42, 0.35)';
  cctx.lineWidth = 2;
  cctx.beginPath();
  cctx.moveTo(0, 128);
  cctx.lineTo(256, 128);
  cctx.moveTo(128, 0);
  cctx.lineTo(128, 256);
  cctx.stroke();

  const concBumpCanvas = document.createElement('canvas');
  concBumpCanvas.width = 256;
  concBumpCanvas.height = 256;
  const cbctx = concBumpCanvas.getContext('2d')!;
  cbctx.fillStyle = '#808080';
  cbctx.fillRect(0, 0, 256, 256);
  cbctx.strokeStyle = '#484848';
  cbctx.lineWidth = 3;
  cbctx.beginPath();
  cbctx.moveTo(0, 128);
  cbctx.lineTo(256, 128);
  cbctx.moveTo(128, 0);
  cbctx.lineTo(128, 256);
  cbctx.stroke();

  // 3. Industrial Amber Metric Block Trim
  const ambCanvas = document.createElement('canvas');
  ambCanvas.width = 256;
  ambCanvas.height = 256;
  const amctx = ambCanvas.getContext('2d')!;
  amctx.fillStyle = '#bd7b30';
  amctx.fillRect(0, 0, 256, 256);
  amctx.fillStyle = 'rgba(28, 22, 16, 0.2)';
  for (let x = -256; x < 512; x += 32) {
    amctx.beginPath();
    amctx.moveTo(x, 0);
    amctx.lineTo(x + 12, 0);
    amctx.lineTo(x - 16, 30);
    amctx.lineTo(x - 28, 30);
    amctx.closePath();
    amctx.fill();
  }
  amctx.strokeStyle = 'rgba(255, 228, 185, 0.28)';
  amctx.lineWidth = 2;
  amctx.strokeRect(4, 4, 248, 248);

  // 4. Hazard Chevron Stripe (for low crouch duct clearance beam)
  const hazCanvas = document.createElement('canvas');
  hazCanvas.width = 256;
  hazCanvas.height = 64;
  const hctx = hazCanvas.getContext('2d')!;
  hctx.fillStyle = '#d98a36';
  hctx.fillRect(0, 0, 256, 64);
  hctx.fillStyle = '#1b1e21';
  for (let x = -64; x < 320; x += 48) {
    hctx.beginPath();
    hctx.moveTo(x, 0);
    hctx.lineTo(x + 24, 0);
    hctx.lineTo(x - 12, 64);
    hctx.lineTo(x - 36, 64);
    hctx.closePath();
    hctx.fill();
  }

  // 5. Corrugated Container Steel
  const corrCanvas = document.createElement('canvas');
  corrCanvas.width = 256;
  corrCanvas.height = 256;
  const sctx = corrCanvas.getContext('2d')!;
  const sbCanvas = document.createElement('canvas');
  sbCanvas.width = 256;
  sbCanvas.height = 256;
  const sbctx = sbCanvas.getContext('2d')!;
  for (let x = 0; x < 256; x += 16) {
    sctx.fillStyle = '#44555e';
    sctx.fillRect(x, 0, 8, 256);
    sctx.fillStyle = '#334148';
    sctx.fillRect(x + 8, 0, 8, 256);

    sbctx.fillStyle = '#b8b8b8';
    sbctx.fillRect(x, 0, 8, 256);
    sbctx.fillStyle = '#484848';
    sbctx.fillRect(x + 8, 0, 8, 256);
  }

  const asphaltMap = configureTexture(new THREE.CanvasTexture(asphaltCanvas), true, 64, 64, aniso);
  const asphaltBump = configureTexture(new THREE.CanvasTexture(asphaltBumpCanvas), false, 64, 64, aniso);
  const concreteMap = configureTexture(new THREE.CanvasTexture(concCanvas), true, 2, 2, aniso);
  const concreteBump = configureTexture(new THREE.CanvasTexture(concBumpCanvas), false, 2, 2, aniso);
  const amberMetricMap = configureTexture(new THREE.CanvasTexture(ambCanvas), true, 1, 1, aniso);
  const hazardChevronMap = configureTexture(new THREE.CanvasTexture(hazCanvas), true, 3, 1, aniso);
  const corrugatedMap = configureTexture(new THREE.CanvasTexture(corrCanvas), true, 2, 1, aniso);
  const corrugatedBump = configureTexture(new THREE.CanvasTexture(sbCanvas), false, 2, 1, aniso);

  return {
    asphaltMap,
    asphaltBump,
    concreteMap,
    concreteBump,
    amberMetricMap,
    hazardChevronMap,
    corrugatedMap,
    corrugatedBump,
    dispose: () => {
      asphaltMap.dispose();
      asphaltBump.dispose();
      concreteMap.dispose();
      concreteBump.dispose();
      amberMetricMap.dispose();
      hazardChevronMap.dispose();
      corrugatedMap.dispose();
      corrugatedBump.dispose();
    },
  };
}

export function createStationPlaqueTexture(title: string, subtitle: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#171a1d';
  ctx.fillRect(0, 0, 512, 192);
  ctx.fillStyle = '#d98a36';
  ctx.fillRect(0, 0, 14, 192);
  ctx.strokeStyle = '#485057';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 508, 188);

  ctx.fillStyle = '#f2ede4';
  ctx.font = '700 46px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(title, 34, 82);

  ctx.fillStyle = '#d98a36';
  ctx.font = '600 24px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(subtitle, 34, 136);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
