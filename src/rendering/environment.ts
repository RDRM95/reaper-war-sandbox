import * as THREE from 'three';
import type { Environment } from '@/simulation/types';
import { Rng } from '@/core/rng';

/**
 * Space environments: procedural starfield, galaxy band, a planet with a
 * shader atmosphere, moon and sun. No external textures: everything is
 * generated at load time on a canvas or in shaders.
 */

function noiseCanvas(size: number, seed: number, paint: (ctx: CanvasRenderingContext2D, rng: Rng, size: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size / 2;
  const ctx = canvas.getContext('2d')!;
  paint(ctx, new Rng(seed), size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Value-noise helper for the planet painter. */
function makeNoise(rng: Rng, n = 64): (x: number, y: number) => number {
  const grid = new Float32Array(n * n);
  for (let i = 0; i < grid.length; i++) grid[i] = rng.next();
  const g = (x: number, y: number) => grid[((y % n) + n) % n * n + (((x % n) + n) % n)];
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = g(xi, yi);
    const b = g(xi + 1, yi);
    const c = g(xi, yi + 1);
    const d = g(xi + 1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

function fbm(noise: (x: number, y: number) => number, x: number, y: number, octaves = 5): number {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    v += amp * noise(x * f, y * f);
    amp *= 0.5;
    f *= 2.03;
  }
  return v;
}

export interface PlanetStyle {
  ocean: [number, number, number];
  land: [number, number, number];
  landHigh: [number, number, number];
  ice: [number, number, number];
  atmosphere: number;
  cloudiness: number;
  seaLevel: number;
  seed: number;
}

export const PLANET_STYLES: Record<string, PlanetStyle> = {
  earth: { ocean: [12, 38, 92], land: [52, 82, 40], landHigh: [128, 110, 78], ice: [225, 232, 240], atmosphere: 0x5aa4ff, cloudiness: 0.38, seaLevel: 0.5, seed: 7 },
  palaven: { ocean: [40, 70, 95], land: [150, 135, 100], landHigh: [200, 190, 160], ice: [230, 230, 220], atmosphere: 0xa0c8ff, cloudiness: 0.35, seaLevel: 0.46, seed: 19 },
  thessia: { ocean: [30, 60, 120], land: [90, 110, 120], landHigh: [170, 170, 190], ice: [235, 235, 245], atmosphere: 0x9fb0ff, cloudiness: 0.5, seaLevel: 0.52, seed: 31 },
  rannoch: { ocean: [60, 70, 80], land: [160, 120, 80], landHigh: [210, 180, 130], ice: [220, 215, 200], atmosphere: 0xffc890, cloudiness: 0.2, seaLevel: 0.3, seed: 43 },
  // Sur'Kesh: humid jungle world — shallow green seas, dense dark-green lowlands, misty highlands.
  surkesh: { ocean: [18, 70, 80], land: [40, 90, 44], landHigh: [120, 140, 90], ice: [225, 235, 225], atmosphere: 0x6fc0a8, cloudiness: 0.4, seaLevel: 0.44, seed: 57 },
};

export function makePlanetTexture(style: PlanetStyle, size = 1024): THREE.CanvasTexture {
  return noiseCanvas(size, style.seed, (ctx, rng, w) => {
    const h = w / 2;
    const noise = makeNoise(rng, 96);
    const noise2 = makeNoise(rng.fork('clouds'), 64);
    const img = ctx.createImageData(w, h);
    const d = img.data;
    for (let y = 0; y < h; y++) {
      const lat = (y / h - 0.5) * 2; // -1..1
      const polar = Math.pow(Math.abs(lat), 6);
      for (let x = 0; x < w; x++) {
        // Wrap horizontally by sampling in a cylinder.
        const u = x / w;
        const nx = Math.cos(u * Math.PI * 2) * 3 + 10;
        const ny = Math.sin(u * Math.PI * 2) * 3 + 10;
        const e = fbm(noise, nx + lat * 4, ny + lat * 7, 6) + 0.1 * fbm(noise, nx * 4, ny * 4, 3);
        const i = (y * w + x) * 4;
        let r: number, g: number, b: number;
        if (e < style.seaLevel) {
          const depth = (style.seaLevel - e) / style.seaLevel;
          r = style.ocean[0] * (1 - depth * 0.5);
          g = style.ocean[1] * (1 - depth * 0.4);
          b = style.ocean[2] * (1 - depth * 0.25);
        } else {
          const t = Math.min(1, (e - style.seaLevel) / (1 - style.seaLevel) * 2.2);
          r = style.land[0] + (style.landHigh[0] - style.land[0]) * t;
          g = style.land[1] + (style.landHigh[1] - style.land[1]) * t;
          b = style.land[2] + (style.landHigh[2] - style.land[2]) * t;
          // Coastal brightening.
          if (t < 0.08) {
            r = r * 0.7 + 150 * 0.3;
            g = g * 0.7 + 140 * 0.3;
            b = b * 0.7 + 100 * 0.3;
          }
        }
        // Ice caps.
        const iceMix = Math.min(1, Math.max(0, (polar - 0.25) * 3 + (e - 0.5) * 0.5));
        r = r + (style.ice[0] - r) * iceMix;
        g = g + (style.ice[1] - g) * iceMix;
        b = b + (style.ice[2] - b) * iceMix;
        // Clouds.
        const c = fbm(noise2, nx * 1.7 + 3, ny * 1.7 + lat * 5, 5);
        const cloud = Math.max(0, (c - (1 - style.cloudiness)) / style.cloudiness);
        const cm = Math.min(0.85, cloud * 1.2);
        r = r + (225 - r) * cm;
        g = g + (228 - g) * cm;
        b = b + (234 - b) * cm;
        d[i] = r;
        d[i + 1] = g;
        d[i + 2] = b;
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

const ATMOSPHERE_VERT = `
varying vec3 vNormal;
varying vec3 vView;
void main(){
  vNormal = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const ATMOSPHERE_FRAG = `
uniform vec3 color;
uniform float power;
varying vec3 vNormal;
varying vec3 vView;
void main(){
  float rim = 1.0 - max(dot(vNormal, vView), 0.0);
  float a = pow(rim, power);
  gl_FragColor = vec4(color, a * 0.7);
}`;

export function makeAtmosphere(radius: number, color: number): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, power: { value: 5.0 } },
    vertexShader: ATMOSPHERE_VERT,
    fragmentShader: ATMOSPHERE_FRAG,
    transparent: true,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.018, 64, 48), mat);
  m.renderOrder = -1;
  return m;
}

export function makeStarfield(count = 6000, radius = 180_000): THREE.Points {
  const rng = new Rng('stars');
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const u = rng.next() * 2 - 1;
    const th = rng.next() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    // Concentrate some stars along a galactic band.
    const band = rng.chance(0.35);
    let y = u;
    if (band) y = u * 0.25 + rng.gaussian(0, 0.08);
    pos[i * 3] = r * Math.cos(th) * radius;
    pos[i * 3 + 1] = y * radius;
    pos[i * 3 + 2] = r * Math.sin(th) * radius;
    const t = rng.next();
    const warm = t < 0.3;
    const c = new THREE.Color().setHSL(warm ? 0.08 : 0.6, warm ? 0.5 : 0.25, 0.75 + rng.next() * 0.25);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
    sizes[i] = rng.chance(0.03) ? 3.5 : rng.chance(0.2) ? 2.0 : 1.2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { pixelRatio: { value: 1 } },
    vertexShader: `
      attribute float size; attribute vec3 color; varying vec3 vColor; uniform float pixelRatio;
      void main(){ vColor = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * pixelRatio; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `
      varying vec3 vColor;
      void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); float a = smoothstep(0.5, 0.1, d); gl_FragColor = vec4(vColor, a); }`,
    transparent: true,
    depthWrite: false,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.name = 'starfield';
  return pts;
}

/** Soft galaxy band and nebula haze on a huge sphere. */
export function makeGalaxyBand(radius = 170_000): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 1024, 512);
  const rng = new Rng('galaxy');
  const noise = makeNoise(rng, 48);
  const img = ctx.createImageData(1024, 512);
  const d = img.data;
  for (let y = 0; y < 512; y++) {
    const lat = (y / 512 - 0.5) * 2;
    for (let x = 0; x < 1024; x++) {
      const u = x / 1024;
      const nx = Math.cos(u * Math.PI * 2) * 2 + 5;
      const ny = Math.sin(u * Math.PI * 2) * 2 + 5;
      const n = fbm(noise, nx * 2, ny * 2 + lat * 3, 5);
      const band = Math.exp(-Math.pow(lat * 3.2 + 0.3 * Math.sin(u * Math.PI * 4), 2));
      const v = band * (0.25 + n * 0.75) * 0.75;
      const i = (y * 1024 + x) * 4;
      d[i] = 110 * v + 30 * n * band;
      d[i + 1] = 100 * v + 20 * n * band;
      d[i + 2] = 150 * v + 40 * n * band;
      d[i + 3] = Math.min(255, 255 * v * 1.1);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), mat);
  m.rotation.z = 0.5;
  m.rotation.x = 0.2;
  m.renderOrder = -10;
  return m;
}

/**
 * The Citadel: Presidium ring (7.2 km diameter, canon) and five wards
 * (~44 km long, canon), built at render scale. Original procedural model.
 */
export function makeCitadel(): THREE.Group {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.5, roughness: 0.45 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a4250, metalness: 0.6, roughness: 0.5 });
  const lights = new THREE.MeshStandardMaterial({ color: 0xcfe4ff, emissive: 0x9fc8ff, emissiveIntensity: 1.8 });
  const ringR = 36; // 3.6 km radius
  const ring = new THREE.Mesh(new THREE.TorusGeometry(ringR, 5, 10, 48), hull);
  g.add(ring);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(ringR, 5.4, 10, 48, Math.PI * 2), lights);
  inner.scale.set(1, 1, 0.2);
  g.add(inner);
  const hubGeo = new THREE.CylinderGeometry(ringR * 0.55, ringR * 0.55, 3, 32, 1, true);
  hubGeo.rotateX(Math.PI / 2);
  g.add(new THREE.Mesh(hubGeo, dark));
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 4, 40, 10), hull);
  tower.rotation.x = Math.PI / 2;
  tower.position.set(0, 0, 20);
  g.add(tower);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const ward = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(22, 9, 440), hull);
    body.position.set(0, 0, 220 + ringR * 0.6);
    ward.add(body);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(23, 1.2, 420), dark);
    plate.position.set(0, 5, 230 + ringR * 0.6);
    ward.add(plate);
    // Ward lights: city grid on the inner face.
    for (let j = 0; j < 14; j++) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(16, 0.4, 8), lights);
      strip.position.set(0, -4.8, 60 + ringR * 0.6 + j * 28);
      ward.add(strip);
    }
    // Wards attach at the ring and open outward (partially open Citadel).
    ward.position.set(Math.cos(a) * ringR, Math.sin(a) * ringR, 0);
    ward.rotation.z = a + Math.PI / 2;
    ward.rotation.x = -0.18;
    g.add(ward);
  }
  g.name = 'citadel';
  return g;
}

