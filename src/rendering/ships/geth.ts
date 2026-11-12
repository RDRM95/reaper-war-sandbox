import * as THREE from 'three';
import { at, taperedBox, zCylinder } from '../geometry';
import { assemble, engineBlock, newParts, type Parts } from './alliance';
import { buildFighter, finPanel, mirrorX, spindle, wingPanel, type FighterSpec } from './fighterKit';
import type { BuiltShip } from './types';

/**
 * Geth hull family. Design language: unmistakably synthetic — segmented
 * white-grey hulls, exposed lattice frames, a forward hooded "head" with a
 * single bright optic, pale blue-white lights. Original fan models.
 */

const GLOW = 0xe8f0ff;

/** Hooded head with a single optic, like a geth platform's flashlight head. */
function gethHead(parts: Parts, r: number, z: number): void {
  parts.hull.push(at(zCylinder(r * 0.6, r, r * 1.2, 12), 0, 0, z));
  parts.hullDark.push(at(zCylinder(r * 0.55, r * 0.5, r * 0.3, 12), 0, 0, z + r * 0.7));
  parts.windows.push(at(zCylinder(r * 0.35, r * 0.3, r * 0.1, 12), 0, 0, z + r * 0.85));
  // Hood plates.
  for (const a of [0.9, 2.2]) {
    const plate = taperedBox(r * 0.5, r * 0.12, r * 1.4, 0.6, 1);
    plate.translate(0, r * 1.0, 0);
    plate.rotateZ(a);
    plate.translate(0, 0, z - r * 0.1);
    parts.hull.push(plate);
    const plate2 = plate.clone();
    plate2.scale(-1, 1, 1);
    parts.hull.push(plate2);
  }
}

function lattice(parts: Parts, x: number, y: number, z0: number, z1: number, n: number, size: number): void {
  for (let i = 0; i < n; i++) {
    const z = z0 + ((z1 - z0) * i) / Math.max(1, n - 1);
    parts.hullDark.push(at(new THREE.BoxGeometry(size, size * 2.4, size), x, y, z));
    parts.windows.push(at(new THREE.BoxGeometry(size * 0.3, size * 0.3, size * 0.6), x, y + size * 1.3, z));
  }
}

/** Geth dreadnought: ~1.1 km with a forward ring and segmented spine. */
export function buildGethDreadnought(): BuiltShip {
  const L = 11;
  const parts = newParts();
  parts.hull.push(taperedBox(0.9, 0.8, L * 0.6, 0.8, 1, { frontHeight: 0.8 }).translate(0, 0, -L * 0.05));
  gethHead(parts, 0.7, L * 0.3);
  parts.hullDark.push(at(zCylinder(0.16, 0.2, 1.4, 12), 0, 0, L * 0.3 + 1.4));
  // Forward ring.
  const ring = new THREE.TorusGeometry(1.5, 0.14, 8, 28);
  ring.translate(0, 0, L * 0.18);
  parts.accent.push(ring);
  const ring2 = new THREE.TorusGeometry(1.5, 0.05, 6, 28);
  ring2.translate(0, 0, L * 0.18 + 0.2);
  parts.windows.push(ring2);
  // Segmented spine plates.
  for (let i = 0; i < 7; i++) parts.accent.push(at(taperedBox(1.2, 1.1, 0.5, 1, 1), 0, 0, -L * 0.33 + i * 0.85));
  lattice(parts, 0.75, 0.3, -L * 0.33, L * 0.1, 7, 0.14);
  lattice(parts, -0.75, 0.3, -L * 0.33, L * 0.1, 7, 0.14);
  // Dorsal and ventral fins.
  parts.hullDark.push(at(taperedBox(0.08, 1.2, 2.6, 0.5, 1), 0, 0.9, -1.0));
  parts.hullDark.push(at(taperedBox(0.08, 0.9, 2.2, 0.5, 1), 0, -0.8, -0.6));
  const eng = newParts();
  engineBlock(1.4, 1.1, 1.7, [
    { x: 0.42, y: 0.28, r: 0.2 },
    { x: -0.42, y: 0.28, r: 0.2 },
    { x: 0.42, y: -0.28, r: 0.2 },
    { x: -0.42, y: -0.28, r: 0.2 },
  ], eng);
  for (const k of Object.keys(eng) as (keyof Parts)[]) parts[k].push(...eng[k].map((g) => g.translate(0, 0, -L * 0.5 + 1.0)));
  const z0 = -L * 0.5 + 1.0 - 1.7 * 0.7;
  return assemble(parts, 'geth', [new THREE.Vector3(0.42, 0.28, z0), new THREE.Vector3(-0.42, 0.28, z0), new THREE.Vector3(0.42, -0.28, z0), new THREE.Vector3(-0.42, -0.28, z0)], L, new THREE.Vector3(0, 0, L * 0.3 + 2.1), GLOW);
}

