import { add, dot, length, lengthSq, normalize, scale, sub, v3, type Vec3 } from '@/core/vec3';
import type { ShipState } from './types';

/** Hulls on converging courses aim to pass this many clearances apart. */
export const SAFE_PASSING_MARGIN = 1.25;

interface Neighbour {
  id: string;
  pos: Vec3;
  vel: Vec3;
  radius: number;
  acceleration: number;
  reaper: boolean;
  side: string;
  fighter: boolean;
  toEnemy?: Vec3;
}

/** One immutable broad-phase snapshot per tick. Local clearance is a thrust
 * request, never a positional correction or an extra source of velocity. */
export class SeparationField {
  private cells = new Map<number, Neighbour[]>();
  private neighbourhoods = new Map<number, Map<number, Neighbour[]>>();
  private members = new Map<string, Neighbour>();
  private cellSize: number;
  private maxRadius = 0;
  private maxStoppingDistance = 0;
  /** Diagnostic count for bounded-neighbour performance tests. */
  pairChecks = 0;

  constructor(ships: readonly ShipState[]) {
    const byId = new Map<string, ShipState>();
    for (const ship of ships) byId.set(ship.id, ship);
    for (const ship of ships) {
      if (!ship.alive || ship.escaped) continue;
      const engine = 0.25 + 0.75 * ship.subsystems.engines;
      const acceleration = Math.max(0.001, ship.acceleration * engine);
      const target = ship.targetId ? byId.get(ship.targetId) : undefined;
      const member: Neighbour = {
        id: ship.id, pos: { ...ship.pos }, vel: { ...ship.vel },
        radius: Math.max(0.02, ship.radiusKm), acceleration,
        reaper: ship.faction === 'reaper',
        side: ship.side,
        fighter: ship.role === 'fighter',
        toEnemy: target?.alive && !target.escaped && target.side !== ship.side
          ? normalize(sub(target.pos, ship.pos)) : undefined,
      };
      this.members.set(ship.id, member);
      this.maxRadius = Math.max(this.maxRadius, member.radius);
      this.maxStoppingDistance = Math.max(this.maxStoppingDistance, lengthSq(member.vel) / (2 * acceleration));
    }
    this.cellSize = Math.max(1.5, this.maxRadius * 2.5);
    for (const member of this.members.values()) {
      const key = this.key(Math.floor(member.pos.x / this.cellSize), Math.floor(member.pos.y / this.cellSize), Math.floor(member.pos.z / this.cellSize));
      const cell = this.cells.get(key) ?? [];
      cell.push(member);
      this.cells.set(key, cell);
    }
  }

  private key(x: number, y: number, z: number): number {
    // Exact 48-bit numeric key avoids allocating hundreds of strings per hull
    // per tick. Wrapped distant cells remain safe: the distance test rejects
    // them, and a local query never spans an entire 65,536-cell period.
    return ((x & 65535) * 65536 + (y & 65535)) * 65536 + (z & 65535);
  }

  private nearby(x: number, y: number, z: number, radius: number): Neighbour[] {
    const key = this.key(x, y, z);
    let byRadius = this.neighbourhoods.get(key);
    if (!byRadius) { byRadius = new Map(); this.neighbourhoods.set(key, byRadius); }
    const cached = byRadius.get(radius);
    if (cached) return cached;
    const neighbours: Neighbour[] = [];
    for (let gx = x - radius; gx <= x + radius; gx++) {
      for (let gy = y - radius; gy <= y + radius; gy++) {
        for (let gz = z - radius; gz <= z + radius; gz++) {
          const cell = this.cells.get(this.key(gx, gy, gz));
          if (cell) neighbours.push(...cell);
        }
      }
    }
    byRadius.set(radius, neighbours);
    return neighbours;
  }

