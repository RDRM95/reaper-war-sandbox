import * as THREE from 'three';
import { at, taperedBox, zCylinder } from '../geometry';
import { assemble, engineBlock, newParts, type Parts } from './alliance';
import { buildFighter, type FighterSpec } from './fighterKit';
import type { BuiltShip } from './types';

/**
 * Quarian Migrant Fleet hull family. Design language: bulky converted
 * civilian hulls with bolted-on modules, asymmetric repairs, cargo pods and
 * amber lighting; liveships carry agricultural domes. Original fan models.
 */

const GLOW = 0xffe0a0;

function modules(parts: Parts, n: number, x: number, y: number, z0: number, dz: number, size: number): void {
  for (let i = 0; i < n; i++) {
    const s = size * (0.8 + ((i * 0.37) % 1) * 0.4);
    parts.hullDark.push(at(new THREE.BoxGeometry(s, s * 0.8, s * 1.3), x + ((i % 2) - 0.5) * size * 0.3, y, z0 + i * dz));
    parts.windows.push(at(new THREE.BoxGeometry(s * 0.6, s * 0.08, s * 0.08), x, y + s * 0.45, z0 + i * dz));
  }
}

/** Liveship: ~2.2 km hull with agricultural domes along the dorsal spine. */
export function buildQuarianLiveship(): BuiltShip {
  const L = 22;
  const parts = newParts();
  parts.hull.push(zCylinder(1.6, 1.9, L * 0.8, 14).translate(0, 0, -L * 0.05));
  parts.hull.push(at(taperedBox(3.2, 2.2, L * 0.2, 0.6, 1, { frontHeight: 0.6 }), 0, 0, L * 0.38));
  for (let i = 0; i < 6; i++) {
    const dome = new THREE.SphereGeometry(1.3, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.translate(0, 1.7, -L * 0.35 + i * 3.0);
    parts.windows.push(dome);
    parts.accent.push(at(zCylinder(1.45, 1.45, 0.3, 14), 0, 1.7, -L * 0.35 + i * 3.0));
  }
  modules(parts, 8, 2.1, -0.4, -L * 0.36, 2.2, 0.9);
  modules(parts, 8, -2.1, -0.4, -L * 0.33, 2.2, 0.9);
  parts.hullDark.push(at(taperedBox(0.4, 1.6, 4.0, 0.6, 1), 0, -2.4, -2));
  const eng = newParts();
  engineBlock(3.4, 2.6, 2.4, [
    { x: 1.0, y: 0.6, r: 0.5 },
    { x: -1.0, y: 0.6, r: 0.5 },
    { x: 1.0, y: -0.6, r: 0.5 },
    { x: -1.0, y: -0.6, r: 0.5 },
  ], eng);
  for (const k of Object.keys(eng) as (keyof Parts)[]) parts[k].push(...eng[k].map((g) => g.translate(0, 0, -L * 0.5 + 1.4)));
  const z0 = -L * 0.5 + 1.4 - 2.4 * 0.7;
  return assemble(parts, 'quarian', [new THREE.Vector3(1, 0.6, z0), new THREE.Vector3(-1, 0.6, z0), new THREE.Vector3(1, -0.6, z0), new THREE.Vector3(-1, -0.6, z0)], L, undefined, GLOW);
}

/** Heavy Fleet warship: freighter hull rebuilt around a spinal gun. */
export function buildQuarianHeavy(): BuiltShip {
  const L = 8.2;
  const parts = newParts();
  parts.hull.push(taperedBox(1.4, 1.1, L * 0.7, 0.9, 1).translate(0, 0, -L * 0.03));
  parts.hullDark.push(at(zCylinder(0.22, 0.26, L * 0.45, 12), 0, 0.1, L * 0.3));
  parts.accent.push(at(zCylinder(0.34, 0.34, 1.2, 12), 0, 0.1, L * 0.12));
  parts.hull.push(at(taperedBox(0.9, 0.7, 1.6, 0.7, 1), 0, 0.3, L * 0.22));
  modules(parts, 5, 0.9, 0.6, -L * 0.3, 1.1, 0.5);
  modules(parts, 5, -0.9, 0.5, -L * 0.28, 1.1, 0.5);
  parts.hull.push(at(new THREE.BoxGeometry(0.5, 0.5, 1.2), -0.3, 0.75, -1.5));
  parts.windows.push(at(new THREE.BoxGeometry(0.52, 0.05, 0.6), -0.3, 0.98, -1.4));
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) parts.hullDark.push(at(new THREE.BoxGeometry(0.2, 0.12, 0.26), s * 0.7, 0.55, -2 + i * 1.2));
  const eng = newParts();
  engineBlock(1.6, 1.1, 1.6, [
    { x: 0.45, y: 0.25, r: 0.22 },
    { x: -0.45, y: 0.25, r: 0.22 },
    { x: 0, y: -0.3, r: 0.28 },
  ], eng);
  for (const k of Object.keys(eng) as (keyof Parts)[]) parts[k].push(...eng[k].map((g) => g.translate(0, 0, -L * 0.5 + 0.9)));
  const z0 = -L * 0.5 + 0.9 - 1.6 * 0.7;
  return assemble(parts, 'quarian', [new THREE.Vector3(0.45, 0.25, z0), new THREE.Vector3(-0.45, 0.25, z0), new THREE.Vector3(0, -0.3, z0)], L, new THREE.Vector3(0, 0.1, L * 0.52), GLOW);
}

