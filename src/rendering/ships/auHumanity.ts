import * as THREE from 'three';
import { at, hexPrism, merge, rot, taperedBox, zCylinder } from '../geometry';
import type { BuiltShip } from './types';

/** Original AU stand-ins: these blueprints are inventions, including Skynet's
 * extrapolated orbital fleet. Nothing here claims a canonical ship design. */
type Family = 'prothean' | 'past' | 'player' | 'skynet';
type Layer = 'hull' | 'hullDark' | 'accent' | 'engine' | 'windows';
type Parts = Record<Layer, THREE.BufferGeometry[]>;
type Palette = Record<Layer, THREE.MeshStandardMaterial>;

const metal = (color: number, roughness = 0.45) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.7 });
const glow = (color: number, emissiveIntensity: number) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity, metalness: 0.2, roughness: 0.35 });
const palettes: Record<Family, Palette> = {
  prothean: { hull: metal(0x7c8052), hullDark: metal(0x303b35), accent: metal(0xd6ba70), engine: glow(0xd7dc92, 2.5), windows: glow(0x9dd6a5, 1.2) },
  past: { hull: metal(0x315f67), hullDark: metal(0x172c36), accent: metal(0x73a9a6), engine: glow(0x6ee0c8, 2.5), windows: glow(0xa6e8df, 1.4) },
  player: { hull: metal(0xaab9c5), hullDark: metal(0x354656), accent: metal(0x447bad), engine: glow(0x74baff, 2.5), windows: glow(0xc4ddff, 1.4) },
  skynet: { hull: metal(0x6d7880, 0.27), hullDark: metal(0x242e35, 0.32), accent: metal(0x414a53, 0.28), engine: glow(0xff4234, 2.5), windows: glow(0xff6356, 1.6) },
};
const engineColors: Record<Family, number> = { prothean: 0xd7dc92, past: 0x6ee0c8, player: 0x74baff, skynet: 0xff4234 };
const makeParts = (): Parts => ({ hull: [], hullDark: [], accent: [], engine: [], windows: [] });

/** Scale visible geometry and all attachment points together, so add-on fins
 * cannot silently inflate a class or leave its muzzle/exhaust floating. */
function finish(parts: Parts, family: Family, length: number, engines: THREE.Vector3[], muzzle: THREE.Vector3): BuiltShip {
  const group = new THREE.Group();
  for (const name of Object.keys(parts) as Layer[]) {
    if (!parts[name].length) continue;
    const mesh = new THREE.Mesh(merge(parts[name]), palettes[family][name]);
    mesh.name = name; group.add(mesh);
  }
  const bounds = new THREE.Box3().setFromObject(group), centre = bounds.getCenter(new THREE.Vector3());
  const scale = length / bounds.getSize(new THREE.Vector3()).z;
  for (const object of group.children) {
    const geometry = (object as THREE.Mesh).geometry;
    geometry.translate(-centre.x, -centre.y, -centre.z).scale(scale, scale, scale);
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  }
  const transform = (point: THREE.Vector3) => point.sub(centre).multiplyScalar(scale);
  return { group, lengthUnits: length, engineNodes: engines.map(transform), muzzle: transform(muzzle), glowColor: engineColors[family] };
}

function addEngines(p: Parts, count: number, width: number): THREE.Vector3[] {
  const engines = Array.from({ length: count }, (_, i) => new THREE.Vector3((i - (count - 1) / 2) * width / Math.max(1, count - 1), -0.018, -0.48));
  for (const e of engines) {
    p.hullDark.push(at(zCylinder(0.022, 0.027, 0.06, 10), e.x, e.y, e.z + 0.014));
    p.engine.push(at(zCylinder(0.018, 0.018, 0.008, 10), e.x, e.y, e.z));
  }
  return engines;
}

/** Split mantle plates and gold-edged monoliths: an invented surviving-Empire
 * design language rather than a recreation of a canon Prothean warship. */
function prothean(length: number, capital: boolean): BuiltShip {
  const p = makeParts();
  p.hullDark.push(hexPrism(0.11, 0.92, 0.60));
  p.hull.push(taperedBox(0.15, 0.11, 0.96, 0.28, 0.85));
  for (const side of [-1, 1]) {
    p.hull.push(at(rot(taperedBox(0.13, 0.07, 0.70, 0.35, 1), 0, side * -0.13, side * 0.15), side * 0.11, 0.016, -0.02));
    p.accent.push(at(rot(taperedBox(0.019, 0.014, 0.68, 0.4, 1), 0, side * -0.13, 0), side * 0.17, 0.059, -0.015));
    for (let i = 0; i < (capital ? 7 : 5); i++) {
      p.accent.push(at(new THREE.BoxGeometry(0.08, 0.008, 0.018), side * 0.105, 0.056, -0.28 + i * 0.085));
      p.windows.push(at(new THREE.BoxGeometry(0.023, 0.011, 0.015), side * 0.09, 0.065, -0.255 + i * 0.085));
    }
  }
  p.hull.push(at(taperedBox(0.075, capital ? 0.16 : 0.11, 0.15, 0.7, 1), 0, 0.080, -0.22));
  p.accent.push(at(new THREE.BoxGeometry(0.081, 0.012, 0.16), 0, capital ? 0.166 : 0.141, -0.22));
  p.hullDark.push(at(zCylinder(0.025, 0.035, 0.30, 8), 0, -0.009, 0.33));
  p.engine.push(at(zCylinder(0.019, 0.019, 0.008, 8), 0, -0.009, 0.482));
  return finish(p, 'prothean', length, addEngines(p, capital ? 5 : 3, 0.17), new THREE.Vector3(0, -0.009, 0.482));
}

