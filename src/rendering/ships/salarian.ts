import * as THREE from 'three';
import { at, latheBody, taperedBox, taperedTube, zCylinder } from '../geometry';
import { assemble, newParts, type Parts } from './alliance';
import type { BuiltShip } from './types';

/**
 * Salarian Union hull family. Design language: slender and amphibian —
 * a narrow sensor "head" on a long neck, a swollen mid-hull, drive pods on
 * swept booms folded back along the body like limbs, dense sensor
 * blisters and pale green illumination. Original fan models.
 */

const GLOW = 0xb8ffa0;

/** Slender body: bow head, long neck, swollen mid-hull, tapering stern. */
function slenderBody(parts: Parts, L: number, R: number, squash = 0.7): void {
  parts.hull.push(
    latheBody(
      [
        { z: -L * 0.5, r: R * 0.3 },
        { z: -L * 0.3, r: R * 0.75 },
        { z: -L * 0.05, r: R },
        { z: L * 0.15, r: R * 0.7 },
        { z: L * 0.3, r: R * 0.32 },
        { z: L * 0.42, r: R * 0.3 },
        { z: L * 0.5, r: R * 0.08 },
      ],
      22,
      squash,
    ),
  );
  // Sensor head: a flattened bulb at the bow with a lit visor.
  parts.hullDark.push(
    latheBody(
      [
        { z: L * 0.36, r: R * 0.2 },
        { z: L * 0.42, r: R * 0.44 },
        { z: L * 0.48, r: R * 0.38 },
        { z: L * 0.53, r: 0.02 },
      ],
      16,
      squash * 0.8,
    ),
  );
  parts.windows.push(at(new THREE.BoxGeometry(R * 0.6, R * 0.06, R * 0.12), 0, R * 0.12, L * 0.47));
  // Stern drive.
  parts.hullDark.push(at(zCylinder(R * 0.34, R * 0.28, R * 0.5, 16, true), 0, 0, -L * 0.5 + R * 0.1));
  parts.engine.push(at(zCylinder(R * 0.26, R * 0.2, R * 0.1, 16), 0, 0, -L * 0.5 - 0.02));
  // Dorsal ridge along the back.
  parts.accent.push(at(taperedBox(R * 0.25, R * 0.3, L * 0.45, 0.4, 0.8), 0, R * squash * 0.85, -L * 0.05));
  // Ventral keel strip.
  parts.hullDark.push(at(taperedBox(R * 0.18, R * 0.12, L * 0.5, 0.5, 0.9), 0, -R * squash * 0.9, -L * 0.02));
}

/** Drive pods on swept booms, folded back along the body. */
function outriggers(parts: Parts, L: number, R: number, podL: number, spread: number, drop: number): THREE.Vector3[] {
  const nodes: THREE.Vector3[] = [];
  for (const s of [-1, 1]) {
    const root = new THREE.Vector3(s * R * 0.6, 0, -L * 0.05);
    const mid = new THREE.Vector3(s * spread * 0.8, -drop * 0.6, -L * 0.15);
    const tip = new THREE.Vector3(s * spread, -drop, -L * 0.3);
    const boom = new THREE.CatmullRomCurve3([root, mid, tip]);
    parts.hullDark.push(taperedTube(boom, (t) => R * 0.16 * (1 - t * 0.3), 12, 8, 0.7));
    const pod = latheBody(
      [
        { z: -podL * 0.5, r: R * 0.12 },
        { z: -podL * 0.2, r: R * 0.3 },
        { z: podL * 0.3, r: R * 0.26 },
        { z: podL * 0.5, r: 0.02 },
      ],
      14,
      0.9,
    );
    pod.translate(tip.x, tip.y, tip.z + podL * 0.15);
    parts.hull.push(pod);
    parts.engine.push(at(zCylinder(R * 0.14, R * 0.1, R * 0.08, 12), tip.x, tip.y, tip.z - podL * 0.36));
    parts.windows.push(at(new THREE.BoxGeometry(R * 0.06, R * 0.06, podL * 0.4), tip.x, tip.y + R * 0.26, tip.z + podL * 0.05));
    nodes.push(new THREE.Vector3(tip.x, tip.y, tip.z - podL * 0.4));
  }
  return nodes;
}

