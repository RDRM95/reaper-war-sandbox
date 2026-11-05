import * as THREE from 'three';
import { at, merge, plateStrip, rot, taperedBox, wedge, zCylinder } from '../geometry';
import { paletteFor } from '../materials';
import type { BuiltShip } from './types';

/**
 * Systems Alliance hull family. Design language: functional military
 * architecture, angular hulls, long spinal mass accelerator, flat armour
 * facets, blue drive illumination, white/grey plating with dark panel bands
 * and a blue identification stripe. All dimensions in render units (100 m).
 *
 * Original fan models; proportions follow the trilogy's Alliance silhouettes.
 */

export function engineBlock(width: number, height: number, length: number, nozzles: { x: number; y: number; r: number }[], parts: Parts): void {
  parts.hullDark.push(at(taperedBox(width, height, length, 1, 0.85), 0, 0, 0));
  for (const n of nozzles) {
    parts.hullDark.push(at(zCylinder(n.r * 1.05, n.r * 0.9, length * 0.35, 14, true), n.x, n.y, -length * 0.55));
    parts.engine.push(at(zCylinder(n.r * 0.8, n.r * 0.55, 0.12, 14), n.x, n.y, -length * 0.7));
  }
}

export interface Parts {
  hull: THREE.BufferGeometry[];
  hullDark: THREE.BufferGeometry[];
  accent: THREE.BufferGeometry[];
  engine: THREE.BufferGeometry[];
  windows: THREE.BufferGeometry[];
}

export const newParts = (): Parts => ({ hull: [], hullDark: [], accent: [], engine: [], windows: [] });

export function assemble(parts: Parts, faction: string, engineNodes: THREE.Vector3[], lengthUnits: number, muzzle?: THREE.Vector3, glowColor = 0x4fb8ff): BuiltShip {
  const p = paletteFor(faction);
  const group = new THREE.Group();
  const add = (g: THREE.BufferGeometry[], m: THREE.Material, name: string) => {
    if (g.length === 0) return;
    const mesh = new THREE.Mesh(merge(g), m);
    mesh.name = name;
    mesh.castShadow = false;
    group.add(mesh);
  };
  add(parts.hull, p.hull, 'hull');
  add(parts.hullDark, p.hullDark, 'hullDark');
  add(parts.accent, p.accent, 'accent');
  add(parts.engine, p.engine, 'engine');
  add(parts.windows, p.windows, 'windows');
  return { group, engineNodes, lengthUnits, muzzle, glowColor };
}

/** Capital silhouettes share a manufacturing language, not a scaled template.
 * The long gun keel, armoured rails, forward bridge and broadside sponsons
 * remain legible at battle distance. Decorative parts merge into five meshes.
 */
