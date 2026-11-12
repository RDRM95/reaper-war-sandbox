/**
 * What ships spend a battle doing: every second, every armed hull that is alive and has not left is put in one class.
 *   firing   it fired within one cycle of its quickest anti-ship weapon (at least 4 s), or has a beam on
 *   silent   it has a target inside its main-battery range and is not firing
 *   closing  its target is out of range and the gap shrank over the last second
 *   chasing  its target is out of range and the gap did not shrink
 *   idle     it has no target
 * Hull-seconds are counted from the battle's first shot to its end. Read-only on the simulation apart from
 * stepping it; used by scripts/combat-activity.ts and by the tests that hold combat to "fighting, not chasing".
 */
import type { BattleSimulation } from './battle';
import { shipEngagementRange } from './ai';
import type { ShipState } from './types';

export type Activity = 'firing' | 'silent' | 'closing' | 'chasing' | 'idle';
export const ACTIVITIES: readonly Activity[] = ['firing', 'silent', 'closing', 'chasing', 'idle'];

export interface ActivityRow {
  key: string;
  seconds: Record<Activity, number>;
  /** Sum and count of distance to target over main-battery range, while the hull has a target. */
  rangeShare: number; rangeSamples: number;
  /** Sum and count of speed over top speed while firing. */
  firingSpeed: number; firingSamples: number;
  targetChanges: number; hullSeconds: number; runs: number;
  /** Anti-ship shots fired, and beam-seconds, over the counted hull-seconds. */
  shots: number;
}

export interface ActivityReport { firstShot: number; duration: number; rows: Map<string, ActivityRow>; winner: string }

const window = (ship: ShipState): number => {
  let quickest = Infinity;
  for (const w of ship.weapons) if (!w.def.antiSmall || ship.role === 'fighter') quickest = Math.min(quickest, w.def.cooldown);
  return Math.max(4, (Number.isFinite(quickest) ? quickest : 4) * 1.3);
};

/** Classify every armed hull once a second for the whole battle. */
export function measureActivity(sim: BattleSimulation, seconds: number): ActivityReport {
  const rows = new Map<string, ActivityRow>();
  const row = (key: string): ActivityRow => {
    let r = rows.get(key);
    if (!r) { r = { key, seconds: { firing: 0, silent: 0, closing: 0, chasing: 0, idle: 0 }, rangeShare: 0, rangeSamples: 0, firingSpeed: 0, firingSamples: 0, targetChanges: 0, hullSeconds: 0, runs: 0, shots: 0 }; rows.set(key, r); }
    return r;
  };
  const shots = new Map<string, number>(), lastFired = new Map<string, number>(), lastGap = new Map<string, number>(), lastTarget = new Map<string, string | undefined>(), closingOn = new Map<string, boolean>();
  let firstShot = -1, next = 1;
  while (!sim.finished && sim.time < seconds) {
    sim.step();
    if (sim.time < next) continue;
    next += 1;
    for (const ship of sim.ships) {
      if (!ship.alive || ship.escaped || ship.weapons.length === 0) continue;
      const before = shots.get(ship.id) ?? 0;
      const beam = ship.weapons.some(w => w.beamRemaining > 0);
      if (ship.stats.shotsFired > before || beam) { lastFired.set(ship.id, sim.time); if (firstShot < 0 && ship.role !== 'fighter') firstShot = sim.time; }
      shots.set(ship.id, ship.stats.shotsFired);
      const target = ship.targetId ? sim.getShip(ship.targetId) : undefined;
      const valid = !!target && target.alive && !target.escaped;
      const gap = valid ? Math.hypot(target!.pos.x - ship.pos.x, target!.pos.y - ship.pos.y, target!.pos.z - ship.pos.z) : -1;
      const previousGap = lastGap.get(ship.id), sameTarget = lastTarget.get(ship.id) === ship.targetId;
      const changed = lastTarget.has(ship.id) && !sameTarget && !!ship.targetId && !!lastTarget.get(ship.id);
      lastGap.set(ship.id, gap); lastTarget.set(ship.id, ship.targetId);
      if (firstShot < 0) continue;
      const r = row(`${ship.side} ${ship.role}`), range = shipEngagementRange(ship);
      const fired = sim.time - (lastFired.get(ship.id) ?? -Infinity) <= window(ship);
      const closing = valid && sameTarget && previousGap !== undefined && previousGap >= 0 && gap < previousGap - 1e-4;
      const activity: Activity = fired ? 'firing' : !valid ? 'idle' : gap <= range ? 'silent' : closing ? 'closing' : 'chasing';
      r.seconds[activity]++; r.hullSeconds++;
      r.shots += Math.max(0, ship.stats.shotsFired - before) + ship.weapons.filter(w => w.beamRemaining > 0).length;
      if (changed) r.targetChanges++;
      if (valid) { r.rangeShare += gap / range; r.rangeSamples++; }
      if (fired) { r.firingSpeed += Math.hypot(ship.vel.x, ship.vel.y, ship.vel.z) / Math.max(1e-6, ship.maxSpeed); r.firingSamples++; }
      if (ship.role === 'fighter' && valid && sameTarget && previousGap !== undefined && previousGap >= 0) {
        const wasClosing = closingOn.get(ship.id) ?? false, nowClosing = gap < previousGap;
        if (wasClosing && !nowClosing && gap <= range * 1.5) r.runs++;
        closingOn.set(ship.id, nowClosing);
      }
    }
  }
  return { firstShot, duration: sim.time, rows, winner: sim.finished ? String(sim.result?.winner ?? '?') : 'unfinished' };
}

/** Totals over every hull that is not a fighter. */
export function hullTotals(report: ActivityReport): { share: Record<Activity, number>; hullSeconds: number; targetChangesPerMinute: number } {
  const total: Record<Activity, number> = { firing: 0, silent: 0, closing: 0, chasing: 0, idle: 0 };
  let hullSeconds = 0, changes = 0;
  for (const r of report.rows.values()) {
    if (r.key.endsWith('fighter')) continue;
    for (const a of ACTIVITIES) total[a] += r.seconds[a];
    hullSeconds += r.hullSeconds; changes += r.targetChanges;
  }
  const share = Object.fromEntries(ACTIVITIES.map(a => [a, hullSeconds ? total[a] / hullSeconds : 0])) as Record<Activity, number>;
  return { share, hullSeconds, targetChangesPerMinute: hullSeconds ? changes / (hullSeconds / 60) : 0 };
}
