import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { taperedBox, taperedTube, zCylinder } from '../geometry';
import { paletteFor } from '../materials';
import type { BuiltShip } from './types';

/**
 * Reaper hull family — original procedural geometry in the Sovereign-class
 * visual language. Design language (docs/design/SCALE_REFERENCE.md,
 * docs/apex/CINEMATIC_DESIGN.md §7.8): a long tapering aft blade with
 * longitudinal overlapping armour bands, a dorsal ridge and a split tail
 * housing; a bulky forward hood of stepped overlapping shells; a recessed,
 * ribbed ventral cavity between the limb roots; heavy faceted limbs sleeved
 * in overlapping plate rings with mechanical knuckles and blade claws; a
 * single dominant orange-red emitter in a dark cowl. Graphite metal with
 * ±6 % per-part albedo variation carried in vertex colours — no textures.
 *
 * Mesh names are a contract with the rig (reaperMotion.ts), the LOD policy
 * (lod.ts), the barrier shell (barriers.ts) and the damage tint
 * (battleView.ts): structural meshes are `hull`, `hullDark` and `carapace`;
 * `plates`, `lights`, `seams` and `eye` are detail meshes dropped at range.
 */

interface ReaperOpts {
  /** Body length in render units (the limbs reach a further ~armLengthFactor forward). */
  length: number;
  arms: number;
  armLengthFactor: number;
  bodyRadiusFactor: number;
  /**
   * Radius factor the emitter, iris, muzzle and shutters were laid out with.
   * Kept separate from the slimmer carapace so the eye, muzzle and engine
   * anchors stay where the simulation and the beam code expect them.
   */
  anchorRadiusFactor?: number;
  tint?: number;
  spines?: boolean;
  variant?: 'harbinger' | 'destroyer';
}

