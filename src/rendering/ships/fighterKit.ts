import * as THREE from 'three';
import { at, latheBody, zCylinder } from '../geometry';
import { assemble, newParts } from './alliance';
import type { BuiltShip } from './types';

/**
 * Small craft built from one kit: a pointed fuselage, swept wing panels, a dark canopy, engine nacelles and fins.
 * Original procedural geometry; each faction's fighter is a different set of proportions, not a different mesh.
 *
 * Before this every fighter was four to six boxes: a plank fuselage, a flat plate for both wings and a canopy
 * drawn as a cube in the lit-window material, which at any distance was a white spark on a box.
 *
 * All lengths in a spec are fractions of the craft's length; z runs from -0.5 (exhaust) to +0.5 (nose).
 */
export interface FighterSpec {
  faction: string;
  /** Overall length in render units (1 = 100 m). */
  length: number;
  glowColor?: number;
  /** Fuselage: greatest width and height, the number of sides of its section (4 = a diamond, 8 = rounded). */
  body: { width: number; height: number; sides: number; canopy?: boolean; eye?: boolean };
  /** One wing panel, mirrored. `sweep` moves the tip aft (negative: forward); `rise` lifts it (negative: droops). */
  wing: { span: number; root: number; tip: number; sweep: number; z: number; rise?: number; stripe?: boolean };
  /** Forward booms on the wings, the outer prongs of a trident. */
  prongs?: { x: number; from: number; to: number; radius: number };
  /** Pods on the wing tips. */
  tipPods?: { radius: number; length: number };
  engines: { count: 1 | 2; x: number; radius: number; length: number };
  fins?: { count: 1 | 2; height: number; root: number; tip: number; sweep: number; x: number; z: number; cant?: number; ventral?: boolean };
}

type Corner = [number, number, number];

/**
 * A six-faced solid from eight corners, ordered by x, then y, then z (low before high on each axis). Faces wind
 * outward when the corners keep that order in space; flat shaded.
 */
export function cornerSolid(c: readonly Corner[]): THREE.BufferGeometry {
  const quads = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
  const positions: number[] = [];
  for (const [a, b, d, e] of quads) for (const i of [a, b, d, a, d, e]) positions.push(...c[i]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  g.computeVertexNormals();
  return g;
}

/** Mirror a flat-shaded, non-indexed geometry across the plane x = 0, keeping its faces outward. */
export function mirrorX(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = source.index ? source.toNonIndexed() : source.clone();
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i += 3) {
    const b: Corner = [p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1)], d: Corner = [p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)];
    p.setXYZ(i, -p.getX(i), p.getY(i), p.getZ(i));
    p.setXYZ(i + 1, -d[0], d[1], d[2]);
    p.setXYZ(i + 2, -b[0], b[1], b[2]);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * A wing panel on the +x side: root at x = 0 with its leading edge at z = 0, tip at x = span. The panel thins
 * toward the tip and toward both edges are left square: at fighter size a bevel is below a pixel.
 */
export function wingPanel(span: number, root: number, tip: number, sweep: number, thickness: number, rise = 0): THREE.BufferGeometry {
  const t = thickness / 2, tt = t * 0.45;
  return cornerSolid([
    [0, -t, -root], [0, -t, 0], [0, t, -root], [0, t, 0],
    [span, rise - tt, -sweep - tip], [span, rise - tt, -sweep], [span, rise + tt, -sweep - tip], [span, rise + tt, -sweep],
  ]);
}

/**
 * A closed body of revolution about z, flattened to `squash` of its width in height. Stations run from the tail
 * to the nose. `latheBody` puts a profile's z at -z, so stations are handed over negated; in this order the faces
 * wind outward.
 */
export function spindle(stations: readonly { z: number; r: number }[], sides: number, squash: number): THREE.BufferGeometry {
  return latheBody(stations.map((s) => ({ z: -s.z, r: s.r })), sides, squash);
}

function fuselage(L: number, width: number, height: number, sides: number): THREE.BufferGeometry {
  const r = width / 2;
  return spindle([
    { z: -0.44 * L, r: 0 }, { z: -0.44 * L, r: r * 0.6 }, { z: -0.32 * L, r: r * 0.86 }, { z: -0.1 * L, r },
    { z: 0.14 * L, r: r * 0.84 }, { z: 0.36 * L, r: r * 0.4 }, { z: 0.5 * L, r: 0 },
  ], sides, height / width);
}

