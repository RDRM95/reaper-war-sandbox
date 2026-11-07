import { describe, expect, it } from 'vitest';
import { getPreset } from '@/timelines/presets';
import { hardcoreReaperBeamDamage, hardcoreReaperTargetFactor, isProtectedAuHull } from '@/simulation/reaperHardcore';

const shooter = { faction: 'reaper' as const, role: 'reaper_capital' as const };
const mainGun = { kind: 'reaper_beam' as const, id: 'reaper_capital_beam' };
const regular = { classId: 'alliance_dreadnought', maxHull: 1500, maxBarriers: 800, armour: 450 };
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