export function buildQuarianCruiser(): BuiltShip {
  const L = 4.8;
  const parts = newParts();
  parts.hull.push(taperedBox(0.8, 0.6, L * 0.7, 0.8, 1).translate(0, 0, 0));
  parts.hullDark.push(at(zCylinder(0.1, 0.12, 0.9, 10), 0, 0.02, L * 0.42));
  // The Migrant Fleet cruiser is defined by its large transverse annulus.
  // The ring embraces the hull rather than sitting on an unrelated mast.
  // Put the structure into existing hull/armour/accent batches, avoiding
  // per-vessel draw calls in large fleet renders.
  const ringZ = 0.38;
  const ring = new THREE.TorusGeometry(1.06, 0.19, 8, 36);
  ring.scale(1.0, 1.12, 1.0);
  ring.translate(0, 0, ringZ);
  parts.hull.push(ring);
  const inset = new THREE.TorusGeometry(0.96, 0.06, 6, 36);
  inset.scale(1.0, 1.12, 1.0);
  inset.translate(0, 0, ringZ + 0.075);
  parts.hullDark.push(inset);
  // Segmented external armour and four structural spokes tie the ring
  // physically to the long civilian-derived pressure hull.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const segment = new THREE.BoxGeometry(0.16, 0.24, 0.30);
    segment.rotateZ(a - Math.PI / 2);
    segment.translate(Math.cos(a) * 1.06, Math.sin(a) * 1.19, ringZ - 0.025);
    parts.accent.push(segment);
  }
  for (const side of [-1, 1]) {
    const brace = taperedBox(0.12, 0.11, 1.34, 0.75, 1);
    brace.rotateY(side * -0.38);
    parts.hullDark.push(at(brace, side * 0.58, 0.16, ringZ - 0.15));
    parts.hull.push(at(new THREE.BoxGeometry(0.22, 0.18, 1.20), side * 0.70, -0.11, ringZ - 0.19));
  }
  modules(parts, 4, 0.5, 0.35, -L * 0.3, 0.9, 0.32);
  modules(parts, 3, -0.5, 0.3, -L * 0.25, 0.9, 0.32);
  parts.hull.push(at(new THREE.BoxGeometry(0.3, 0.3, 0.7), 0.15, 0.42, -0.6));
  parts.windows.push(at(new THREE.BoxGeometry(0.32, 0.04, 0.4), 0.15, 0.56, -0.55));
  parts.hullDark.push(at(new THREE.BoxGeometry(0.85, 0.12, 1.4), 0, -0.34, -0.4));
  const eng = newParts();
  engineBlock(0.9, 0.6, 1.1, [
    { x: 0.26, y: 0, r: 0.17 },
    { x: -0.26, y: 0, r: 0.17 },
  ], eng);
  for (const k of Object.keys(eng) as (keyof Parts)[]) parts[k].push(...eng[k].map((g) => g.translate(0, 0, -L * 0.5 + 0.6)));
  const z0 = -L * 0.5 + 0.6 - 1.1 * 0.7;
  return assemble(parts, 'quarian', [new THREE.Vector3(0.26, 0, z0), new THREE.Vector3(-0.26, 0, z0)], L, new THREE.Vector3(0, 0.02, L * 0.5), GLOW);
}

/** Quarian patrol craft: a stubby converted hull with straight wings, tip pods and one oversized drive. */
export const QUARIAN_FIGHTER: FighterSpec = {
  faction: 'quarian', length: 0.36, glowColor: GLOW,
  body: { width: 0.2, height: 0.16, sides: 8 },
  wing: { span: 0.26, root: 0.2, tip: 0.14, sweep: 0.04, z: -0.02 },
  tipPods: { radius: 0.03, length: 0.22 },
  engines: { count: 1, x: 0, radius: 0.075, length: 0.2 },
  fins: { count: 1, height: 0.1, root: 0.14, tip: 0.08, sweep: 0.05, x: 0, z: -0.26 },
};
export function buildQuarianFighter(): BuiltShip {
  return buildFighter(QUARIAN_FIGHTER);
}
