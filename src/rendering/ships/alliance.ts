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

/** The heavy three-rail gunship hull that the Omaha, Aegis and Valkyrie classes are built on: long gun keel,
 * armoured rails, forward bridge and broadside sponsons, six drives. Decorative parts merge into five meshes.
 * The line dreadnought and cruiser have their own hulls below.
 */
function buildAllianceGunship(L: number): BuiltShip {
  const parts = newParts();
  const beam = L * 0.28;
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
    const batteries = 6;
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
  // Reinforced channel and recoil braces.
  for (const side of [-1, 1]) {
    parts.hull.push(at(taperedBox(beam * 0.09, height * 0.8, L * 0.55, 0.3, 1), side * beam * 0.13, height * 0.38, L * 0.08));
  }
  for (const z of [-0.18, -0.02, 0.14]) parts.hullDark.push(at(new THREE.BoxGeometry(beam * 0.62, height * 0.10, L * 0.016), 0, height * 0.61, L * z));
  const nozzles = 6;
  const engineNodes: THREE.Vector3[] = [];
  parts.hullDark.push(at(taperedBox(beam * 0.76, height * 1.45, L * 0.16, 0.9, 1), 0, -height * 0.05, -L * 0.38));
  parts.hull.push(at(taperedBox(beam * 0.72, height * 0.18, L * 0.16, 0.8, 1), 0, height * 0.73, -L * 0.38));
  parts.accent.push(at(new THREE.BoxGeometry(beam * 0.5, height * 0.025, L * 0.025), 0, height * 0.83, -L * 0.37));
  for (const side of [-1, 1]) parts.hull.push(at(taperedBox(beam * 0.07, height * 0.95, L * 0.14, 0.7, 1), side * beam * 0.34, 0, -L * 0.38));
  for (let i = 0; i < nozzles; i++) {
    const columns = nozzles / 2;
    const x = (i % columns - (columns - 1) / 2) * beam * 0.22;
    const y = (i < columns ? 1 : -1) * height * 0.33;
    const r = L * 0.021;
    parts.hullDark.push(at(zCylinder(r * 1.25, r, L * 0.055, 12, true), x, y, -L * 0.465));
    parts.engine.push(at(zCylinder(r * 0.86, r * 0.75, L * 0.008, 12), x, y, -L * 0.495));
    engineNodes.push(new THREE.Vector3(x, y, -L * 0.50));
  }
  return assemble(parts, 'alliance', engineNodes, L, new THREE.Vector3(0, -height * 0.12, gunZ));
}

/**
 * A flat armour plate: an outline in the deck plane (x across, z along), mirrored about the centre line and
 * extruded downward from `yTop`. `half` runs along the starboard edge from the stern to the bow, x >= 0.
 */
function deckPlate(half: readonly (readonly [number, number])[], yTop: number, thickness: number, L: number): THREE.BufferGeometry {
  const points = [...half, ...half.filter(([x]) => x > 0).reverse().map(([x, z]) => [-x, z] as const)];
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0] * L, points[0][1] * L);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0] * L, points[i][1] * L);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness * L, bevelEnabled: false, curveSegments: 1 });
  // Shape y becomes ship z; the extrusion runs down from the top face.
  g.rotateX(Math.PI / 2);
  g.translate(0, yTop * L, 0);
  return g;
}

/** A row of small lit ports along a straight stretch of hull side, each turned to lie along the row. */
function portRow(parts: Parts, from: readonly [number, number, number], to: readonly [number, number, number], count: number, L: number): void {
  const yaw = Math.atan2(to[0] - from[0], to[2] - from[2]);
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const g = rot(new THREE.BoxGeometry(0.0022 * L, 0.0042 * L, 0.0075 * L), 0, yaw, 0);
    parts.windows.push(at(g, (from[0] + (to[0] - from[0]) * t) * L, (from[1] + (to[1] - from[1]) * t) * L, (from[2] + (to[2] - from[2]) * t) * L));
  }
}

