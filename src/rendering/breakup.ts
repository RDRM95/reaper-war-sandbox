import * as THREE from 'three';

/**
 * Pieces a destroyed hull breaks into. Most ship models are a flat list of merged meshes under the visual's group and
 * break into those. A Reaper's model sits under one model root with its limbs on pivot groups, so the flat rule found
 * nothing and a dying Reaper simply vanished: here each limb (its whole pivot subtree), each mandible and each
 * remaining visible mesh becomes a piece. Hidden layers (stand-in limbs behind the articulated ones, or the reverse)
 * are never pieces. Every piece gets its own material clones, because debris is faded and disposed and the originals
 * are shared across the fleet.
 */
export const MAX_BREAKUP_PIECES = 32;

/** A subtree that breaks off as one piece. */
const isLimb = (o: THREE.Object3D): boolean => o.userData.reaperRig === 'shoulder' || o.userData.reaperRig === 'mandible';

export function collectBreakupPieces(group: THREE.Object3D, max = MAX_BREAKUP_PIECES): THREE.Object3D[] {
  const pieces: THREE.Object3D[] = [];
  const visit = (o: THREE.Object3D): void => {
    if (!o.visible) return;
    if (o !== group && (isLimb(o) || (o as THREE.Mesh).isMesh)) {
      pieces.push(o);
      return;
    }
    for (const child of o.children) visit(child);
  };
  visit(group);
  // Largest first, so a cap keeps the pieces that carry the silhouette; ties keep traversal order.
  const size = (o: THREE.Object3D): number => {
    let n = 0;
    o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh && c.visible) n += m.geometry.attributes.position?.count ?? 0; });
    return n;
  };
  const ranked = pieces.map((o, i) => ({ o, i, n: size(o) })).filter(p => p.n > 0).sort((a, b) => b.n - a.n || a.i - b.i).slice(0, max);
  const kept = ranked.sort((a, b) => a.i - b.i).map(p => p.o);
  for (const piece of kept) {
    const clones = new Map<THREE.Material, THREE.Material>();
    piece.traverse((c) => {
      const mesh = c as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      let clone = clones.get(mesh.material);
      if (!clone) { clone = mesh.material.clone(); clones.set(mesh.material, clone); }
      mesh.material = clone;
    });
  }
  return kept;
}

/**
 * Velocity of a hull piece as the hull breaks up: outward from the centre of the break along the piece's own
 * offset, so limbs and plates separate instead of drifting through one another, plus a small scatter. `size` is
 * the explosion's size in render units; a piece with no offset (the hull's own core) only scatters.
 */
export function breakupVelocity(offset: THREE.Vector3, size: number, rng: { next(): number; gaussian(mean: number, sd: number): number }, out = new THREE.Vector3()): THREE.Vector3 {
  const distance = offset.length();
  out.set(rng.gaussian(0, 1), rng.gaussian(0, 1), rng.gaussian(0, 1)).multiplyScalar(size * 0.025);
  if (distance > 1e-4) out.addScaledVector(offset, (size * (0.06 + 0.06 * rng.next())) / distance);
  return out;
}
