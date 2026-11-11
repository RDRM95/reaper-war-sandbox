import * as THREE from 'three';
import { at, taperedBox } from '../geometry';
import type { Parts } from './alliance';

/** Original SR-2 reconstruction. +Z bow, +Y dorsal, 1 unit = 100 m.
 * Ratios are visual estimates, not canon specifications. See the SR-2 QA note.
 * All detail is merged into the existing five faction/material batches.
 */
type Station = readonly [z: number, radiusX: number, radiusY: number, centreY: number];
const BODY: readonly Station[] = [
  [-0.94, 0.073, 0.045, 0.035], [-0.77, 0.115, 0.080, 0.038],
  [-0.48, 0.136, 0.101, 0.035], [-0.17, 0.139, 0.104, 0.026],
  [0.13, 0.124, 0.088, 0.012], [0.43, 0.100, 0.069, -0.005],
  [0.74, 0.070, 0.049, -0.021], [1.02, 0.040, 0.026, -0.030],
];

/** A longitudinal shell strip on an elliptical cross section. Winding stays
 * outward on the underside too; adjacent strips share the same surface.
 */
function shell(stations: readonly Station[], start: number, end: number, steps: number, lift = 0): THREE.BufferGeometry {
  const positions: number[] = [], indices: number[] = [];
  for (const [z, rx, ry, cy] of stations) for (let j = 0; j <= steps; j++) {
    const a = start + (end - start) * j / steps;
    positions.push(Math.cos(a) * (rx + lift), cy + Math.sin(a) * (ry + lift), z);
  }
  for (let i = 0; i < stations.length - 1; i++) for (let j = 0; j < steps; j++) {
    const a = i * (steps + 1) + j, b = a + steps + 1;
    indices.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices); g.computeVertexNormals();
  return g;
}

/** Extrude an XZ outline, allowing supports to slope down to the pods. */
function plan(points: number[][], thickness: number, height: (x: number) => number): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, steps: 1 });
  g.rotateX(Math.PI / 2);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + height(p.getX(i)));
  g.computeVertexNormals();
  return g;
}