/** Drive block shared by the line hulls: nozzles and engine nodes exactly where the previous models had them. */
function lineDrives(parts: Parts, L: number, nozzles: 2 | 4, beam: number, height: number, r: number): THREE.Vector3[] {
  const nodes: THREE.Vector3[] = [];
  for (let i = 0; i < nozzles; i++) {
    const columns = nozzles === 2 ? 2 : nozzles / 2;
    const x = (i % columns - (columns - 1) / 2) * beam * 0.38;
    const y = nozzles > 2 ? (i < columns ? 1 : -1) * height * 0.33 : 0;
    parts.hullDark.push(at(zCylinder(r * 1.25, r, L * 0.055, 12, true), x, y, -L * 0.465));
    parts.engine.push(at(zCylinder(r * 0.86, r * 0.75, L * 0.008, 12), x, y, -L * 0.495));
    nodes.push(new THREE.Vector3(x, y, -L * 0.50));
  }
  return nodes;
}

/**
 * Alliance dreadnought. A broad, flat arrowhead of layered deck armour that narrows into a long spinal blade around
 * the main gun; a stepped command citadel over the aft third with raised slab fins beside it; a dark ventral tier
 * and keel; blue deck inlays; long rows of lit ports along the deck edge. Original procedural geometry: the shapes
 * are outlines and boxes written here, in the proportions of the Alliance capital silhouette (beam under a third
 * of the length, height under a sixth). Length, muzzle and engine nodes are those of the model it replaces.
 */
export function buildAllianceDreadnought(): BuiltShip {
  const L = 8.88;
  const parts = newParts();
  const beam = L * 0.26, height = L * 0.075;
  // Main deck: arrowhead into the spinal blade.
  parts.hull.push(deckPlate([[0.105, -0.44], [0.15, -0.40], [0.15, -0.08], [0.075, 0.14], [0.034, 0.20], [0.012, 0.47], [0, 0.5]], 0.018, 0.04, L));
  // Raised second tier of deck armour.
  parts.hull.push(deckPlate([[0.085, -0.42], [0.115, -0.38], [0.115, -0.10], [0.05, 0.10], [0.02, 0.16], [0, 0.17]], 0.03, 0.014, L));
  // Dark ventral tier and keel under the pale deck.
  parts.hullDark.push(deckPlate([[0.12, -0.47], [0.16, -0.43], [0.16, -0.18], [0.09, 0.02], [0.03, 0.12], [0.018, 0.44], [0, 0.46]], -0.022, 0.022, L));
  parts.hullDark.push(at(taperedBox(L * 0.05, L * 0.014, L * 0.86, 0.45, 1), 0, -L * 0.051, -L * 0.03));
  // Main gun housing at the tip of the blade.
  parts.hullDark.push(at(zCylinder(L * 0.017, L * 0.021, L * 0.12, 12), 0, -height * 0.12, L * 0.43));
  // Stepped command citadel over the aft third.
  parts.hull.push(at(taperedBox(L * 0.12, L * 0.032, L * 0.24, 0.7, 0.9), 0, L * 0.046, -L * 0.25));
  parts.hull.push(at(taperedBox(L * 0.085, L * 0.022, L * 0.15, 0.7, 0.95), 0, L * 0.073, -L * 0.27));
  parts.hullDark.push(at(taperedBox(L * 0.05, L * 0.012, L * 0.07, 0.8, 1), 0, L * 0.090, -L * 0.25));
  parts.windows.push(at(new THREE.BoxGeometry(L * 0.036, L * 0.004, L * 0.003), 0, L * 0.090, -L * 0.2145));
  parts.accent.push(at(new THREE.BoxGeometry(L * 0.07, L * 0.002, L * 0.03), 0, L * 0.0848, -L * 0.325));
  for (const side of [-1, 1]) {
    parts.hullDark.push(at(new THREE.BoxGeometry(L * 0.004, L * 0.009, L * 0.004), side * L * 0.02, L * 0.1005, -L * 0.29));
    // Raised slab fin beside the citadel, on a short pylon.
    parts.hull.push(at(taperedBox(L * 0.05, L * 0.012, L * 0.2, 0.7, 1), side * L * 0.125, L * 0.046, -L * 0.33));
    parts.hullDark.push(at(new THREE.BoxGeometry(L * 0.012, L * 0.024, L * 0.08), side * L * 0.118, L * 0.03, -L * 0.34));
    // Blue deck inlay on the second tier.
    const inlay = new THREE.Shape();
    inlay.moveTo(side * 0.03 * L, -0.08 * L); inlay.lineTo(side * 0.095 * L, -0.08 * L); inlay.lineTo(side * 0.05 * L, 0.07 * L); inlay.lineTo(side * 0.03 * L, 0.07 * L); inlay.closePath();
    const panel = new THREE.ExtrudeGeometry(inlay, { depth: 0.002 * L, bevelEnabled: false, curveSegments: 1 });
    panel.rotateX(Math.PI / 2); panel.translate(0, 0.0315 * L, 0);
    parts.accent.push(panel);
    // Panel lines in the deck armour, and broadside casemates along its edge.
    parts.hullDark.push(at(new THREE.BoxGeometry(L * 0.0016, L * 0.0016, L * 0.3), side * L * 0.07, L * 0.0304, -L * 0.25));
    for (let i = 0; i < 4; i++) parts.hullDark.push(at(new THREE.BoxGeometry(L * 0.014, L * 0.007, L * 0.022), side * L * 0.134, L * 0.0215, -L * (0.36 - i * 0.075)));
    // Long rows of lit ports along the deck edge, straight run and taper.
    portRow(parts, [side * 0.1508, -0.002, -0.395], [side * 0.1508, -0.002, -0.085], 22, L);
    portRow(parts, [side * 0.1488, -0.002, -0.075], [side * 0.0778, -0.002, 0.135], 14, L);
  }
  for (const z of [-0.38, -0.18]) parts.hullDark.push(at(new THREE.BoxGeometry(L * 0.22, L * 0.0016, L * 0.0016), 0, L * 0.0304, L * z));
  // Drive block.
  parts.hullDark.push(at(taperedBox(L * 0.2, L * 0.05, L * 0.08, 1, 0.9), 0, -L * 0.004, -L * 0.455));
  const engineNodes = lineDrives(parts, L, 4, beam, height, L * 0.024);
  return assemble(parts, 'alliance', engineNodes, L, new THREE.Vector3(0, -height * 0.12, L * 0.48));
}
/** Alliance-fitted APEX Omaha. Retains Alliance spine engineering but has
 * its own broad gun-cradle and angular weapon sponsons; the Cerberus Omaha is
 * a separate class with an entirely independent model builder.
 */
