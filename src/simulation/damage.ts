import type { Rng } from '@/core/rng';
import { BARRIER_EFFICIENCY } from '@/data/weapons';
import type { EffectiveWeapon } from '@/timelines/rules';
import type { ShipState, Subsystems } from './types';
import { transplantedHullDamage } from './techTransplants';

export interface DamageOutcome {
  /** Damage absorbed by kinetic barriers. */
  barrierDamage: number;
  /** Damage that reached the hull after armour. */
  hullDamage: number;
  /** Barriers reached zero on this hit. */
  barriersCollapsed: boolean;
  /** Subsystem knocked down (if any). */
  subsystem?: { name: keyof Subsystems; level: number };
  destroyed: boolean;
  internalDetonated?: boolean;
  internalWarheadDamage?: number;
}

/**
 * Resolve a quantity of incoming damage against a ship.
 *
 * Kinetic barriers absorb a damage-type dependent fraction of each hit until
 * their capacity is exhausted (slugs: everything; Reaper streams: ~40%;
 * lasers: nothing; slow torpedoes: ~25%). Armour then reduces what passes
 * through by a flat amount scaled by the weapon's penetration, and ablates
 * slowly. The remainder strikes the hull and may disable a subsystem.
 */
export function applyDamage(target: ShipState, raw: number, weapon: EffectiveWeapon, rng: Rng, now: number): DamageOutcome {
  const out: DamageOutcome = { barrierDamage: 0, hullDamage: 0, barriersCollapsed: false, destroyed: false };
  if (!target.alive || raw <= 0) return out;
  target.lastHitAt = now;

  let amount = raw;
  const eff = BARRIER_EFFICIENCY[weapon.damageType] * weapon.barrierEfficiencyMultiplier;
  if (target.barriers > 0 && eff > 0) {
    const absorbed = Math.min(target.barriers, amount * eff);
    target.barriers -= absorbed;
    amount -= absorbed;
    out.barrierDamage = absorbed;
    if (target.barriers <= 0.01) {
      target.barriers = 0;
      out.barriersCollapsed = true;
    }
  }
  if (amount <= 0) return out;

  const exotic = target.defenseTransplant;
  let hullDamage: number;
  if (exotic) {
    // Adamantium prevents ordinary plating penetration and vibranium absorbs
    // transmitted shock. Small residual damage represents heat and vulnerable
    // external equipment, not an adamantium plate being worn away.
    hullDamage = transplantedHullDamage(exotic, weapon.damageType, amount);
  } else {
    const armourEff = target.armour * (1 - weapon.armourBypass);
    const reduction = Math.max(0, armourEff * Math.max(0, 1.2 - weapon.penetration));
    hullDamage = Math.max(amount * 0.15, amount - reduction);
    hullDamage = Math.min(hullDamage, amount);
    // Canonical armour continues to ablate under sustained fire.
    target.armour = Math.max(0, target.armour - hullDamage * 0.002);
  }

  target.hull -= hullDamage;
  out.hullDamage = hullDamage;
  target.stats.damageTaken += hullDamage;

  // Exposed engines, sensors and weapon mounts can still be disabled without
  // penetrating an exotic hull. Canon damage and RNG remain unchanged if off.
  const severity = (exotic ? amount : hullDamage) / Math.max(1, target.maxHull);
  const chance = Math.min(exotic ? 0.18 : 0.6, severity * (exotic?.subsystemChanceScale ?? 4));
  if (severity > 0.03 && rng.chance(chance)) {
    const which = rng.pick(['engines', 'weapons', 'sensors'] as const);
    const drop = Math.min(exotic ? 0.10 : 0.5, severity * (exotic?.subsystemDropScale ?? 3));
    target.subsystems[which] = Math.max(0.1, target.subsystems[which] - drop);
    out.subsystem = { name: which, level: target.subsystems[which] };
  }

  if (target.hull <= 0) {
    target.hull = 0;
    target.alive = false;
    target.destroyedAt = now;
    out.destroyed = true;
  }
  return out;
}

/** A HADES penetrator must first reach the hull. Its reserved warhead then
 * detonates inside, bypassing the exterior barrier/armour. Both stages share
 * the existing shot budget; this is not an extra arbitrary damage multiplier.
 */
export function applyProjectileDamage(target: ShipState, raw: number, weapon: EffectiveWeapon, rng: Rng, now: number): DamageOutcome {
  const fraction = weapon.kind === 'mass_accelerator' ? Math.max(0, Math.min(0.8, weapon.internalWarheadFraction ?? 0)) : 0;
  if (fraction === 0) return applyDamage(target, raw, weapon, rng, now);
  const kinetic = applyDamage(target, raw * (1 - fraction), weapon, rng, now);
  if (kinetic.hullDamage <= 0 || target.defenseTransplant?.blocksInternalWarheads) return kinetic;
  const internal = applyDamage(target, raw * fraction, { ...weapon, damageType: 'warhead', armourBypass: 1, barrierEfficiencyMultiplier: 0 }, rng, now);
  return {
    hullDamage: kinetic.hullDamage + internal.hullDamage,
    barrierDamage: kinetic.barrierDamage,
    barriersCollapsed: kinetic.barriersCollapsed,
    destroyed: kinetic.destroyed || internal.destroyed,
    subsystem: internal.subsystem ?? kinetic.subsystem,
    internalDetonated: true,
    internalWarheadDamage: internal.hullDamage,
  };
}

/**
 * Probability that a shot from `shooter` with `weapon` hits `target` at
 * distance `dist` (km). Combines base accuracy, target profile, range falloff,
 * electronic warfare, crew quality and sensor damage.
 */
export function hitProbability(
  shooter: ShipState,
  target: ShipState,
  weapon: EffectiveWeapon,
  dist: number,
  closingSpeed: number,
): number {
  const rangeFrac = Math.min(1, dist / weapon.range);
  const rangeFactor = 1 - 0.45 * rangeFrac * rangeFrac;
  // Target profile: big slow ships are easy to hit; fighters very hard for capital guns.
  let profile: number;
  if (weapon.antiSmall) {
    profile = Math.min(1.3, 0.55 + target.signature * 1.2);
  } else {
    profile = Math.min(1.6, Math.sqrt(target.signature) * 1.05);
    if (target.role === 'fighter') profile *= 0.08;
  }
  const ecm = 1 - target.ecm * 0.6;
  const crew = 0.75 + 0.3 * shooter.crewQuality;
  const sensors = 0.5 + 0.5 * shooter.subsystems.sensors;
  // Fast-moving targets are harder for slow projectiles.
  const relSpeedPenalty =
    weapon.projectileSpeed === Infinity ? 1 : Math.max(0.55, 1 - closingSpeed / weapon.projectileSpeed);
  const p = weapon.accuracy * rangeFactor * profile * ecm * crew * sensors * relSpeedPenalty;
  return Math.max(0.01, Math.min(0.98, p));
}