export function populateNormandySR2(parts: Parts): THREE.Vector3[] {
  // Rounded fuselage with a continuous recessed dark lateral belt.
  parts.hullDark.push(shell(BODY, 0, Math.PI * 2, 16));
  parts.hull.push(shell(BODY, 0.19, Math.PI - 0.19, 10, 0.003));
  parts.hull.push(shell(BODY, Math.PI + 0.23, Math.PI * 2 - 0.23, 10, 0.003));
  // Blue longitudinal paint follows the curved deck instead of floating bars.
  for (const a of [1.12, 1.84]) parts.accent.push(shell(BODY, a, a + 0.18, 1, 0.004));
  // Deck plate joints and the larger aft collar are visible in the licensed
  // replica views. They follow the shell rather than adding floating boxes.
  const stationAt = (z: number): Station => {
    const i = BODY.findIndex(s => s[0] >= z);
    const a = BODY[Math.max(0, i - 1)], b = BODY[i];
    const t = (z - a[0]) / (b[0] - a[0]);
    return [z, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
  };
  for (const z of [-0.70, -0.51, -0.28, -0.05, 0.18, 0.41, 0.64, 0.84]) {
    const half = z === -0.51 ? 0.010 : 0.002;
    parts.hullDark.push(shell([stationAt(z - half), stationAt(z + half)], 0.19, Math.PI - 0.19, 10, 0.0045));
  }
  parts.hullDark.push(at(taperedBox(0.079, 0.047, 0.027, 1, 1), 0, -0.030, 1.013));
  parts.hullDark.push(at(taperedBox(0.14, 0.080, 0.02, 1, 1), 0, 0.035, -0.935));

  const engines: THREE.Vector3[] = [];
  for (const side of [-1, 1]) {
    // Short swept supports leave open space between the fuselage and nacelles.
    const mirror = (p: number[][]) => p.map(([x, z]) => [side * x, z]);
    parts.hull.push(plan(mirror([[0.105, 0.12], [0.17, -0.05], [0.30, -0.34],
      [0.31, -0.58], [0.19, -0.53], [0.11, -0.25]]), 0.024, x => 0.004 - Math.abs(x) * 0.24));
    parts.hull.push(plan(mirror([[0.29, -0.31], [0.46, -0.58], [0.46, -0.73],
      [0.29, -0.56]]), 0.020, x => -0.012 - Math.abs(x) * 0.25));

    for (const [i, offset] of [0.27, 0.45].entries()) {
      const x = side * offset, y = i === 0 ? -0.085 : -0.145;
      const front = i === 0 ? 0.19 : -0.21, back = i === 0 ? -1.025 : -1.08;
      const width = i === 0 ? 0.16 : 0.12;
      const length = front - back;
      // Armour on a dark machinery bed; fore and aft have real open frames.
      parts.hullDark.push(at(taperedBox(width, 0.105, length - 0.25, 0.66, 0.95), x, y, (front + back) / 2));
      parts.hull.push(at(taperedBox(width * 0.87, 0.055, length * 0.57, 0.52, 1), x, y + 0.052, (front + back) / 2 + 0.045));
      parts.accent.push(at(taperedBox(width * 0.10, 0.004, length * 0.52, 0.6, 1), x + side * width * 0.33, y + 0.081, (front + back) / 2 + 0.025));
      for (const z of [front - 0.065, back + 0.07]) {
        for (const s of [-1, 1]) parts.hullDark.push(at(new THREE.BoxGeometry(0.014, 0.080, 0.13), x + s * (width / 2 - 0.007), y, z));
        for (const s of [-1, 1]) parts.hullDark.push(at(new THREE.BoxGeometry(width, 0.012, 0.13), x, y + s * 0.040, z));
      }
      // Recessed rectangular exhaust, with glow origin on its exposed aft face.
      const thrustZ = back + 0.05;
      parts.engine.push(at(new THREE.BoxGeometry(width * 0.66, 0.044, 0.008), x, y, thrustZ + 0.004));
      engines.push(new THREE.Vector3(x, y, thrustZ));
      // A few substantial transverse machinery ribs, not decorative noise.
      for (let r = 0; r < 3; r++) parts.hull.push(at(new THREE.BoxGeometry(width * 0.73, 0.024, 0.025), x, y + 0.056, back + 0.20 + r * 0.055));
    }
    // Twin swept dorsal fins, separately visible from front and rear.
    const fin = new THREE.Shape([
      new THREE.Vector2(-0.89, 0.072), new THREE.Vector2(-0.65, 0.10),
      new THREE.Vector2(-0.78, 0.24), new THREE.Vector2(-0.94, 0.27),
    ]);
    const g = new THREE.ExtrudeGeometry(fin, { depth: 0.012, bevelEnabled: false });
    // The shape's X coordinate is ship Z; extrusion becomes ship X.
    g.rotateY(-Math.PI / 2); g.translate(side * 0.075 + 0.006, 0, 0);
    const vertices = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < vertices.count; i++) vertices.setX(i, vertices.getX(i) + side * Math.max(0, vertices.getY(i) - 0.08) * 0.28);
    g.computeVertexNormals();
    parts.hull.push(g);
    // Paired bow rails frame the dark cockpit; muzzle remains at its old datum.
    parts.hull.push(at(taperedBox(0.015, 0.025, 0.12, 0.2, 1), side * 0.043, -0.025, 1.02));
    parts.hullDark.push(at(taperedBox(0.029, 0.006, 0.13, 0.6, 1), side * 0.023, 0.005, 0.94));
    for (let i = 0; i < 7; i++) {
      const z = -0.40 + i * 0.075;
      parts.windows.push(at(new THREE.BoxGeometry(0.003, 0.004, 0.015), side * (0.141 - Math.max(0, z + 0.17) * 0.05), 0.018, z));
    }
  }
  // Visible barrel at the established gun-camera/beam origin (no solver edit).
  parts.hullDark.push(at(new THREE.BoxGeometry(0.018, 0.018, 0.055), 0, -0.012, 1.0405));
  return engines;
}
