import * as THREE from 'three';
import { at, latheBody, merge, taperedBox, taperedTube, zCylinder } from '../geometry';
import { paletteFor } from '../materials';
import { assemble, newParts, type Parts } from './alliance';
import type { BuiltShip } from './types';

/**
 * Asari Republics hull family. Design language: graceful, curved, advanced —
 * smooth lathe-turned hulls, sweeping fins, violet illumination.
 * Original fan models.
 */

const GLOW = 0xd0a8ff;

function curvedBody(parts: Parts, L: number, R: number, squash = 0.8): void {
  const body = latheBody(
    [
      { z: -L * 0.5, r: R * 0.25 },
      { z: -L * 0.35, r: R * 0.6 },
      { z: -L * 0.1, r: R },
      { z: L * 0.15, r: R * 0.9 },
      { z: L * 0.35, r: R * 0.55 },
      { z: L * 0.48, r: R * 0.18 },
      { z: L * 0.5, r: 0.01 },
    ],
    24,
    squash,
  );
  parts.hull.push(body);
  // Engine ring at the stern.
  parts.engine.push(at(zCylinder(R * 0.3, R * 0.22, R * 0.1, 16), 0, 0, -L * 0.5 - 0.02));
  parts.hullDark.push(at(zCylinder(R * 0.36, R * 0.3, R * 0.4, 16, true), 0, 0, -L * 0.5 + R * 0.15));
}

function sweepingFins(parts: Parts, L: number, R: number, count: number, length: number, rise: number): void {
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + Math.PI / count;
    const fin = taperedBox(R * 0.12, R * 0.9, length, 0.3, 1, { frontHeight: 0.25 });
    fin.translate(0, R * 0.9, 0);
    fin.rotateZ(ang);
    fin.translate(0, 0, -L * 0.15);
    parts.accent.push(fin);
    const light = new THREE.BoxGeometry(R * 0.05, R * 0.05, length * 0.6);
    light.translate(0, R * 1.3 + rise, 0);
    light.rotateZ(ang);
    light.translate(0, 0, -L * 0.2);
    parts.windows.push(light);
  }
}

/** Asari cruiser: ~500 m. */
export function buildAsariCruiser(): BuiltShip {
  const L = 5.0;
  const parts = newParts();
  curvedBody(parts, L, 0.42);
  sweepingFins(parts, L, 0.42, 3, 2.2, 0);
  parts.windows.push(at(new THREE.BoxGeometry(0.3, 0.04, 0.5), 0, 0.3, 1.0));
  // Flank viewports and a pair of accent collars.
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) parts.windows.push(at(new THREE.BoxGeometry(0.04, 0.03, 0.14), s * 0.38, 0.08, -1.4 + i * 0.5));
  for (const z of [-0.6, 0.9]) parts.accent.push(at(zCylinder(0.44, 0.44, 0.08, 24, true), 0, 0, z));
  parts.hullDark.push(at(zCylinder(0.07, 0.1, 0.9, 12), 0, -0.05, L * 0.5 - 0.3));
  return assemble(parts, 'asari', [new THREE.Vector3(0, 0, -L * 0.5)], L, new THREE.Vector3(0, -0.05, L * 0.5 + 0.2), GLOW);
}

/** Asari dreadnought: ~900 m. */
export function buildAsariDreadnought(): BuiltShip {
  const L = 9.0;
  const parts = newParts();
  curvedBody(parts, L, 0.75, 0.75);
  sweepingFins(parts, L, 0.75, 4, 4.2, 0.1);
  parts.hullDark.push(at(zCylinder(0.14, 0.2, 1.4, 12), 0, -0.08, L * 0.5 - 0.5));
  parts.windows.push(at(new THREE.BoxGeometry(0.4, 0.05, 1.2), 0, 0.5, 1.2));
  for (let i = 0; i < 8; i++) parts.windows.push(at(new THREE.BoxGeometry(0.5, 0.03, 0.08), 0, 0.62 - i * 0.02, -2.5 + i * 0.6));
  // Flank viewport rows, accent collars and ventral sensor domes.
  for (let i = 0; i < 10; i++) for (const s of [-1, 1]) parts.windows.push(at(new THREE.BoxGeometry(0.05, 0.04, 0.2), s * 0.68, 0.1, -2.6 + i * 0.55));
  for (const z of [-1.2, 1.4]) parts.accent.push(at(zCylinder(0.78, 0.78, 0.1, 28, true), 0, 0, z));
  for (const z of [-1.8, 0, 1.8]) parts.hullDark.push(at(new THREE.SphereGeometry(0.12, 10, 8), 0, -0.6, z));
  return assemble(parts, 'asari', [new THREE.Vector3(0, 0, -L * 0.5)], L, new THREE.Vector3(0, -0.08, L * 0.5 + 0.3), GLOW);
}

/**
 * Destiny Ascension: central hull with four long curved prongs sweeping
 * forward and outward around the primary gun.
 */
export function buildDestinyAscension(): BuiltShip {
  const L = 16;
  const parts = newParts();
  curvedBody(parts, L * 0.75, 1.2, 0.8);
  const p = paletteFor('asari');
  const prongs: THREE.BufferGeometry[] = [];
  const lights: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const dir = new THREE.Vector3(Math.cos(ang), Math.sin(ang) * 0.85, 0).normalize();
    const root = dir.clone().multiplyScalar(1.0).add(new THREE.Vector3(0, 0, -1.5));
    const c1 = dir.clone().multiplyScalar(2.8).add(new THREE.Vector3(0, 0, 2.5));
    const c2 = dir.clone().multiplyScalar(3.4).add(new THREE.Vector3(0, 0, 6.5));
    const tip = dir.clone().multiplyScalar(2.6).add(new THREE.Vector3(0, 0, 9.5));
    const curve = new THREE.CatmullRomCurve3([root, c1, c2, tip]);
    prongs.push(taperedTube(curve, (t) => 0.55 * (1 - t * 0.7), 24, 10, 0.7));
    const lc = new THREE.CatmullRomCurve3([root.clone().add(dir.clone().multiplyScalar(0.5)), c1.clone().add(dir.clone().multiplyScalar(0.45)), c2.clone().add(dir.clone().multiplyScalar(0.3)), tip.clone()]);
    lights.push(taperedTube(lc, (t) => 0.06 * (1 - t * 0.6), 20, 5));
  }
  const prongMesh = new THREE.Mesh(merge(prongs), p.hull);
  prongMesh.name = 'hull';
  const lightMesh = new THREE.Mesh(merge(lights), p.windows);
  lightMesh.name = 'windows';
  // Main gun at the centre, between the prongs.
  parts.hullDark.push(at(zCylinder(0.25, 0.35, 4.5, 14), 0, 0, 5.0));
  parts.accent.push(at(zCylinder(0.4, 0.4, 0.3, 14), 0, 0, 3.2));
  parts.windows.push(at(new THREE.BoxGeometry(0.6, 0.06, 2.0), 0, 0.95, -1.0));
  const built = assemble(parts, 'asari', [new THREE.Vector3(0, 0, -L * 0.375)], L, new THREE.Vector3(0, 0, 7.4), GLOW);
  built.group.add(prongMesh, lightMesh);
  return built;
}
