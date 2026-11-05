import * as THREE from 'three';
import { at, taperedBox, wedge, zCylinder } from '../geometry';
import { assemble, engineBlock, newParts, type Parts } from './alliance';
import type { BuiltShip } from './types';

/**
 * Cerberus hull family. Design language: white hulls with black panels and
 * orange identification stripes; sleek, forward-raked, technologically
 * experimental (twin forward booms, raised bridges). Original fan models.
 */

const GLOW = 0xffb060;

function stripes(parts: Parts, x: number, y: number, z: number, length: number, count = 2): void {
  for (let i = 0; i < count; i++) parts.accent.push(at(new THREE.BoxGeometry(0.08, 0.025, length), x + i * 0.14, y, z));
}

/** Cerberus cruiser: ~560 m wedge with twin forward booms. */
export function buildCerberusCruiser(): BuiltShip {
  const L = 5.6;
  const parts = newParts();
  parts.hull.push(taperedBox(0.9, 0.5, L * 0.6, 0.6, 1, { frontHeight: 0.6 }).translate(0, 0, -L * 0.05));
  for (const s of [-1, 1]) {
    parts.hull.push(at(taperedBox(0.26, 0.3, 2.6, 0.35, 1, { frontHeight: 0.5 }), s * 0.42, 0.02, L * 0.3));
    parts.hullDark.push(at(new THREE.BoxGeometry(0.28, 0.08, 1.4), s * 0.42, 0.18, L * 0.25));
    parts.accent.push(at(new THREE.BoxGeometry(0.3, 0.03, 0.4), s * 0.42, 0.2, L * 0.34));
    parts.hullDark.push(at(new THREE.BoxGeometry(0.16, 0.1, 0.24), s * 0.5, 0.28, -0.4));
  }
  parts.hullDark.push(at(zCylinder(0.09, 0.12, 0.9, 10), 0, -0.02, L * 0.42));
  parts.hull.push(at(taperedBox(0.4, 0.3, 1.2, 0.7, 1), 0, 0.38, -0.6));
  parts.windows.push(at(new THREE.BoxGeometry(0.42, 0.04, 0.5), 0, 0.52, -0.4));
  parts.hullDark.push(at(new THREE.BoxGeometry(0.95, 0.1, 1.6), 0, -0.26, -0.6));
  stripes(parts, -0.07, 0.27, -0.3, 2.4);
  const eng = newParts();
  engineBlock(1.1, 0.6, 1.2, [
    { x: 0.3, y: 0, r: 0.17 },
    { x: -0.3, y: 0, r: 0.17 },
  ], eng);
  for (const k of Object.keys(eng) as (keyof Parts)[]) parts[k].push(...eng[k].map((g) => g.translate(0, 0, -L * 0.5 + 0.7)));
  const z0 = -L * 0.5 + 0.7 - 1.2 * 0.7;
  return assemble(parts, 'cerberus', [new THREE.Vector3(0.3, 0, z0), new THREE.Vector3(-0.3, 0, z0)], L, new THREE.Vector3(0, -0.02, L * 0.5), GLOW);
}

/** Cerberus frigate: ~180 m, raked forward hull. */
export function buildCerberusFrigate(): BuiltShip {
  const L = 1.8;
  const parts = newParts();
  parts.hull.push(taperedBox(0.3, 0.2, L * 0.7, 0.4, 0.9, { frontHeight: 0.5 }).translate(0, 0.02, L * 0.08));
  parts.hull.push(at(taperedBox(0.2, 0.13, 0.5, 0.7, 1), 0, 0.12, L * 0.26));
  parts.windows.push(at(new THREE.BoxGeometry(0.16, 0.03, 0.14), 0, 0.2, L * 0.34));
  for (const s of [-1, 1]) {
    const wing = taperedBox(0.7, 0.05, 0.45, 0.5, 1);
    wing.rotateY(s * -0.5);
    parts.hull.push(at(wing, s * 0.4, -0.02, -0.2));
    parts.hullDark.push(at(zCylinder(0.07, 0.08, 0.6, 10), s * 0.72, -0.05, -0.4));
    parts.engine.push(at(zCylinder(0.05, 0.04, 0.05, 10), s * 0.72, -0.05, -0.72));
    parts.accent.push(at(new THREE.BoxGeometry(0.14, 0.03, 0.2), s * 0.5, 0.02, -0.15));
  }
  parts.hullDark.push(at(new THREE.BoxGeometry(0.31, 0.21, 0.3), 0, 0.02, -0.5));
  stripes(parts, -0.07, 0.13, 0.1, 0.8);
  return assemble(parts, 'cerberus', [new THREE.Vector3(0.72, -0.05, -0.75), new THREE.Vector3(-0.72, -0.05, -0.75)], L, new THREE.Vector3(0, 0, L * 0.5), GLOW);
}

