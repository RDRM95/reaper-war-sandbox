import { v3, type Vec3 } from '@/core/vec3';
import type { ShipRole } from '@/data/types';
import type { FormationType } from './types';
import { BATTLESPACE_SCALE } from './constants';

/**
 * Formation slot assignment. Slots are expressed in fleet-local space: +z is
 * the fleet's facing, +x to the right, +y up. Distances in km. Capital ships
 * are spaced so that a two-kilometre Reaper or a kilometre-long dreadnought
 * does not overlap its neighbours.
 */

export interface SlotShip {
  id: string;
  role: ShipRole;
  lengthKm: number;
}

const tier = (role: ShipRole): number => {
  switch (role) {
    case 'reaper_capital':
    case 'dreadnought':
    case 'carrier':
      return 0;
    case 'cruiser':
    case 'reaper_destroyer':
      return 1;
    case 'frigate':
      return 2;
    case 'fighter':
      return 3;
  }
};

/** Symmetric spread of n items along an axis with spacing s: 0, +s, -s, +2s, ... */
function spreadIndex(i: number): number {
  if (i === 0) return 0;
  const k = Math.ceil(i / 2);
  return i % 2 === 1 ? k : -k;
}

const CHUNK_LIMITS = [8, 12, 16, 24];
const SLOT_SCALE = Math.max(BATTLESPACE_SCALE, 0.55);
// Original catalogue bounds for the four nominal layout tiers. Keeping this
// guard preserves established small ME layouts while bigger crossover/future
// hulls receive the same physical clearance used by large formations.
const NOMINAL_TIER_MAX_KM = [2.4, 0.56, 0.216, 0.018];

export function assignSlots(ships: SlotShip[], formation: FormationType, seed = 0): Map<string, Vec3> {
  const counts = [0, 0, 0, 0];
  for (const ship of ships) counts[tier(ship.role)]++;
  const large = counts.some((count, i) => count > CHUNK_LIMITS[i]);
  const raw = large ? assignBattleGroups(ships, formation, seed) : assignSlotsNominal(ships, formation);
  // Spacing between ships compresses with the battlespace, but never below
  // what keeps hulls from overlapping.
  const slots = new Map<string, Vec3>();
  for (const [id, v] of raw) slots.set(id, v3(v.x * SLOT_SCALE, v.y * SLOT_SCALE, v.z * SLOT_SCALE));
  const oversized = ships.some(ship => ship.lengthKm > NOMINAL_TIER_MAX_KM[tier(ship.role)]);
  if (large || oversized) separateFormationHulls(ships, slots);
  return slots;
}

/** Keep mixed tiers clear without moving established small-fleet layouts. */
function separateFormationHulls(ships: SlotShip[], slots: Map<string, Vec3>): void {
  const cellSize = Math.max(0.1, ...ships.map((ship) => ship.lengthKm * 1.1));
  const cells = new Map<string, { pos: Vec3; radius: number }[]>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  // Place the largest tiers first so escort clearance cannot displace a capital.
  const ordered = ships.map((ship, index) => ({ ship, index })).sort((a, b) => tier(a.ship.role) - tier(b.ship.role) || a.index - b.index);
  for (const { ship } of ordered) {
    const pos = slots.get(ship.id)!;
    const origin = { ...pos };
    const radius = Math.max(0.01, ship.lengthKm * 0.55);
    const step = Math.max(0.08, ship.lengthKm * 1.1);
    let attempt = 0;
    for (;;) {
      const cx = Math.floor(pos.x / cellSize), cy = Math.floor(pos.y / cellSize), cz = Math.floor(pos.z / cellSize);
      let overlaps = false;
      for (let x = cx - 1; x <= cx + 1 && !overlaps; x++) {
        for (let y = cy - 1; y <= cy + 1 && !overlaps; y++) {
          for (let z = cz - 1; z <= cz + 1 && !overlaps; z++) {
            for (const other of cells.get(key(x, y, z)) ?? []) {
              if (Math.hypot(pos.x - other.pos.x, pos.y - other.pos.y, pos.z - other.pos.z) < radius + other.radius) {
                overlaps = true;
                break;
              }
            }
          }
        }
      }
      if (!overlaps) {
        const k = key(cx, cy, cz);
        const cell = cells.get(k) ?? [];
        cell.push({ pos, radius });
        cells.set(k, cell);
        break;
      }
      // Search nearby lateral stations instead of stacking displaced escorts
      // into a vertical tower. This runs only on assignment, never per frame.
      const angle = ++attempt * 2.399963229728653;
      const searchRadius = Math.sqrt(attempt) * step;
      pos.x = origin.x + Math.cos(angle) * searchRadius;
      pos.z = origin.z + Math.sin(angle) * searchRadius;
      pos.y = origin.y + Math.sin(attempt * 1.7) * step * 0.35;
    }
  }
}

