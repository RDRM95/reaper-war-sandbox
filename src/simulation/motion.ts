import { add, addScaled, dot, length, scale, sub, v3, type Vec3 } from '@/core/vec3';
import type { MovementGoal } from './ai';
import type { ShipState } from './types';

/** Acceleration-limited arrival, independent of gun facing (mass-effect thrusters).
 * The old fixed arrival radius ignored stopping distance and lateral momentum.
 * A critically damped controller brakes both components rather than orbiting a
 * waypoint. Catalogue acceleration/speed remain the authoritative class limits.
 */
export function advanceMotion(ship: ShipState, goal: MovementGoal, dt: number): void {
  if (dt <= 0) return;
  const health = Math.max(0,Math.min(1,ship.subsystems.engines));
  // No thrust means zero commanded acceleration — conserve inertial velocity.
  // Damaged but functional engines keep limited RCS capability.
  if (health <= 0.025 || ship.acceleration <= 0) {
    ship.engineThrust = 0;
    ship.inertialCoast = length(ship.vel) > 0.0001;
    ship.pos = addScaled(ship.pos, ship.vel, dt);
    return;
  }
  const engine = 0.25 + 0.75 * health;
  const maxSpeed = ship.maxSpeed * engine * Math.max(0, Math.min(1, goal.speedFraction));
  const acceleration = ship.acceleration * engine;
  const error = sub(goal.position, ship.pos);
  const dist = length(error);

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
  // Visual and physical honesty: capital hulls cannot magically translate
  // sideways as fast as their powerful rear main engines accelerate forward.
  // Side RCS can still align formations, turn under fire and avoid collisions.
  // Fighters retain near-full vector thrust. These are class-wide AU/cutscene
  // manoeuvre parameters, not random per-ship animation.
  const facing = ship.heading;
  const axial = dot(force, facing);
  const forward = scale(facing, axial);
  const lateral = sub(force, forward);
  const typicalLateralFraction = ship.role === 'fighter' ? 0.85 :
    ship.role === 'frigate' ? 0.68 :
    ship.role === 'reaper_destroyer' ? 0.36 :
    ship.role === 'cruiser' ? 0.46 :
    ship.role === 'carrier' ? 0.24 :
    ship.role === 'reaper_capital' ? 0.12 :
    ship.role === 'dreadnought' ? 0.28 : 0.42;
  // Fine station keeping and collision avoidance use small omnidirectional
  // thrusters. Do not cripple the final arrival controller or clearance field
  // merely to prevent conspicuous sideways motion during powered cruising.
  const stationKeeping = Math.max(8, ship.lengthKm * 3);
  const lateralFraction = dist < stationKeeping ||
    (goal.avoidanceAcceleration && length(goal.avoidanceAcceleration) > 1e-6)
    ? (ship.faction === 'reaper' ? 0.52 : 1) : typicalLateralFraction;
  // Slowing/braking is allowed through forward-facing RCS. Only forward
  // acceleration lights the dominant aft engine; inertia alone does not.
  force = add(forward,scale(lateral,lateralFraction));
  const actual = length(force);
  if(actual > acceleration) force = scale(force,acceleration/actual);
  ship.engineThrust = Math.max(0,Math.min(1,Math.max(0,dot(force,facing))/acceleration));
  ship.inertialCoast = ship.engineThrust < 0.065 && length(ship.vel) > ship.maxSpeed * 0.04;
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
  if (dist < 0.002 && length(before) <= acceleration * dt &&
      length(velocity) <= acceleration * dt &&
      (!goal.avoidanceAcceleration || length(goal.avoidanceAcceleration) < acceleration * 0.01)) {
    ship.pos = { ...goal.position };
    ship.vel = v3();
    ship.engineThrust = 0;
    ship.inertialCoast = false;
  } else {
    ship.vel = velocity;
    ship.pos = add(ship.pos, scale(add(before, velocity), dt * 0.5));
  }
}