// ---------------------------------------------------------------------------
// Materials. The shared Reaper palette is cloned once with vertex colours so
// every Reaper plate can carry its own albedo offset while all Reapers of all
// classes still share the same handful of material objects (createBatch in
// instancedFleet.ts merges by material). The Oculus keeps the plain palette.
interface ReaperMaterials {
  hull: THREE.MeshStandardMaterial;
  hullDark: THREE.MeshStandardMaterial;
  shell: THREE.MeshStandardMaterial;
  seam: THREE.MeshStandardMaterial;
  iris: THREE.MeshStandardMaterial;
}
let sharedMaterials: ReaperMaterials | undefined;
function reaperMaterials(): ReaperMaterials {
  if (sharedMaterials) return sharedMaterials;
  const p = paletteFor('reaper');
  const vertexTinted = (m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial => {
    const c = m.clone();
    c.vertexColors = true;
    return c;
  };
  sharedMaterials = {
    hull: vertexTinted(p.hull),
    hullDark: vertexTinted(p.hullDark),
    shell: vertexTinted(p.accent),
    // Thin pale-blue seams and the warm iris are the two Reaper-only slots.
    seam: new THREE.MeshStandardMaterial({ color: 0x7fb4ff, emissive: 0x7fb4ff, emissiveIntensity: 0.9, roughness: 0.45, metalness: 0.1 }),
    iris: new THREE.MeshStandardMaterial({ color: 0xffb060, emissive: 0xffb060, emissiveIntensity: 4.5, roughness: 0.3, metalness: 0 }),
  };
  return sharedMaterials;
}

// ---------------------------------------------------------------------------
// Deterministic helpers. No Math.random: the same class always builds the
// same hull, so templates, instancing batches and screenshots are repeatable.
function hash(seed: number, i: number, j = 0): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(i + 1, 0xc2b2ae35) ^ Math.imul(j + 1, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Crease angle for armour shells: faces that meet at less than this shade as one curved plate; lips stay hard. */
const ARMOUR_CREASE = THREE.MathUtils.degToRad(38);
/** Limb sleeves are eight-sided: a wider crease rounds them under light while ring lips and end caps stay hard. */
const SLEEVE_CREASE = THREE.MathUtils.degToRad(52);

/**
 * Shade a geometry and give every vertex the same albedo factor (±6 % around 1). `flat` true is faceted (mechanical
 * parts), false keeps the geometry's own smooth normals, and 'curved' smooths within ARMOUR_CREASE so a plate reads
 * as a curved shell with crisp edges.
 */
function tinted(g: THREE.BufferGeometry, k: number | ((p: THREE.Vector3) => number), flat: boolean | 'curved' | 'round' = true): THREE.BufferGeometry {
  const geom = flat === 'curved' ? toCreasedNormals(g, ARMOUR_CREASE) : flat === 'round' ? toCreasedNormals(g, SLEEVE_CREASE) : flat && g.index ? g.toNonIndexed() : g;
  if (flat === true) geom.computeVertexNormals();
  const pos = geom.attributes.position as THREE.BufferAttribute;
  const n = pos.count;
  const col = new Float32Array(n * 3);
  const p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const f = typeof k === 'number' ? k : k(p.fromBufferAttribute(pos, i));
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = f;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (!geom.attributes.uv) geom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return geom;
}

/** Merge that keeps the vertex-colour attribute (geometry.ts `merge` strips it). */
function mergeTinted(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = geoms.filter(g => g.attributes.position && g.attributes.position.count > 0).map(g => (g.index ? g.toNonIndexed() : g));
  for (const g of parts) {
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') g.deleteAttribute(k);
    const n = g.attributes.position.count;
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (!g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  }
  return mergeGeometries(parts, false) ?? new THREE.BufferGeometry();
}

// ---------------------------------------------------------------------------
// Lofted carapace sections. θ = 0 is the dorsal line, increasing toward +x
// (starboard), π is the ventral line. Each half is a superellipse so the
// aft blade can carry a sharp dorsal ridge while the hood stays boxy.
interface Section { z: number; w: number; hTop: number; hBot: number; cy: number; cx: number; nTop: number; nBot: number }
const sec = (z: number, w: number, hTop: number, hBot: number, extra: Partial<Section> = {}): Section =>
  ({ z, w, hTop, hBot, cy: 0, cx: 0, nTop: 2.2, nBot: 2.2, ...extra });

function sectionAt(sections: Section[], z: number): Section {
  if (z <= sections[0].z) return sections[0];
  for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[i], b = sections[i + 1];
    if (z <= b.z) {
      const t = (z - a.z) / (b.z - a.z);
      const l = (x: number, y: number) => x + (y - x) * t;
      return { z, w: l(a.w, b.w), hTop: l(a.hTop, b.hTop), hBot: l(a.hBot, b.hBot), cy: l(a.cy, b.cy), cx: l(a.cx, b.cx), nTop: l(a.nTop, b.nTop), nBot: l(a.nBot, b.nBot) };
    }
  }
  return sections[sections.length - 1];
}

function sectionPoint(s: Section, theta: number, scale: number, out: THREE.Vector3): THREE.Vector3 {
  const sn = Math.sin(theta), cs = Math.cos(theta);
  const n = cs >= 0 ? s.nTop : s.nBot;
  const x = s.w * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n);
  const y = cs >= 0 ? s.hTop * Math.pow(cs, 2 / n) : -s.hBot * Math.pow(-cs, 2 / n);
  return out.set(s.cx + x * scale, s.cy + y * scale, s.z);
}

type Scale = number | ((z: number, theta: number) => number);
const scaleAt = (s: Scale, z: number, th: number): number => (typeof s === 'number' ? s : s(z, th));

/** Quad grid: rows run along the first parameter, columns along the second. Default winding faces rowDir × colDir. */
function grid(rows: number, cols: number, point: (i: number, j: number, out: THREE.Vector3) => void, flip = false): THREE.BufferGeometry {
  const pos = new Float32Array((rows + 1) * (cols + 1) * 3);
  const v = new THREE.Vector3();
  const idx: number[] = [];
  for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) {
    point(i, j, v);
    const k = (i * (cols + 1) + j) * 3;
    pos[k] = v.x; pos[k + 1] = v.y; pos[k + 2] = v.z;
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const a = i * (cols + 1) + j, b = a + cols + 1;
    if (flip) idx.push(a, a + 1, b, b, a + 1, b + 1); else idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Smooth closed loft of the carapace core between two stations. */
function loft(sections: Section[], z0: number, z1: number, nz: number, nt: number, scale: Scale): THREE.BufferGeometry {
  return grid(nz, nt, (i, j, out) => {
    const z = z0 + (z1 - z0) * i / nz, th = (j / nt) * Math.PI * 2;
    sectionPoint(sectionAt(sections, z), th, scaleAt(scale, z, th), out);
  });
}

/** Thick partial shell over the carapace: outer and inner skins plus four rims so every plate edge casts a lip shadow. */
function shell(sections: Section[], z0: number, z1: number, t0: number, t1: number, nz: number, nt: number, outer: Scale, thick: number): THREE.BufferGeometry {
  const pt = (z: number, th: number, out: THREE.Vector3) => sectionPoint(sectionAt(sections, z), th, scaleAt(outer, z, th), out);
  const inner = (z: number, th: number, out: THREE.Vector3) => {
    pt(z, th, out);
    const s = sectionAt(sections, z);
    const dx = out.x - s.cx, dy = out.y - s.cy, len = Math.hypot(dx, dy) || 1;
    out.x -= dx / len * thick; out.y -= dy / len * thick;
  };
  const zAt = (i: number) => z0 + (z1 - z0) * i / nz, thAt = (j: number) => t0 + (t1 - t0) * j / nt;
  return mergeGeometries([
    grid(nz, nt, (i, j, o) => pt(zAt(i), thAt(j), o)),
    grid(nz, nt, (i, j, o) => inner(zAt(i), thAt(j), o), true),
    grid(1, nt, (i, j, o) => (i === 0 ? pt(z0, thAt(j), o) : inner(z0, thAt(j), o)), true),
    grid(1, nt, (i, j, o) => (i === 0 ? pt(z1, thAt(j), o) : inner(z1, thAt(j), o))),
    grid(1, nz, (i, j, o) => (i === 0 ? pt(zAt(j), t0, o) : inner(zAt(j), t0, o))),
    grid(1, nz, (i, j, o) => (i === 0 ? pt(zAt(j), t1, o) : inner(zAt(j), t1, o)), true),
  ].map(g => g.toNonIndexed()), false)!;
}

/** Sweep along a curve with a stable frame, for faceted limb sleeves, plate rings and claws. */
class Sweep {
  private frames: { tangents: THREE.Vector3[]; normals: THREE.Vector3[]; binormals: THREE.Vector3[] };
  private readonly res = 32;
  constructor(readonly curve: THREE.Curve<THREE.Vector3>, readonly flatten = 1) {
    this.frames = curve.computeFrenetFrames(this.res, false);
  }
  point(t: number, v: number, r: number, out: THREE.Vector3): THREE.Vector3 {
    const k = Math.min(this.res, Math.max(0, Math.round(t * this.res)));
    const N = this.frames.normals[k], B = this.frames.binormals[k];
    const c = -Math.cos(v), s = Math.sin(v) * this.flatten;
    const p = this.curve.getPointAt(Math.min(1, Math.max(0, t)));
    return out.set(p.x + r * (c * N.x + s * B.x), p.y + r * (c * N.y + s * B.y), p.z + r * (c * N.z + s * B.z));
  }
  /** Open faceted tube between two parameters. */
  sleeve(t0: number, t1: number, segs: number, radial: number, rFn: (t: number) => number): THREE.BufferGeometry {
    return grid(segs, radial, (i, j, o) => { const t = t0 + (t1 - t0) * i / segs; this.point(t, (j / radial) * Math.PI * 2, rFn(t), o); });
  }
  /** Annular lip at one parameter, from an outer to an inner radius. `back` faces toward t = 0. */
  lip(t: number, rOuter: number, rInner: number, radial: number, back: boolean): THREE.BufferGeometry {
    return grid(1, radial, (i, j, o) => this.point(t, (j / radial) * Math.PI * 2, i === 0 ? rOuter : rInner, o), back);
  }
  /** Overlapping armour ring: a short tapered sleeve standing proud of the limb with a lip at each end. */
  ring(t0: number, t1: number, radial: number, base: (t: number) => number, standoff: (t: number) => number): THREE.BufferGeometry {
    const r = (t: number) => base(t) * standoff(t);
    return mergeGeometries([
      this.sleeve(t0, t1, 1, radial, r),
      this.lip(t0, r(t0), base(t0) * 0.96, radial, true),
      this.lip(t1, r(t1), base(t1) * 0.96, radial, false),
    ].map(g => g.toNonIndexed()), false)!;
  }
}

function cylinderBetween(a: THREE.Vector3, b: THREE.Vector3, r: number, segments: number): THREE.BufferGeometry {
  const dir = b.clone().sub(a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r, r, len, segments, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

function cylinderAlong(centre: THREE.Vector3, axis: THREE.Vector3, r: number, len: number, segments: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, len, segments, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().normalize()));
  g.translate(centre.x, centre.y, centre.z);
  return g;
}

/** Diamond-section keel following a polyline: the dorsal ridge and the Harbinger's fin bases. */
function keel(points: THREE.Vector3[], width: (t: number) => number, height: (t: number) => number): THREE.BufferGeometry {
  const n = points.length - 1;
  return grid(n, 4, (i, j, o) => {
    const p = points[i], w = width(i / n), h = height(i / n);
    const k = j % 4;
    o.set(p.x + (k === 1 ? w : k === 3 ? -w : 0), p.y + (k === 0 ? h : k === 2 ? -h * 0.35 : 0), p.z);
  });
}

// ---------------------------------------------------------------------------

export function buildReaper(opts: ReaperOpts): BuiltShip {
  const base = paletteFor('reaper');
  const m = reaperMaterials();
  // Harbinger alone uses amber illumination; never mutate the shared palette.
  const p = opts.tint ? { ...base, engine: base.engine.clone(), windows: base.windows.clone() } : base;
  if (opts.tint) { p.engine.color.setHex(opts.tint); p.engine.emissive.setHex(opts.tint); p.windows.color.setHex(opts.tint); p.windows.emissive.setHex(opts.tint); }
  const L = opts.length;
  const R = L * opts.bodyRadiusFactor;
  const A = L * (opts.anchorRadiusFactor ?? opts.bodyRadiusFactor);
  const n = opts.arms;
  const destroyer = n === 4;
  const harbinger = opts.variant === 'harbinger';
  const seed = Math.round(L * 1000) ^ (n * 7919) ^ (harbinger ? 0x5a5a : 0);
  const rnd = (i: number, j = 0) => hash(seed, i, j);
  const group = new THREE.Group();
  const TAU = Math.PI * 2;
  // The normalised bounds (and so the eye, muzzle and engine anchors the beam
  // and glow code rely on) reproduce the previous build: tail tip at the old
  // tail emitter, forward claw tips at the old claw reach.
  const aftZ = -0.44 * L - 0.25 * A;
  const fwdZ = 0.1 * L + L * opts.armLengthFactor + 0.255 * A;
  /** Longitudinal station from a body-length fraction; the aft half is remapped onto the tail extent. */
  const zf = (frac: number): number => (frac >= 0 ? frac * L : aftZ * (-frac / 0.5));

  // --- Carapace core: a tall thin aft blade swelling into a boxy hood.
  const S: Section[] = [
    sec(-0.500, 0.025, 0.05, 0.02, { nTop: 1.4, nBot: 1.8 }),
    sec(-0.450, 0.09, 0.26, 0.12, { nTop: 1.4, nBot: 2.0 }),
    sec(-0.370, 0.19, 0.48, 0.24, { nTop: 1.5, nBot: 2.1 }),
    sec(-0.270, 0.33, 0.68, 0.40, { nTop: 1.6, nBot: 2.2 }),
    sec(-0.170, 0.50, 0.84, 0.58, { nTop: 1.8, nBot: 2.3 }),
    sec(-0.080, 0.70, 1.00, 0.76, { nTop: 2.1, nBot: 2.4 }),
    sec(-0.010, 0.90, 1.12, 0.90, { nTop: 2.5, nBot: 2.5 }),
    sec(0.070, 1.00, 1.08, 0.96, { nTop: 2.8, nBot: 2.7 }),
    sec(0.150, 0.96, 0.96, 0.93, { nTop: 2.8, nBot: 2.7 }),
    sec(0.215, 0.84, 0.76, 0.84, { nTop: 2.7, nBot: 2.6 }),
    sec(0.252, 0.62, 0.50, 0.66, { nTop: 2.8, nBot: 2.8 }),
    sec(0.268, 0.30, 0.22, 0.34, { nTop: 3.0, nBot: 3.0 }),
    sec(0.272, 0.05, 0.04, 0.06, { nTop: 3.0, nBot: 3.0 }),
  ].map(s => ({ ...s, z: zf(s.z), w: s.w * R, hTop: s.hTop * R, hBot: s.hBot * R }));
  // Ventral cavity: the hood underside between the limb roots is recessed.
  const recess = (z: number, th: number): number => {
    let d = th - Math.PI; d = Math.atan2(Math.sin(d), Math.cos(d));
    const ang = 1 - smooth(0.30, 0.52, Math.abs(d));
    const zf = smooth(-0.06 * L, -0.01 * L, z) * (1 - smooth(0.165 * L, 0.205 * L, z));
    return 1 - 0.22 * ang * zf;
  };
  const hullGeom = tinted(loft(S, aftZ, 0.272 * L, 30, 28, recess), pt => 1.03 - 0.07 * smooth(-R, R, -pt.y), false);
  const hullMesh = new THREE.Mesh(hullGeom, m.hull);
  hullMesh.name = 'hull';
  group.add(hullMesh);

  const carapace: THREE.BufferGeometry[] = [];
  const dark: THREE.BufferGeometry[] = [];
  const detail: THREE.BufferGeometry[] = [];
  const seams: THREE.BufferGeometry[] = [];
  const lights: THREE.BufferGeometry[] = [];

  // --- Aft blade: longitudinal overlapping armour bands (clinker-laid, alternate bands proud),
  // segmented along the blade at a pitch of tens of metres so the 2 km hull reads as plated.
  const bands = 7;
  const bandPitch = L * (destroyer ? 0.075 : 0.04);
  const bandZ0 = zf(-0.42), bandZ1 = zf(-0.015);
  for (let k = 0; k < bands; k++) {
    const centre = (k + 0.5) * TAU / bands + (rnd(k, 1) - 0.5) * 0.09;
    const half = TAU / bands * 0.56;
    const standoff = 1.025 + (k % 2) * 0.03;
    const pitch = bandPitch * (0.85 + 0.3 * rnd(k, 2));
    let z = bandZ0 + rnd(k, 3) * pitch * 0.8;
    let i = 0;
    while (z < bandZ1) {
      const z1 = Math.min(bandZ1, z + pitch);
      if (z1 - z > pitch * 0.3) {
        carapace.push(tinted(shell(S, z, z1 + pitch * 0.08, centre - half, centre + half, 1, 5, standoff, R * 0.035), 0.94 + 0.12 * rnd(k, 10 + i), 'curved'));
      }
      z = z1; i++;
    }
  }
  // Dorsal ridge: a raised keel along the spine, embedded into the blade's top edge.
  const ridgePts: THREE.Vector3[] = [];
  for (let i = 0; i <= 16; i++) {
    const z = zf(-0.46) + (0.46 * L + 0.2 * L) * i / 16;
    const s = sectionAt(S, z);
    ridgePts.push(new THREE.Vector3(0, s.cy + s.hTop * 0.95, z));
  }
  carapace.push(tinted(keel(ridgePts, t => R * (0.035 + 0.085 * Math.min(1, t * 1.4)), t => R * (0.07 + 0.2 * Math.min(1, t * 1.4)) * (1 - 0.55 * smooth(0.75, 1, t))), 1.05));
  if (opts.spines) {
    // Harbinger / Ascendant: more pronounced ridges — five angular dorsal fins.
    for (let i = 0; i < 5; i++) {
      const z = zf(-0.36) + i * 0.085 * L;
      const s = sectionAt(S, z);
      const fin = taperedBox(R * 0.05, R * 0.34, R * 0.62, 0.9, 0.5, { frontHeight: 0.18, backHeight: 1 });
      fin.translate(0, s.cy + s.hTop + R * 0.14, z);
      carapace.push(tinted(fin, 1.02 - 0.04 * (i % 2)));
    }
  }
  // Split tail: two tines flanking a dark recessed spinal housing.
  const tines: Section[] = [
    sec(aftZ, R * 0.022, R * 0.05, R * 0.02, { nTop: 3, nBot: 3 }),
    sec(zf(-0.36), R * 0.03, R * 0.30, R * 0.14, { nTop: 3, nBot: 3 }),
  ];
  for (const side of [-1, 1]) {
    const tine = tines.map((s, i) => ({ ...s, cx: side * R * (i === 0 ? 0.035 : 0.125) }));
    carapace.push(tinted(loft(tine, aftZ, zf(-0.36), 2, 8, 1), side > 0 ? 1.03 : 0.99));
  }
  dark.push(tinted(loft([
    sec(aftZ, R * 0.02, R * 0.02, R * 0.02),
    sec(zf(-0.36), R * 0.11, R * 0.17, R * 0.13, { nTop: 3, nBot: 2.5 }),
  ], aftZ, zf(-0.35), 2, 8, 1), 0.96));

  // --- Hood: stepped overlapping shells, largest and proudest aft, each split at
  // a different angle on each side so the two flanks are not mirror copies.
  const hoodShells = [
    { z0: -0.06, z1: 0.05, arc: 2.6, outer: 1.10, k: 1.04 },
    { z0: 0.03, z1: 0.125, arc: 2.5, outer: 1.065, k: 0.97 },
    { z0: 0.105, z1: 0.19, arc: 2.35, outer: 1.035, k: 1.02 },
    { z0: 0.17, z1: 0.236, arc: 1.9, outer: 1.015, k: 0.95 },
    { z0: 0.226, z1: 0.269, arc: 2.1, outer: 1.045, k: 1.0 },
  ];
  const hoodThick = R * 0.05;
  hoodShells.forEach((h, idx) => {
    // Panel seams at different angles on each flank; every panel is one planar
    // facet row with its own standoff so the hood steps like stacked armour.
    const b1 = 0.5 + 0.7 * rnd(20 + idx, 1), b2 = 0.5 + 0.7 * rnd(20 + idx, 2);
    const gap = 0.06;
    const pieces: [number, number][] = [[-h.arc, -b2 - gap], [-b2 + gap, -gap], [gap, b1 - gap], [b1 + gap, h.arc]];
    pieces.forEach(([t0, t1], piece) => {
      const nt = Math.max(2, Math.round((t1 - t0) / 0.26));
      const outer = h.outer + 0.03 * (rnd(30 + idx, piece) - 0.5);
      carapace.push(tinted(shell(S, h.z0 * L, h.z1 * L, t0, t1, 1, nt, outer, hoodThick), h.k + 0.03 * (rnd(35 + idx, piece) - 0.5), 'curved'));
    });
    // A thin pale seam along each exposed forward lip.
    const lipZ = h.z1 * L - hoodThick * 0.4;
    const pts: THREE.Vector3[] = [];
    for (let j = 0; j <= 10; j++) pts.push(sectionPoint(sectionAt(S, lipZ), -h.arc * 0.72 + (h.arc * 1.44) * j / 10, h.outer + 0.004, new THREE.Vector3()));
    seams.push(taperedTube(new THREE.CatmullRomCurve3(pts), () => R * 0.009, 10, 4));
  });

  // --- Ventral cavity furniture: ring ribs, longitudinal rails and round mechanical ports.
  const cavity = (extra: number) => (z: number, th: number) => recess(z, th) + extra;
  for (let i = 0; i < 4; i++) {
    const z = L * (0.005 + i * 0.045);
    detail.push(tinted(shell(S, z - L * 0.008, z + L * 0.008, Math.PI - 0.44, Math.PI + 0.44, 1, 6, cavity(0.055), R * 0.03), 0.95));
  }
  for (const side of [-1, 1]) {
    const th = Math.PI + side * 0.21;
    detail.push(tinted(shell(S, -0.03 * L, 0.175 * L, th - 0.03, th + 0.03, 4, 1, cavity(0.045), R * 0.03), 1.04));
    for (let i = 0; i < 2; i++) {
      const z = L * (0.035 + i * 0.085), pth = Math.PI + side * 0.34;
      const s = sectionAt(S, z);
      const c = sectionPoint(s, pth, recess(z, pth) - 0.02, new THREE.Vector3());
      const axis = new THREE.Vector3(c.x - s.cx, c.y - s.cy, 0).normalize();
      dark.push(tinted(cylinderAlong(c, axis, R * 0.085, R * 0.09, 10), 0.94));
      const rim = new THREE.TorusGeometry(R * 0.085, R * 0.014, 5, 14);
      rim.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis));
      rim.translate(c.x + axis.x * R * 0.045, c.y + axis.y * R * 0.045, c.z);
      detail.push(tinted(rim, 1.05));
    }
  }

  // --- Class identity carved into the detail batch (no extra draw calls).
  if (harbinger) {
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const z = L * (-0.32 + i * 0.113);
        const w = sectionAt(S, z).w;
        const scythe = new THREE.CatmullRomCurve3([
          new THREE.Vector3(side * w * 0.82, R * 0.08, z),
          new THREE.Vector3(side * (w + R * 0.34), R * 0.16, z + L * 0.018),
          new THREE.Vector3(side * (w + R * 1.24), R * 0.06, z + L * 0.075),
          new THREE.Vector3(side * (w + R * 1.42), -R * 0.06, z + L * 0.11),
        ]);
        detail.push(tinted(taperedTube(scythe, t => R * 0.115 * (1 - t * 0.88), 9, 6, 0.45), 1.0 + 0.04 * side * (i % 2 ? 1 : -1)));
      }
    }
  } else if (destroyer) {
    for (const side of [-1, 1]) {
      const guard = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * R * 0.62, -R * 0.25, L * 0.035),
        new THREE.Vector3(side * R * 1.02, -R * 0.23, L * 0.14),
        new THREE.Vector3(side * R * 0.75, -R * 0.42, L * 0.32),
        new THREE.Vector3(side * R * 0.42, -R * 0.62, L * 0.42),
      ]);
      detail.push(tinted(taperedTube(guard, t => R * 0.19 * (1 - t * 0.82), 9, 6, 0.55), 1.03));
    }
  }

  // --- Limbs. Articulated, rigid mechanical limbs: every segment is solid metal
  // moving only about shoulder/elbow bearings. Pivots are lightweight Transform
  // nodes named for the rig; the geometry is never deformed or skinned.
  // Static merged stand-ins keep distant/bulk Reapers at two limb draw calls.
  const armLen = L * opts.armLengthFactor;
  const stations = destroyer
    ? [{ th: 2.05, z: 0.02, spread: 2.3, drop: 0.1, root: 0.62 }, { th: 2.62, z: 0.12, spread: 1.8, drop: 0.35, root: 0.56 }]
    : [{ th: 1.98, z: 0.03, spread: harbinger ? 1.95 : 1.7, drop: 0.0, root: 0.52 },
       { th: 2.38, z: 0.09, spread: harbinger ? 1.7 : 1.45, drop: 0.12, root: 0.5 },
       { th: 2.70, z: 0.145, spread: harbinger ? 1.3 : 1.1, drop: 0.32, root: 0.48 }];
  const staticArms: THREE.BufferGeometry[] = [];
  const staticSeams: THREE.BufferGeometry[] = [];
  const bake = (g: THREE.BufferGeometry, offset: THREE.Vector3): THREE.BufferGeometry => g.clone().translate(offset.x, offset.y, offset.z);
  const radial = 8;
  for (let i = 0; i < n; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const st = stations[Math.floor(i / 2)];
    const th = side * st.th;
    const z = st.z * L;
    const s = sectionAt(S, z);
    const root = sectionPoint(s, th, 0.9, new THREE.Vector3());
    const outward = new THREE.Vector3(root.x - s.cx, (root.y - s.cy) * 0.9, 0).normalize();
    const fwd = new THREE.Vector3(0, 0, 1);
    const joint = new THREE.Vector3().crossVectors(outward, fwd).normalize();
    const forwardPair = Math.floor(i / 2) === stations.length - 1;
    // Upper 0.42 + lower 0.46 + claw 0.125 of the reach lie along +z.
    const reach = forwardPair ? (fwdZ - root.z) / 1.005 : armLen * (1 + 0.04 * (rnd(40 + i) - 0.5));
    const upperEnd = outward.clone().multiplyScalar(R * st.spread).add(new THREE.Vector3(0, -R * 0.1, reach * 0.42));
    // The lower limb angles back inboard so each knee reads as a mechanical bend.
    const lowerEnd = outward.clone().multiplyScalar(-R * st.spread * 0.38).add(new THREE.Vector3(0, -R * st.drop, reach * 0.46));
    const rootR = R * st.root;
    const upperR = (t: number) => rootR * (1 - 0.46 * t);
    const lowerR = (t: number) => rootR * 0.52 * (1 - 0.56 * t);

    const pivot = new THREE.Group();
    pivot.name = 'reaper-shoulder';
    pivot.userData = { reaperRig: 'shoulder', index: i, side: Math.sign(outward.x) || 1, destroyer, hinge: joint.toArray() };
    pivot.position.copy(root);
    group.add(pivot);

    // Upper limb: faceted tapered sleeve wrapped in overlapping plate rings.
    const upperCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      outward.clone().multiplyScalar(R * st.spread * 0.62).add(new THREE.Vector3(0, R * 0.02, reach * 0.15)),
      upperEnd,
    ]);
    const upper = new Sweep(upperCurve, 0.85);
    const upperParts: THREE.BufferGeometry[] = [tinted(upper.sleeve(0, 1, 7, radial, upperR), 0.95, 'round')];
    for (let k = 0; k < 4; k++) {
      const tc = 0.13 + k * 0.215 + (rnd(50 + i, k) - 0.5) * 0.03;
      upperParts.push(tinted(upper.ring(tc - 0.08, tc + 0.08, radial, upperR, t => 1.22 - 0.1 * (t - tc + 0.08) / 0.16), 1.03 + 0.03 * (k % 2), 'round'));
    }
    const upperGeom = mergeTinted(upperParts);
    const upperMesh = new THREE.Mesh(upperGeom, m.shell);
    upperMesh.name = 'reaper-arm-plate';
    pivot.add(upperMesh);
    staticArms.push(bake(upperGeom, root));
    // Shoulder bearing: a heavy cylindrical hip block half-buried in the hood.
    const bearing = tinted(cylinderAlong(outward.clone().multiplyScalar(rootR * 0.3), joint, rootR * 0.82, rootR * 1.7, radial), 0.94);
    const bearingMesh = new THREE.Mesh(bearing, m.shell);
    bearingMesh.name = 'reaper-joint';
    pivot.add(bearingMesh);
    staticArms.push(bake(bearing, root));
    // Thin pale seam along the outer edge of the sleeve.
    const upperSeamGeom = taperedTube(new THREE.CatmullRomCurve3([
      outward.clone().multiplyScalar(upperR(0.05) * 1.0).add(new THREE.Vector3(0, 0, reach * 0.03)),
      upperCurve.getPointAt(0.5).addScaledVector(outward, upperR(0.5) * 1.02),
      upperEnd.clone().addScaledVector(outward, upperR(0.95) * 1.02).add(new THREE.Vector3(0, 0, -reach * 0.02)),
    ]), t => R * 0.02 * (1 - 0.3 * t), 8, 4);
    const upperSeam = new THREE.Mesh(upperSeamGeom, m.seam);
    upperSeam.name = 'reaper-arm-seam';
    pivot.add(upperSeam);
    staticSeams.push(bake(upperSeamGeom, root));

    const elbow = new THREE.Group();
    elbow.name = 'reaper-elbow';
    elbow.userData = { reaperRig: 'elbow', index: i, side: Math.sign(outward.x) || 1, destroyer, hinge: joint.toArray() };
    elbow.position.copy(upperEnd);
    pivot.add(elbow);
    const elbowWorld = root.clone().add(upperEnd);

    // Lower limb sleeve and rings.
    const lowerCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      lowerEnd.clone().multiplyScalar(0.5).addScaledVector(outward, R * 0.1),
      lowerEnd,
    ]);
    const lower = new Sweep(lowerCurve, 0.85);
    const lowerParts: THREE.BufferGeometry[] = [tinted(lower.sleeve(0, 1, 6, radial, lowerR), 0.95, 'round')];
    for (let k = 0; k < 3; k++) {
      const tc = 0.18 + k * 0.26 + (rnd(60 + i, k) - 0.5) * 0.03;
      lowerParts.push(tinted(lower.ring(tc - 0.075, tc + 0.075, radial, lowerR, t => 1.24 - 0.1 * (t - tc + 0.075) / 0.15), 1.04 + 0.02 * (k % 2), 'round'));
    }
    const lowerGeom = mergeTinted(lowerParts);
    const lowerMesh = new THREE.Mesh(lowerGeom, m.shell);
    lowerMesh.name = 'reaper-arm-tip';
    elbow.add(lowerMesh);
    staticArms.push(bake(lowerGeom, elbowWorld));
    // Mechanical knuckle: a cylinder across the joint axis with two piston rods bridging the bend.
    const knuckleR = upperR(1) * 1.12;
    const knuckleParts = [tinted(cylinderAlong(new THREE.Vector3(), joint, knuckleR, knuckleR * 2.6, radial), 0.94)];
    const lowerDir = lowerEnd.clone().normalize();
    const upperDir = upperEnd.clone().normalize();
    for (const sgn of [-1, 1]) {
      const a = upperDir.clone().multiplyScalar(-reach * 0.07).addScaledVector(outward, knuckleR * 1.05).addScaledVector(joint, sgn * knuckleR * 0.55);
      const b = lowerDir.clone().multiplyScalar(reach * 0.08).addScaledVector(outward, knuckleR * 0.95).addScaledVector(joint, sgn * knuckleR * 0.55);
      knuckleParts.push(tinted(cylinderBetween(a, b, knuckleR * 0.16, 6), 1.0));
      knuckleParts.push(tinted(cylinderBetween(a, a.clone().lerp(b, 0.45), knuckleR * 0.24, 6), 0.96));
    }
    const knuckleGeom = mergeTinted(knuckleParts);
    const knuckle = new THREE.Mesh(knuckleGeom, m.shell);
    knuckle.name = 'reaper-joint';
    elbow.add(knuckle);
    staticArms.push(bake(knuckleGeom, elbowWorld));
    const lowerSeamGeom = taperedTube(new THREE.CatmullRomCurve3([
      outward.clone().multiplyScalar(lowerR(0.1) * 1.0).add(new THREE.Vector3(0, 0, reach * 0.05)),
      lowerCurve.getPointAt(0.5).addScaledVector(outward, lowerR(0.5) * 1.02),
      lowerEnd.clone().addScaledVector(outward, lowerR(0.9) * 1.02).add(new THREE.Vector3(0, 0, -reach * 0.02)),
    ]), t => R * 0.014 * (1 - 0.4 * t), 8, 4);
    const lowerSeam = new THREE.Mesh(lowerSeamGeom, m.seam);
    lowerSeam.name = 'reaper-arm-seam';
    elbow.add(lowerSeam);
    staticSeams.push(bake(lowerSeamGeom, elbowWorld));
    // Curved blade claw turning inward and down.
    const clawCurve = new THREE.CatmullRomCurve3([
      lowerEnd.clone().addScaledVector(lowerDir, -R * 0.1),
      lowerEnd.clone().add(new THREE.Vector3(0, -R * 0.05, reach * 0.06)).addScaledVector(outward, -R * 0.12),
      lowerEnd.clone().add(new THREE.Vector3(0, -R * 0.16, reach * 0.11)).addScaledVector(outward, -R * 0.42),
      lowerEnd.clone().add(new THREE.Vector3(0, -R * 0.30, reach * 0.125)).addScaledVector(outward, -R * 0.62),
    ]);
    const clawGeom = tinted(new Sweep(clawCurve, 0.38).sleeve(0, 1, 6, 6, t => lowerR(1) * 1.25 * (1 - t) * (1 - t) + R * 0.006 * (1 - t)), 0.97);
    const claw = new THREE.Mesh(clawGeom, m.shell);
    claw.name = 'reaper-claw';
    elbow.add(claw);
    staticArms.push(bake(clawGeom, elbowWorld));
  }
  const staticHull = new THREE.Mesh(mergeTinted(staticArms), m.shell);
  staticHull.name = 'reaper-static-arms';
  staticHull.visible = false;
  group.add(staticHull);
  const staticLights = new THREE.Mesh(mergeTinted(staticSeams), m.seam);
  staticLights.name = 'reaper-static-seams';
  staticLights.visible = false;
  group.add(staticLights);

  // --- Weapon aperture: the single dominant emitter in a dark faceted cowl, lower-forward.
  const eyeZ = L * 0.2;
  const eyeY = -A * 0.85;
  const cowl = tinted(zCylinder(A * 0.30, A * 0.38, A * 0.32, 8), 0.95);
  cowl.translate(0, eyeY, eyeZ - A * 0.01);
  dark.push(cowl);
  const lensGeom = new THREE.SphereGeometry(A * 0.2, 14, 10);
  lensGeom.scale(1, 1, 0.55);
  const eye = new THREE.Mesh(lensGeom, p.engine);
  eye.position.set(0, eyeY, eyeZ);
  eye.name = 'eye';
  group.add(eye);
  // Iris: a bright warm ring just inside the cowl so the eye reads at distance.
  const iris = new THREE.Mesh(new THREE.TorusGeometry(A * 0.23, A * 0.03, 6, 20), m.iris);
  iris.position.set(0, eyeY, eyeZ + A * 0.1);
  iris.name = 'eye';
  group.add(iris);
  // Armoured shutters expose the emitter as it charges. These never alter
  // weapon timing or the collision model: just hinged plates above the eye.
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * TAU;
    const shutter = new THREE.Group();
    shutter.name = 'reaper-shutter';
    shutter.userData = { reaperRig: 'shutter', index: i };
    shutter.position.set(Math.cos(angle) * A * 0.13, eyeY + Math.sin(angle) * A * 0.13, eyeZ + A * 0.16);
    shutter.rotation.z = angle;
    const plate = new THREE.Mesh(tinted(new THREE.BoxGeometry(A * 0.18, A * 0.065, A * 0.19), 0.97), m.hullDark);
    plate.name = 'aperture-shutter';
    plate.position.set(A * 0.065, 0, 0);
    shutter.add(plate);
    group.add(shutter);
  }

  // Five short jointed facial mandibles around the cowl, distinct from the
  // locomotor limbs. The head moves in very small increments, like heavy actuators.
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI * 0.88 + (Math.PI * 0.76 * i / 4);
    const r = A * 0.56;
    const jointGroup = new THREE.Group();
    jointGroup.name = 'reaper-mandible';
    jointGroup.userData = { reaperRig: 'mandible', index: i, side: Math.cos(a) >= 0 ? 1 : -1, destroyer };
    jointGroup.position.set(Math.cos(a) * r, eyeY + A * 0.1 + Math.sin(a) * A * 0.16, L * 0.225);
    const length = (destroyer ? 0.25 : 0.19) * L;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(),
      new THREE.Vector3(Math.cos(a) * A * 0.15, -A * 0.035, length * 0.45),
      new THREE.Vector3(Math.cos(a) * A * 0.10, -A * 0.10, length),
    ]);
    const mandible = new Sweep(curve, 0.8);
    const feeler = new THREE.Mesh(mergeTinted([
      tinted(mandible.sleeve(0, 1, 6, 6, t => A * 0.1 * (1 - t * 0.82)), 0.96),
      tinted(mandible.ring(0.22, 0.36, 6, t => A * 0.1 * (1 - t * 0.82), () => 1.2), 1.02),
    ]), m.hullDark);
    feeler.name = 'reaper-mandible-tip';
    jointGroup.add(feeler);
    group.add(jointGroup);
  }

  // --- Emitters: a dim tail housing glow and a few small crimson running lights.
  const tailGlow = zCylinder(R * 0.06, R * 0.03, R * 0.4, 6);
  tailGlow.translate(0, 0, zf(-0.44));
  lights.push(tailGlow);
  const light = (z: number, th: number, scale: number) => {
    const s = sectionAt(S, z);
    const c = sectionPoint(s, th, scale, new THREE.Vector3());
    const g = new THREE.BoxGeometry(R * 0.035, R * 0.035, R * 0.11);
    g.translate(c.x, c.y, c.z);
    lights.push(g);
  };
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) light(L * (-0.02 + i * 0.075), side * 1.35, 1.12);
    light(zf(-0.22), side * 0.55, 1.07);
    light(zf(-0.34), side * 0.6, 1.07);
  }
  // Pale seams along two of the band gaps on the blade.
  for (const side of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let j = 0; j <= 8; j++) {
      const z = zf(-0.40) + (0.36 * L) * j / 8;
      pts.push(sectionPoint(sectionAt(S, z), side * (TAU / bands) * 1.0, 1.045, new THREE.Vector3()));
    }
    seams.push(taperedTube(new THREE.CatmullRomCurve3(pts), () => R * 0.011, 8, 4));
  }

  const carapaceMesh = new THREE.Mesh(mergeTinted(carapace), m.shell);
  carapaceMesh.name = 'carapace';
  group.add(carapaceMesh);
  const darkMesh = new THREE.Mesh(mergeTinted(dark), m.hullDark);
  darkMesh.name = 'hullDark';
  group.add(darkMesh);
  const plateMesh = new THREE.Mesh(mergeTinted(detail), m.shell);
  plateMesh.name = 'plates';
  group.add(plateMesh);
  const seamMesh = new THREE.Mesh(mergeTinted(seams), m.seam);
  seamMesh.name = 'seams';
  group.add(seamMesh);
  const lightMesh = new THREE.Mesh(mergeTinted(lights), p.windows);
  lightMesh.name = 'lights';
  group.add(lightMesh);

  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group);
  const overall = opts.arms === 4 ? 1.6 : opts.spines ? 24 : 20;
  const fit = overall / Math.max(1e-6, bounds.max.z - bounds.min.z);
  const centreZ = (bounds.max.z + bounds.min.z) / 2;
  // Normalise the *whole articulated skeleton* under a single internal
  // rig transform. Baking transforms into each mesh would break local joints,
  // while scaling the outer root would also affect simulation placement.
  const model = new THREE.Group();
  model.name = 'reaper-model-root';
  while (group.children.length) model.add(group.children[0]);
  model.position.z = -centreZ * fit;
  model.scale.setScalar(fit);
  group.add(model);
  const point = (x: number, y: number, z: number) => new THREE.Vector3(x * fit, y * fit, (z - centreZ) * fit);
  return {
    group,
    engineNodes: [point(0, 0, -L * 0.46), point(0, eyeY, eyeZ + A * 0.1)],
    // The aperture sprite is kept small: the emitter itself is the light source.
    glowScales: [0.1, 0.55],
    lengthUnits: overall,
    muzzle: point(0, eyeY, eyeZ + A * 0.15),
    glowColor: opts.tint ?? 0xff5a1f,
  };
}