export const buildAllianceOmaha = (): BuiltShip => {
  const base = buildAllianceGunship(18);
  const parts = newParts();
  for (const side of [-1, 1]) {
    // Exposed structural gun cradle / heavy lateral armour, inspired by the
    // stepped aft prongs in the Alliance dreadnought orthographic reference.
    parts.hull.push(at(taperedBox(0.78, 0.36, 11.2, 0.18, 0.88),
      side * 2.15, -0.38, -0.25));
    parts.hullDark.push(at(taperedBox(0.58, 0.24, 8.8, 0.27, 0.94),
      side * 2.47, -0.29, -1.06));
    parts.hull.push(at(taperedBox(0.44, 0.28, 4.65, 0.13, 0.92),
      side * 2.29, 0.25, 1.2));
    // Raised, protected broadside batteries and gun-control casemates.
    for (let i = 0; i < 6; i++) {
      const z = -4.25 + i * 1.6;
      parts.hullDark.push(at(new THREE.BoxGeometry(0.34, 0.29, 0.7),
        side * 1.94, 0.34, z));
    }
    parts.accent.push(at(new THREE.BoxGeometry(0.075, 0.03, 8.1),
      side * 1.76, 0.61, -0.48));
  }
  parts.hull.push(at(taperedBox(1.12, 0.30, 5.0, 0.42, 0.88),
    0, 1.10, -0.94));
  const addition = assemble(parts, 'alliance', [], 18);
  // Merge upgraded structure into the existing five material batches.
  // Extra submeshes would multiply large-fleet draw calls for no benefit.
  for (const object of [...addition.group.children]) {
    const mesh = object as THREE.Mesh;
    const existing = base.group.getObjectByName(mesh.name) as THREE.Mesh | undefined;
    if (existing) existing.geometry = merge([existing.geometry, mesh.geometry]);
    else base.group.add(mesh);
  }
  base.group.name = 'SSV Omaha - Systems Alliance / APEX';
  return base;
};