export function buildFighter(spec: FighterSpec): BuiltShip {
  const L = spec.length, parts = newParts();
  const { body, wing, engines, fins } = spec;
  const width = body.width * L, height = body.height * L;
  parts.hull.push(fuselage(L, width, height, body.sides));
  if (body.canopy !== false && !body.eye) {
    // Dark glass set into the upper fuselage. It is not lit: a lit canopy was the brightest thing on the craft.
    const canopy = spindle([{ z: -0.12 * L, r: 0 }, { z: -0.07 * L, r: width * 0.26 }, { z: 0.04 * L, r: width * 0.3 }, { z: 0.13 * L, r: 0 }], 6, 0.75);
    parts.hullDark.push(at(canopy, 0, height * 0.36, 0.2 * L));
  }
  // A synthetic craft has a sensor where a pilot would sit: one small lit lens in the nose.
  if (body.eye) parts.windows.push(at(new THREE.SphereGeometry(width * 0.2, 6, 4), 0, 0, 0.4 * L));

  const thickness = Math.max(0.012, height * 0.22) * 1;
  const panel = at(wingPanel(wing.span * L, wing.root * L, wing.tip * L, wing.sweep * L, thickness, (wing.rise ?? 0) * L), width * 0.3, 0, wing.z * L);
  parts.hull.push(panel, mirrorX(panel));
  const tipX = width * 0.3 + wing.span * L, tipY = (wing.rise ?? 0) * L, tipZ = (wing.z - wing.sweep - wing.tip / 2) * L;
  if (wing.stripe) {
    // Identification stripe across each wing, a third of the way out.
    const stripe = at(wingPanel(wing.span * L * 0.16, wing.root * L * 0.72, wing.root * L * 0.6, wing.sweep * L * 0.16, thickness * 1.25, tipY * 0.16),
      width * 0.3 + wing.span * L * 0.3, tipY * 0.3, (wing.z - wing.sweep * 0.3 - wing.root * 0.1) * L);
    parts.accent.push(stripe, mirrorX(stripe));
  }
  if (spec.prongs) {
    const { x, from, to, radius } = spec.prongs, length = (to - from) * L, y = tipY * (x * L - width * 0.3) / (wing.span * L);
    for (const side of [-1, 1]) {
      parts.hullDark.push(at(zCylinder(radius * L * 0.45, radius * L, length, 6), side * x * L, y, (from + to) / 2 * L));
    }
  }
  if (spec.tipPods) {
    const { radius, length } = spec.tipPods;
    for (const side of [-1, 1]) parts.hullDark.push(at(zCylinder(radius * L * 0.5, radius * L, length * L, 6), side * tipX, tipY, tipZ + length * L * 0.2));
  }

  const nodes: THREE.Vector3[] = [];
  for (const side of engines.count === 1 ? [0] : [-1, 1]) {
    const x = side * engines.x * L, r = engines.radius * L, length = engines.length * L, z = -0.5 * L + length / 2;
    parts.hullDark.push(at(zCylinder(r * 0.8, r, length, 8), x, 0, z));
    // The lit exhaust is a disc inside the nozzle, not the whole nacelle.
    parts.engine.push(at(zCylinder(r * 0.62, r * 0.5, length * 0.08, 8), x, 0, -0.5 * L - length * 0.03));
    nodes.push(new THREE.Vector3(x, 0, -0.5 * L - length * 0.04));
  }

  if (fins) {
    const fin = (side: number, down: boolean): THREE.BufferGeometry => {
      const placed = at(finPanel(fins.height * L, fins.root * L, fins.tip * L, fins.sweep * L, thickness * 0.9, fins.cant ?? 0, down), fins.x * L, (down ? -1 : 1) * height * 0.3, fins.z * L);
      return side < 0 ? mirrorX(placed) : placed;
    };
    for (const side of fins.count === 1 ? [1] : [-1, 1]) {
      parts.hullDark.push(fin(side, false));
      if (fins.ventral) parts.hullDark.push(fin(side, true));
    }
  }
  return assemble(parts, spec.faction, nodes, L, new THREE.Vector3(0, 0, L * 0.5), spec.glowColor);
}

/**
 * A fin: a wing panel stood on end with its root at the origin and its leading edge at z = 0, canted toward +x by
 * `cant` radians; `down` hangs it below instead.
 */
export function finPanel(height: number, root: number, tip: number, sweep: number, thickness: number, cant = 0, down = false): THREE.BufferGeometry {
  const g = wingPanel(height, root, tip, sweep, thickness);
  g.rotateZ(Math.PI / 2 - cant);
  if (!down) return g;
  g.scale(1, -1, 1);
  return flip(g);
}

/** Reverse the winding of a flat-shaded, non-indexed geometry (after a mirroring scale). */
function flip(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i += 3) {
    const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1);
    p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
    p.setXYZ(i + 2, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}
