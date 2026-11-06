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

  // --- Articulated, rigid mechanical limbs.
  // A Reaper is NOT soft rubber. Every segment remains solid metal and moves
  // only around mechanical shoulder/elbow bearings. Each pivot is a lightweight
  // Transform node; the geometry itself is never deformed or vertex-skinned.
  const armLen = L * opts.armLengthFactor;
  const n = opts.arms;
  for (let i = 0; i < n; i++) {
    const spread = n === 4 ? Math.PI * 1.65 : Math.PI * 1.35;
    const ang = -Math.PI / 2 - spread / 2 + (spread * (i + 0.5)) / n;
    const rootR = R * 0.78;
    const root = new THREE.Vector3(Math.cos(ang) * rootR, Math.sin(ang) * rootR * 0.8, L * 0.1);
    const outward = new THREE.Vector3(Math.cos(ang), Math.sin(ang) * 0.8, 0).normalize();
    const c1 = root.clone().addScaledVector(outward, R * (n === 4 ? 1.8 : 1.15))
      .add(new THREE.Vector3(0, 0, armLen * 0.18));
    const c2 = root.clone().addScaledVector(outward, R * (n === 4 ? 2.0 : 1.6))
      .add(new THREE.Vector3(0, 0, armLen * 0.56));
    const tip = root.clone().addScaledVector(outward, R * (n === 4 ? 1.7 : 1.1))
      .add(new THREE.Vector3(0, -R * 0.35, armLen));
    const upperEnd = c2.clone().sub(root);
    const lowerEnd = tip.clone().sub(c2);
    const baseR = R * 0.34;
    const pivot = new THREE.Group();
    pivot.name = 'reaper-shoulder';
    pivot.userData = { reaperRig: 'shoulder', index: i, side: Math.sign(outward.x) || 1, destroyer: n === 4 };
    pivot.position.copy(root);
    group.add(pivot);

    const upper = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      c1.clone().sub(root),
      upperEnd,
    ]);
    const upperMesh = new THREE.Mesh(
      taperedTube(upper, t => baseR * (1 - 0.42 * t) * (1 + 0.07 * Math.sin(17 * t)), 20, 9, 0.78),
      p.hullDark
    );
    upperMesh.name = 'reaper-arm-plate';
    pivot.add(upperMesh);
    const upperSeam = new THREE.Mesh(taperedTube(new THREE.CatmullRomCurve3([
      outward.clone().multiplyScalar(baseR*.88),
      c1.clone().sub(root).addScaledVector(outward, baseR*.72),
      upperEnd.clone().addScaledVector(outward, baseR*.54),
    ]), t => baseR * .075 * (1 - .3*t), 12, 5), p.windows);
    upperSeam.name = 'reaper-arm-seam';
    pivot.add(upperSeam);
    const shoulderRing = new THREE.Mesh(new THREE.SphereGeometry(baseR*1.1, 9, 7), p.accent);
    shoulderRing.name = 'reaper-joint';
    pivot.add(shoulderRing);

    const elbow = new THREE.Group();
    elbow.name = 'reaper-elbow';
    elbow.userData = { reaperRig: 'elbow', index: i, side: Math.sign(outward.x) || 1, destroyer: n === 4 };
    elbow.position.copy(upperEnd);
    pivot.add(elbow);
    const lower = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      lowerEnd.clone().multiplyScalar(.56).addScaledVector(outward, R * .07),
      lowerEnd
    ]);
    const lowerMesh = new THREE.Mesh(
      taperedTube(lower, t => baseR * .59 * (1 - .74*t) * (1 + .06*Math.cos(16*t)), 16, 8, .82),
      p.hullDark
    );
    lowerMesh.name = 'reaper-arm-tip';
    elbow.add(lowerMesh);
    const lowerSeam = new THREE.Mesh(taperedTube(new THREE.CatmullRomCurve3([
      outward.clone().multiplyScalar(baseR*.48),
      lowerEnd.clone().multiplyScalar(.56).addScaledVector(outward, baseR*.36),
      lowerEnd.clone(),
    ]), t => baseR * .046 * (1-t*.5), 12, 5), p.windows);
    lowerSeam.name = 'reaper-arm-seam';
    elbow.add(lowerSeam);
    const knuckle = new THREE.Mesh(new THREE.SphereGeometry(baseR*.7, 9, 7), p.accent);
    knuckle.name = 'reaper-joint';
    elbow.add(knuckle);
    const claw = new THREE.Mesh(new THREE.ConeGeometry(baseR*.32, baseR*1.5, 6), p.hullDark);
    claw.rotation.x = Math.PI/2;
    claw.position.copy(lowerEnd);
    claw.name = 'reaper-claw';
    elbow.add(claw);
  }

  // Five short jointed facial feelers, distinct from the four/six locomotor
  // limbs. The head moves in very small increments, like heavy actuators.
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI*.88 + (Math.PI*.76*i/4);
    const r = R*.47;
    const joint = new THREE.Group();
    joint.name = 'reaper-mandible';
    joint.userData = { reaperRig: 'mandible', index: i, side: Math.cos(a)>=0?1:-1, destroyer:n===4 };
    joint.position.set(Math.cos(a)*r, -R*.72 + Math.sin(a)*R*.13, L*.225);
    const length = (n===4?.25:.19)*L;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(),
      new THREE.Vector3(Math.cos(a)*R*.15,-R*.035,length*.45),
      new THREE.Vector3(Math.cos(a)*R*.10,-R*.10,length)
    ]);
    const feeler = new THREE.Mesh(taperedTube(curve, t=>R*.11*(1-t*.8), 11, 6), p.hullDark);
    feeler.name = 'reaper-mandible-tip';
    joint.add(feeler);
    group.add(joint);
  }

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
  // Armoured shutters expose the emitter as it charges. These never alter
  // weapon timing or the collision model: just hinged plates above the eye.
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const shutter = new THREE.Group();
    shutter.name = 'reaper-shutter';
    shutter.userData = { reaperRig:'shutter', index:i };
    shutter.position.set(
      Math.cos(angle)*R*.13,
      eyeY + Math.sin(angle)*R*.13,
      eyeZ + R*.16
    );
    shutter.rotation.z = angle;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(R*.18,R*.065,R*.19),p.hullDark);
    plate.name = 'aperture-shutter';
    plate.position.set(R*.065,0,0);
    shutter.add(plate);
    group.add(shutter);
  }


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
/** Extragalactic Ascendant — derived from the unmistakable Sovereign anatomy,
 * keeping material plates and independently articulated appendages.
 * The scale is an AU render datum, not an attempt to match a canon mesh.
 */