/** Serial-production Apex AU command capital ship.
 * Shares Alliance structural construction, but adds a broad bridge spine and
 * paired spinal bracing rails. Distinct from the named Valkyrie prototype.
 */
export const buildAllianceAegis = (): BuiltShip => {
  const hull = buildAllianceGunship(16.5);
  const p = paletteFor('alliance');
  const parts = newParts();
  for(const side of [-1, 1]){
    parts.hull.push(at(taperedBox(.53,.38,7.8,.3,.88,{frontHeight:.27}),side*1.53,-.16,.42));
    parts.hullDark.push(at(taperedBox(.30,.23,5.4,.44,.9),side*2.14,-.18,-1.65));
    parts.accent.push(at(new THREE.BoxGeometry(.075,.045,4.8),side*1.75,.23,-.24));
  }
  // Serial command hull: broad protected sensors and a recognisable long
  // dorsal command keel rather than the Omaha's weapon casemates.
  for (const side of [-1, 1]) {
    parts.hullDark.push(at(taperedBox(.24,.19,4.3,.26,.94),
      side*1.05,.89,-2.12));
    parts.windows.push(at(new THREE.BoxGeometry(.08,.05,1.1),
      side*.82,1.04,-.78));
  }
  parts.hull.push(at(taperedBox(1.40,.34,4.4,.41,.95),0,.83,1.1));
  parts.windows.push(at(new THREE.BoxGeometry(.88,.045,.95),0,1.02,1.82));
  const extra = assemble(parts,'alliance',[],16.5);
  // Fold command armour into the existing five material batches, preserving
  // one shared render template per class even with hundreds of Aegis hulls.
  for (const object of [...extra.group.children]) {
    const mesh = object as THREE.Mesh<THREE.BufferGeometry>;
    const existing = hull.group.getObjectByName(mesh.name) as THREE.Mesh<THREE.BufferGeometry> | undefined;
    if (existing) existing.geometry = merge([existing.geometry, mesh.geometry]);
    else hull.group.add(mesh);
  }
  hull.muzzle = new THREE.Vector3(0,-.38,8.03);
  hull.group.name = 'Aegis-pattern command dreadnought (Apex AU)';
  return hull;
};


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

/**
 * Alliance cruiser. Its own silhouette, not a small dreadnought: the deck forks into two forward prongs either side
 * of the gun spine, with a low bridge aft and two drives. Original procedural geometry; length, muzzle and engine
 * nodes are those of the model it replaces.
 */
