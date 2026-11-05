import { isCrossoverFaction, isMassEffectFaction, isSandboxFaction, type ShipClassDef } from '@/data/types';
import { SHIP_CLASSES } from '@/data/ships';
import type { BattleConfig } from '@/simulation/types';
import type { RuleSet } from './rules';

export const isShipAllowedInRules = (ship: ShipClassDef, rules: RuleSet): boolean =>
  !rules.strictLore || (isMassEffectFaction(ship.faction) && ship.designProvenance.provenance !== 'AU_MODIFIED');

/** Validate at the simulation boundary too: saved/hand-built configs must not
 * bypass the roster restriction merely by avoiding the builder screen. */
export function assertLoreCompatible(config: BattleConfig): void {
  if (config.rules.category === 'canon' && config.fleets.some(f => isCrossoverFaction(f.faction))) {
    throw new Error('Crossover fleets require an AU timeline. Choose Multiverse Crossover — Sandbox.');
  }
  if (config.rules.category === 'canon' && config.fleets.some(f => isSandboxFaction(f.faction))) {
    throw new Error('Historical and generated fleets require an AU timeline. Choose an AU Worlds profile.');
  }
  if (!config.rules.strictLore) return;
  if (config.alternateHistory) throw new Error('Strict Lore excludes alternate-history scenarios. Choose a canon scenario or an AU timeline.');
  for (const fleet of config.fleets) {
    if (isCrossoverFaction(fleet.faction)) throw new Error('Strict Lore excludes crossover factions. Choose Multiverse Crossover instead.');
    for (const group of fleet.ships) {
      const ship = SHIP_CLASSES[group.classId];
      if (group.count > 0 && ship && !isShipAllowedInRules(ship, config.rules)) {
        throw new Error(`Strict Lore excludes ${ship.name}. Choose an AU timeline to field this hull.`);
      }
    }
  }
}
