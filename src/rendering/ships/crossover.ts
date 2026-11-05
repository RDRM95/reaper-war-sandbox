import * as THREE from 'three';
import { at, latheBody, merge, rot, taperedBox, taperedTube, wedge, zCylinder } from '../geometry';
import type { BuiltShip } from './types';

/** Original, deliberately simplified crossover stand-ins. The silhouettes are
 * inspired by their settings; these contain no extracted meshes or textures.
 * Geometry is merged by material and cached by the ordinary ship registry. */
type Family = 'unsc' | 'covenant' | 'imperium' | 'chaos';
type Layer = 'hull' | 'hullDark' | 'accent' | 'engine' | 'windows';
type Parts = Record<Layer, THREE.BufferGeometry[]>;
type Palette = Record<Layer, THREE.MeshStandardMaterial>;

const metal = (color: number, roughness = 0.45) => new THREE.MeshStandardMaterial({ color, metalness: 0.65, roughness });
const light = (color: number, strength: number) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: strength, metalness: 0.15, roughness: 0.4 });
const PALETTES: Record<Family, Palette> = {
  unsc: { hull: metal(0x7e8987), hullDark: metal(0x232e32), accent: metal(0x3c584c), engine: light(0x8fcbff, 3), windows: light(0xc9e6ee, 1.4) },
  covenant: { hull: metal(0x604a91, 0.27), hullDark: metal(0x291d47, 0.3), accent: metal(0xa889bf, 0.25), engine: light(0xc87aff, 3), windows: light(0x91f1ed, 1.8) },
  imperium: { hull: metal(0x4e6356), hullDark: metal(0x252d30), accent: metal(0xc1a675), engine: light(0xffb45c, 3), windows: light(0xffd59b, 1.8) },
  chaos: { hull: metal(0x683d38), hullDark: metal(0x261e28), accent: metal(0xb58261), engine: light(0xff4a35, 3), windows: light(0xf48757, 1.7) },
};
const GLOWS: Record<Family, number> = { unsc: 0x8fcbff, covenant: 0xc87aff, imperium: 0xffb45c, chaos: 0xff4a35 };
const parts = (): Parts => ({ hull: [], hullDark: [], accent: [], engine: [], windows: [] });
const sphere = (x: number, y: number, z: number) => new THREE.SphereGeometry(1, 16, 10).scale(x, y, z);
const curve = (points: number[][]) => new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p as [number, number, number])));

/** The visible hull, exhaust markers and muzzle use one normalization. Curved
 * wings and ram prows therefore cannot silently exceed the catalogue length. */
function finish(p: Parts, family: Family, length: number, engines: THREE.Vector3[], muzzle: THREE.Vector3): BuiltShip {
  const group = new THREE.Group();
  for (const name of Object.keys(p) as Layer[]) {
    if (!p[name].length) continue;
    const mesh = new THREE.Mesh(merge(p[name]), PALETTES[family][name]);
    mesh.name = name;
    group.add(mesh);
  }
  const box = new THREE.Box3().setFromObject(group);
  const centre = box.getCenter(new THREE.Vector3());
  const factor = length / box.getSize(new THREE.Vector3()).z;
  group.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) { mesh.geometry.translate(-centre.x, -centre.y, -centre.z).scale(factor, factor, factor); mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere(); }
  });
  const transform = (point: THREE.Vector3) => point.sub(centre).multiplyScalar(factor);
  return { group, engineNodes: engines.map(transform), muzzle: transform(muzzle), lengthUnits: length, glowColor: GLOWS[family] };
}

function exhaust(p: Parts, positions: THREE.Vector3[], radius: number): void {
  for (const point of positions) {
    p.hullDark.push(at(zCylinder(radius * 1.2, radius, 0.055, 10, true), point.x, point.y, point.z + 0.02));
    p.engine.push(at(zCylinder(radius * 0.85, radius * 0.85, 0.008, 10), point.x, point.y, point.z));
  }
}