export function buildAllianceCruiser(): BuiltShip {
  const L = 5.2;
  const parts = newParts();
  const beam = L * 0.25, height = L * 0.075;
  // Forked main deck: outer prongs, the notch, then the gun spine to the bow.
  parts.hull.push(deckPlate([[0.10, -0.45], [0.135, -0.41], [0.135, 0.30], [0.115, 0.37], [0.095, 0.37], [0.085, 0.30], [0.085, 0.06], [0.032, 0.06], [0.014, 0.46], [0, 0.5]], 0.02, 0.042, L));
  parts.hull.push(deckPlate([[0.08, -0.42], [0.105, -0.38], [0.105, 0.02], [0.03, 0.02], [0.02, 0.2], [0, 0.22]], 0.031, 0.011, L));
  parts.hullDark.push(deckPlate([[0.11, -0.46], [0.125, -0.40], [0.125, 0.26], [0.09, 0.30], [0.09, 0.04], [0.026, 0.04], [0.018, 0.42], [0, 0.46]], -0.022, 0.02, L));
  parts.hullDark.push(at(taperedBox(L * 0.045, L * 0.012, L * 0.84, 0.45, 1), 0, -L * 0.048, -L * 0.03));
  parts.hullDark.push(at(zCylinder(L * 0.017, L * 0.021, L * 0.12, 12), 0, -height * 0.12, L * 0.43));
  // Low bridge aft.
  parts.hull.push(at(taperedBox(L * 0.11, L * 0.026, L * 0.2, 0.7, 0.9), 0, L * 0.044, -L * 0.24));
  parts.hullDark.push(at(taperedBox(L * 0.066, L * 0.016, L * 0.1, 0.75, 1), 0, L * 0.065, -L * 0.25));
  parts.windows.push(at(new THREE.BoxGeometry(L * 0.046, L * 0.004, L * 0.003), 0, L * 0.066, -L * 0.199));
  for (const side of [-1, 1]) {
    parts.hullDark.push(at(new THREE.BoxGeometry(L * 0.004, L * 0.01, L * 0.004), side * L * 0.022, L * 0.078, -L * 0.28));
    // Blue stripe along each prong, panel line inboard of it, casemates and ports along the edge.
    parts.accent.push(at(new THREE.BoxGeometry(L * 0.02, L * 0.002, L * 0.26), side * L * 0.11, L * 0.0212, L * 0.17));
    parts.hullDark.push(at(new THREE.BoxGeometry(L * 0.0018, L * 0.0018, L * 0.36), side * L * 0.07, L * 0.0314, -L * 0.2));
    for (let i = 0; i < 2; i++) parts.hullDark.push(at(new THREE.BoxGeometry(L * 0.016, L * 0.008, L * 0.026), side * L * 0.118, L * 0.024, -L * (0.3 - i * 0.16)));
    portRow(parts, [side * 0.1358, -0.002, -0.40], [side * 0.1358, -0.002, 0.29], 26, L);
  }
  parts.hullDark.push(at(new THREE.BoxGeometry(L * 0.2, L * 0.0018, L * 0.0018), 0, L * 0.0314, -L * 0.36));
  parts.hullDark.push(at(taperedBox(L * 0.18, L * 0.05, L * 0.08, 1, 0.9), 0, -L * 0.004, -L * 0.455));
  const engineNodes = lineDrives(parts, L, 2, beam, height, L * 0.026);
  return assemble(parts, 'alliance', engineNodes, L, new THREE.Vector3(0, -height * 0.12, L * 0.48));
}

/** Reference-informed Normandy SR-2. Unlike the ordinary Alliance frigate,
 * its long needle bow, four aft engine nacelles and swept shoulder panels are
 * structural geometry, not just paint. It remains an original procedural mesh.
 */
export function buildNormandySR2(): BuiltShip {
  const L = 2.16;
  const parts = newParts();
  // Narrow command fuselage and long continuous forward prow.
  parts.hull.push(at(taperedBox(0.26, 0.16, 1.82, 0.22, 0.95,
    { frontHeight: 0.24 }), 0, 0.02, 0.105));
  parts.hullDark.push(at(taperedBox(0.11, 0.055, 1.28, 0.3, 1), 0, -0.055, 0.23));
  parts.hull.push(at(taperedBox(0.10, 0.09, 0.55, 0.08, 0.88), 0, -0.01, 0.78));
  parts.hullDark.push(at(new THREE.BoxGeometry(0.17, 0.025, 1.0), 0, 0.105, -0.06));
  parts.windows.push(at(taperedBox(0.10, 0.025, 0.46, 0.38, 1), 0, 0.13, 0.35));

  const engines: THREE.Vector3[] = [];
  for (const side of [-1, 1]) {
    // Two structural swept wings rather than aircraft-style isolated winglets.
    const wing = new THREE.Shape();
    const pts: Array<[number, number]> = [
      [side * 0.09, 0.30], [side * 0.24, 0.10],
      [side * 0.68, -0.34], [side * 0.78, -0.79],
      [side * 0.46, -0.72], [side * 0.17, -0.27],
    ];
    wing.moveTo(...pts[0]);
    for (let i = 1; i < pts.length; i++) wing.lineTo(...pts[i]);
    wing.closePath();
    const plate = new THREE.ExtrudeGeometry(wing, {
      depth: 0.045, bevelEnabled: false, steps: 1,
    });
    plate.rotateX(Math.PI / 2);
    plate.translate(0, 0.03, 0);
    parts.hull.push(plate);

    // Four independent drive pods: two on each side, distinct aft profiles.
    for (const [i, offset] of [0.47, 0.72].entries()) {
      const x = side * offset;
      const podLength = i === 0 ? 0.82 : 0.68;
      parts.hullDark.push(at(taperedBox(0.16, 0.13, podLength, 0.55, 1),
        x, -0.02, -0.54));
      parts.hull.push(at(taperedBox(0.125, 0.055, podLength * 0.76, 0.22, 0.95),
        x, 0.071, -0.43));
      parts.accent.push(at(new THREE.BoxGeometry(0.045, 0.018, podLength * 0.62),
        x, 0.12, -0.44));
      const thrustZ = -0.54 - podLength * 0.49;
      parts.engine.push(at(zCylinder(0.055, 0.045, 0.035, 12), x, -0.02, thrustZ));
      engines.push(new THREE.Vector3(x, -0.02, thrustZ));
    }
    // Recessed wing-root plating and the characteristic pale shoulder taper.
    parts.hullDark.push(at(taperedBox(0.19, 0.075, 0.68, 0.48, 1),
      side * 0.26, 0.05, -0.26));
    parts.accent.push(at(new THREE.BoxGeometry(0.042, 0.023, 0.55),
      side * 0.14, 0.112, -0.12));
  }
  parts.hullDark.push(at(new THREE.BoxGeometry(0.26, 0.15, 0.29), 0, 0, -0.80));
  const built = assemble(parts, 'alliance', engines, L,
    new THREE.Vector3(0, -0.012, 1.068));
  built.group.name = 'SSV Normandy SR-2 (original procedural reconstruction)';
  return built;
}