function buildAllianceGunship(L: number, kind: 'dreadnought' | 'omaha' | 'cruiser'): BuiltShip {
  const parts = newParts();
  const heavy = kind === 'omaha';
  const cruiser = kind === 'cruiser';
  const beam = L * (heavy ? 0.28 : cruiser ? 0.25 : 0.26);
  const height = L * 0.075;
  const gunZ = L * 0.48;
  // Continuous ventral accelerator, flanked by pale armour rails.
  parts.hullDark.push(at(taperedBox(beam * 0.23, height * 0.65, L * 0.9, 0.65, 1), 0, -height * 0.22, 0));
  for (const side of [-1, 1]) {
    parts.hull.push(at(taperedBox(beam * 0.27, height, L * 0.82, 0.38, 0.85, { frontHeight: 0.45 }), side * beam * 0.19, 0, L * 0.01));
    // Stepped slab sponsons; no swept aircraft wings on capital hulls.
    parts.hull.push(at(taperedBox(beam * 0.25, height * 0.65, L * 0.55, 0.65, 0.9), side * beam * 0.36, -height * 0.08, -L * 0.055));
    parts.hullDark.push(at(new THREE.BoxGeometry(beam * 0.045, height * 0.25, L * 0.44), side * beam * 0.49, 0, -L * 0.045));
    parts.accent.push(at(new THREE.BoxGeometry(beam * 0.035, height * 0.025, L * 0.56), side * beam * 0.25, height * 0.51, -L * 0.02));
    const batteries = heavy ? 6 : cruiser ? 2 : 4;
    for (let i = 0; i < batteries; i++) {
      const z = -L * 0.24 + i * L * 0.42 / Math.max(1, batteries - 1);
      parts.hullDark.push(at(new THREE.BoxGeometry(beam * 0.09, height * 0.18, L * 0.035), side * beam * 0.42, height * 0.35, z));
      parts.hullDark.push(at(rot(zCylinder(L * 0.0035, L * 0.0035, beam * 0.14, 6), 0, side * Math.PI / 2, 0), side * beam * 0.49, height * 0.4, z));
    }
    parts.windows.push(...plateStrip(8, L * 0.007, L * 0.004, L * 0.018,
      new THREE.Vector3(side * beam * 0.20, height * 0.42, -L * 0.29), new THREE.Vector3(side * beam * 0.20, height * 0.42, L * 0.22)));
    // Bow GARDIAN blisters stay small against the spinal housing.
    for (const z of [L * 0.18, L * 0.28]) parts.hullDark.push(at(new THREE.SphereGeometry(L * 0.009, 8, 6), side * beam * 0.24, height * 0.48, z));
  }
  parts.hull.push(at(taperedBox(beam * 0.47, height * 0.65, L * 0.22, 0.22, 1, { frontHeight: 0.18 }), 0, height * 0.05, L * 0.33));
  parts.hullDark.push(at(zCylinder(L * 0.017, L * 0.021, L * 0.12, 12), 0, -height * 0.12, L * 0.43));
  // Forward command block, behind the armoured bow, rather than a rear tower.
  parts.hull.push(at(taperedBox(beam * 0.28, height * 0.55, L * 0.20, 0.65, 1), 0, height * 0.66, L * 0.12));
  parts.hullDark.push(at(taperedBox(beam * 0.18, height * 0.46, L * 0.09, 0.75, 1), 0, height * 1.03, L * 0.10));
  parts.windows.push(at(new THREE.BoxGeometry(beam * 0.19, height * 0.06, L * 0.035), 0, height * 1.14, L * 0.13));
  if (heavy) {
    // Omaha's reinforced channel and recoil braces are unique geometry.
    for (const side of [-1, 1]) {
      parts.hull.push(at(taperedBox(beam * 0.09, height * 0.8, L * 0.55, 0.3, 1), side * beam * 0.13, height * 0.38, L * 0.08));
    }
    for (const z of [-0.18, -0.02, 0.14]) parts.hullDark.push(at(new THREE.BoxGeometry(beam * 0.62, height * 0.10, L * 0.016), 0, height * 0.61, L * z));
  }
  const nozzles = heavy ? 6 : cruiser ? 2 : 4;
  const engineNodes: THREE.Vector3[] = [];
  parts.hullDark.push(at(taperedBox(beam * 0.76, height * 1.45, L * 0.16, 0.9, 1), 0, -height * 0.05, -L * 0.38));
  parts.hull.push(at(taperedBox(beam * 0.72, height * 0.18, L * 0.16, 0.8, 1), 0, height * 0.73, -L * 0.38));
  parts.accent.push(at(new THREE.BoxGeometry(beam * 0.5, height * 0.025, L * 0.025), 0, height * 0.83, -L * 0.37));
  for (const side of [-1, 1]) parts.hull.push(at(taperedBox(beam * 0.07, height * 0.95, L * 0.14, 0.7, 1), side * beam * 0.34, 0, -L * 0.38));
  for (let i = 0; i < nozzles; i++) {
    const columns = nozzles === 2 ? 2 : nozzles / 2;
    const x = (i % columns - (columns - 1) / 2) * beam * (heavy ? 0.22 : 0.38);
    const y = nozzles > 2 ? (i < columns ? 1 : -1) * height * 0.33 : 0;
    const r = L * (heavy ? 0.021 : cruiser ? 0.026 : 0.024);
    parts.hullDark.push(at(zCylinder(r * 1.25, r, L * 0.055, 12, true), x, y, -L * 0.465));
    parts.engine.push(at(zCylinder(r * 0.86, r * 0.75, L * 0.008, 12), x, y, -L * 0.495));
    engineNodes.push(new THREE.Vector3(x, y, -L * 0.50));
  }
  return assemble(parts, 'alliance', engineNodes, L, new THREE.Vector3(0, -height * 0.12, gunZ));
}

