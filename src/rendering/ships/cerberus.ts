import * as THREE from 'three';
import { at, taperedBox, wedge, zCylinder } from '../geometry';
import { assemble, engineBlock, newParts, type Parts } from './alliance';
import { buildFighter, type FighterSpec } from './fighterKit';
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
  // Reference-informed shoulder armour and an uninterrupted underside keel.
  // These broad, swept channels stay visible in the overhead fleet camera.
  parts.hull.push(at(taperedBox(0.35, 0.21, 3.5, 0.1, 0.94), 0, -0.17, 0.58));
  for (const side of [-1, 1]) {
    parts.hullDark.push(at(taperedBox(0.23, 0.08, 3.3, 0.23, 1),
      side * 0.75, 0.24, -0.18));
    parts.hull.push(at(taperedBox(0.34, 0.12, 1.7, 0.15, 1),
      side * 0.60, -0.17, -1.57));
    parts.accent.push(at(new THREE.BoxGeometry(0.04, 0.02, 1.46),
      side * 0.26, 0.29, 0.44));
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

/** Cerberus strike fighter: a faceted delta with a diamond-section fuselage and outward-canted fins. */
export const CERBERUS_FIGHTER: FighterSpec = {
  faction: 'cerberus', length: 0.34, glowColor: GLOW,
  body: { width: 0.14, height: 0.09, sides: 4 },
  wing: { span: 0.34, root: 0.44, tip: 0.1, sweep: 0.3, z: 0.14, stripe: true },
  engines: { count: 2, x: 0.07, radius: 0.045, length: 0.18 },
  fins: { count: 2, height: 0.12, root: 0.16, tip: 0.05, sweep: 0.1, x: 0.12, z: -0.24, cant: 0.45 },
};
export function buildCerberusFighter(): BuiltShip {
  return buildFighter(CERBERUS_FIGHTER);
}

/** AU-only Cerberus dreadnought (Black Fleet): long white hull, orange spine. */
export function buildCerberusDreadnought(): BuiltShip {
  const L = 9.0;
  const parts = newParts();
  parts.hull.push(taperedBox(0.8, 0.7, L * 0.74, 0.7, 1, { frontHeight: 0.7 }).translate(0, 0, L * 0.03));
  parts.hull.push(at(taperedBox(1.3, 0.8, 2.2, 0.5, 1, { frontHeight: 0.4 }), 0, 0, L * 0.3));
  // Black Fleet reference: long split bow rails and stepped upper armour,
  // not an enlarged cruiser or a re-coloured Alliance gunship.
  for (const side of [-1, 1]) {
    parts.hull.push(at(taperedBox(0.38, 0.22, 5.6, 0.12, 0.94),
      side * 0.68, -0.24, L * 0.18));
    parts.hullDark.push(at(taperedBox(0.42, 0.16, 4.4, 0.22, 0.96),
      side * 0.82, 0.33, -0.35));
    parts.hull.push(at(taperedBox(0.42, 0.12, 2.1, 0.32, 0.9),
      side * 0.57, 0.62, 1.33));
  }
  parts.hullDark.push(at(zCylinder(0.16, 0.2, 1.2, 12), 0, 0, L * 0.5 - 0.2));
  parts.hull.push(at(taperedBox(0.5, 0.4, 1.8, 0.8, 1), 0, 0.55, 0.3));
  parts.windows.push(at(new THREE.BoxGeometry(0.4, 0.05, 0.6), 0, 0.78, 0.4));
  for (const s of [-1, 1]) {
    parts.hull.push(at(taperedBox(0.8, 0.28, 3.8, 0.7, 0.9), s * 0.7, 0, -0.5));
    parts.hullDark.push(at(new THREE.BoxGeometry(0.4, 0.14, 3.0), s * 1.0, 0.12, -0.4));
    for (let i = 0; i < 3; i++) parts.hullDark.push(at(new THREE.BoxGeometry(0.2, 0.12, 0.26), s * 0.9, 0.2, -1.4 + i * 1.0));
    parts.accent.push(at(new THREE.BoxGeometry(0.1, 0.03, L * 0.55), s * 0.25, 0.37, 0));
  }
  // Heavy batteries and realistic exposed rear stanchions, merged into the
  // five material groups for efficient instanced fleet rendering.
  for (const side of [-1, 1]) {
    for (const z of [-2.5, -0.9, 0.7, 2.3]) {
      parts.hullDark.push(at(new THREE.BoxGeometry(0.20, 0.20, 0.38),
        side * 1.12, 0.21, z));
    }
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