/** Rows of sensor blisters along the flanks. */
function sensorBlisters(parts: Parts, L: number, R: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const z = -L * 0.25 + (i / Math.max(1, n - 1)) * L * 0.5;
    const k = 0.55 + 0.4 * Math.sin((i / n) * Math.PI);
    for (const s of [-1, 1]) parts.windows.push(at(new THREE.SphereGeometry(R * 0.07, 8, 6), s * R * k, R * 0.3, z));
  }
}

/** Union interceptor: ~18 m. */
export function buildSalarianFighter(): BuiltShip {
  const L = 0.36;
  const parts = newParts();
  parts.hull.push(taperedBox(0.05, 0.035, L, 0.2, 0.7));
  parts.hullDark.push(at(taperedBox(0.11, 0.012, L * 0.5, 0.3, 1), 0, 0, -L * 0.1));
  parts.hullDark.push(at(zCylinder(0.014, 0.022, L * 0.28, 8, true), 0, 0, -L * 0.42));
  parts.engine.push(at(zCylinder(0.012, 0.01, 0.015, 8), 0, 0, -L * 0.56));
  parts.windows.push(at(new THREE.BoxGeometry(0.02, 0.008, 0.05), 0, 0.016, L * 0.1));
  return assemble(parts, 'salarian', [new THREE.Vector3(0, 0, -L * 0.56)], L, new THREE.Vector3(0, 0, L * 0.5), GLOW);
}

/** STG stealth frigate: ~150 m, drive pods tucked close. */
export function buildStgFrigate(): BuiltShip {
  const L = 1.5;
  const R = 0.14;
  const parts = newParts();
  slenderBody(parts, L, R, 0.65);
  const pods = outriggers(parts, L, R, 0.5, 0.3, 0.05);
  parts.hullDark.push(at(zCylinder(0.02, 0.028, 0.3, 10), 0, -0.02, L * 0.5 - 0.1));
  return assemble(parts, 'salarian', [new THREE.Vector3(0, 0, -L * 0.5), ...pods], L, new THREE.Vector3(0, -0.02, L * 0.5 + 0.08), GLOW);
}

/** Union cruiser: ~520 m. */
export function buildSalarianCruiser(): BuiltShip {
  const L = 5.2;
  const R = 0.4;
  const parts = newParts();
  slenderBody(parts, L, R, 0.7);
  const pods = outriggers(parts, L, R, 1.8, 1.0, 0.15);
  sensorBlisters(parts, L, R, 5);
  parts.hullDark.push(at(zCylinder(0.06, 0.09, 0.9, 12), 0, -0.05, L * 0.5 - 0.35));
  parts.accent.push(at(zCylinder(0.11, 0.11, 0.12, 12), 0, -0.05, L * 0.5 - 0.8));
  return assemble(parts, 'salarian', [new THREE.Vector3(0, 0, -L * 0.5), ...pods], L, new THREE.Vector3(0, -0.05, L * 0.5 + 0.2), GLOW);
}

/** Union dreadnought: ~860 m, two pairs of drive pods and a long spinal gun. */
export function buildSalarianDreadnought(): BuiltShip {
  const L = 8.6;
  const R = 0.66;
  const parts = newParts();
  slenderBody(parts, L, R, 0.7);
  const pods = outriggers(parts, L, R, 3.0, 1.7, 0.25);
  const pods2 = outriggers(parts, L * 0.8, R * 0.75, 2.0, 1.15, -0.5);
  sensorBlisters(parts, L, R, 8);
  parts.hullDark.push(at(zCylinder(0.12, 0.17, 1.6, 14), 0, -0.08, L * 0.5 - 0.6));
  parts.accent.push(at(zCylinder(0.2, 0.2, 0.18, 14), 0, -0.08, L * 0.5 - 1.4));
  for (let i = 0; i < 6; i++) parts.windows.push(at(new THREE.BoxGeometry(0.4, 0.03, 0.08), 0, 0.5 - i * 0.03, -2.2 + i * 0.5));
  return assemble(parts, 'salarian', [new THREE.Vector3(0, 0, -L * 0.5), ...pods, ...pods2], L, new THREE.Vector3(0, -0.08, L * 0.5 + 0.3), GLOW);
}
