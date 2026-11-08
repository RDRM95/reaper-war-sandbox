import { add, distance, dot, normalize, rotateY, sub, v3, type Vec3 } from '@/core/vec3';
import type { FleetState, ShipState, WeaponState } from './types';

export const PRIMARY_VOLLEY_SECONDS = 0.5;

export type PrimaryBatteryReason = 'ready' | 'held' | 'cooling' | 'coordinating' |
  'out_of_range' | 'aligning' | 'overheated' | 'out_of_ammo' | 'no_target' |
  'retreating' | 'destroyed' | 'escaped';

export interface PrimaryBatteryStatus {
  shipId: string;
  reason: PrimaryBatteryReason;
  /** Physically ready mounts, before hold-fire and salvo timing permissions. */
  ready: number;
  cooling: number;
  total: number;
  volleyRemaining: number;
  cooldownRemaining: number;
  /** Simulation kilometres, measured from the actual firing origin. */
  range: number;
  distance?: number;
  targetId?: string;
  held: boolean;
}

export interface FleetBatteryStatus {
  fleetId: string;
  ready: number;
  cooling: number;
  total: number;
  volleyRemaining: number;
  held: boolean;
}

/** Player salvo commands affect organic capital spinal guns only. Escorts,
 * fighters, secondary batteries, point defence and Reapers remain independent. */
export function isCommandedBattery(ship: ShipState, weapon: WeaponState): boolean {
  return ship.faction !== 'reaper' && ship.role === 'dreadnought' &&
    weapon.def.kind === 'mass_accelerator' && weapon.def.antiCapital && weapon.def.arc <= 20 && Math.cos(weapon.facing) > 0.999;
}

/** Shared live firing geometry: diagnostics and the simulation use one source. */
export function weaponWorldOffset(ship: ShipState, weapon: WeaponState): Vec3 {
  const yaw = Math.atan2(ship.heading.x, ship.heading.z);
  return add(ship.pos, rotateY(weapon.offset, yaw));
}

export function inWeaponArc(ship: ShipState, weapon: WeaponState, target: Vec3): boolean {
  if (weapon.def.arc >= 360) return true;
  // Use the full 3D weapon bore direction. The previous horizontal-only
  // comparison rejected ships above/below the firing line even when the gun
  // was properly tracking them, leaving otherwise valid capital battles silent.
  const facing = normalize(rotateY(ship.heading, weapon.facing));
  const to = normalize(sub(target, weaponWorldOffset(ship, weapon)));
  const halfArc = weapon.def.arc * Math.PI / 360;
  return dot(facing, to) >= Math.cos(halfArc + 0.05);
}

function validEnemy(ship: ShipState, target: ShipState | undefined): target is ShipState {
  return !!target && target.alive && !target.escaped && target.side !== ship.side;
}

/** Pure target solution for non-PD mounts, including the same targets of
 * opportunity as real firing. Calling it never commits a target or advances RNG. */
export function weaponTarget(
  ship: ShipState, fleet: FleetState, weapon: WeaponState,
  getShip: (id: string) => ShipState | undefined, enemies: readonly ShipState[],
): ShipState | undefined {
  const def = weapon.def;
  const origin = weaponWorldOffset(ship, weapon);
  const reachable = (target: ShipState | undefined): target is ShipState =>
    validEnemy(ship, target) && distance(origin, target.pos) <= def.range && inWeaponArc(ship, weapon, target.pos);
  let primary = ship.targetId ? getShip(ship.targetId) : undefined;
  if (fleet.orders.focusFire && isCommandedBattery(ship, weapon) && def.armourBypass > 0 && !ship.forcedTargetId) {
    const focus = fleet.focusTargetId ? getShip(fleet.focusTargetId) : undefined;
    if (reachable(focus)) primary = focus;
  }
  if (reachable(primary)) return primary;
  let best: ShipState | undefined;
  let bestScore = -Infinity;
  for (const enemy of enemies) {
    if (!validEnemy(ship, enemy) || enemy.role === 'fighter') continue;
    const d = distance(origin, enemy.pos);
    if (d > def.range || !inWeaponArc(ship, weapon, enemy.pos)) continue;
    const score = (def.antiCapital ? Math.log2(1 + enemy.pointValue) : 1) * (1 - d / def.range) + (1 - enemy.hull / enemy.maxHull) * 0.5;
    if (score > bestScore) { best = enemy; bestScore = score; }
  }
  return best;
}

/** Intended target for explaining a blocked solution, without changing it. */
export function batteryIntent(
  ship: ShipState, fleet: FleetState, getShip: (id: string) => ShipState | undefined,
  enemies: readonly ShipState[],
): ShipState | undefined {
  const primary = ship.targetId ? getShip(ship.targetId) : undefined;
  if (validEnemy(ship, primary)) return primary;
  const focus = fleet.focusTargetId ? getShip(fleet.focusTargetId) : undefined;
  if (validEnemy(ship, focus)) return focus;
  return enemies.find(enemy => validEnemy(ship, enemy) && enemy.role !== 'fighter');
}

interface ManualVolley {
  endsAt: number;
  fired: Set<string>;
}

/** A short, non-queued release. Every mount gets at most one shot; clicking
 * again cannot extend an active window or erase the shots already released. */
export class PrimaryVolleyControl {
  private windows = new Map<string, ManualVolley>();

  remaining(time: number, fleetId: string): number {
    return Math.max(0, (this.windows.get(fleetId)?.endsAt ?? time) - time);
  }

  open(time: number, fleetId: string): boolean {
    if (this.remaining(time, fleetId) > 1e-8) return false;
    this.windows.set(fleetId, { endsAt: time + PRIMARY_VOLLEY_SECONDS, fired: new Set() });
    return true;
  }

  allows(time: number, fleetId: string, ship: ShipState, weapon: WeaponState): boolean {
    const volley = this.windows.get(fleetId);
    return !!volley && time < volley.endsAt - 1e-8 && !volley.fired.has(`${ship.id}:${weapon.index}`);
  }

  fired(fleetId: string, ship: ShipState, weapon: WeaponState): void {
    this.windows.get(fleetId)?.fired.add(`${ship.id}:${weapon.index}`);
  }
}