/** Axial MAC keel, stepped industrial armour and a large multi-nozzle stern. */
function unsc(length: number, carrier: boolean): BuiltShip {
  const p = parts(), width = carrier ? 0.31 : 0.25;
  p.hullDark.push(taperedBox(width * 0.42, 0.07, 0.91, 0.55, 1));
  for (const side of [-1, 1]) {
    p.hull.push(at(taperedBox(width * 0.29, 0.095, 0.72, 0.45, 1), side * width * 0.24, 0.015, 0.035));
    p.hull.push(at(taperedBox(width * 0.29, 0.10, 0.32, 0.9, 0.85), side * width * 0.33, 0.006, -0.27));
    p.hullDark.push(at(new THREE.BoxGeometry(0.018, 0.035, 0.48), side * width * 0.45, -0.005, -0.06));
    for (let i = 0; i < 7; i++) {
      const z = -0.30 + i * 0.073;
      p.accent.push(at(new THREE.BoxGeometry(width * 0.25, 0.012, 0.018), side * width * 0.24, 0.068, z));
      p.hullDark.push(at(new THREE.BoxGeometry(0.025, 0.022, 0.032), side * width * 0.45, 0.034, z));
    }
    if (carrier) {
      p.hullDark.push(at(new THREE.BoxGeometry(0.008, 0.037, 0.35), side * width * 0.50, 0.003, -0.02));
      for (const z of [-0.13, 0, 0.13]) p.windows.push(at(new THREE.BoxGeometry(0.010, 0.018, 0.077), side * width * 0.505, 0.004, z));
    }
  }
  // Separate armour terraces and a rear command island distinguish Infinity.
  const decks = carrier ? 4 : 3;
  for (let i = 0; i < decks; i++) p.hull.push(at(taperedBox(width * (0.65 - i * 0.10), 0.036, 0.32 - i * 0.06, 0.8, 1), 0, 0.055 + i * 0.029, -0.17 - i * 0.035));
  p.windows.push(at(new THREE.BoxGeometry(width * 0.30, 0.009, 0.015), 0, 0.062 + decks * 0.029, -0.12 - (decks - 1) * 0.035));
  p.hullDark.push(at(taperedBox(0.013, 0.09, 0.11, 0.45, 1), 0, 0.17, -0.27));
  // The long forward barrel reads as one spinal battery, separate from turrets.
  p.hullDark.push(at(taperedBox(carrier ? 0.045 : 0.032, 0.028, 0.64, 0.72, 1), 0, -0.027, 0.17));
  p.accent.push(at(new THREE.BoxGeometry(carrier ? 0.05 : 0.036, 0.034, 0.012), 0, -0.027, 0.485));
  // Two visible MAC bores match the independently cycling catalogue mounts.
  for (const side of [-1, 1]) {
    const r = carrier ? 0.007 : 0.004;
    p.hullDark.push(at(zCylinder(r * 1.5, r * 1.5, 0.025, 8), side * (carrier ? 0.017 : 0.009), -0.027, 0.483));
    p.engine.push(at(zCylinder(r, r, 0.003, 8), side * (carrier ? 0.017 : 0.009), -0.027, 0.497));
  }
  p.hull.push(at(taperedBox(width * 0.95, 0.14, 0.16, 0.9, 1), 0, 0, -0.37));
  const engines: THREE.Vector3[] = [];
  const columns = carrier ? 3 : 2;
  for (let i = 0; i < columns * 2; i++) engines.push(new THREE.Vector3((i % columns - (columns - 1) / 2) * width * 0.28, i < columns ? 0.035 : -0.035, -0.49));
  exhaust(p, engines, carrier ? 0.024 : 0.027);
  return finish(p, 'unsc', length, engines, new THREE.Vector3(0, -0.027, 0.494));
}

