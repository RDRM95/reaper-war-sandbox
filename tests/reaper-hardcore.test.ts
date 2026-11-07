import { describe, expect, it } from 'vitest';
import { getPreset } from '@/timelines/presets';
import { hardcoreReaperBeamDamage, hardcoreReaperTargetFactor, isProtectedAuHull } from '@/simulation/reaperHardcore';

const shooter = { faction: 'reaper' as const, role: 'reaper_capital' as const };
const mainGun = { kind: 'reaper_beam' as const, id: 'reaper_capital_beam' };
const regular = { classId: 'alliance_dreadnought', faction: 'alliance' as const, maxHull: 1500, maxBarriers: 800, armour: 450 };
const hardened = { ...regular, classId: 'alliance_valkyrie' };
const scoringTarget = { ...regular, role: 'dreadnought' as const, withdrawing: false, stats: { damageDealt: 1000 } };

describe('opt-in Reaper Hardcore — Annihilation', () => {
  const hardcore = getPreset('reaper_hardcore');
  const canon = getPreset('canon_me3');
  it('is selectable but does not affect canon, Escalation or APEX rules', () => {
    expect(hardcore.special.reaperHardcore).toBe(true);
    expect(canon.special.reaperHardcore).toBeFalsy();
    expect(getPreset('reaper_escalation').special.reaperHardcore).toBeFalsy();
    expect(getPreset('prime_apex').special.reaperHardcore).toBeFalsy();
    expect(hardcore.special.indoctrinationDisabled).toBe(true);
  });
  it('one-shots conventional ships on actual capital beam contact, not other weapons', () => {
    const regularHit = hardcoreReaperBeamDamage(hardcore, shooter, regular, mainGun, 20);
    expect(regularHit).toBeGreaterThan(regular.maxHull + regular.maxBarriers + regular.armour);
    expect(hardcoreReaperBeamDamage(canon, shooter, regular, mainGun, 20)).toBe(20);
    expect(hardcoreReaperBeamDamage(hardcore, shooter, { ...regular, faction: 'reaper' }, mainGun, 20)).toBe(20);
    expect(hardcoreReaperBeamDamage(hardcore, { ...shooter, role: 'reaper_destroyer' }, regular, mainGun, 20)).toBe(20);
    expect(hardcoreReaperBeamDamage(hardcore, shooter, regular, { ...mainGun, id: 'reaper_destroyer_beam' }, 20)).toBe(20);
  });
  it('gives explicit AU super-vessels their barrier and hull protection', () => {
    expect(isProtectedAuHull(hardened)).toBe(true);
    expect(isProtectedAuHull(regular)).toBe(false);
    const damage = hardcoreReaperBeamDamage(hardcore, shooter, hardened, mainGun, 20);
    expect(damage).toBeGreaterThan(20);
    expect(damage).toBeLessThan(hardened.maxHull);
    expect(isProtectedAuHull({ classId: 'destiny_ascension' })).toBe(false);
  });
  it('keeps Reaper targeting tactical and refuses long empty pursuits', () => {
    const prioritized = hardcoreReaperTargetFactor(hardcore, shooter, scoringTarget, 6, 10);
    expect(prioritized).toBeGreaterThan(1);
    const fleeing = hardcoreReaperTargetFactor(hardcore, shooter, { ...scoringTarget, withdrawing: true }, 40, 10);
    expect(fleeing).toBeLessThan(prioritized / 5);
    expect(hardcoreReaperTargetFactor(canon, shooter, scoringTarget, 6, 10)).toBe(1);
  });
});


import { buildCustomBattle } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';

const duelConfig = (rulesId: string) => buildCustomBattle({
  seed: 9, rulesId, environment: 'deep_space' as const, startingDistanceKm: 30,
  sideA: { faction: 'alliance' as const, name: 'One Alliance dreadnought', formation: 'line_abreast' as const,
    counts: { alliance_dreadnought: 1 } },
  sideB: { faction: 'reaper' as const, name: 'One capital Reaper', formation: 'strike_wedge' as const,
    counts: { reaper_capital: 1 } },
});

describe('real simulated beam hit', () => {
  const fireActualMainGun = (rulesId: string) => {
    const sim = new BattleSimulation(duelConfig(rulesId));
    const target = sim.ships.find(s => s.faction === 'alliance')!;
    const reaper = sim.ships.find(s => s.faction === 'reaper')!;
    const beam = reaper.weapons.find(w => w.def.id === 'reaper_capital_beam')!;
    target.pos = { x: 0, y: 0, z: 0 };
    target.prevPos = { ...target.pos };
    reaper.pos = { x: 0, y: 0, z: 1.5 };
    reaper.prevPos = { ...reaper.pos };
    reaper.heading = { x: 0, y: 0, z: -1 };
    reaper.prevHeading = { ...reaper.heading };
    beam.beamRemaining = .5;
    beam.beamTargetId = target.id;
    beam.beamHit = true;
    sim.step();
    return { sim, target, reaper };
  };
  it('destroys an unprotected organic dreadnought through the normal combat events', () => {
    const { sim, target } = fireActualMainGun('reaper_hardcore');
    expect(target.alive).toBe(false);
    expect(sim.events.some(e => e.type === 'ship_destroyed' && e.shipId === target.id)).toBe(true);
  });
  it('keeps ordinary canon beam damage unchanged', () => {
    const { target } = fireActualMainGun('canon_me3');
    expect(target.alive).toBe(true);
  });
});