/** Existing catalogue dimensions are preserved; these are original fan hulls. */
export const buildAllianceDreadnought = (): BuiltShip => buildAllianceGunship(8.88, 'dreadnought');
export const buildAllianceOmaha = (): BuiltShip => buildAllianceGunship(18, 'omaha');

/** Alliance carrier: dreadnought-sized hull with a flight deck and hangar mouths. */
export function buildAllianceCarrier(): BuiltShip {
  const L = 9.0;
  const parts = newParts();
  parts.hull.push(taperedBox(1.4, 0.7, L * 0.8, 0.75, 1, { frontHeight: 0.7 }));
  // Flight deck slab.
  parts.hull.push(at(taperedBox(2.3, 0.22, L * 0.62, 0.8, 1), 0, 0.4, 0.2));
  parts.hullDark.push(at(new THREE.BoxGeometry(2.1, 0.03, L * 0.55), 0, 0.52, 0.2));
  parts.accent.push(at(new THREE.BoxGeometry(0.06, 0.04, L * 0.5), 0.5, 0.54, 0.2));
  parts.accent.push(at(new THREE.BoxGeometry(0.06, 0.04, L * 0.5), -0.5, 0.54, 0.2));
  // Hangar openings (recessed, lit).
  for (const s of [-1, 1]) {
    parts.hullDark.push(at(new THREE.BoxGeometry(0.1, 0.42, 2.6), s * 1.2, 0.0, 0.4));
    parts.windows.push(at(new THREE.BoxGeometry(0.04, 0.3, 2.4), s * 1.24, 0.0, 0.4));
    parts.hull.push(at(taperedBox(0.5, 0.5, 3.6, 0.7, 0.9), s * 1.0, -0.25, -0.8));
  }
  // Island / bridge.
  parts.hull.push(at(new THREE.BoxGeometry(0.5, 0.5, 1.4), 0.6, 0.85, -1.6));
  parts.windows.push(at(new THREE.BoxGeometry(0.52, 0.06, 1.0), 0.6, 1.0, -1.6));
  // Bow.
  parts.hull.push(at(wedge(1.3, 0.6, 1.6, 0.35), 0, 0, L * 0.4 + 0.6));
  // Engines.
  const engParts = newParts();
  engineBlock(2.0, 1.0, 1.8, [
    { x: 0.6, y: 0.2, r: 0.24 },
    { x: -0.6, y: 0.2, r: 0.24 },
    { x: 0, y: -0.25, r: 0.28 },
  ], engParts);
  for (const k of Object.keys(engParts) as (keyof Parts)[]) parts[k].push(...engParts[k].map((g) => g.translate(0, 0, -L * 0.5 + 1.0)));
  const z0 = -L * 0.5 + 1.0 - 1.8 * 0.7;
  return assemble(parts, 'alliance', [new THREE.Vector3(0.6, 0.2, z0), new THREE.Vector3(-0.6, 0.2, z0), new THREE.Vector3(0, -0.25, z0)], L);
}

/** Cruiser keeps the Alliance capital-slab language on its 520 m hull. */
export const buildAllianceCruiser = (): BuiltShip => buildAllianceGunship(5.2, 'cruiser');