/** Smooth whale-like centre hull and swept, tapered crescent shoulders. */
function covenant(length: number, carrier: boolean): BuiltShip {
  const p = parts();
  const width = carrier ? 0.21 : 0.155;
  p.hull.push(latheBody([
    { z: -0.49, r: 0.009 }, { z: -0.37, r: width * 0.56 }, { z: -0.15, r: width },
    { z: 0.08, r: width * 0.96 }, { z: 0.30, r: width * 0.62 }, { z: 0.47, r: width * 0.12 }, { z: 0.49, r: 0.004 },
  ], 24, carrier ? 0.42 : 0.35));
  p.hullDark.push(at(sphere(width * 0.86, 0.047, 0.31), 0, -0.036, -0.015));
  p.accent.push(at(sphere(width * 0.77, carrier ? 0.065 : 0.04, 0.29), 0, 0.031, -0.045));
  for (const side of [-1, 1]) {
    const wing = curve([[side * 0.065, 0, -0.28], [side * 0.18, 0.009, -0.10], [side * (carrier ? 0.32 : 0.27), 0.013, 0.15], [side * 0.22, 0.018, 0.30], [side * 0.125, 0.006, 0.36]]);
    p.hull.push(taperedTube(wing, t => 0.043 * Math.pow(1 - t, 0.6) + 0.004, 18, 8).scale(1, 0.55, 1));
    const stripe = curve([[side * 0.09, 0.029, -0.22], [side * 0.20, 0.035, -0.02], [side * 0.24, 0.026, 0.17], [side * 0.15, 0.018, 0.30]]);
    p.accent.push(taperedTube(stripe, t => 0.009 * (1 - t) + 0.003, 14, 6));
    for (let i = 0; i < 5; i++) p.windows.push(at(sphere(0.013, 0.007, 0.012), side * width * 0.77, 0.031, -0.22 + i * 0.10));
  }
  if (carrier) {
    p.hull.push(at(sphere(0.11, 0.065, 0.20), 0, -0.045, -0.025));
    p.hullDark.push(at(sphere(0.045, 0.014, 0.14), 0, -0.100, 0.055));
    for (const x of [-0.055, 0.055]) p.windows.push(at(sphere(0.008, 0.009, 0.095), x, -0.081, -0.025));
  }
  const engines = [new THREE.Vector3(-0.053, 0, -0.39), new THREE.Vector3(0.053, 0, -0.39), new THREE.Vector3(0, -0.015, -0.455)];
  for (const e of engines) p.engine.push(at(sphere(0.017, 0.011, 0.025), e.x, e.y, e.z));
  for (const x of carrier ? [-0.022, 0.022] : [0]) p.engine.push(at(sphere(0.016, 0.010, 0.023), x, carrier ? -0.09 : -0.055, 0.26));
  return finish(p, 'covenant', length, engines, new THREE.Vector3(0, carrier ? -0.09 : -0.055, 0.278));
}

function imperial(length: number, battleship: boolean): BuiltShip {
  const p = parts(), width = battleship ? 0.25 : 0.21;
  p.hull.push(taperedBox(width * 0.76, 0.075, 0.83, 0.70, 0.85));
  p.hullDark.push(at(taperedBox(width * 0.58, 0.065, 0.78, 0.55, 1), 0, -0.04, -0.02));
  p.accent.push(at(wedge(width, 0.16, 0.25, 0.35), 0, -0.003, 0.35));
  p.hull.push(at(taperedBox(width * 0.68, 0.12, 0.17, 0.08, 1), 0, -0.015, 0.43));
  const batteries = battleship ? 9 : 7;
  for (const side of [-1, 1]) {
    for (let i = 0; i < batteries; i++) {
      const z = -0.29 + i * 0.52 / (batteries - 1);
      p.hull.push(at(taperedBox(0.048, 0.037, 0.041, 0.85, 1), side * width * 0.44, 0.008, z));
      p.hullDark.push(at(rot(zCylinder(0.004, 0.006, 0.055, 6), 0, side * Math.PI / 2, 0), side * width * 0.58, 0.008, z));
      p.accent.push(at(new THREE.BoxGeometry(0.043, 0.009, 0.035), side * width * 0.44, 0.031, z));
    }
    // Stepped buttresses climb from the gun deck into the aft cathedral.
    for (const z of [-0.28, -0.19, -0.10]) {
      p.hull.push(at(rot(new THREE.BoxGeometry(0.022, 0.13, 0.018), 0, 0, side * 0.35), side * 0.042, 0.082, z));
      p.windows.push(at(new THREE.BoxGeometry(0.006, 0.039, 0.014), side * 0.045, 0.115, z));
    }
  }
  p.hull.push(at(taperedBox(0.09, 0.09, 0.29, 0.8, 1), 0, 0.09, -0.20));
  p.accent.push(at(taperedBox(0.10, 0.012, 0.30, 0.8, 1), 0, 0.143, -0.20));
  for (const [i, z] of [-0.29, -0.20, -0.11].entries()) {
    const height = battleship && i === 1 ? 0.15 : 0.10;
    p.hull.push(at(new THREE.BoxGeometry(0.038, height * 0.58, 0.043), 0, 0.15 + height * 0.2, z));
    p.accent.push(at(new THREE.ConeGeometry(0.033, height * 0.65, 4), 0, 0.15 + height * 0.65, z));
    p.windows.push(at(new THREE.BoxGeometry(0.040, 0.009, 0.016), 0, 0.155, z + 0.023));
  }
  for (const z of battleship ? [-0.02, 0.08, 0.18] : [0.02, 0.16]) {
    p.hullDark.push(at(new THREE.SphereGeometry(0.018, 8, 6), 0, 0.055, z));
    p.accent.push(at(zCylinder(0.003, 0.006, 0.055, 6), 0, 0.069, z + 0.02));
  }
  p.hullDark.push(at(taperedBox(width * 0.9, 0.13, 0.16, 0.8, 1), 0, 0.005, -0.39));
  const engines: THREE.Vector3[] = [];
  for (let i = 0; i < (battleship ? 5 : 3); i++) engines.push(new THREE.Vector3((i - (battleship ? 2 : 1)) * 0.043, 0.005, -0.495));
  exhaust(p, engines, 0.022);
  return finish(p, 'imperium', length, engines, new THREE.Vector3(0, -0.025, 0.493));
}

