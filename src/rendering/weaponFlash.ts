import * as THREE from 'three';
import type { WeaponState } from '@/simulation/types';
import { KM } from './geometry';

/** Resolve the visible barrel for the mount that actually fired. Damage is
 * an effect-strength input, never evidence that a weapon is a spinal cannon. */
export function weaponFlashPose(group: THREE.Object3D, muzzle: THREE.Vector3 | undefined, weapon: WeaponState): {
  position: THREE.Vector3;
  direction: THREE.Vector3;
  spinal: boolean;
} {
  const spinal = weapon.def.kind === 'mass_accelerator' && weapon.def.antiCapital &&
    weapon.def.arc <= 20 && Math.cos(weapon.facing) > 0.999;
  const local = spinal && muzzle ? muzzle.clone() : new THREE.Vector3(weapon.offset.x, weapon.offset.y, weapon.offset.z).multiplyScalar(KM);
  const position = group.localToWorld(local);
  const direction = new THREE.Vector3(Math.sin(weapon.facing), 0, Math.cos(weapon.facing)).transformDirection(group.matrixWorld);
  return { position, direction, spinal };
}

/** Dedicated eyes/projectors are forward emitters. Turreted lance decks use
 * their physical hardpoint, including when a ship turns to fire broadsides. */
export function weaponBeamOrigin(group: THREE.Object3D, muzzle: THREE.Vector3 | undefined, weapon: WeaponState, reaperEye = false): THREE.Vector3 {
  const forwardProjector = weapon.def.kind === 'thanix' && weapon.def.arc <= 30 && Math.cos(weapon.facing) > 0.999;
  const local = muzzle && (reaperEye || forwardProjector) ? muzzle.clone()
    : new THREE.Vector3(weapon.offset.x, weapon.offset.y, weapon.offset.z).multiplyScalar(KM);
  return group.localToWorld(local);
}