/** Alliance frigate / Normandy-style hull: ~170–216 m. */
export function buildAllianceFrigate(normandy = false): BuiltShip {
  const L = normandy ? 2.16 : 1.7;
  const parts = newParts();
  // Fuselage.
  parts.hull.push(taperedBox(0.28, 0.2, L * 0.72, 0.45, 0.9, { frontHeight: 0.5 }).translate(0, 0.02, L * 0.08));
  // Raised cockpit / neck.
  parts.hull.push(at(taperedBox(0.2, 0.14, 0.5, 0.7, 1), 0, 0.12, L * 0.28));
  parts.windows.push(at(new THREE.BoxGeometry(0.16, 0.03, 0.14), 0, 0.2, L * 0.36));
  // Swept wings with tip nacelles.
  for (const s of [-1, 1]) {
    const wing = taperedBox(0.75, 0.05, 0.5, 0.5, 1);
    wing.rotateY(s * -0.45);
    wing.rotateZ(s * 0.12);
    parts.hull.push(at(wing, s * 0.42, -0.02, -0.25));
    parts.hullDark.push(at(zCylinder(0.07, 0.08, 0.7, 10), s * 0.78, -0.06, -0.4));
    parts.engine.push(at(zCylinder(0.055, 0.04, 0.06, 10), s * 0.78, -0.06, -0.78));
    parts.accent.push(at(new THREE.BoxGeometry(0.12, 0.03, 0.18), s * 0.5, 0.02, -0.2));
  }
  // Dorsal fin and ventral weapon bay.
  parts.hullDark.push(at(taperedBox(0.04, 0.16, 0.5, 0.5, 1), 0, 0.18, -0.35));
  parts.hullDark.push(at(new THREE.BoxGeometry(0.16, 0.07, 0.5), 0, -0.1, 0.1));
  // Main thrusters.
  parts.hullDark.push(at(new THREE.BoxGeometry(0.34, 0.16, 0.3), 0, 0.0, -L * 0.42));
  parts.engine.push(at(zCylinder(0.05, 0.04, 0.05, 10), 0.09, 0.0, -L * 0.5 + 0.02));
  parts.engine.push(at(zCylinder(0.05, 0.04, 0.05, 10), -0.09, 0.0, -L * 0.5 + 0.02));
  // Stripe (Normandy: black/white with blue; standard: blue).
  parts.accent.push(at(new THREE.BoxGeometry(0.3, 0.02, 0.5), 0, 0.12, -0.1));
  if (normandy) parts.hullDark.push(at(new THREE.BoxGeometry(0.29, 0.21, 0.25), 0, 0.02, -0.55));
  const engineNodes = [new THREE.Vector3(0.78, -0.06, -0.8), new THREE.Vector3(-0.78, -0.06, -0.8), new THREE.Vector3(0.09, 0, -L * 0.5), new THREE.Vector3(-0.09, 0, -L * 0.5)];
  return assemble(parts, 'alliance', engineNodes, L, new THREE.Vector3(0, -0.02, L * 0.5));
}

/** F-61 Trident fighter (rendered ×2 for visibility; see KNOWN_ISSUES). */
export function buildAllianceFighter(): BuiltShip {
  const scale = 2;
  const L = 0.18 * scale;
  const parts = newParts();
  parts.hull.push(taperedBox(0.05 * scale, 0.035 * scale, L, 0.3, 0.9));
  const wing = taperedBox(0.2 * scale, 0.01 * scale, 0.08 * scale, 0.4, 1);
  parts.hull.push(at(wing, 0, 0, -0.02 * scale));
  parts.hullDark.push(at(new THREE.BoxGeometry(0.03 * scale, 0.02 * scale, 0.06 * scale), 0.03 * scale, 0, -0.07 * scale));
  parts.hullDark.push(at(new THREE.BoxGeometry(0.03 * scale, 0.02 * scale, 0.06 * scale), -0.03 * scale, 0, -0.07 * scale));
  parts.engine.push(at(zCylinder(0.012 * scale, 0.01 * scale, 0.01 * scale, 6), 0.03 * scale, 0, -0.1 * scale));
  parts.engine.push(at(zCylinder(0.012 * scale, 0.01 * scale, 0.01 * scale, 6), -0.03 * scale, 0, -0.1 * scale));
  parts.windows.push(at(new THREE.BoxGeometry(0.02 * scale, 0.012 * scale, 0.03 * scale), 0, 0.02 * scale, 0.02 * scale));
  return assemble(parts, 'alliance', [new THREE.Vector3(0.03 * scale, 0, -0.1 * scale), new THREE.Vector3(-0.03 * scale, 0, -0.1 * scale)], L);
}
