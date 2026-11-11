import { dot, lengthSq, scale, sub, type Vec3 } from '@/core/vec3';
import type { ShipRole } from '@/data/types';

/** Tactical handling estimates, not canonical speeds. Catalogue forward speed,
 * acceleration and turn rate still apply. FTL speed is not a combat throttle.
 * Capitals keep a bow-on gun line; light craft retain vector manoeuvrability.
 */
export const MANOEUVRE_SPEED: Readonly<Record<ShipRole, Readonly<{ lateral: number; reverse: number }>>> = {
  fighter: { lateral: .95, reverse: .85 },
  frigate: { lateral: .75, reverse: .55 },
  cruiser: { lateral: .42, reverse: .30 },
  dreadnought: { lateral: .25, reverse: .18 },
  carrier: { lateral: .22, reverse: .16 },
  reaper_destroyer: { lateral: .48, reverse: .32 },
  reaper_capital: { lateral: .20, reverse: .15 },
};

/** Direction-dependent cruise envelope. This returns a braking target, never
 * edits velocity: the integrator must still respect available acceleration.
 * Reducing lateral acceleration alone leaves a capital free to reach full
 * forward speed sideways or backwards after a sufficiently long manoeuvre.
 */
export function manoeuvreVelocity(role: ShipRole, heading: Vec3, velocity: Vec3, maxSpeed: number): Vec3 {
  if (maxSpeed <= 0) return { x: 0, y: 0, z: 0 };
  const axial = dot(velocity, heading);
  const lateral = sub(velocity, scale(heading, axial));
  const profile = MANOEUVRE_SPEED[role];
  const axialLimit = maxSpeed * (axial < 0 ? profile.reverse : 1);
  const lateralLimit = maxSpeed * profile.lateral;
  const fraction = Math.sqrt(axial * axial / (axialLimit * axialLimit) + lengthSq(lateral) / (lateralLimit * lateralLimit));
  return fraction > 1 ? scale(velocity, 1 / fraction) : velocity;
}
