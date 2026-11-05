import type { Vec3 } from '@/core/vec3';
import type { ShipState, Side } from './types';

interface IndexedShip { ship: ShipState; order: number }

/**
 * Immutable broad-phase contact grid for one fixed simulation tick.
 * Results retain deployment order so target tie-breaking stays deterministic.
 *
 * A safety margin covers movement between the snapshot and late-tick weapon
 * updates. Query users still apply their normal, precise range and arc checks.
 */
export class CombatSpatialIndex {
  private readonly cells = new Map<string, IndexedShip[]>();
  private readonly sides: Record<Side, ShipState[]> = { A: [], B: [] };
  private readonly drift: number;
  readonly cellSize: number;

  constructor(ships: readonly ShipState[], stepSeconds: number, cellSize = 12) {
    this.cellSize = cellSize;
    let fastest = 0;
    for (let i = 0; i < ships.length; i++) {
      const ship = ships[i];
      if (!ship.alive || ship.escaped) continue;
      fastest = Math.max(fastest, ship.maxSpeed);
      this.sides[ship.side].push(ship);
      const x = Math.floor(ship.pos.x / cellSize);
      const y = Math.floor(ship.pos.y / cellSize);
      const z = Math.floor(ship.pos.z / cellSize);
      const key = this.key(ship.side, x, y, z);
      let bucket = this.cells.get(key);
      if (!bucket) { bucket = []; this.cells.set(key, bucket); }
      bucket.push({ ship, order: i });
    }
    // Both the querying ship and the target may move before a shot is fired.
    this.drift = fastest * Math.max(0, stepSeconds) * 2 + 0.001;
  }

  private key(side: Side, x: number, y: number, z: number): string {
    return side + ':' + x + ':' + y + ':' + z;
  }

  enemiesNear(side: Side, origin: Vec3, radius: number): ShipState[] {
    const enemySide: Side = side === 'A' ? 'B' : 'A';
    const r = Math.max(0, radius) + this.drift;
    const inv = 1 / this.cellSize;
    const x0 = Math.floor((origin.x - r) * inv), x1 = Math.floor((origin.x + r) * inv);
    const y0 = Math.floor((origin.y - r) * inv), y1 = Math.floor((origin.y + r) * inv);
    const z0 = Math.floor((origin.z - r) * inv), z1 = Math.floor((origin.z + r) * inv);
    const cells = (x1-x0+1) * (y1-y0+1) * (z1-z0+1);
    // Wide sensors can encompass the whole battlespace. Avoid searching huge
    // empty cubes; the ordinary enemy list is both cheaper and exact there.
    if (cells > 4096 || !Number.isFinite(cells)) return this.sides[enemySide];
    const found: IndexedShip[] = [];
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          const bucket = this.cells.get(this.key(enemySide, x, y, z));
          if (bucket) found.push(...bucket);
        }
      }
    }
    // The exact selectors use current positions, not these snapshot positions.
    // Sorting by original insertion order preserves existing target tie rules.
    found.sort((a, b) => a.order - b.order);
    return found.map(entry => entry.ship);
  }
}