/** Ordinary Alliance frigate: independently retained at 170 m. */
export function buildAllianceFrigate(normandy = false): BuiltShip {
  if (normandy) return buildNormandySR2();
  const L = 1.7;
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

/** Apex-only experimental hull. Original geometry, distinct from Omaha's
 * reinforced conventional dreadnought through outboard lance rails, dorsal
 * command block and a separate dedicated NOVA emitter. */
export const buildAllianceValkyrie = (): BuiltShip => {
  const built = buildAllianceGunship(20.2);
  const hull = built.group.getObjectByName('hull') as THREE.Mesh;
  const dark = built.group.getObjectByName('hullDark') as THREE.Mesh;
  const plateMaterial = (hull?.material as THREE.Material) ?? paletteFor('alliance').hull;
  const darkMaterial = (dark?.material as THREE.Material) ?? paletteFor('alliance').hullDark;
  for (const side of [-1,1]) {
    const rail = taperedBox(0.82,0.55,11.6,0.18,1,{frontHeight:0.21});
    rail.translate(side*2.15,-0.36,1.0);
    const mesh = new THREE.Mesh(rail,plateMaterial);mesh.name='hull';built.group.add(mesh);
    const fin = taperedBox(0.48,0.30,4.2,0.24,1);
    fin.translate(side*3.0,0,-4.0);
    const wing = new THREE.Mesh(fin,plateMaterial);wing.name='hull';built.group.add(wing);
  }
  // The experimental Valkyrie has two enormous armoured emitter fairings and
  // aft outboard drives, visually separate from the Omaha's heavy broadsides.
  for (const side of [-1, 1]) {
    const fairing = taperedBox(0.71,0.39,8.8,0.10,0.94,{frontHeight:0.22});
    fairing.translate(side*1.13,-0.66,4.33);
    const mesh = new THREE.Mesh(fairing,plateMaterial);
    mesh.name = 'hull';
    built.group.add(mesh);
    const nacelle = taperedBox(0.57,0.46,5.6,0.37,0.94);
    nacelle.translate(side*3.1,-0.05,-6.27);
    const pod = new THREE.Mesh(nacelle,plateMaterial);
    pod.name = 'hull';
    built.group.add(pod);
  }
  const emitter = new THREE.Mesh(new THREE.CylinderGeometry(0.32,0.65,3.0,16),darkMaterial);
  emitter.rotation.x=Math.PI/2;emitter.position.set(0,-0.55,9.25);
  emitter.name='hullDark';built.group.add(emitter);
  built.muzzle = new THREE.Vector3(0,-0.55,10.2);
  return built;
};
