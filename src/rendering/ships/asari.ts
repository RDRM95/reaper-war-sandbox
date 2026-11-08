import * as THREE from 'three';
import { at, latheBody, taperedBox, taperedTube, zCylinder } from '../geometry';
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
 * Destiny Ascension: broad asymmetric-looking-at-angle swept fan, not an
 * enlarged Asari cruiser with four detached claws. The original procedural
 * interpretation is guided by the user-supplied Destiny Ascension comparison
 * (fan concept), NOT by an extracted/approved game mesh.
 * Geometry is folded into five existing materials for fleet scalability.
 */
export function buildDestinyAscension(): BuiltShip {
  const L = 16;
  const parts = newParts();
  curvedBody(parts, L * 0.78, 1.25, 0.72);

  // Broad paired swept shell panels. The transverse span is intentionally
  // prominent at normal spectator distance, matching the reference's fan.
  for (const side of [-1, 1]) {
    const outline = new THREE.Shape();
    const points: Array<[number, number]> = [
      [side * 0.24, 4.5],
      [side * 0.84, 4.0],
      [side * 1.92, 2.7],
      [side * 3.45, -1.3],
      [side * 5.05, -5.95],
      [side * 4.10, -6.25],
      [side * 1.45, -5.10],
      [side * 0.16, -4.40],
    ];
    outline.moveTo(...points[0]);
    for (let i = 1; i < points.length; i++) outline.lineTo(...points[i]);
    outline.closePath();
    // Extruded Shape lies in XY; rotate into the horizontal XZ hull plane.
    const panel = new THREE.ExtrudeGeometry(outline, {
      depth: 0.16, bevelEnabled: false, steps: 1, curveSegments: 3,
    });
    panel.rotateX(Math.PI / 2);
    panel.translate(0, 0.18, 0);
    parts.hull.push(panel);

    // Structural leading-edge spar, thickness tapered to the outer tip.
    const edge = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.24, 0.23, 4.5),
      new THREE.Vector3(side * 0.84, 0.23, 4.0),
      new THREE.Vector3(side * 1.92, 0.23, 2.7),
      new THREE.Vector3(side * 3.45, 0.23, -1.3),
      new THREE.Vector3(side * 5.05, 0.23, -5.95),
    ]);
    parts.accent.push(taperedTube(edge, t => 0.18 * (1 - 0.72 * t), 30, 7, 0.76));
    for (let i = 0; i < 5; i++) {
      const z = -3.9 + i * 1.36;
      const x = side * (1.30 + i * 0.14);
      parts.hullDark.push(at(taperedBox(0.28, 0.07, 0.75, 0.45, 0.95), x, 0.25, z));
    }
  }

  // Central command hull and coaxial cannon run between the swept surfaces.
  parts.hullDark.push(at(taperedBox(0.64, 0.42, 8.8, 0.38, 0.96), 0, 0.04, 0.55));
  parts.hull.push(at(taperedBox(0.28, 0.24, 3.3, 0.16, 0.9), 0, 0.03, 5.75));
  parts.hullDark.push(at(zCylinder(0.18, 0.24, 3.5, 12), 0, -0.20, 5.6));
  // Distinct circular central collar remains visible in bow and side views.
  const collar = new THREE.TorusGeometry(0.94, 0.15, 8, 36);
  collar.translate(0, 0, 0.48);
  parts.accent.push(collar);
  const litCollar = new THREE.TorusGeometry(0.80, 0.045, 6, 36);
  litCollar.translate(0, 0, 0.57);
  parts.windows.push(litCollar);
  parts.windows.push(at(new THREE.BoxGeometry(0.62, 0.06, 2.1), 0, 0.95, -1.1));

  return assemble(parts, 'asari', [new THREE.Vector3(0, 0, -L * 0.39)],
    L, new THREE.Vector3(0, -0.20, 7.5), GLOW);
}