export const buildReaperAscendant = (): BuiltShip => {
  const built = buildReaper({length:11,arms:6,armLengthFactor:.87,bodyRadiusFactor:.12,spines:true,tint:0x692d30});
  // Structural ridges communicate a higher engineering generation without
  // turning the cephalopod Reaper into a conventional starship.
  const plate=new THREE.MeshStandardMaterial({
    color:0x34404c,metalness:.84,roughness:.43,emissive:0x130405,emissiveIntensity:.08
  });
  for(const side of [-1,1])for(let i=0;i<4;i++){
    const strut=new THREE.Mesh(new THREE.BoxGeometry(.12,.1,1.4),plate);
    strut.position.set(side*(.45+i*.025),.12,-3.4+i*2.1);
    strut.rotation.y=side*.18;
    strut.name='ascendant-carapace-ridge';
    built.group.add(strut);
  }
  const scale=30000/2000;
  built.group.scale.multiplyScalar(scale);
  built.lengthUnits*=scale;
  built.engineNodes=built.engineNodes.map(p=>p.clone().multiplyScalar(scale));
  if(built.muzzle)built.muzzle.multiplyScalar(scale);
  built.glowColor=0xb53439;
  built.group.name='Ascendant Reaper — extragalactic AU';
  return built;
};

export const buildHarbinger = (): BuiltShip => buildReaper({ length: 13.2, arms: 6, armLengthFactor: 0.8, bodyRadiusFactor: 0.115, spines: true, tint: 0xffa040 });