/** Low blade-like hull, raked fins and hooked horns distinguish Chaos from the
 * Imperial cathedral silhouettes while retaining large broadside batteries. */
function chaos(length: number, battleship: boolean): BuiltShip {
  const p = parts(), width = battleship ? 0.24 : 0.20;
  p.hull.push(taperedBox(width * 0.7, 0.075, 0.9, 0.32, 0.9));
  p.hullDark.push(at(taperedBox(width * 0.8, 0.05, 0.67, 0.5, 1), 0, -0.035, -0.06));
  for (const side of [-1, 1]) {
    const fins = battleship ? 5 : 4;
    for (let i = 0; i < fins; i++) {
      const z = -0.31 + i * 0.115;
      p.hull.push(at(rot(taperedBox(0.13, 0.016, 0.15, 0.05, 1), 0, side * -0.72, side * 0.12), side * width * 0.55, 0.024, z));
      p.accent.push(at(rot(taperedBox(0.018, 0.020, 0.13, 0.08, 1), 0, side * -0.72, 0), side * width * 0.65, 0.03, z));
      p.hullDark.push(at(rot(zCylinder(0.004, 0.006, 0.060, 6), 0, side * Math.PI / 2, 0), side * width * 0.54, -0.006, z + 0.03));
      p.windows.push(at(new THREE.BoxGeometry(0.006, 0.010, 0.040), side * width * 0.40, 0.041, z));
    }
    const horn = curve([[side * 0.030, 0.015, 0.25], [side * 0.092, 0.045, 0.38], [side * 0.073, 0.040, 0.50]]);
    p.hull.push(taperedTube(horn, t => 0.024 * (1 - t) + 0.002, 12, 6));
    p.accent.push(at(rot(taperedBox(0.014, 0.12, 0.15, 0.15, 1), 0, 0, side * 0.25), side * 0.043, 0.085, -0.20));
  }
  p.hull.push(at(taperedBox(0.085, 0.075, 0.19, 0.3, 1), 0, 0.069, -0.22));
  p.hullDark.push(at(taperedBox(0.012, battleship ? 0.18 : 0.13, 0.17, 0.1, 1), 0, 0.13, -0.27));
  p.windows.push(at(new THREE.BoxGeometry(0.06, 0.014, 0.010), 0, 0.10, -0.12));
  for (let i = 0; i < (battleship ? 4 : 3); i++) {
    const z = -0.03 + i * 0.075;
    p.hullDark.push(at(new THREE.SphereGeometry(0.014, 8, 6), 0, 0.042, z));
    p.accent.push(at(zCylinder(0.003, 0.005, 0.045, 6), 0, 0.055, z + 0.02));
  }
  p.hullDark.push(at(taperedBox(width, 0.14, 0.17, 0.85, 1), 0, 0, -0.37));
  const engines: THREE.Vector3[] = [];
  for (let i = 0; i < (battleship ? 5 : 3); i++) engines.push(new THREE.Vector3((i - (battleship ? 2 : 1)) * 0.041, 0, -0.49));
  exhaust(p, engines, 0.023);
  return finish(p, 'chaos', length, engines, new THREE.Vector3(0, 0, 0.425));
}

export const buildUnscMarathon = (): BuiltShip => unsc(11.70, false);
export const buildUnscInfinity = (): BuiltShip => unsc(56.94, true);
export const buildCovenantCcs = (): BuiltShip => covenant(17.82, false);
export const buildCovenantCas = (): BuiltShip => covenant(53.47, true);
export const buildImperiumLunar = (): BuiltShip => imperial(50, false);
export const buildImperiumRetribution = (): BuiltShip => imperial(80, true);
export const buildChaosMurder = (): BuiltShip => chaos(50, false);
export const buildChaosDesolator = (): BuiltShip => chaos(75, true);
