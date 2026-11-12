import { add, cross, lengthSq, normalize, scale, sub, v3, type Vec3 } from '@/core/vec3';
import type { ShipRole } from '@/data/types';

/**
 * Three-dimensional attack bearings.
 *
 * A fleet used to fight as a sheet: every hull's firing station was its deployment slot pushed forward along the
 * fleet heading, so both sides met as two flat walls in one plane. Here each hull that is engaging also has an
 * attack bearing: a direction in which it swings its firing station around its target, at an unchanged distance
 * from it, by an angle its class allows.
 *
 * The reasons are tactical, not decorative:
 *  - an enemy wall's open flank is above and below it, where its neighbours are not, so hulls from the middle of a
 *    line go over or under the target and only the wings go round the sides, where they have room;
 *  - attackers on separated bearings do not stand in each other's line of fire and make a target with a narrow
 *    main-weapon arc choose whom to face;
 *  - the swing a class gets follows what it is for: dreadnoughts keep a firing line and only step it into tiers,
 *    cruisers work the flanks, frigates get round the beam, carriers stay where they are, Reaper capitals advance
 *    almost straight and their destroyers hunt wide.
 *
 * Everything is derived from deployment slots: no randomness, and a hull keeps its bearing for the battle.
 */

const DEG = Math.PI / 180;

/** How far a class swings round its target: the least any hull of the class takes, and the most. */
export const ATTACK_SWING: Partial<Record<ShipRole, readonly [number, number]>> = {
  dreadnought: [5 * DEG, 14 * DEG],
  cruiser: [22 * DEG, 55 * DEG],
  frigate: [60 * DEG, 150 * DEG],
  // Capitals keep their guns bearing through a wide arc, so each can come at its target from its own quarter.
  reaper_capital: [8 * DEG, 26 * DEG],
  reaper_destroyer: [30 * DEG, 100 * DEG],
};

export interface AttackBearing {
  /** Angle swung round the target, radians. */
  swing: number;
  /** Direction of the swing as the attacker sees it facing its target: unit vector (right, up). */
  right: number;
  up: number;
}

export interface BearingMember {
  id: string;
  /** Deployment offset to the right of the class's centre in the fleet, kilometres. */
  lateral: number;
}

/**
 * Bearings for the hulls of one class in one fleet. Hulls near the middle of the line go over or under; hulls
 * toward a wing go round that side; consecutive hulls on a side alternate above and below and step through three
 * depths of swing, so neighbours never share a bearing.
 */
export function assignAttackBearings(role: ShipRole, members: readonly BearingMember[]): Map<string, AttackBearing> {
  const out = new Map<string, AttackBearing>();
  const limits = ATTACK_SWING[role];
  if (!limits || !members.length) return out;
  const halfWidth = Math.max(1e-6, ...members.map(m => Math.abs(m.lateral)));
  const ordered = [...members].sort((a, b) => Math.abs(a.lateral) - Math.abs(b.lateral) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const rank = { left: 0, right: 0 };
  for (const [index, member] of ordered.entries()) {
    // A hull on the centre line has no side of its own: alternate, so a column does not all break the same way.
    const side = Math.abs(member.lateral) > halfWidth * 1e-3 ? Math.sign(member.lateral) : index % 2 === 0 ? 1 : -1;
    const k = side > 0 ? rank.right++ : rank.left++;
    const outerness = Math.min(1, Math.abs(member.lateral) / halfWidth);
    // Middle of the line: nearly straight over or under. Wing: nearly straight out to the side.
    const elevation = ((1 - outerness) * 70 + 12) * DEG;
    const vertical = (k + (side > 0 ? 0 : 1)) % 2 === 0 ? 1 : -1;
    const depth = Math.min(1, 0.25 + 0.55 * outerness + 0.2 * ((k % 3) / 2));
    out.set(member.id, {
      swing: limits[0] + (limits[1] - limits[0]) * depth,
      right: side * Math.cos(elevation),
      up: vertical * Math.sin(elevation),
    });
  }
  return out;
}

/** Share of its swing a hull has taken up: none beyond twice its range from the target, all of it inside 1.15×. */
export function swingAmount(distanceToTarget: number, range: number): number {
  const t = Math.max(0, Math.min(1, (range * 2 - distanceToTarget) / Math.max(1e-6, range * 0.85)));
  return t * t * (3 - 2 * t);
}

/**
 * Swing a firing station round its target by `amount` (0 to 1) of the hull's bearing. The station keeps its
 * distance from the target, so range bands and leashes computed before the swing still hold.
 */
export function swingStation(station: Vec3, target: Vec3, bearing: AttackBearing, amount: number): Vec3 {
  const fromTarget = sub(station, target);
  const radiusSq = lengthSq(fromTarget);
  const angle = bearing.swing * amount;
  if (radiusSq < 1e-12 || angle <= 0) return station;
  const radius = Math.sqrt(radiusSq);
  const out = scale(fromTarget, 1 / radius);
  // The attacker's own right and up, looking at the target.
  const forward = scale(out, -1);
  let right = cross(v3(0, 1, 0), forward);
  right = lengthSq(right) > 1e-8 ? normalize(right) : v3(1, 0, 0);
  const up = cross(forward, right);
  const direction = add(scale(right, bearing.right), scale(up, bearing.up));
  return add(target, add(scale(out, radius * Math.cos(angle)), scale(direction, radius * Math.sin(angle))));
}
