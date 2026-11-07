import type { ShipState, WeaponState } from '@/simulation/types';

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
