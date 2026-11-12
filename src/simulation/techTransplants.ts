import type { DamageType, FactionId } from '@/data/types';
import type { Side } from './types';

/**
 * Opt-in, non-canonical science-fiction technology transplants.
 *
 * The catalogue is simulation data, independent of ship assets and renderer.
 * A technology may add defensive, offensive or other effect channels later.
 * No base ship definition or timeline preset is changed.
 */
export type TechTransplantTarget = 'all_organics' | 'side_a_organics' | 'side_b_organics';

export interface DefenseTransplant {
  /** Residual hull damage from exposed equipment, thermal load and imperfect coverage. */
  hullDamageFactor: Readonly<Record<DamageType, number>>;
  /** Probability factor for an exposed subsystem hit, scaled by pre-mitigation impact. */
  subsystemChanceScale: number;
  /** Fraction of the pre-mitigation impact that can damage an exposed subsystem. */
  subsystemDropScale: number;
  /** A shell impact does not imply an interior breach for HADES-style rounds. */
  blocksInternalWarheads: boolean;
  /** Coarse endurance approximation for instant battle reports (not live damage). */
  quickEnduranceMultiplier: number;
}

export interface TechTransplantDefinition {
  id: string;
  name: string;
  source: string;
  description: string;
  defense?: DefenseTransplant;
}

/**
 * Fictionalised gameplay effects, not literal numerical claims about Marvel.
 * True Adamantium prevents ordinary penetration, while Wakandan Vibranium
 * dissipates the transmitted shock. Exposed systems remain vulnerable.
 */
export const TECH_TRANSPLANTS = {
  adamantium_vibranium: {
    id: 'adamantium_vibranium',
    name: 'Adamantium + Vibranium armour',
    source: 'Marvel / experimental crossover',
    description: 'Adamantium plating resists penetration; vibranium absorbs impact and vibration. Engines and exposed systems can still fail.',
    defense: {
      hullDamageFactor: {
        kinetic: 0.015,
        thanix_stream: 0.035,
        laser: 0.12,
        warhead: 0.03,
        reaper_beam: 0.04,
      },
      subsystemChanceScale: 0.08,
      subsystemDropScale: 0.05,
      blocksInternalWarheads: true,
      quickEnduranceMultiplier: 16,
    },
  },
} as const satisfies Record<string, TechTransplantDefinition>;

export type TechTransplantId = keyof typeof TECH_TRANSPLANTS;

export interface TechTransplantConfig {
  enabled: boolean;
  id: TechTransplantId;
  target: TechTransplantTarget;
}

/** Only Mass Effect organic fleets receive this upgrade. Geth and Reapers do not. */
export function eligibleForTransplant(faction: FactionId, side: Side, config?: TechTransplantConfig): boolean {
  if (!config?.enabled) return false;
  if (config.target === 'side_a_organics' && side !== 'A') return false;
  if (config.target === 'side_b_organics' && side !== 'B') return false;
  return faction === 'alliance' || faction === 'turian' || faction === 'asari' ||
    faction === 'salarian' || faction === 'quarian' || faction === 'cerberus';
}

export function defenseTransplantFor(
  config: TechTransplantConfig | undefined,
  faction: FactionId,
  side: Side,
): DefenseTransplant | undefined {
  if (!eligibleForTransplant(faction, side, config)) return undefined;
  return TECH_TRANSPLANTS[config!.id]?.defense;
}

/** Canon damage remains bit-for-bit unchanged when the mode is switched off. */
export function transplantedHullDamage(defense: DefenseTransplant, damageType: DamageType, afterBarrier: number): number {
  return Math.max(0, afterBarrier) * defense.hullDamageFactor[damageType];
}
