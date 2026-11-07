import * as THREE from 'three';
import { at, taperedBox, zCylinder } from '../geometry';
import { assemble, newParts } from './alliance';
import type { BuiltShip } from './types';

/**
 * APEX / SSV Omaha Black Fleet configuration — independent, reference-informed
 * geometry. Not a recoloured Alliance Omaha.
 *
 * Visual anchors: Cerberus_Cruiser_Kiesling.png (swept split bow, stepped
 * armour, black insets) and Cerberus Dreadnaught.jpeg (heavy axial structure).
 * No third-party reference art or game mesh is included in the distribution.
 * Local axes are +Z bow, +Y dorsal; 1 render unit = 100 metres.
 */
export function buildCerberusOmaha(): BuiltShip {
  const L = 18;
  const parts = newParts();

  // Deep, narrow gunship keel: a dark recessed axial channel remains legible
  // independently of faction colour or decals.
  parts.hullDark.push(at(taperedBox(2.15, 1.1, 16.1, 0.29, 0.9, { frontHeight: 0.42 }), 0, -0.28, -0.30));
  parts.hull.push(at(taperedBox(2.55, 0.83, 11.8, 0.32, 0.92, { frontHeight: 0.50 }), 0, 0.21, -0.65));
  parts.hullDark.push(at(taperedBox(0.63, 0.37, 14.7, 0.62, 0.95), 0, -0.72, 0.22));

  // Two Cerberus-style forward blades; their void frames the HADES weapon.
  // Distinct from the compact, contiguous Alliance Omaha accelerator hull.
  for (const side of [-1, 1]) {
    parts.hull.push(at(taperedBox(1.03, 0.42, 11.4, 0.14, 0.92, { frontHeight: 0.32 }),
      side * 1.35, 0.10, 2.55));
    parts.hullDark.push(at(taperedBox(0.66, 0.24, 9.5, 0.14, 1),
      side * 1.82, -0.20, 2.3));
    // Angular shoulder extensions form a distinctive black-chevron top view.
    parts.hull.push(at(taperedBox(1.45, 0.30, 7.6, 0.18, 0.96),
      side * 2.04, -0.12, -1.30));
    parts.hullDark.push(at(taperedBox(0.55, 0.17, 7.2, 0.4, 0.95),
      side * 2.56, 0.23, -1.73));

    // Stepped top armour and restrained orange registry strips.
    for (let k = 0; k < 4; k++) {
      const z = -4.1 + k * 2.15;
      parts.hull.push(at(taperedBox(0.98, 0.14, 1.58, 0.56, 0.98),
        side * 1.04, 0.68 + k * 0.025, z));
    }
    parts.accent.push(at(new THREE.BoxGeometry(0.065, 0.035, 8.0),
      side * 0.75, 0.79, -0.6));

    // Broadside housings positioned at realistic side and stern stations.
    for (let i = 0; i < 8; i++) {
      const z = -4.55 + i * 1.32;
      parts.hullDark.push(at(new THREE.BoxGeometry(0.34, 0.31, 0.56),
        side * 1.65, 0.37, z));
      parts.hull.push(at(zCylinder(0.105, 0.13, 0.42, 8),
        side * 1.84, 0.39, z));
    }

    // Sensor / point-defence blisters, small at capital-ship scale.
    for (const z of [-5.8, -2.5, 0.7, 4.1]) {
      parts.hullDark.push(at(new THREE.SphereGeometry(0.13, 8, 6),
        side * 1.14, 0.84, z));
    }
  }

  // Massive armoured command spine; less exposed than the Alliance bridge.
  parts.hull.push(at(taperedBox(0.96, 0.52, 5.0, 0.24, 0.91),
    0, 0.97, -0.95));
  parts.hullDark.push(at(taperedBox(0.68, 0.25, 3.5, 0.38, 0.9),
    0, 1.30, -0.45));
  parts.windows.push(at(new THREE.BoxGeometry(0.43, 0.035, 0.78),
    0, 1.45, 0.5));

  // Explicit axial HADES tube and high-contrast mouth at its physical muzzle.
  parts.hullDark.push(at(zCylinder(0.22, 0.32, 3.25, 16),
    0, -0.24, 7.18));
  parts.accent.push(at(zCylinder(0.27, 0.27, 0.12, 16),
    0, -0.24, 8.73));
  parts.hullDark.push(at(zCylinder(0.15, 0.15, 0.20, 12),
    0, -0.24, 8.78));

  // Fully physical aft drives: 4 major nozzles, 2 auxiliary thrusters.
  parts.hullDark.push(at(taperedBox(3.05, 1.3, 3.1, 0.82, 1),
    0, -0.04, -7.08));
  const engineNodes: THREE.Vector3[] = [];
  for (const x of [-1.05, 1.05]) {
    for (const y of [-0.47, 0.47]) {
      parts.hullDark.push(at(zCylinder(0.37, 0.40, 0.87, 12, true),
        x, y, -8.58));
      parts.engine.push(at(zCylinder(0.28, 0.30, 0.13, 12),
        x, y, -8.96));
      engineNodes.push(new THREE.Vector3(x, y, -8.99));
    }
  }
  for (const x of [-0.38, 0.38]) {
    parts.engine.push(at(zCylinder(0.11, 0.11, 0.08, 10), x, 0.05, -8.82));
    engineNodes.push(new THREE.Vector3(x, 0.05, -8.85));
  }

  const built = assemble(parts, 'cerberus_black_fleet', engineNodes, L,
    new THREE.Vector3(0, -0.24, 8.78), 0x65b9ff);
  built.group.name = 'SSV Omaha - Cerberus Black Fleet / APEX';
  return built;
}
