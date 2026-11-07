import type { BattleConfig, Environment, FleetSpec } from '@/simulation/types';

/**
 * Strategic 3D theatre policy. Space is unbounded: these are staging
 * corridors, not collision walls or a flat arena.
 *
 * Fleet positions are specified in nominal kilometres and scaled by the
 * existing simulation engine. Staging changes only the initial fleet anchor.
 * Every member keeps the exact existing battle-group slot relative to it.
 */
export const THEATRE_PROFILES: Record<Environment, {
  landmark: 'planet' | 'relay' | 'station' | 'none';
  /** Maximum fleet-to-midplane altitude at deployment (nominal kilometres). */
  verticalLayerKm: number;
  /** Suggested region for a strategic camera, never a hard gameplay bound. */
  overviewKm: number;
}> = {
  earth_orbit: { landmark: 'planet', verticalLayerKm: 10, overviewKm: 1600 },
  palaven_orbit: { landmark: 'planet', verticalLayerKm: 10, overviewKm: 1600 },
  thessia_orbit: { landmark: 'planet', verticalLayerKm: 10, overviewKm: 1600 },
  rannoch_orbit: { landmark: 'planet', verticalLayerKm: 10, overviewKm: 1600 },
  surkesh_orbit: { landmark: 'planet', verticalLayerKm: 10, overviewKm: 1600 },
  relay: { landmark: 'relay', verticalLayerKm: 12, overviewKm: 2400 },
  citadel: { landmark: 'station', verticalLayerKm: 6, overviewKm: 1600 },
  deep_space: { landmark: 'none', verticalLayerKm: 14, overviewKm: 3200 },
};

/** A scenario may explicitly retain its original deployment via world state. */
export const LEGACY_THEATRE_FLAG = 'legacy_plane';

/**
 * Stage fleets across separate vertical approach lanes while retaining every
 * original X/Z bearing, heading, unit count, tech rule and arrival time.
 * Altitude is limited to a fraction of the horizontal enemy separation:
 * even a close-starting scenario retains viable forward firing arcs.
 *
 * Keep authored altitudes (e.g. a high flanking Reaper wave) as offsets.
 * Static defence platforms retain their exact placed coordinates.
 */
export function stageThreeDimensionalTheatre(config: BattleConfig): BattleConfig {
  // Older scenario IDs, replays and calibration seeds retain their exact
  // positions until the player selects the new spatial theatre.
  if (config.worldState?.theatre_layout !== 'three_dimensional') return config;
  const a = config.fleets.filter(f => f.side === 'A');
  const b = config.fleets.filter(f => f.side === 'B');
  if (!a.length || !b.length) return config;
  let nearestHorizontal = Infinity;
  for (const friend of a) for (const foe of b) {
    const x = friend.position.x - foe.position.x;
    const z = friend.position.z - foe.position.z;
    nearestHorizontal = Math.min(nearestHorizontal, Math.hypot(x, z));
  }
  const layer = Math.min(THEATRE_PROFILES[config.environment].verticalLayerKm,
    Math.max(0, nearestHorizontal) * 0.075);
  if (!(layer > 0)) return config;
  const rank: Record<'A' | 'B', number> = { A: 0, B: 0 };
  const fleets: FleetSpec[] = config.fleets.map(f => {
    if (f.ships.some(s => s.classId.includes('platform'))) return f;
    const i = rank[f.side]++;
    const side = f.side === 'A' ? -1 : 1;
    // Allied wings occupy different altitudes but remain in mutually
    // supporting range. Even/odd lanes mirror, rather than drift each tick.
    const step = Math.min(3, nearestHorizontal * 0.018);
    const echelon = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2) * step;
    return {
      ...f,
      position: { ...f.position, y: f.position.y + side * layer + echelon },
    };
  });
  return { ...config, fleets };
}