export interface EnvironmentBuild {
  group: THREE.Group;
  sunDirection: THREE.Vector3;
  /** Camera-relative objects that must follow the camera (skybox etc.). */
  skyObjects: THREE.Object3D[];
  planet?: THREE.Mesh;
  name: string;
}

/**
 * Build an environment. Planet radii are compressed (Earth drawn at 1/3 real
 * scale, placed so it fills the lower sky from a low-orbit battle) — this is
 * a visual choice, not a simulation value.
 */
export function buildEnvironment(env: Environment): EnvironmentBuild {
  const group = new THREE.Group();
  const sky: THREE.Object3D[] = [];
  const stars = makeStarfield();
  const band = makeGalaxyBand();
  sky.push(stars, band);
  group.add(stars, band);

  const sunDirection = new THREE.Vector3(0.55, 0.35, -0.75).normalize();
  let planet: THREE.Mesh | undefined;
  let name = 'Deep space';

  const addPlanet = (style: PlanetStyle, radius: number, position: THREE.Vector3, label: string, moon?: boolean) => {
    const tex = makePlanetTexture(style);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.0, color: 0xb8c0cc });
    const p = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 64), mat);
    p.position.copy(position);
    p.rotation.y = 1.2;
    p.name = 'planet';
    group.add(p);
    const atm = makeAtmosphere(radius, style.atmosphere);
    atm.position.copy(position);
    group.add(atm);
    planet = p;
    name = label;
    if (moon) {
      const mg = new THREE.MeshStandardMaterial({ color: 0x9a9a98, roughness: 1 });
      const m = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.27, 32, 24), mg);
      m.position.copy(position).add(new THREE.Vector3(radius * 4.5, radius * 1.4, -radius * 3.5));
      group.add(m);
    }
  };

  switch (env) {
    case 'earth_orbit':
      addPlanet(PLANET_STYLES.earth, 21_000, new THREE.Vector3(0, -24_500, 6_000), 'Earth orbit', true);
      break;
    case 'palaven_orbit':
      addPlanet(PLANET_STYLES.palaven, 19_000, new THREE.Vector3(2_000, -22_500, 4_000), 'Palaven orbit', true);
      break;
    case 'thessia_orbit':
      addPlanet(PLANET_STYLES.thessia, 20_000, new THREE.Vector3(-3_000, -23_500, 5_000), 'Thessia orbit');
      break;
    case 'rannoch_orbit':
      addPlanet(PLANET_STYLES.rannoch, 18_000, new THREE.Vector3(0, -21_500, 7_000), 'Rannoch orbit');
      break;
    case 'surkesh_orbit':
      addPlanet(PLANET_STYLES.surkesh, 19_500, new THREE.Vector3(1_500, -23_000, 5_500), 'Sur’Kesh orbit', true);
      break;
    case 'citadel': {
      const citadel = makeCitadel();
      citadel.position.set(-520, -120, 260);
      citadel.rotation.set(0.5, 0.9, 0.2);
      group.add(citadel);
      // Serpent Nebula haze.
      const haze = new THREE.Mesh(new THREE.SphereGeometry(150_000, 24, 12), new THREE.MeshBasicMaterial({ color: 0x5a3a8a, side: THREE.BackSide, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
      haze.renderOrder = -9;
      group.add(haze);
      sky.push(haze);
      name = 'The Citadel, Serpent Nebula';
      break;
    }
    case 'relay':
    case 'deep_space':
      break;
  }

  // Sun glare sprite far along the sun direction.
  const sunCanvas = document.createElement('canvas');
  sunCanvas.width = sunCanvas.height = 256;
  const sctx = sunCanvas.getContext('2d')!;
  const grad = sctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,255,250,1)');
  grad.addColorStop(0.08, 'rgba(255,250,230,1)');
  grad.addColorStop(0.2, 'rgba(255,230,180,0.5)');
  grad.addColorStop(1, 'rgba(255,200,120,0)');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 256, 256);
  const sunTex = new THREE.CanvasTexture(sunCanvas);
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sun.position.copy(sunDirection).multiplyScalar(150_000);
  sun.scale.setScalar(26_000);
  sun.name = 'sun';
  group.add(sun);
  sky.push(sun);

  return { group, sunDirection, skyObjects: sky, planet, name };
}