export function buildCerberusFighter(): BuiltShip {
  const k = 2;
  const L = 0.17 * k;
  const parts = newParts();
  parts.hull.push(taperedBox(0.05 * k, 0.03 * k, L, 0.3, 0.9));
  parts.hull.push(at(taperedBox(0.18 * k, 0.008 * k, 0.07 * k, 0.5, 1), 0, 0, -0.03 * k));
  parts.hullDark.push(at(wedge(0.02 * k, 0.04 * k, 0.05 * k, 0.4), 0, 0.02 * k, -0.06 * k));
  parts.accent.push(at(new THREE.BoxGeometry(0.1 * k, 0.012 * k, 0.015 * k), 0, 0, -0.02 * k));
  parts.engine.push(at(zCylinder(0.012 * k, 0.01 * k, 0.01 * k, 6), 0, 0, -0.09 * k));
  return assemble(parts, 'cerberus', [new THREE.Vector3(0, 0, -0.09 * k)], L, undefined, GLOW);
}

/** AU-only Cerberus dreadnought (Black Fleet): long white hull, orange spine. */
export function buildCerberusDreadnought(): BuiltShip {
  const L = 9.0;
  const parts = newParts();
  parts.hull.push(taperedBox(0.8, 0.7, L * 0.74, 0.7, 1, { frontHeight: 0.7 }).translate(0, 0, L * 0.03));
  parts.hull.push(at(taperedBox(1.3, 0.8, 2.2, 0.5, 1, { frontHeight: 0.4 }), 0, 0, L * 0.3));
  parts.hullDark.push(at(zCylinder(0.16, 0.2, 1.2, 12), 0, 0, L * 0.5 - 0.2));
  parts.hull.push(at(taperedBox(0.5, 0.4, 1.8, 0.8, 1), 0, 0.55, 0.3));
  parts.windows.push(at(new THREE.BoxGeometry(0.4, 0.05, 0.6), 0, 0.78, 0.4));
  for (const s of [-1, 1]) {
    parts.hull.push(at(taperedBox(0.8, 0.28, 3.8, 0.7, 0.9), s * 0.7, 0, -0.5));
    parts.hullDark.push(at(new THREE.BoxGeometry(0.4, 0.14, 3.0), s * 1.0, 0.12, -0.4));
    for (let i = 0; i < 3; i++) parts.hullDark.push(at(new THREE.BoxGeometry(0.2, 0.12, 0.26), s * 0.9, 0.2, -1.4 + i * 1.0));
    parts.accent.push(at(new THREE.BoxGeometry(0.1, 0.03, L * 0.55), s * 0.25, 0.37, 0));
  }
  const eng = newParts();
  engineBlock(1.6, 0.9, 1.8, [
    { x: 0.45, y: 0.22, r: 0.22 },
    { x: -0.45, y: 0.22, r: 0.22 },
    { x: 0.45, y: -0.22, r: 0.22 },
    { x: -0.45, y: -0.22, r: 0.22 },
  ], eng);
  for (const k of Object.keys(eng) as (keyof Parts)[]) parts[k].push(...eng[k].map((g) => g.translate(0, 0, -L * 0.5 + 1.1)));
  const z0 = -L * 0.5 + 1.1 - 1.8 * 0.7;
  return assemble(parts, 'cerberus', [new THREE.Vector3(0.45, 0.22, z0), new THREE.Vector3(-0.45, 0.22, z0), new THREE.Vector3(0.45, -0.22, z0), new THREE.Vector3(-0.45, -0.22, z0)], L, new THREE.Vector3(0, 0, L * 0.5 + 0.4), GLOW);
}
