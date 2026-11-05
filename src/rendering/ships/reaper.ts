import * as THREE from 'three';
import { latheBody, merge, taperedTube, zCylinder } from '../geometry';
import { paletteFor } from '../materials';
import type { BuiltShip } from './types';

/**
 * Reaper hull family. Design language: cuttlefish-like silhouette — a long
 * ridged central body, a hooded forward section where the arms root, swept
 * mechanical arms curving forward, layered plating, and red illumination
 * concentrated in the primary weapon aperture and along the arm seams.
 *
 * Original fan models in the Sovereign-class visual language.
 */

interface ReaperOpts {
  /** Body length in render units. */
  length: number;
  arms: number;
  armLengthFactor: number;
  bodyRadiusFactor: number;
  tint?: number;
  spines?: boolean;
}

export function buildReaper(opts: ReaperOpts): BuiltShip {
  const base = paletteFor('reaper');
  // Harbinger alone uses amber illumination; never mutate the shared palette.
  const p = opts.tint ? { ...base, engine: base.engine.clone(), windows: base.windows.clone() } : base;
  if (opts.tint) { p.engine.color.setHex(opts.tint); p.engine.emissive.setHex(opts.tint); p.windows.color.setHex(opts.tint); p.windows.emissive.setHex(opts.tint); }
  const L = opts.length;
  const R = L * opts.bodyRadiusFactor;
  const group = new THREE.Group();

  // --- Body: ridged lathe with a bulbous mid-section tapering to a long tail.
  const profile = [
    { z: -L * 0.5, r: 0.02 },
    { z: -L * 0.42, r: R * 0.18 },
    { z: -L * 0.3, r: R * 0.45 },
    { z: -L * 0.15, r: R * 0.78 },
    { z: -L * 0.02, r: R * 1.0 },
    { z: L * 0.08, r: R * 0.98 },
    { z: L * 0.16, r: R * 0.82 },
    { z: L * 0.22, r: R * 0.6 },
    { z: L * 0.26, r: R * 0.3 },
    { z: L * 0.27, r: 0.02 },
  ];
  const body = latheBody(profile, 28, 0.8);
  // Ridge the body: displace vertices radially by a 6-fold pattern.
  const pos = body.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ang = Math.atan2(y, x);
    const ridge = 1 + 0.06 * Math.cos(ang * 6) + 0.025 * Math.cos(ang * 18 + z * 2.5);
    pos.setXYZ(i, x * ridge, y * ridge, z);
  }
  body.computeVertexNormals();
  const bodyMesh = new THREE.Mesh(body, p.hull);
  bodyMesh.name = 'hull';
  group.add(bodyMesh);

  // --- Dorsal and lateral armour plates (partial lathe shells, layered).
  const plates: THREE.BufferGeometry[] = [];
  const plateProfiles = [
    { z0: -L * 0.3, z1: L * 0.12, r: 1.06, phi: Math.PI * 0.55, rotZ: Math.PI * 0.72 },
    { z0: -L * 0.36, z1: L * 0.05, r: 1.08, phi: Math.PI * 0.35, rotZ: Math.PI * 1.5 },
    { z0: -L * 0.2, z1: L * 0.18, r: 1.05, phi: Math.PI * 0.3, rotZ: Math.PI * 0.2 },
    { z0: -L * 0.2, z1: L * 0.18, r: 1.05, phi: Math.PI * 0.3, rotZ: Math.PI * 1.1 },
  ];
  for (const pp of plateProfiles) {
    const pts: THREE.Vector2[] = [];
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const z = pp.z0 + (pp.z1 - pp.z0) * t;
      // Sample the body radius at this z.
      const r = sampleRadius(profile, z) * pp.r * 0.8;
      pts.push(new THREE.Vector2(Math.max(0.01, r), z));
    }
    const shell = new THREE.LatheGeometry(pts, 10, 0, pp.phi);
    shell.rotateX(Math.PI / 2);
    shell.scale(1, 0.8, -1);
    shell.rotateZ(pp.rotZ);
    plates.push(shell);
  }
  // Hood plating: overlapping forward shells around the arm roots, stepping down toward the aperture.
  for (let i = 0; i < 3; i++) {
    const z0 = L * (0.02 + i * 0.05);
    const z1 = L * (0.12 + i * 0.05);
    const pts: THREE.Vector2[] = [];
    for (let s = 0; s <= 6; s++) {
      const t = s / 6;
      const z = z0 + (z1 - z0) * t;
      pts.push(new THREE.Vector2(Math.max(0.01, sampleRadius(profile, z) * (1.1 - i * 0.03) * 0.8), z));
    }
    const hood = new THREE.LatheGeometry(pts, 12, 0, Math.PI * 0.9);
    hood.rotateX(Math.PI / 2);
    hood.scale(1, 0.8, -1);
    hood.rotateZ(Math.PI * 0.55 + i * 0.12);
    plates.push(hood);
  }
  const plateMesh = new THREE.Mesh(merge(plates), p.accent);
  plateMesh.name = 'plates';
  group.add(plateMesh);

  // --- Arms: tapered tubes rooted on the lower-forward hull, sweeping forward.
  const armGeoms: THREE.BufferGeometry[] = [];
  const seamGeoms: THREE.BufferGeometry[] = [];
  const armLen = L * opts.armLengthFactor;
  const n = opts.arms;
  for (let i = 0; i < n; i++) {
    // Distribute arms around the lower 240° of the hull so the top stays clear (hooded look).
    const spread = opts.arms === 4 ? Math.PI * 1.65 : Math.PI * 1.35;
    const ang = -Math.PI / 2 - spread / 2 + (spread * (i + 0.5)) / n;
    const rootR = R * 0.78;
    const root = new THREE.Vector3(Math.cos(ang) * rootR, Math.sin(ang) * rootR * 0.8, L * 0.1);
    const outward = new THREE.Vector3(Math.cos(ang), Math.sin(ang) * 0.8, 0).normalize();
    const c1 = root.clone().add(outward.clone().multiplyScalar(R * (n === 4 ? 1.8 : 1.15))).add(new THREE.Vector3(0, 0, armLen * 0.18));
    const c2 = root.clone().add(outward.clone().multiplyScalar(R * (n === 4 ? 2.0 : 1.6))).add(new THREE.Vector3(0, 0, armLen * 0.56));
    const tip = root.clone().add(outward.clone().multiplyScalar(R * (n === 4 ? 1.7 : 1.1))).add(new THREE.Vector3(0, -R * 0.35, armLen));
    const curve = new THREE.CatmullRomCurve3([root, c1, c2, tip]);
    const baseR = R * 0.34;
    // Segmented, tapering arm with plated ridges.
    armGeoms.push(taperedTube(curve, (t) => baseR * (1 - t * 0.82) * (1 + 0.12 * Math.sin(t * 22)), 30, 10, 0.78));
    // Red seam along each arm (thin tube offset slightly outward).
    const seamCurve = new THREE.CatmullRomCurve3([root.clone().add(outward.clone().multiplyScalar(baseR * 0.95)), c1.clone().add(outward.clone().multiplyScalar(baseR * 0.8)), c2.clone().add(outward.clone().multiplyScalar(baseR * 0.5)), tip.clone()]);
    seamGeoms.push(taperedTube(seamCurve, (t) => baseR * 0.1 * (1 - t * 0.8), 20, 5));
    // Joint knuckles.
    for (const kt of [0.22, 0.5]) {
      const k = curve.getPointAt(kt);
      armGeoms.push(new THREE.SphereGeometry(baseR * (1 - kt * 0.8) * 1.15, 8, 6).translate(k.x, k.y, k.z));
    }
  }
  const armMesh = new THREE.Mesh(merge(armGeoms), p.hullDark);
  armMesh.name = 'arms';
  armMesh.userData.armCount = n;
  group.add(armMesh);
  const seamMesh = new THREE.Mesh(merge(seamGeoms), p.windows);
  seamMesh.name = 'seams';
  group.add(seamMesh);

  // --- Weapon aperture: the "eye" in the hood, lower-forward.
  const eyeZ = L * 0.2;
  const eyeY = -R * 0.85;
  const eye = new THREE.Mesh(new THREE.SphereGeometry(R * 0.16, 14, 10), p.engine);
  eye.position.set(0, eyeY, eyeZ);
  eye.name = 'eye';
  group.add(eye);
  const socket = new THREE.Mesh(zCylinder(R * 0.26, R * 0.2, R * 0.25, 14, true), p.hullDark);
  socket.position.set(0, eyeY, eyeZ - R * 0.02);
  group.add(socket);
  // Aperture iris: a bright ring just inside the socket so the eye reads at distance.
  const iris = new THREE.Mesh(new THREE.TorusGeometry(R * 0.2, R * 0.035, 6, 20), p.windows);
  iris.position.set(0, eyeY, eyeZ + R * 0.1);
  iris.name = 'eye';
  group.add(iris);

  // --- Rear "tail" emitters and dorsal spines.
  const tailGlow = new THREE.Mesh(zCylinder(R * 0.1, R * 0.05, R * 0.5, 8), p.windows);
  tailGlow.position.set(0, 0, -L * 0.44);
  group.add(tailGlow);
  if (opts.spines) {
    const spines: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) {
      const z = -L * 0.3 + i * L * 0.1;
      const r = sampleRadius(profile, z) * 0.78;
      const g = new THREE.ConeGeometry(R * 0.06, R * 0.5, 6);
      g.translate(0, r + R * 0.2, z);
      spines.push(g);
    }
    group.add(new THREE.Mesh(merge(spines), p.hullDark));
  }

  // Red running lights along the body ridges.
  const lights: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + Math.PI / 6;
    for (let j = 0; j < 4; j++) {
      const z = -L * 0.32 + j * L * 0.11;
      const r = sampleRadius(profile, z) * 1.04;
      const g = new THREE.BoxGeometry(R * 0.04, R * 0.04, R * 0.18);
      g.translate(Math.cos(ang) * r, Math.sin(ang) * r * 0.8, z);
      lights.push(g);
    }
  }
  const lightMesh = new THREE.Mesh(merge(lights), p.windows);
  lightMesh.name = 'lights';
  group.add(lightMesh);

  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group);
  const overall = opts.arms === 4 ? 1.6 : opts.spines ? 24 : 20;
  const fit = overall / Math.max(1e-6, bounds.max.z - bounds.min.z);
  const centreZ = (bounds.max.z + bounds.min.z) / 2;
  // Bake scaling into original geometry: renderer and hit silhouette agree.
  group.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.translate(0, 0, -centreZ).scale(fit, fit, fit);
    mesh.position.multiplyScalar(fit);
  });
  const point = (x: number, y: number, z: number) => new THREE.Vector3(x * fit, y * fit, (z - centreZ) * fit);
  return {
    group,
    engineNodes: [point(0, 0, -L * 0.46), point(0, eyeY, eyeZ + R * 0.1)],
    glowScales: [0.1, 1.25],
    lengthUnits: overall,
    muzzle: point(0, eyeY, eyeZ + R * 0.15),
    glowColor: opts.tint ?? 0xff2038,
  };
}

function sampleRadius(profile: { z: number; r: number }[], z: number): number {
  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i];
    const b = profile[i + 1];
    if (z >= a.z && z <= b.z) {
      const t = (z - a.z) / (b.z - a.z);
      return a.r + (b.r - a.r) * t;
    }
  }
  return profile[profile.length - 1].r;
}

/** Sovereign-class capital ship: body ≈ 1.1 km, arms reach to ≈ 2 km overall. */
export const buildReaperCapital = (): BuiltShip => buildReaper({ length: 11, arms: 6, armLengthFactor: 0.8, bodyRadiusFactor: 0.10 });

/** Reaper destroyer: 160 m, four heavy arms. */
export const buildReaperDestroyer = (): BuiltShip => buildReaper({ length: 0.95, arms: 4, armLengthFactor: 0.75, bodyRadiusFactor: 0.2 });

/** Harbinger: larger, spined, and with a brighter aperture. */
export const buildHarbinger = (): BuiltShip => buildReaper({ length: 13.2, arms: 6, armLengthFactor: 0.8, bodyRadiusFactor: 0.115, spines: true, tint: 0xffa040 });