/** Stable, independent layout noise. Never use the combat RNG: layouts must be
 * reproducible without changing weapon rolls, AI decisions or replay events. */
function layoutNoise(seed: number, index: number, salt: number): number {
  let x = (seed ^ Math.imul(index + 1, 0x9e3779b9) ^ Math.imul(salt + 1, 0x85ebca6b)) | 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** Different groups may use a local tactical screen or assault wedge, while
 * the overall fleet still respects its ordered line, column or broad wedge.
 * Chosen at deployment only; no artificial random movement during combat. */
function localFormation(formation: FormationType, seed: number, index: number): FormationType {
  const roll = layoutNoise(seed, index, 17);
  switch (formation) {
    case 'line_abreast': return roll < 0.43 ? 'line_abreast' : roll < 0.68 ? 'defensive_screen' : roll < 0.87 ? 'strike_wedge' : 'fighter_screen';
    case 'strike_wedge': return roll < 0.55 ? 'strike_wedge' : roll < 0.78 ? 'line_abreast' : 'defensive_screen';
    case 'defensive_screen': return roll < 0.61 ? 'defensive_screen' : roll < 0.85 ? 'line_abreast' : 'fighter_screen';
    case 'fighter_screen': return roll < 0.60 ? 'fighter_screen' : roll < 0.85 ? 'defensive_screen' : 'line_abreast';
    case 'capital_column': return roll < 0.82 ? 'capital_column' : 'line_abreast';
    case 'dispersed': return roll < 0.6 ? 'dispersed' : roll < 0.85 ? 'defensive_screen' : 'line_abreast';
  }
}

/** Organics should not resolve into identical rows of cloned battle groups.
 * Uneven task-group strengths, distinct local formations and broad strategic
 * salients create a different overview silhouette for each scenario seed.
 * Individual tactical clearance is maintained by separateFormationHulls().
 * The layout costs O(N + G log G) on assignment; nothing runs per render frame.
 * Reaper-only formations deliberately keep their ordered pressure-wave look. */
function assignBattleGroups(ships: SlotShip[], formation: FormationType, seed: number): Map<string, Vec3> {
  const members: SlotShip[][] = [[], [], [], []];
  for (const ship of ships) members[tier(ship.role)].push(ship);
  const limits = [4, 6, 8, 12];
  const count = Math.max(...members.map((group, i) => Math.ceil(group.length / limits[i])));
  const groups: SlotShip[][] = Array.from({ length: count }, () => []);
  const reapers = members[0].every(s => s.role === 'reaper_capital')
    && members[1].every(s => s.role === 'reaper_destroyer')
    && members[2].length === 0;

  members.forEach((roleShips, role) => {
    if (reapers) {
      roleShips.forEach((ship, i) => groups[i % count].push(ship));
      return;
    }
    // Vary cruiser, escort and capital concentrations *independently* so
    // adjacent groups are not identical 4/6/8/12 templates.
    const weights = groups.map((_, i) => 0.60 + layoutNoise(seed, i, 30 + role) * 1.20);
    const sum = weights.reduce((a, b) => a + b, 0);
    const expected = weights.map(w => roleShips.length * w / sum);
    const quotas = expected.map(Math.floor);
    const remaining = roleShips.length - quotas.reduce((a, b) => a + b, 0);
    const fractions = expected.map((n, i) => ({ i, fraction: n - quotas[i] }))
      .sort((a, b) => b.fraction - a.fraction || a.i - b.i);
    for (let i = 0; i < remaining; i++) quotas[fractions[i].i]++;
    let cursor = 0;
    for (let i = 0; i < count; i++)
      for (let k = 0; k < quotas[i]; k++) groups[i].push(roleShips[cursor++]);
  });

  const layouts = groups.map((group, i) =>
    assignSlotsNominal(group, reapers ? formation : localFormation(formation, seed, i)));
  let width = 0, depth = 0;
  for (const layout of layouts) {
    const positions = [...layout.values()];
    if (!positions.length) continue;
    width = Math.max(width, Math.max(...positions.map(p => p.x)) - Math.min(...positions.map(p => p.x)));
    depth = Math.max(depth, Math.max(...positions.map(p => p.z)) - Math.min(...positions.map(p => p.z)));
  }
  const clearance = Math.max(1.8, ...ships.map(ship => ship.lengthKm * 2.5)) / SLOT_SCALE;
  const lateralStride = width + clearance;
  const rearStride = Math.max(depth + clearance, lateralStride * 0.42);
  const wings = Math.max(1, Math.ceil(Math.sqrt(count * 1.6)));
  const slots = new Map<string, Vec3>();

  layouts.forEach((layout, index) => {
    const wave = Math.floor(index / wings);
    const waveCount = Math.min(wings, count - wave * wings);
    const column = index % wings;
    const mean = Array.from({ length: waveCount }, (_, i) => spreadIndex(i))
      .reduce((a, b) => a + b, 0) / waveCount;
    const wing = spreadIndex(column) - mean;
    const phase = index * 2.399963229728653;
    let x = wing * lateralStride;
    let z = -wave * rearStride;
    let y = Math.sin(wing * 0.7) * clearance * 0.18;
    switch (formation) {
      case 'strike_wedge': z -= Math.abs(x) * 0.32; break;
      case 'defensive_screen': z -= wing * wing * lateralStride * 0.09; break;
      case 'fighter_screen': z -= Math.abs(x) * 0.12; break;
      case 'line_abreast': z -= wing * wing * lateralStride * 0.035; break;
      case 'capital_column': {
        const columns = Math.min(3, Math.ceil(Math.sqrt(count)));
        x = spreadIndex(index % columns) * lateralStride * 0.8;
        z = -Math.floor(index / columns) * rearStride;
        break;
      }
      case 'dispersed': {
        const radius = Math.sqrt(index) * lateralStride * 0.74;
        x = Math.cos(phase) * radius * 1.25;
        z = Math.sin(phase) * radius * 0.65;
        break;
      }
    }
    if (reapers) {
      x += (wave % 2) * lateralStride * 0.2;
      y += (wave % 2) * clearance * 0.22;
    } else {
      // Independent salients, reserve pockets and changing frontage make the
      // *whole fleet* asymmetric in free-camera zoom, not just the hull spacing.
      // Preserve the strategic order: columns remain deep, lines remain wide.
      const isColumn = formation === 'capital_column';
      const flank = layoutNoise(seed, index, 1) - 0.5;
      const advance = layoutNoise(seed, index, 2) - 0.5;
      x += flank * lateralStride * (isColumn ? 0.14 : 0.74);
      z += advance * rearStride * (isColumn ? 0.30 : 0.88);
      // Some battlegroups temporarily form reserves or forward assault salients.
      const commitment = layoutNoise(seed, index, 3);
      if (commitment < 0.19) z -= rearStride * 0.28;
      else if (commitment > 0.84) z += rearStride * 0.28;
      y += (layoutNoise(seed, index, 4) - 0.5) * clearance * 0.28;
    }

    const local = [...layout.values()];
    if (!local.length) return;
    const centreX = (Math.min(...local.map(p => p.x)) + Math.max(...local.map(p => p.x))) / 2;
    const centreZ = (Math.min(...local.map(p => p.z)) + Math.max(...local.map(p => p.z))) / 2;
    const yaw = reapers ? 0 : (layoutNoise(seed, index, 5) - 0.5) * 0.34;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const scaleX = reapers ? 1 : 0.84 + layoutNoise(seed, index, 6) * 0.32;
    const scaleZ = reapers ? 1 : 0.84 + layoutNoise(seed, index, 7) * 0.36;
    [...layout].forEach(([id, p], localIndex) => {
      const localX = (p.x - centreX) * scaleX;
      const localZ = (p.z - centreZ) * scaleZ;
      const dx = localX * cos - localZ * sin;
      const dz = localX * sin + localZ * cos;
      // Fixed per-hull station offsets prevent repeated internal diamonds,
      // without making ships wander randomly as the battle progresses.
      const trim = reapers ? 0 : layoutNoise(seed ^ Math.imul(index + 1, 0x71e2a9b7), localIndex, 8) - 0.5;
      const trimZ = reapers ? 0 : layoutNoise(seed ^ Math.imul(index + 1, 0x4cf5ad43), localIndex, 9) - 0.5;
      slots.set(id, v3(
        x + centreX + dx + trim * clearance * 0.24,
        y + p.y + trimZ * clearance * 0.11,
        z + centreZ + dz - Math.abs(dx) * 0.06 + trimZ * clearance * 0.26,
      ));
    });
  });
  return slots;
}

function assignSlotsNominal(ships: SlotShip[], formation: FormationType): Map<string, Vec3> {
  const slots = new Map<string, Vec3>();
  const byTier: SlotShip[][] = [[], [], [], []];
  for (const s of ships) byTier[tier(s.role)].push(s);
  const [caps, cruisers, frigates, fighters] = byTier;

  const capSpacing = Math.max(3.2, ...caps.map((c) => (c.lengthKm * 1.7) / Math.max(BATTLESPACE_SCALE, 0.55)));
  const cruSpacing = 2.2;
  const friSpacing = 1.6;

  switch (formation) {
    case 'line_abreast': {
      caps.forEach((s, i) => slots.set(s.id, v3(spreadIndex(i) * capSpacing, 0, 0)));
      cruisers.forEach((s, i) => slots.set(s.id, v3(spreadIndex(i) * cruSpacing * 1.3, (i % 2 ? 1 : -1) * 1.2, 4)));
      frigates.forEach((s, i) => slots.set(s.id, v3(spreadIndex(i) * friSpacing * 1.6, (i % 3) * 1.0 - 1, 9)));
      fighters.forEach((s, i) => slots.set(s.id, v3(spreadIndex(i) * 0.6, 2 + (i % 4) * 0.5, 13)));
      break;
    }
    case 'defensive_screen': {
      caps.forEach((s, i) => slots.set(s.id, v3(spreadIndex(i) * capSpacing * 0.9, 0, -4)));
      cruisers.forEach((s, i) => {
        const a = (i / Math.max(1, cruisers.length - 1) - 0.5) * Math.PI * 0.8;
        slots.set(s.id, v3(Math.sin(a) * 9, (i % 2 ? 1 : -1) * 1.5, 3 + Math.cos(a) * 4));
      });
      frigates.forEach((s, i) => {
        const a = (i / Math.max(1, frigates.length - 1) - 0.5) * Math.PI * 1.1;
        slots.set(s.id, v3(Math.sin(a) * 14, ((i % 3) - 1) * 2.0, 7 + Math.cos(a) * 6));
      });
      fighters.forEach((s, i) => slots.set(s.id, v3(spreadIndex(i) * 0.8, 3 + (i % 3) * 0.6, 12)));
      break;
    }
    case 'strike_wedge': {
      caps.forEach((s, i) => {
        const k = Math.ceil(i / 2);
        slots.set(s.id, v3(spreadIndex(i) * capSpacing * 0.8, 0, -k * capSpacing * 0.7));
      });
      cruisers.forEach((s, i) => {
        const k = Math.ceil(i / 2);
        slots.set(s.id, v3(spreadIndex(i) * cruSpacing * 1.4 + (i % 2 ? 2 : -2), (i % 2 ? 1 : -1) * 1.8, -2 - k * 1.2));
      });
      frigates.forEach((s, i) => {
        const k = Math.ceil(i / 2);
        slots.set(s.id, v3(spreadIndex(i) * friSpacing * 2.2, ((i % 3) - 1) * 1.5, 3 - k * 0.8));
      });
      fighters.forEach((s, i) => slots.set(s.id, v3(spreadIndex(i) * 0.6, 2.5 + (i % 3) * 0.5, 6)));
      break;
    }
    case 'capital_column': {
      caps.forEach((s, i) => slots.set(s.id, v3(0, 0, -i * capSpacing)));
      cruisers.forEach((s, i) =>
        slots.set(s.id, v3((i % 2 ? 1 : -1) * (cruSpacing * 2.2), (i % 4 < 2 ? 1 : -1) * 1.5, -Math.floor(i / 2) * 2.5 + 2)),
      );
      frigates.forEach((s, i) =>
        slots.set(s.id, v3((i % 2 ? 1 : -1) * (6 + (i % 4) * 1.2), ((i % 3) - 1) * 2.5, -Math.floor(i / 2) * 1.8 + 4)),
      );
      fighters.forEach((s, i) => slots.set(s.id, v3(spreadIndex(i) * 0.6, 3 + (i % 3) * 0.5, 8)));
      break;
    }
    case 'fighter_screen': {
      caps.forEach((s, i) => slots.set(s.id, v3(spreadIndex(i) * capSpacing, 0, -6)));
      cruisers.forEach((s, i) => slots.set(s.id, v3(spreadIndex(i) * cruSpacing * 1.4, (i % 2 ? 1 : -1) * 1.5, -2)));
      frigates.forEach((s, i) => slots.set(s.id, v3(spreadIndex(i) * friSpacing * 1.6, ((i % 3) - 1) * 1.5, 3)));
      fighters.forEach((s, i) => {
        const a = (i / Math.max(1, fighters.length - 1) - 0.5) * Math.PI;
        slots.set(s.id, v3(Math.sin(a) * 12, ((i % 5) - 2) * 1.2, 10 + Math.cos(a) * 5));
      });
      break;
    }
    case 'dispersed': {
      // Deterministic pseudo-scatter from index.
      const scatter = (i: number, scaleX: number, scaleZ: number): Vec3 => {
        const g = (i * 0.618034) % 1;
        const h = (i * 0.754877) % 1;
        return v3((g - 0.5) * scaleX, ((i * 0.382) % 1 - 0.5) * 6, (h - 0.5) * scaleZ);
      };
      caps.forEach((s, i) => slots.set(s.id, scatter(i + 1, caps.length * capSpacing * 1.4, 14)));
      cruisers.forEach((s, i) => slots.set(s.id, scatter(i + 7, 30, 18)));
      frigates.forEach((s, i) => slots.set(s.id, scatter(i + 19, 40, 22)));
      fighters.forEach((s, i) => slots.set(s.id, scatter(i + 41, 24, 10)));
      break;
    }
  }
  return slots;
}

/** Convert a fleet-local slot to world space given anchor position and heading (unit, y≈0). */
export function slotToWorld(anchor: Vec3, heading: Vec3, slot: Vec3): Vec3 {
  // right = heading × up
  const rx = heading.z;
  const rz = -heading.x;
  return v3(
    anchor.x + rx * slot.x + heading.x * slot.z,
    anchor.y + slot.y,
    anchor.z + rz * slot.x + heading.z * slot.z,
  );
}
