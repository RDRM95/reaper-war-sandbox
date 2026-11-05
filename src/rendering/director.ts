import type { Rng } from '@/core/rng';
import { distance } from '@/core/vec3';
import type { ShipState } from '@/simulation/types';

/** Activity-weighted camera subjects, independent of the simulation RNG.
 * Ship motion and outcomes never depend on whether the director is enabled. */
export function cinematicPair(ships: readonly ShipState[], rng: Rng, previousId?: string): { fromId: string; toId?: string } | undefined {
  const alive = ships.filter(s => s.alive && !s.escaped && s.role !== 'fighter');
  if (!alive.length) return undefined;
  const byId = new Map(alive.map(s => [s.id, s]));
  const candidates = alive.map(ship => {
    const target = ship.targetId ? byId.get(ship.targetId) : undefined;
    const enemy = target && target.side !== ship.side ? target : undefined;
    const range = Math.max(0, ...ship.weapons.filter(w => !w.def.antiSmall).map(w => w.def.range));
    const engaged = !!enemy && distance(ship.pos, enemy.pos) <= range * 1.1;
    const firing = ship.weapons.some(w => w.beamRemaining > 0 || w.cooldown > w.def.cooldown * 0.85);
    const capital = ['dreadnought', 'carrier', 'reaper_capital'].includes(ship.role);
    const weight = (capital ? 3 : 1) * (engaged ? 3 : 0.5) * (firing ? 2 : 1) * (ship.id === previousId ? 0.1 : 1);
    return { ship, enemy, weight };
  });
  let pick = rng.next() * candidates.reduce((sum, c) => sum + c.weight, 0);
  const chosen = candidates.find(c => (pick -= c.weight) <= 0) ?? candidates[candidates.length - 1];
  let enemy = chosen.enemy;
  if (!enemy) {
    let nearest = Infinity;
    for (const other of alive) {
      if (other.side === chosen.ship.side) continue;
      const d = distance(chosen.ship.pos, other.pos);
      if (d < nearest) { nearest = d; enemy = other; }
    }
  }
  return { fromId: chosen.ship.id, toId: enemy?.id };
}

/** A bounded neighbourhood for a fleet pass. Membership is chosen only when
 * the shot changes; the camera follows these hulls rather than chasing the
 * changing centroid of an entire battle. */
export function cinematicWing(ships: readonly ShipState[], leaderId: string): string[] {
  const leader = ships.find(s => s.id === leaderId && s.alive && !s.escaped);
  if (!leader) return [];
  const members = ships.filter(s => s.alive && !s.escaped && s.fleetId === leader.fleetId && s.role !== 'fighter')
    .sort((a, b) => distance(a.pos, leader.pos) - distance(b.pos, leader.pos) || a.id.localeCompare(b.id))
    .slice(0, 12);
  return members.length >= 6 ? members.map(s => s.id) : [];
}