/** Sovereign-class capital ship: body ≈ 1.1 km, arms reach to ≈ 2 km overall. */
export const buildReaperCapital = (): BuiltShip => buildReaper({ length: 11, arms: 6, armLengthFactor: 0.8, bodyRadiusFactor: 0.09, anchorRadiusFactor: 0.10 });

/** Reaper destroyer: 160 m, four heavy legs dominating a compact body. */
export const buildReaperDestroyer = (): BuiltShip => buildReaper({ length: 0.95, arms: 4, armLengthFactor: 0.75, bodyRadiusFactor: 0.185, anchorRadiusFactor: 0.2, variant: 'destroyer' });

/** Extragalactic Ascendant — derived from the unmistakable Sovereign anatomy,
 * keeping material plates and independently articulated appendages.
 * The scale is an AU render datum, not an attempt to match a canon mesh.
 */
export const buildReaperAscendant = (): BuiltShip => {
  const built = buildReaper({ length: 11, arms: 6, armLengthFactor: .87, bodyRadiusFactor: .105, anchorRadiusFactor: .12, spines: true, tint: 0x692d30 });
  // Structural ridges communicate a higher engineering generation without
  // turning the cephalopod Reaper into a conventional starship.
  const plate = new THREE.MeshStandardMaterial({
    color: 0x34404c, metalness: .84, roughness: .43, emissive: 0x130405, emissiveIntensity: .08
  });
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(.12, .1, 1.4), plate);
    strut.position.set(side * (.45 + i * .025), .12, -3.4 + i * 2.1);
    strut.rotation.y = side * .18;
    strut.name = 'ascendant-carapace-ridge';
    built.group.add(strut);
  }
  // The catalogue says 30 km. The base rig normalises a spined Reaper to 24 units (2.4 km), so scale from that,
  // not from the Sovereign's 20: the old 30000/2000 left the Ascendant at 360 units (36 km).
  const scale = 300 / built.lengthUnits;
  built.group.scale.multiplyScalar(scale);
  built.lengthUnits *= scale;
  built.engineNodes = built.engineNodes.map(p => p.clone().multiplyScalar(scale));
  if (built.muzzle) built.muzzle.multiplyScalar(scale);
  built.glowColor = 0xb53439;
  built.group.name = 'Ascendant Reaper — extragalactic AU';
  return built;
};

/** Harbinger: broader hood, longer and more splayed limbs, lateral scythes, dorsal fins, amber illumination. */
export const buildHarbinger = (): BuiltShip => buildReaper({ length: 13.2, arms: 6, armLengthFactor: 0.8, bodyRadiusFactor: 0.10, anchorRadiusFactor: 0.115, spines: true, tint: 0xffa040, variant: 'harbinger' });
