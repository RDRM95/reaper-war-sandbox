import type { ShipState, WeaponState } from '@/simulation/types';

/** The first-person station defaults to the real spinal / primary battery.
 * Prefer high-damage forward mounts over point-defence or disposable torpedoes.
 * Never synthesise a weapon: the returned object is from the simulation.
 */
export function primaryGunneryMount(ship: ShipState): WeaponState | undefined {
  let best: WeaponState | undefined;
  let bestScore = -Infinity;
  for (const weapon of ship.weapons) {
    if (weapon.def.antiSmall) continue;
    const direct = weapon.def.kind === 'mass_accelerator' ||
      weapon.def.kind === 'reaper_beam' || weapon.def.kind === 'thanix';
    const forward = weapon.def.arc <= 30 ? 5 : weapon.def.arc <= 120 ? 2 : 0;
    const score = (direct ? 100 : 0) + forward * 20 +
      Math.log1p(weapon.def.damage) * 2;
    if (score > bestScore) { best = weapon; bestScore = score; }
  }
  return best ?? ship.weapons[0];
}

/** Fire-control event check for the selected spinal/axial MAIN battery only.
 * Identical hardpoint barrels may qualify; flak, torpedoes and broadsides do not.
 */
export function isMainGunShot(ship: ShipState,weaponIndex:number): boolean {
  const main=primaryGunneryMount(ship);
  const actual=ship.weapons[weaponIndex];
  return !!(main&&actual&&!actual.def.antiSmall&&
    actual.def.id===main.def.id&&actual.def.kind===main.def.kind);
}
