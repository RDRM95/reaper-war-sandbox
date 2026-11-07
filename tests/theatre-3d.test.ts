import { describe, expect, it } from 'vitest';
import { buildCustomBattle, buildScenario } from '@/scenarios';
import { LEGACY_THEATRE_FLAG, THEATRE_PROFILES, stageThreeDimensionalTheatre } from '@/scenarios/theatre';
import { BattleSimulation } from '@/simulation/battle';

const setup = (distance: number) => ({
  seed: 42, rulesId: 'canon_me3', environment: 'relay' as const,
  startingDistanceKm: distance,
  sideA: { faction: 'alliance' as const, name: 'Fifth Fleet',
    formation: 'line_abreast' as const, counts: { alliance_cruiser: 4, alliance_frigate: 6 } },
  sideB: { faction: 'reaper' as const, name: 'Reaper vanguard',
    formation: 'strike_wedge' as const, counts: { reaper_capital: 1, reaper_destroyer: 4 } },
});

describe('open-space 3D fleet theatres', () => {
  it('provides meaningful map anchors without imposing gameplay walls', () => {
    expect(THEATRE_PROFILES.relay.landmark).toBe('relay');
    expect(THEATRE_PROFILES.earth_orbit.landmark).toBe('planet');
    expect(THEATRE_PROFILES.citadel.landmark).toBe('station');
    expect(THEATRE_PROFILES.deep_space.landmark).toBe('none');
  });
  it('stages opposing fleets above and below one another without moving their X/Z corridors', () => {
    const cfg = buildCustomBattle(setup(100));
    const [a, b] = cfg.fleets;
    expect(a.position.x).toBe(0); expect(b.position.x).toBe(0);
    expect(a.position.z).toBe(-50); expect(b.position.z).toBe(50);
    expect(a.position.y).toBeLessThan(0);
    expect(b.position.y).toBeGreaterThan(0);
    const dz = Math.abs(b.position.z - a.position.z);
    expect(Math.abs(b.position.y - a.position.y)).toBeLessThan(dz * 0.2);
    const copy = buildCustomBattle(setup(100));
    expect(copy.fleets).toEqual(cfg.fleets);
    expect(a.heading).toEqual({ x: 0, y: 0, z: 1 });
    expect(b.heading).toEqual({ x: 0, y: 0, z: -1 });
  });
  it('preserves close engagements and permits legacy layout when explicitly selected', () => {
    const cfg = buildCustomBattle(setup(10));
    const [a, b] = cfg.fleets;
    expect(Math.abs(a.position.y - b.position.y)).toBeLessThan(2);
    const legacy = stageThreeDimensionalTheatre({
      ...cfg, worldState: { theatre_layout: LEGACY_THEATRE_FLAG },
      fleets: cfg.fleets.map(f => ({ ...f, position: { ...f.position, y: 0 } }))
    });
    expect(legacy.fleets.every(f => f.position.y === 0)).toBe(true);
  });
  it('keeps same-side wings at distinct altitudes and runs real deterministic combat', () => {
    const wing = { ...setup(90).sideA, name: 'Auxiliary wing' };
    const config = buildCustomBattle({ ...setup(90), extraA: [wing] });
    expect(config.fleets.filter(f => f.side === 'A').map(f => f.position.y)[0])
      .not.toBe(config.fleets.filter(f => f.side === 'A').map(f => f.position.y)[1]);
    const sim = new BattleSimulation(config);
    const initial = sim.ships.map(s => s.pos.y);
    expect(new Set(initial.map(y => Math.round(y * 100))).size).toBeGreaterThan(2);
    for (let i = 0; i < 15; i++) sim.step();
    expect(sim.ships.every(s => Number.isFinite(s.pos.x + s.pos.y + s.pos.z))).toBe(true);
  });
  it('stages preset scenarios while preserving their fleet rosters', () => {
    const cfg = buildScenario('battle_of_earth', 'canon_me3', 17);
    expect(cfg.fleets.some(f => f.position.y > 0)).toBe(true);
    expect(cfg.fleets.some(f => f.position.y < 0)).toBe(true);
  });
});