  /** Stable passing side. Collinear arrival paths have no geometric normal;
   * choosing opposite vertical lanes breaks that symmetry without random noise. */
  private passingDirection(a: Neighbour, b: Neighbour, delta: Vec3): Vec3 {
    let direction = delta;
    // A Reaper never backs away from the enemy to clear another hull, it sidesteps. The one exception: while it is
    // advancing, it may brake for a hull of its own side (it slows, it does not reverse).
    const lateralOnly = a.reaper && !!a.toEnemy && !(a.side === b.side && dot(a.vel, a.toEnemy) > 0);
    if (lateralOnly && dot(direction, a.toEnemy!) < 0) {
      direction = sub(direction, scale(a.toEnemy!, dot(direction, a.toEnemy!)));
    }
    if (lengthSq(direction) < 1e-8) {
      const sign = a.id < b.id ? 1 : -1;
      direction = v3(0, sign, 0);
      if (lateralOnly) direction = sub(direction, scale(a.toEnemy!, dot(direction, a.toEnemy!)));
      if (lengthSq(direction) < 1e-8) direction = v3(sign, 0, 0);
    }
    return normalize(direction);
  }

  acceleration(ship: ShipState): Vec3 {
    const self = this.members.get(ship.id);
    if (!self) return v3();
    const stop = lengthSq(self.vel) / (2 * self.acceleration);
    const reach = (self.radius + this.maxRadius) * 1.6 + Math.min(6, (stop + this.maxStoppingDistance) * 1.5);
    const radius = Math.ceil(reach / this.cellSize);
    const cx = Math.floor(self.pos.x / this.cellSize), cy = Math.floor(self.pos.y / this.cellSize), cz = Math.floor(self.pos.z / this.cellSize);
    let force = v3();
    // For a Reaper advancing on its target, what its own side asks of it is kept apart and may brake it; the rest
    // is made lateral below.
    let own = v3();
    const split = self.reaper && !!self.toEnemy && dot(self.vel, self.toEnemy) > 0;
    for (const other of this.nearby(cx, cy, cz, radius)) {
    if (other.id === self.id) continue;
    this.pairChecks++;
    // A hull does not give way to a fighter: the fighter is the one that can turn. A carrier's own wing, forming
    // up and landing on it, otherwise pushed it kilometres off its station.
    if (other.fighter && !self.fighter) continue;
    const delta = sub(self.pos, other.pos);
    const dist = length(delta);
    const clearance = (self.radius + other.radius) * 1.08;
    const influence = clearance + Math.max(0.08, clearance * 0.55);
    if (dist > reach) continue;
    const relative = sub(self.vel, other.vel);
    const relativeSpeedSq = lengthSq(relative);
    const horizon = Math.min(6, Math.max(1.5, (length(self.vel) / self.acceleration + length(other.vel) / other.acceleration) * 0.5));
    const closestAt = relativeSpeedSq > 1e-8 ? Math.max(0, Math.min(horizon, -dot(delta, relative) / relativeSpeedSq)) : 0;
    const closest = add(delta, scale(relative, closestAt));
    const closestDistance = length(closest);
    const pressure = dist < influence ? (influence - dist) / Math.max(clearance * 0.08, dist - clearance) : 0;
    const warning = closestAt > 0 && closestDistance < clearance
      ? (1 - closestDistance / clearance) * (horizon - closestAt) / Math.max(0.5, horizon * 0.3) : 0;
    // The thrust that opens the predicted miss to a safe margin in the time left, as a multiple of this hull's
    // own thrust. Small while the pass is seconds away and rising as it nears, so a hull starts to give way while
    // it still can instead of when the other is alongside.
    const safe = clearance * SAFE_PASSING_MARGIN;
    const timeLeft = Math.max(0.5, closestAt);
    const evasion = closestAt > 0 && closestDistance < safe
      ? 2 * (safe - closestDistance) / (timeLeft * timeLeft * self.acceleration) : 0;
    const anticipation = Math.max(warning, evasion);
    const strength = Math.max(pressure, anticipation);
    if (strength <= 0) continue;
    const direction = this.passingDirection(self, other, pressure >= anticipation ? delta : closest);
    const push = scale(direction, self.acceleration * Math.min(20, strength));
    if (split && other.side === self.side) own = add(own, push);
    else force = add(force, push);
    }
    // Several neighbours may cancel one another into an away component. Keep
    // Reaper avoidance tactical and lateral even in a crowded capital line.
    if (self.reaper && self.toEnemy) {
      const away = dot(force, self.toEnemy);
      if (away < 0) force = sub(force, scale(self.toEnemy, away));
    }
    return split ? add(force, own) : force;
  }
}
