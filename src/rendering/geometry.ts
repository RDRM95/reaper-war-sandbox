import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Procedural geometry helpers used by the ship builders. Everything is built
 * in render units where 1 unit = 100 m (ship lengths in metres / 100).
 */

export const M = 0.01; // metres → units
export const KM = 10; // kilometres → units

/** Box whose cross-section tapers toward +z (front) and/or -z (back). */
export function taperedBox(width: number, height: number, length: number, taperFront = 1, taperBack = 1, opts: { frontHeight?: number; backHeight?: number; shearY?: number } = {}): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(width, height, length, 1, 1, 1);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const half = length / 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t = (z + half) / length; // 0 back → 1 front
    const sx = taperBack + (taperFront - taperBack) * t;
    const hBack = opts.backHeight ?? taperBack;
    const hFront = opts.frontHeight ?? taperFront;
    const sy = hBack + (hFront - hBack) * t;
    pos.setXYZ(i, x * sx, y * sy + (opts.shearY ?? 0) * (t - 0.5) * length, z);
  }
  g.computeVertexNormals();
  return g;
}

/** Wedge: a box whose top slopes down toward the front. */
export function wedge(width: number, height: number, length: number, frontHeightFrac = 0.3): THREE.BufferGeometry {
  return taperedBox(width, height, length, 1, 1, { frontHeight: frontHeightFrac, backHeight: 1 });
}

/** A hexagonal prism oriented along z (good for armoured hull segments). */
export function hexPrism(radius: number, length: number, squash = 0.7): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(radius, radius, length, 6, 1);
  g.rotateX(Math.PI / 2);
  g.rotateZ(Math.PI / 6);
  g.scale(1, squash, 1);
  return g;
}

/** Cylinder oriented along z. */
export function zCylinder(rTop: number, rBottom: number, length: number, segments = 16, open = false): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBottom, length, segments, 1, open);
  g.rotateX(Math.PI / 2);
  return g;
}

/** Translate / rotate helpers that return the geometry. */
export const at = (g: THREE.BufferGeometry, x: number, y: number, z: number): THREE.BufferGeometry => g.translate(x, y, z);
export const rot = (g: THREE.BufferGeometry, rx: number, ry: number, rz: number): THREE.BufferGeometry => {
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  return g;
};

export function merge(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const valid = geoms.filter((g) => g.attributes.position && g.attributes.position.count > 0);
  // mergeGeometries requires consistent attributes; drop uv2/tangents and normalise to position+normal+uv.
  for (const g of valid) {
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    if (g.index) {
      const nonIndexed = g.toNonIndexed();
      g.copy(nonIndexed);
    }
  }
  const merged = mergeGeometries(valid, false);
  if (!merged) return new THREE.BufferGeometry();
  return merged;
}

/**
 * Tapered tube swept along a curve: radius varies with t ∈ [0,1]. Used for
 * Reaper arms, which thicken at the root and taper to a point.
 */
export function taperedTube(curve: THREE.Curve<THREE.Vector3>, radiusFn: (t: number) => number, segments = 24, radial = 10, flatten = 1): THREE.BufferGeometry {
  const frames = curve.computeFrenetFrames(segments, false);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = curve.getPointAt(t);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    const r = radiusFn(t);
    for (let j = 0; j <= radial; j++) {
      const v = (j / radial) * Math.PI * 2;
      const sin = Math.sin(v);
      const cos = -Math.cos(v);
      const nx = cos * N.x + sin * B.x * flatten;
      const ny = cos * N.y + sin * B.y * flatten;
      const nz = cos * N.z + sin * B.z * flatten;
      normals.push(nx, ny, nz);
      positions.push(p.x + r * nx, p.y + r * ny, p.z + r * nz);
      uvs.push(t, j / radial);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = (i + 1) * (radial + 1) + j;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  // Cap the tip with a small cone-ish fan.
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Lathe body from a radius profile along z (z increases to the front). */
export function latheBody(profile: { z: number; r: number }[], segments = 28, squashY = 1): THREE.BufferGeometry {
  const pts = profile.map((p) => new THREE.Vector2(Math.max(0.001, p.r), p.z));
  const g = new THREE.LatheGeometry(pts, segments);
  // LatheGeometry revolves around Y; rotate so the axis is Z.
  g.rotateX(Math.PI / 2);
  // After rotation the profile's y (our z) maps to -z; flip so front is +z.
  g.scale(1, squashY, -1);
  g.computeVertexNormals();
  return g;
}

/** Repeated small plates ("greebles") along a line for hull detail. */
export function plateStrip(count: number, w: number, h: number, d: number, from: THREE.Vector3, to: THREE.Vector3, jitter = 0): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const p = from.clone().lerp(to, t);
    const g = new THREE.BoxGeometry(w * (1 + jitter * ((i * 0.37) % 1 - 0.5)), h, d);
    g.translate(p.x, p.y, p.z);
    out.push(g);
  }
  return out;
}