/** A stable generic frame for generated past civilizations; seed-dependent
 * politics and technology do not mutate cached hull geometry. */
function past(length: number, capital: boolean): BuiltShip {
  const p = makeParts();
  p.hullDark.push(hexPrism(0.095, 0.94, 0.70));
  p.hull.push(at(hexPrism(0.11, 0.43, 0.65), 0, 0, -0.15));
  for (const side of [-1, 1]) {
    for (let i = 0; i < (capital ? 4 : 3); i++) {
      const z = -0.28 + i * 0.16;
      p.hull.push(at(rot(taperedBox(0.25 - i * 0.022, 0.034, 0.22, 0.18, 1), 0, side * 0.45, side * 0.15), side * (0.20 + i * 0.007), 0.012, z));
      p.accent.push(at(rot(new THREE.BoxGeometry(0.17, 0.009, 0.018), 0, side * 0.45, 0), side * 0.21, 0.037, z - 0.03));
    }
    p.windows.push(at(new THREE.BoxGeometry(0.009, 0.026, 0.35), side * 0.083, 0.025, -0.09));
  }
  p.hull.push(at(hexPrism(0.07, 0.18, 0.6), 0, capital ? 0.078 : 0.057, -0.21));
  p.accent.push(at(taperedBox(0.036, 0.033, 0.38, 0.16, 1), 0, 0.012, 0.29));
  p.engine.push(at(zCylinder(0.021, 0.021, 0.008, 10), 0, 0.007, 0.48));
  return finish(p, 'past', length, addEngines(p, capital ? 5 : 3, 0.16), new THREE.Vector3(0, 0.007, 0.48));
}

function player(length: number, capital: boolean): BuiltShip {
  const p = makeParts();
  p.hullDark.push(taperedBox(0.11, 0.07, 0.96, 0.5, 1));
  p.hull.push(taperedBox(0.20, 0.085, 0.78, 0.3, 0.90));
  for (const side of [-1, 1]) {
    p.hull.push(at(rot(taperedBox(capital ? 0.13 : 0.10, 0.05, 0.54, 0.35, 0.9), 0, side * -0.13, 0), side * 0.12, -0.006, -0.06));
    p.accent.push(at(new THREE.BoxGeometry(0.024, 0.007, 0.52), side * 0.123, 0.022, -0.06));
    for (let i = 0; i < 5; i++) {
      p.hullDark.push(at(new THREE.BoxGeometry(0.022, 0.018, 0.035), side * 0.10, 0.032, -0.23 + i * 0.10));
      p.windows.push(at(new THREE.BoxGeometry(0.018, 0.009, 0.016), side * 0.056, 0.049, -0.20 + i * 0.075));
    }
  }
  p.hull.push(at(taperedBox(0.10, 0.045, 0.22, 0.75, 1), 0, 0.064, -0.22));
  p.accent.push(at(new THREE.BoxGeometry(0.074, 0.008, 0.13), 0, 0.090, -0.22));
  p.hullDark.push(at(taperedBox(0.029, 0.025, 0.40, 0.85, 1), 0, -0.005, 0.28));
  p.engine.push(at(zCylinder(0.011, 0.011, 0.007, 8), 0, -0.005, 0.482));
  return finish(p, 'player', length, addEngines(p, capital ? 5 : 3, 0.18), new THREE.Vector3(0, -0.005, 0.482));
}

function skynet(length: number, capital: boolean): BuiltShip {
  const p = makeParts();
  p.hullDark.push(taperedBox(0.08, 0.08, 0.96, 0.45, 0.75));
  p.hull.push(at(hexPrism(0.09, 0.23, 0.7), 0, 0, -0.24));
  for (const side of [-1, 1]) {
    p.hull.push(at(rot(taperedBox(0.075, 0.06, 0.83, 0.23, 1), 0, side * -0.15, 0), side * 0.14, -0.013, -0.025));
    for (let i = 0; i < (capital ? 7 : 5); i++) {
      const z = -0.33 + i * (capital ? 0.105 : 0.15);
      p.accent.push(at(new THREE.BoxGeometry(0.23, 0.018, 0.020), 0, 0.003, z));
      p.hullDark.push(at(new THREE.BoxGeometry(0.021, 0.07, 0.04), side * 0.14, -0.01, z));
      p.windows.push(at(new THREE.BoxGeometry(0.018, 0.012, 0.014), side * 0.14, 0.035, z));
    }
    p.hull.push(at(rot(taperedBox(0.036, 0.025, 0.25, 0.1, 1), 0, side * 0.5, 0), side * 0.18, 0.009, 0.20));
  }
  p.hull.push(at(taperedBox(0.19, 0.11, 0.13, 0.75, 1), 0, 0, 0.32));
  for (const x of [-0.052, 0, 0.052]) p.windows.push(at(new THREE.SphereGeometry(0.018, 8, 6), x, 0.025, 0.39));
  p.engine.push(at(zCylinder(0.022, 0.022, 0.012, 10), 0, -0.037, 0.48));
  return finish(p, 'skynet', length, addEngines(p, capital ? 5 : 3, 0.16), new THREE.Vector3(0, -0.037, 0.48));
}

export const buildProtheanCruiser = (): BuiltShip => prothean(10, false);
export const buildProtheanDreadnought = (): BuiltShip => prothean(22, true);
export const buildPastCycleCruiser = (): BuiltShip => past(9, false);
export const buildPastCycleDreadnought = (): BuiltShip => past(15, true);
export const buildPlayerCivCruiser = (): BuiltShip => player(7, false);
export const buildPlayerCivDreadnought = (): BuiltShip => player(12, true);
export const buildSkynetHunter = (): BuiltShip => skynet(3.2, false);
export const buildSkynetHarvester = (): BuiltShip => skynet(12, true);
