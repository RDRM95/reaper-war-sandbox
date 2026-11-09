import type { Vec3 } from '@/core/vec3';
import type { ShipState, Side } from './types';

interface IndexedShip { ship: ShipState; order: number }
interface ContactCell { entries: IndexedShip[]; min: Vec3; max: Vec3 }
interface ContactNode {
  min: Vec3; max: Vec3;
  cells?: ContactCell[];
  left?: ContactNode; right?: ContactNode;
}

/** Built lazily from occupied non-fighter cells, not from every hull. */
function contactTree(cells: ContactCell[]): ContactNode {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const cell of cells) for (const axis of ['x', 'y', 'z'] as const) {
    min[axis] = Math.min(min[axis], cell.min[axis]);
    max[axis] = Math.max(max[axis], cell.max[axis]);
  }
  if (cells.length <= 4) return { min, max, cells };
  const spans = { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z };
  const axis = spans.x >= spans.y && spans.x >= spans.z ? 'x' : spans.y >= spans.z ? 'y' : 'z';
  cells.sort((a, b) => a.min[axis] - b.min[axis]);
  const middle = Math.floor(cells.length / 2);
  return { min, max, left: contactTree(cells.slice(0, middle)), right: contactTree(cells.slice(middle)) };
}

function contactDistance(node: ContactNode, origin: Vec3, drift: number): number {
  const dx = Math.max(node.min.x - drift - origin.x, 0, origin.x - node.max.x - drift);
  const dy = Math.max(node.min.y - drift - origin.y, 0, origin.y - node.max.y - drift);
  const dz = Math.max(node.min.z - drift - origin.z, 0, origin.z - node.max.z - drift);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

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
  private readonly contactCells: Record<Side, Map<string, ContactCell>> = { A: new Map(), B: new Map() };
  private readonly contactTrees: Partial<Record<Side, ContactNode | null>> = {};
  private drift = 0;
  private readonly stepSeconds: number;
  readonly cellSize: number;
  /** Conservative broad-phase radius, including fighter hit-box scaling. */
  maxCollisionRadius = 0;
  /** Actual hull candidates visited by nearest-contact searches. */
  nearestCandidateChecks = 0;

  constructor(ships: readonly ShipState[], stepSeconds: number, cellSize = 12) {
    this.cellSize = cellSize;
    this.stepSeconds = Math.max(0, stepSeconds);
    for (let i = 0; i < ships.length; i++) this.add(ships[i], i);
  }

  /** Newly deployed fighters are added without forcing a full grid rebuild. */
  add(ship: ShipState, order: number): void {
    if (!ship.alive || ship.escaped) return;
    this.maxCollisionRadius = Math.max(this.maxCollisionRadius, ship.radiusKm * (ship.role === 'fighter' ? 2.5 : 1));
    this.drift = Math.max(this.drift, ship.maxSpeed * this.stepSeconds * 2 + 0.001);
    this.sides[ship.side].push(ship);
    const x = Math.floor(ship.pos.x / this.cellSize);
    const y = Math.floor(ship.pos.y / this.cellSize);
    const z = Math.floor(ship.pos.z / this.cellSize);
    const key = this.key(ship.side, x, y, z);
    let bucket = this.cells.get(key);
    if (!bucket) { bucket = []; this.cells.set(key, bucket); }
    bucket.push({ ship, order });
    if (ship.role !== 'fighter') {
      if (!this.contactCells[ship.side].has(key)) this.contactCells[ship.side].set(key, {
        entries: bucket,
        min: { x: x * this.cellSize, y: y * this.cellSize, z: z * this.cellSize },
        max: { x: (x + 1) * this.cellSize, y: (y + 1) * this.cellSize, z: (z + 1) * this.cellSize },
      });
      this.contactTrees[ship.side] = undefined;
    }
  }

  private key(side: Side, x: number, y: number, z: number): string {
    return side + ':' + x + ':' + y + ':' + z;
  }

  /** Exact nearest shared contact beyond a local sensor query. Occupied-cell
   * bounds avoid an all-enemy scan for every distant rear ship. Bounds expand
   * by the current drift margin; narrow phase reads current hull positions.
   * Equal distances retain deployment order regardless of tree traversal.
   */
  nearestEnemy(side: Side, origin: Vec3): ShipState | undefined {
    const enemy: Side = side === 'A' ? 'B' : 'A';
    let root = this.contactTrees[enemy];
    if (root === undefined) {
      const cells = [...this.contactCells[enemy].values()];
      root = cells.length ? contactTree(cells) : null;
      this.contactTrees[enemy] = root;
    }
    if (!root) return undefined;
    let nearest: ShipState | undefined;
    let nearestDistance = Infinity, nearestOrder = Infinity;
    const visit = (node: ContactNode): void => {
      if (contactDistance(node, origin, this.drift) > nearestDistance) return;
      if (node.cells) {
        for (const cell of node.cells) for (const entry of cell.entries) {
          this.nearestCandidateChecks++;
          const ship = entry.ship;
          if (!ship.alive || ship.escaped || ship.role === 'fighter') continue;
          const dx = ship.pos.x - origin.x, dy = ship.pos.y - origin.y, dz = ship.pos.z - origin.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist < nearestDistance || (dist === nearestDistance && entry.order < nearestOrder)) {
            nearest = ship; nearestDistance = dist; nearestOrder = entry.order;
          }
        }
      } else {
        const left = node.left!, right = node.right!;
        if (contactDistance(left, origin, this.drift) <= contactDistance(right, origin, this.drift)) {
          visit(left); visit(right);
        } else { visit(right); visit(left); }
      }
    };
    visit(root);
    return nearest;
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
