import type { ShipState, WeaponState } from '@/simulation/types';
import * as THREE from 'three';
import { weaponBeamOrigin, weaponFlashPose } from './weaponFlash';
import { KM } from './geometry';

/** Observe the same interpolated pose as the hull. Using the latest tick's
 * heading here makes a rigid gun sight judder while its ship turns smoothly. */
export function gunneryFrame(ship: ShipState, weapon: WeaponState, alpha: number,
  rendered?: { group: THREE.Object3D; muzzle?: THREE.Vector3 }): {
  position: THREE.Vector3; aim: THREE.Vector3;
} {
  const t = Math.max(0, Math.min(1, alpha));
  const heading = new THREE.Vector3(ship.prevHeading.x, ship.prevHeading.y, ship.prevHeading.z)
    .lerp(new THREE.Vector3(ship.heading.x, ship.heading.y, ship.heading.z), t).normalize();
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), heading);
  let position: THREE.Vector3;
  let bore: THREE.Vector3;
  if (rendered) {
    rendered.group.updateWorldMatrix(true, false);
    position = weapon.def.kind === 'reaper_beam' || weapon.def.kind === 'thanix'
      ? weaponBeamOrigin(rendered.group, rendered.muzzle, weapon, ship.faction === 'reaper')
      : weaponFlashPose(rendered.group, rendered.muzzle, weapon).position;
    bore = new THREE.Vector3(Math.sin(weapon.facing), 0, Math.cos(weapon.facing))
      .transformDirection(rendered.group.matrixWorld);
  } else {
    position = new THREE.Vector3(weapon.offset.x, weapon.offset.y, weapon.offset.z)
      .applyQuaternion(rotation).add(new THREE.Vector3(ship.prevPos.x, ship.prevPos.y, ship.prevPos.z)
        .lerp(new THREE.Vector3(ship.pos.x, ship.pos.y, ship.pos.z), t)).multiplyScalar(KM);
    bore = new THREE.Vector3(Math.sin(weapon.facing), 0, Math.cos(weapon.facing)).applyQuaternion(rotation);
  }
  position.addScaledVector(bore, Math.max(0.18, ship.radiusKm * KM * 0.2));
  return { position, aim: position.clone().addScaledVector(bore, 2000) };
}

/** Only genuine forward capital-class main batteries own a first-person
 * gunnery station. No invisible point-defence, secondary broadside or torpedo
 * gets falsely labelled a spinal gun.
 */
export function primaryGunneryMount(ship: ShipState): WeaponState | undefined {
  let best: WeaponState | undefined;
  let bestScore = -Infinity;
  for (const weapon of ship.weapons) {
    const direct = weapon.def.kind === 'mass_accelerator' ||
      weapon.def.kind === 'reaper_beam' || weapon.def.kind === 'thanix';
    if (!direct || !weapon.def.antiCapital || weapon.def.antiSmall) continue;
    // Facing is a local bearing in radians; arc is a maximum yaw in degrees.
    if (Math.abs(weapon.facing) > Math.PI / 3 || weapon.def.arc > 115) continue;
    const score = weapon.def.damage *
      (weapon.def.kind === 'mass_accelerator' ? 1.3 : 1) -
      Math.abs(weapon.facing) * 100;
    if (score > bestScore) { best = weapon; bestScore = score; }
  }
  return best;
}

/** Only the exact selected axial mount (or its linked identical barrels)
 * may trigger first-person gun recoil, rumble and internal sound.
 */
export function isMainGunShot(ship: ShipState, weaponIndex: number): boolean {
  const main = primaryGunneryMount(ship);
  const actual = ship.weapons[weaponIndex];
  return !!(main && actual && !actual.def.antiSmall &&
    actual.hardpointIndex === main.hardpointIndex &&
    actual.def.id === main.def.id && actual.def.kind === main.def.kind);
}
