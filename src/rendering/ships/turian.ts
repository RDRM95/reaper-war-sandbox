import * as THREE from 'three';
import { at, rot, taperedBox, wedge, zCylinder } from '../geometry';
import { assemble, engineBlock, newParts, type Parts } from './alliance';
import type { BuiltShip } from './types';

/**
 * Turian Hierarchy hull family. Design language: angular, aggressive, highly
 * engineered — tall narrow hulls, split "pincer" bows, large dorsal fins,
 * swept blade-like wings, steel-grey plating with cyan lights.
 * Original fan models.
 */

const GLOW = 0x9fe0ff;

function pincerBow(parts: Parts, width: number, height: number, length: number, z: number): void {
  for (const s of [-1, 1]) {
    const blade = taperedBox(width * 0.3, height, length, 0.25, 1, { frontHeight: 0.35 });
    blade.translate(s * width * 0.32, 0, z);
    parts.hull.push(blade);
  }
  parts.hullDark.push(at(taperedBox(width * 0.4, height * 0.6, length * 0.55, 0.6, 1), 0, 0, z - length * 0.2));
}

function dorsalFin(parts: Parts, height: number, length: number, z: number, y: number): void {
  const fin = taperedBox(0.08, height, length, 0.35, 1, { frontHeight: 0.3 });
  parts.hullDark.push(at(fin, 0, y + height * 0.5, z));
  parts.windows.push(at(new THREE.BoxGeometry(0.1, 0.03, length * 0.6), 0, y + height * 0.95, z - length * 0.1));
}

function bladeWings(parts: Parts, span: number, length: number, z: number, y: number, sweep: number, dihedral: number): void {
  for (const s of [-1, 1]) {
    const wing = taperedBox(span, 0.07, length, 0.35, 1);
    wing.rotateY(s * -sweep);
    wing.rotateZ(s * dihedral);
    parts.hull.push(at(wing, s * span * 0.5, y, z));
    parts.accent.push(at(new THREE.BoxGeometry(span * 0.3, 0.09, 0.2), s * span * 0.55, y, z + length * 0.15));
  }
}

/** Turian dreadnought: ~950 m → 9.5 units. */
export function buildTurianDreadnought(): BuiltShip {
  const L = 9.5;
  const parts = newParts();
  parts.hull.push(taperedBox(0.9, 1.1, L * 0.7, 0.7, 1, { frontHeight: 0.75 }).translate(0, 0, L * 0.02));
  pincerBow(parts, 1.3, 0.6, 2.6, L * 0.36);
  parts.hullDark.push(at(zCylinder(0.15, 0.2, 1.3, 10), 0, -0.05, L * 0.48 - 0.2));
  dorsalFin(parts, 1.4, 3.2, -0.6, 0.5);
  parts.hull.push(at(taperedBox(0.5, 0.5, 1.6, 0.8, 1), 0, 0.65, 1.4));
  parts.windows.push(at(new THREE.BoxGeometry(0.52, 0.05, 0.6), 0, 0.92, 1.5));
  bladeWings(parts, 2.6, 2.2, -1.4, -0.1, 0.5, -0.12);
  // Ventral blade.
  parts.hullDark.push(at(taperedBox(0.1, 0.9, 2.4, 0.4, 1), 0, -0.9, -0.4));
  // Hull plating detail: ribs, lit viewports, accent stripe, broadside turrets and GARDIAN blisters.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) parts.hullDark.push(at(new THREE.BoxGeometry(0.1, 0.36, 0.5), s * 0.5, 0.0, -3 + i * 1.05));
    for (let i = 0; i < 10; i++) parts.windows.push(at(new THREE.BoxGeometry(0.06, 0.05, 0.25), s * 0.47, 0.25, -3.2 + i * 0.65));
    parts.accent.push(at(new THREE.BoxGeometry(0.06, 0.5, 2.2), s * 0.49, 0.1, 2.2));
    for (let i = 0; i < 4; i++) {
      parts.hullDark.push(at(new THREE.BoxGeometry(0.18, 0.12, 0.26), s * 0.52, 0.58, -2.4 + i * 1.1));
      parts.hullDark.push(at(rot(zCylinder(0.025, 0.025, 0.36, 6), 0, (s * Math.PI) / 2, 0), s * 0.7, 0.6, -2.4 + i * 1.1));
    }
    for (let i = 0; i < 3; i++) parts.hullDark.push(at(new THREE.SphereGeometry(0.07, 8, 6), s * 0.46, -0.45, -1.5 + i * 1.6));
  }
  // Dorsal ridge plates along the spine.
  for (let i = 0; i < 5; i++) parts.accent.push(at(taperedBox(0.5, 0.06, 0.5, 0.8, 1), 0, 0.57, -2.8 + i * 0.9));
  const eng = newParts();
  engineBlock(1.5, 1.2, 1.8, [
    { x: 0.45, y: 0.3, r: 0.24 },
    { x: -0.45, y: 0.3, r: 0.24 },
    { x: 0, y: -0.3, r: 0.3 },
  ], eng);
  for (const k of Object.keys(eng) as (keyof Parts)[]) parts[k].push(...eng[k].map((g) => g.translate(0, 0, -L * 0.5 + 1.0)));
  const z0 = -L * 0.5 + 1.0 - 1.8 * 0.7;
  return assemble(parts, 'turian', [new THREE.Vector3(0.45, 0.3, z0), new THREE.Vector3(-0.45, 0.3, z0), new THREE.Vector3(0, -0.3, z0)], L, new THREE.Vector3(0, -0.05, L * 0.5 + 0.4), GLOW);
}

