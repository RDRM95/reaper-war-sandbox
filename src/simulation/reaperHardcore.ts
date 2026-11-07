import type { RuleSet, EffectiveWeapon } from '@/timelines/rules';
import type { ShipState } from './types';

/** Only purpose-built alternate-universe command/hardening vessels can
 * withstand a main-gun strike in the explicitly enabled Hardcore preset.
 * Ordinary dreadnoughts (including Destiny Ascension) do not qualify. */
const PROTECTED_AU_HULLS = new Set([
  'normandy_valkyrie', 'alliance_super_dreadnought', 'turian_super_dreadnought',
  'alliance_omaha', 'alliance_aegis_command', 'alliance_valkyrie',
]);

export function isProtectedAuHull(ship: Pick<ShipState,'classId'>): boolean {
  return PROTECTED_AU_HULLS.has(ship.classId);
}

export function isHardcoreReaperMainGun(
  rules: Pick<RuleSet,'special'>,
  shooter: Pick<ShipState,'faction'|'role'>,
  weapon: Pick<EffectiveWeapon,'kind'|'id'>,
): boolean {
  return !!rules.special.reaperHardcore && shooter.faction === 'reaper' &&
    shooter.role === 'reaper_capital' && weapon.kind === 'reaper_beam' &&
    weapon.id === 'reaper_capital_beam';
}

/** Called only for an actual, successfully aimed, non-glancing capital beam
 * contact. It does not change accuracy, firing arcs, cooldowns or hit rolls.
 * Nonprotected conventional hulls are destroyed via the usual damage pipeline
 * and thus still produce authoritative destruction events and visuals.
 * Hardened AU hulls use the existing damage model, capped at a heavy but
 * survivable fraction of their durability per simulation tick. */
export function hardcoreReaperBeamDamage(
  rules: Pick<RuleSet,'special'>,
  shooter: Pick<ShipState,'faction'|'role'>,
  target: Pick<ShipState,'classId'|'maxHull'|'maxBarriers'|'armour'>,
  weapon: Pick<EffectiveWeapon,'kind'|'id'>,
  normalDamage: number,
): number {
  if (!isHardcoreReaperMainGun(rules, shooter, weapon)) return normalDamage;
  if (isProtectedAuHull(target)) {
    return Math.min(normalDamage * 2.5,
      Math.max(1, (target.maxHull + target.maxBarriers) * 0.018));
  }
  return Math.max(normalDamage,
    target.maxHull * 24 + target.maxBarriers * 16 + target.armour * 12 + 100);
}

/** Reaper tactics: disable orbital guns/command ships, then collapse the
 * capital line. This affects target selection only, never forces kills or
 * invented manoeuvres. Long-range fleeing contacts do not draw the capital
 * battle group into a featureless pursuit. */
export function hardcoreReaperTargetFactor(
  rules: Pick<RuleSet,'special'>,
  shooter: Pick<ShipState,'faction'|'role'>,
  target: Pick<ShipState,'role'|'classId'|'withdrawing'> & { stats: Pick<ShipState['stats'],'damageDealt'> },
  distanceKm: number,
  effectiveRangeKm: number,
): number {
  if (!rules.special.reaperHardcore || shooter.faction !== 'reaper') return 1;
  const majorGun = shooter.role === 'reaper_capital';
  if (target.withdrawing && distanceKm > effectiveRangeKm * (majorGun ? 1.7 : 2.2)) return 0.08;
  const roleFactor = target.classId.includes('platform') ? 2.8 :
    target.role === 'carrier' ? 2.2 :
    isProtectedAuHull(target) ? 2.0 :
    target.role === 'dreadnought' ? 1.9 :
    target.role === 'cruiser' ? 1.25 : 1;
  const firePowerFactor = 1 + Math.min(0.7, Math.log2(1 + Math.max(0, target.stats.damageDealt)) / 22);
  return roleFactor * firePowerFactor;
}