export function buildGethCruiser(): BuiltShip {
  const L = 5.2;
  const parts = newParts();
  parts.hull.push(taperedBox(0.55, 0.5, L * 0.6, 0.8, 1).translate(0, 0, -L * 0.04));
  gethHead(parts, 0.36, L * 0.3);
  parts.hullDark.push(at(zCylinder(0.09, 0.12, 0.8, 10), 0, 0, L * 0.3 + 0.8));
  for (let i = 0; i < 4; i++) parts.accent.push(at(taperedBox(0.7, 0.65, 0.3, 1, 1), 0, 0, -L * 0.3 + i * 0.75));
  lattice(parts, 0.45, 0.2, -L * 0.3, L * 0.08, 4, 0.1);
  lattice(parts, -0.45, 0.2, -L * 0.3, L * 0.08, 4, 0.1);
  parts.hullDark.push(at(taperedBox(0.06, 0.6, 1.4, 0.5, 1), 0, 0.55, -0.5));
  const eng = newParts();
  engineBlock(0.9, 0.6, 1.1, [
    { x: 0.26, y: 0, r: 0.16 },
    { x: -0.26, y: 0, r: 0.16 },
  ], eng);
  for (const k of Object.keys(eng) as (keyof Parts)[]) parts[k].push(...eng[k].map((g) => g.translate(0, 0, -L * 0.5 + 0.65)));
  const z0 = -L * 0.5 + 0.65 - 1.1 * 0.7;
  return assemble(parts, 'geth', [new THREE.Vector3(0.26, 0, z0), new THREE.Vector3(-0.26, 0, z0)], L, new THREE.Vector3(0, 0, L * 0.3 + 1.2), GLOW);
}

/**
 * Geth frigate: a 150 m synthetic. A rounded, segmented body carrying the family's hooded head and single optic
 * between two forward-swept mandibles that reach the muzzle; a short lattice of lit struts along its back; a keel
 * fin; two drives. Original procedural geometry. It replaces a model that was a box with a head on it. Length,
 * muzzle and engine nodes are those of the model it replaces.
 */
export function buildGethFrigate(): BuiltShip {
  const L = 1.5;
  const parts = newParts();
  parts.hull.push(spindle([{ z: -0.72, r: 0 }, { z: -0.72, r: 0.07 }, { z: -0.5, r: 0.115 }, { z: -0.1, r: 0.13 }, { z: 0.22, r: 0.105 }, { z: 0.4, r: 0.075 }, { z: 0.4, r: 0 }], 8, 0.85));
  gethHead(parts, 0.09, 0.44);
  // Segment collars round the body.
  for (const [z, r] of [[-0.46, 0.124], [-0.26, 0.134], [-0.06, 0.138]] as const) {
    const collar = zCylinder(r, r, 0.045, 8);
    collar.scale(1, 0.87, 1);
    parts.accent.push(at(collar, 0, 0, z));
  }
  // Mandibles: swept forward from the shoulders to either side of the muzzle.
  const mandible = at(wingPanel(0.27, 0.34, 0.05, -0.55, 0.03, -0.035), 0.1, 0, 0.2);
  parts.hullDark.push(mandible, mirrorX(mandible));
  lattice(parts, 0, 0.105, -0.44, 0.02, 4, 0.026);
  parts.hullDark.push(at(finPanel(0.13, 0.3, 0.08, 0.18, 0.024, 0, true), 0, -0.095, -0.12));
  for (const side of [-1, 1]) {
    parts.hullDark.push(at(zCylinder(0.045, 0.056, 0.28, 8), side * 0.07, 0, -0.6));
    parts.engine.push(at(zCylinder(0.038, 0.03, 0.012, 8), side * 0.07, 0, -0.745));
  }
  return assemble(parts, 'geth', [new THREE.Vector3(0.07, 0, -L * 0.5), new THREE.Vector3(-0.07, 0, -L * 0.5)], L, new THREE.Vector3(0, 0, L * 0.5), GLOW);
}

/** Geth fighter: no pilot, so no canopy. A sensor lens in a bulbous body between two forward-swept mandibles. */
export const GETH_FIGHTER: FighterSpec = {
  faction: 'geth', length: 0.32, glowColor: GLOW,
  body: { width: 0.16, height: 0.14, sides: 8, eye: true },
  wing: { span: 0.3, root: 0.16, tip: 0.04, sweep: -0.3, z: -0.12, rise: -0.06 },
  tipPods: { radius: 0.02, length: 0.14 },
  engines: { count: 1, x: 0, radius: 0.06, length: 0.16 },
};
export function buildGethFighter(): BuiltShip {
  return buildFighter(GETH_FIGHTER);
}
