import type { BattleSimulation } from './battle';
import type { ShipState } from './types';

/**
 * Measurements of how three-dimensional a battle is, for the probe script and the tests. Read-only: nothing here
 * feeds back into the simulation.
 */
export interface GeometrySample { time: number; side: string; ships: number; thickness: number; elevationDeg: number; steepShare: number; offBowDeg: number; abaftShare: number; overlaps: number }

/** Extent of a point cloud along its thinnest direction over its widest, from the covariance eigenvalues. */
function thickness(points: { x: number; y: number; z: number }[]): number {
  const n = points.length;
  if (n < 4) return 0;
  let cx = 0, cy = 0, cz = 0;
  for (const p of points) { cx += p.x / n; cy += p.y / n; cz += p.z / n; }
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (const p of points) { const x = p.x - cx, y = p.y - cy, z = p.z - cz; xx += x * x; xy += x * y; xz += x * z; yy += y * y; yz += y * z; zz += z * z; }
  // Eigenvalues of the symmetric 3×3 covariance (trigonometric solution).
  const q = (xx + yy + zz) / 3;
  const p1 = xy * xy + xz * xz + yz * yz;
  const p2 = (xx - q) ** 2 + (yy - q) ** 2 + (zz - q) ** 2 + 2 * p1;
  const p = Math.sqrt(p2 / 6);
  if (p < 1e-12) return 1;
  const b = [[(xx - q) / p, xy / p, xz / p], [xy / p, (yy - q) / p, yz / p], [xz / p, yz / p, (zz - q) / p]];
  const det = b[0][0] * (b[1][1] * b[2][2] - b[1][2] * b[2][1]) - b[0][1] * (b[1][0] * b[2][2] - b[1][2] * b[2][0]) + b[0][2] * (b[1][0] * b[2][1] - b[1][1] * b[2][0]);
  const phi = Math.acos(Math.max(-1, Math.min(1, det / 2))) / 3;
  const largest = q + 2 * p * Math.cos(phi), smallest = q + 2 * p * Math.cos(phi + 2 * Math.PI / 3);
  return Math.sqrt(Math.max(0, smallest) / Math.max(1e-12, largest));
}

export function sampleGeometry(sim: BattleSimulation): GeometrySample[] {
  const out: GeometrySample[] = [];
  for (const side of ['A', 'B'] as const) {
    const mine = sim.ships.filter((s: ShipState) => s.side === side && s.alive && !s.escaped && s.role !== 'fighter');
    const theirs = sim.ships.filter((s: ShipState) => s.side !== side && s.alive && !s.escaped && s.role !== 'fighter');
    if (mine.length < 4 || theirs.length < 1) continue;
    const centre = (ships: ShipState[]) => ships.reduce((a, s) => ({ x: a.x + s.pos.x / ships.length, y: a.y + s.pos.y / ships.length, z: a.z + s.pos.z / ships.length }), { x: 0, y: 0, z: 0 });
    let elevation = 0, steep = 0, lines = 0, offBow = 0, abaft = 0;
    for (const ship of mine) {
      const target = ship.targetId ? sim.getShip(ship.targetId) : undefined;
      if (!target?.alive) continue;
      const dx = target.pos.x - ship.pos.x, dy = target.pos.y - ship.pos.y, dz = target.pos.z - ship.pos.z;
      const range = Math.hypot(dx, dy, dz) || 1;
      const angle = Math.abs(Math.asin(dy / range)) * 180 / Math.PI;
      elevation += angle; if (angle > 15) steep++; lines++;
      // Where the attacker sits as its target sees it: 0° is dead ahead of the target, 180° dead astern.
      const cos = -(dx * target.heading.x + dy * target.heading.y + dz * target.heading.z) / range;
      offBow += Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
      if (cos < 0) abaft++;
    }
    let overlaps = 0;
    for (let i = 0; i < mine.length; i++) for (let j = i + 1; j < mine.length; j++) {
      const a = mine[i], b = mine[j], reach = a.radiusKm + b.radiusKm;
      const ex = a.pos.x - b.pos.x, ey = a.pos.y - b.pos.y, ez = a.pos.z - b.pos.z;
      if (ex * ex + ey * ey + ez * ez < reach * reach) overlaps++;
    }
    out.push({ time: +sim.time.toFixed(2), side, ships: mine.length, thickness: +thickness(mine.map(s => s.pos)).toFixed(3),
      elevationDeg: +(elevation / Math.max(1, lines)).toFixed(1), steepShare: +(steep / Math.max(1, lines)).toFixed(3),
      offBowDeg: +(offBow / Math.max(1, lines)).toFixed(1), abaftShare: +(abaft / Math.max(1, lines)).toFixed(3), overlaps });
  }
  return out;
}
