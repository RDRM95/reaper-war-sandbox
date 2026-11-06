import { add, cross, dot, lengthSq, normalize, scale, sub, v3, type Vec3 } from '@/core/vec3';
import type { ShipState } from './types';

/**
 * Deterministic geometry-only shot pattern. Never touches the combat RNG:
 * adding a visual contact point cannot reshuffle hit/miss or AI decisions.
 * Every mount/round/victim samples a different location.
 */
function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}
const fract = (n: number): number => n - Math.floor(n);
export function impactPattern(serial: number, mount: number, targetId: string): { angle: number; radial: number } {
  const seed = hashId(targetId) * (1 / 4294967296);
  const angle = 2 * Math.PI * fract(seed + serial * 0.7548776662466927 + mount * 0.41421356237);
  const radial = Math.sqrt(fract(seed * 0.61803398875 + serial * 0.569840291 + mount * 0.2718281828));
  return { angle, radial };
}

function basis(forward: Vec3): { right: Vec3; up: Vec3; forward: Vec3 } {
  const dir = normalize(forward);
  let right = cross(v3(0, 1, 0), dir);
  if (lengthSq(right) < 1e-8) right = cross(v3(1, 0, 0), dir);
  right = normalize(right);
  return { right, up: normalize(cross(dir, right)), forward: dir };
}

/** Aim at different points inside a ship's projected silhouette.
 * The simulation's existing broad-phase and sphere intersection still
 * decide if and where the actual projectile strikes.
 */
export function spreadProjectileAim(aim: Vec3, origin: Vec3, target: ShipState, serial: number, mount: number): Vec3 {
  const { right, up } = basis(sub(aim, origin));
  const { angle, radial } = impactPattern(serial, mount, target.id);
  const offset = target.radiusKm * 0.70 * radial;
  return add(aim, add(scale(right, offset * Math.cos(angle)), scale(up, offset * Math.sin(angle))));
}

/** Beam hits use an incoming-hemisphere contact and keep that point on
 * the victim as it rotates. Unlike centre locks, the emitter can score
 * plates, sides, necks and edge grazes without artificial beam wobble.
 */
export function beamContactLocal(shooter: ShipState, target: ShipState, serial: number, mount: number): Vec3 {
  const toShooter = sub(shooter.pos, target.pos);
  const basisShot = basis(toShooter);
  const { angle, radial } = impactPattern(serial, mount, target.id);
  const r = target.radiusKm * 0.88 * radial;
  const depth = Math.sqrt(Math.max(0, target.radiusKm * target.radiusKm - r * r));
  const offset = add(
    scale(basisShot.forward, depth),
    add(scale(basisShot.right, Math.cos(angle) * r), scale(basisShot.up, Math.sin(angle) * r)),
  );
  const ship = basis(target.heading);
  return v3(dot(offset, ship.right), dot(offset, ship.up), dot(offset, ship.forward));
}

export function worldHullContact(target: ShipState, local: Vec3): Vec3 {
  const b = basis(target.heading);
  return add(target.pos, add(scale(b.right, local.x), add(scale(b.up, local.y), scale(b.forward, local.z))));
}

/** Shallow entry-angle impacts lose a bounded portion of effective damage.
 * Head-on hits remain unchanged. No new random rolls or hit registrations.
 */
export function glanceMultiplier(incomingVelocity: Vec3, impact: Vec3, target: ShipState): number {
  const outward = sub(impact, target.pos);
  if (lengthSq(outward) < 1e-10 || lengthSq(incomingVelocity) < 1e-10) return 1;
  const incidence = Math.abs(dot(normalize(incomingVelocity), normalize(outward)));
  return incidence < 0.62 ? 0.58 + 0.42 * (incidence / 0.62) : 1;
}
