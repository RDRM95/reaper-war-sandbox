import * as THREE from 'three';
import { at, taperedBox, zCylinder } from '../geometry';
import { assemble, engineBlock, newParts, type Parts } from './alliance';
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

export function buildGethFrigate(): BuiltShip {
  const L = 1.5;
  const parts = newParts();
  parts.hull.push(taperedBox(0.22, 0.2, L * 0.6, 0.8, 1).translate(0, 0, -0.05));
  gethHead(parts, 0.12, L * 0.3);
  for (const s of [-1, 1]) {
    parts.hullDark.push(at(new THREE.BoxGeometry(0.05, 0.12, 0.5), s * 0.15, 0.05, -0.1));
    parts.windows.push(at(new THREE.BoxGeometry(0.02, 0.02, 0.3), s * 0.15, 0.13, -0.1));
    parts.engine.push(at(zCylinder(0.045, 0.035, 0.05, 8), s * 0.07, 0, -L * 0.5 + 0.02));
  }
  parts.hullDark.push(at(new THREE.BoxGeometry(0.26, 0.16, 0.3), 0, 0, -L * 0.42));
  return assemble(parts, 'geth', [new THREE.Vector3(0.07, 0, -L * 0.5), new THREE.Vector3(-0.07, 0, -L * 0.5)], L, new THREE.Vector3(0, 0, L * 0.5), GLOW);
}

export function buildGethFighter(): BuiltShip {
  const k = 2;
  const L = 0.16 * k;
  const parts = newParts();
  parts.hull.push(taperedBox(0.04 * k, 0.03 * k, L, 0.6, 1));
  parts.windows.push(at(zCylinder(0.01 * k, 0.012 * k, 0.01 * k, 8), 0, 0, L * 0.5));
  for (const s of [-1, 1]) parts.hullDark.push(at(taperedBox(0.07 * k, 0.006 * k, 0.06 * k, 0.4, 1), s * 0.05 * k, 0, -0.02 * k));
  parts.engine.push(at(zCylinder(0.012 * k, 0.01 * k, 0.01 * k, 6), 0, 0, -L * 0.5));
  return assemble(parts, 'geth', [new THREE.Vector3(0, 0, -L * 0.5)], L, undefined, GLOW);
}
