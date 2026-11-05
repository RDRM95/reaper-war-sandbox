import { add, addScaled, length, scale, sub, v3, type Vec3 } from '@/core/vec3';
import type { MovementGoal } from './ai';
import type { ShipState } from './types';

/** Acceleration-limited arrival, independent of gun facing (mass-effect thrusters).
 * The old fixed arrival radius ignored stopping distance and lateral momentum.
 * A critically damped controller brakes both components rather than orbiting a
 * waypoint. Catalogue acceleration/speed remain the authoritative class limits.
 */
export function advanceMotion(ship: ShipState, goal: MovementGoal, dt: number): void {
  const engine = 0.25 + 0.75 * ship.subsystems.engines;
  const maxSpeed = ship.maxSpeed * engine * Math.max(0, Math.min(1, goal.speedFraction));
  const acceleration = ship.acceleration * engine;
  const error = sub(goal.position, ship.pos);
  const dist = length(error);
  if (acceleration <= 0 || dt <= 0) return;

  // A full-speed hull needs v/a seconds to stop. Choose damping on that
  // timescale and retain a small numerical settling zone, not a hull-size dead
  // zone that can put short-range guns permanently outside firing range.
  const response = Math.max(0.4, ship.maxSpeed * engine / acceleration);
  const omega = 2 / response;
  let force: Vec3 = sub(scale(error, omega * omega), scale(ship.vel, 2 * omega));
  const forceLength = length(force);
  if (forceLength > acceleration) force = scale(force, acceleration / forceLength);
  if (goal.avoidanceAcceleration) {
    force = add(force, goal.avoidanceAcceleration);
    const combined = length(force);
    if (combined > acceleration) force = scale(force, acceleration / combined);
  }
  const before = ship.vel;
  let velocity = addScaled(before, force, dt);
  const speed = length(velocity);
  // Brake toward a reduced speed limit instead of instantly deleting momentum
  // when a subsystem is disabled or an order changes speed.
  if (speed > maxSpeed && speed > 0) {
    velocity = scale(velocity, maxSpeed / speed);
  }
  const dv = sub(velocity, before);
  const dvLength = length(dv);
  if (dvLength > acceleration * dt) velocity = addScaled(before, dv, acceleration * dt / dvLength);
  if (dist < 0.002 && length(velocity) < acceleration * dt && (!goal.avoidanceAcceleration || length(goal.avoidanceAcceleration) < acceleration * 0.01)) {
    ship.pos = { ...goal.position };
    ship.vel = v3();
  } else {
    ship.vel = velocity;
    ship.pos = add(ship.pos, scale(add(before, velocity), dt * 0.5));
  }
}