/** Turian cruiser: ~560 m. */
export function buildTurianCruiser(): BuiltShip {
  const L = 5.6;
  const parts = newParts();
  parts.hull.push(taperedBox(0.6, 0.7, L * 0.66, 0.7, 1, { frontHeight: 0.7 }).translate(0, 0, L * 0.03));
  pincerBow(parts, 0.9, 0.42, 1.7, L * 0.34);
  parts.hullDark.push(at(zCylinder(0.09, 0.12, 0.8, 10), 0, -0.03, L * 0.48 - 0.1));
  dorsalFin(parts, 0.9, 2.0, -0.3, 0.33);
  bladeWings(parts, 1.5, 1.3, -0.9, -0.05, 0.55, -0.15);
  parts.hullDark.push(at(taperedBox(0.08, 0.5, 1.4, 0.4, 1), 0, -0.55, -0.2));
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) parts.windows.push(at(new THREE.BoxGeometry(0.05, 0.04, 0.2), s * 0.31, 0.15, -1.6 + i * 0.6));
    for (let i = 0; i < 2; i++) {
      parts.hullDark.push(at(new THREE.BoxGeometry(0.16, 0.12, 0.22), s * 0.34, 0.3, -0.6 + i * 0.9));
      parts.hullDark.push(at(rot(zCylinder(0.02, 0.02, 0.28, 6), 0, (s * Math.PI) / 2, 0), s * 0.5, 0.32, -0.6 + i * 0.9));
    }
    parts.accent.push(at(new THREE.BoxGeometry(0.05, 0.3, 1.2), s * 0.32, 0.05, 1.3));
    for (let i = 0; i < 4; i++) parts.hullDark.push(at(new THREE.BoxGeometry(0.06, 0.22, 0.3), s * 0.31, -0.1, -1.4 + i * 0.75));
  }
  const eng = newParts();
  engineBlock(1.0, 0.7, 1.2, [
    { x: 0.28, y: 0, r: 0.18 },
    { x: -0.28, y: 0, r: 0.18 },
  ], eng);
  for (const k of Object.keys(eng) as (keyof Parts)[]) parts[k].push(...eng[k].map((g) => g.translate(0, 0, -L * 0.5 + 0.7)));
  const z0 = -L * 0.5 + 0.7 - 1.2 * 0.7;
  return assemble(parts, 'turian', [new THREE.Vector3(0.28, 0, z0), new THREE.Vector3(-0.28, 0, z0)], L, new THREE.Vector3(0, -0.03, L * 0.5 + 0.3), GLOW);
}

/** Turian frigate: ~160 m dart with forward-swept blades. */
export function buildTurianFrigate(): BuiltShip {
  const L = 1.6;
  const parts = newParts();
  parts.hull.push(taperedBox(0.22, 0.26, L * 0.75, 0.3, 0.9, { frontHeight: 0.4 }).translate(0, 0, L * 0.06));
  parts.hullDark.push(at(wedge(0.12, 0.3, 0.5, 0.3), 0, 0.2, -0.2));
  for (const s of [-1, 1]) {
    const blade = taperedBox(0.6, 0.05, 0.4, 0.4, 1);
    blade.rotateY(s * 0.35);
    blade.rotateZ(s * -0.2);
    parts.hull.push(at(blade, s * 0.35, -0.02, 0.05));
    parts.engine.push(at(zCylinder(0.045, 0.035, 0.05, 8), s * 0.09, -0.02, -L * 0.5 + 0.02));
    parts.windows.push(at(new THREE.BoxGeometry(0.03, 0.03, 0.2), s * 0.12, 0.08, 0.1));
  }
  parts.hullDark.push(at(new THREE.BoxGeometry(0.3, 0.18, 0.3), 0, -0.02, -L * 0.42));
  parts.accent.push(at(new THREE.BoxGeometry(0.24, 0.02, 0.3), 0, 0.14, 0.2));
  return assemble(parts, 'turian', [new THREE.Vector3(0.09, -0.02, -L * 0.5), new THREE.Vector3(-0.09, -0.02, -L * 0.5)], L, new THREE.Vector3(0, 0, L * 0.5), GLOW);
}

export function buildTurianFighter(): BuiltShip {
  const k = 2;
  const L = 0.17 * k;
  const parts = newParts();
  parts.hull.push(taperedBox(0.04 * k, 0.03 * k, L, 0.25, 0.9));
  const wing = taperedBox(0.16 * k, 0.008 * k, 0.09 * k, 0.3, 1);
  wing.rotateY(0);
  parts.hull.push(at(wing, 0, 0, -0.03 * k));
  parts.hullDark.push(at(rot(taperedBox(0.01 * k, 0.05 * k, 0.06 * k, 0.4, 1), 0, 0, 0), 0, 0.03 * k, -0.06 * k));
  parts.engine.push(at(zCylinder(0.012 * k, 0.01 * k, 0.01 * k, 6), 0, 0, -0.09 * k));
  parts.windows.push(at(new THREE.BoxGeometry(0.018 * k, 0.01 * k, 0.03 * k), 0, 0.015 * k, 0.02 * k));
  return assemble(parts, 'turian', [new THREE.Vector3(0, 0, -0.09 * k)], L, undefined, GLOW);
}
