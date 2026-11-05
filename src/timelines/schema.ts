import {
  CANON_FLEETS,
  CANON_SPECIAL,
  CANON_STRATEGIC,
  CANON_TECH,
  TECH_KEYS,
  type FleetStrength,
  type RuleSet,
  type SpecialTechnology,
  type StrategicVariables,
  type TechModifiers,
} from './rules';
import { CROSSOVER_FACTION_IDS, SANDBOX_FACTION_IDS } from '@/data/types';

/**
 * Validation for imported rule sets. Imports are JSON data only; nothing is
 * executed. Unknown keys are dropped, missing keys fall back to canon
 * values, and numeric values are clamped to documented ranges.
 */

export interface ValidationResult {
  ok: boolean;
  rules?: RuleSet;
  errors: string[];
  warnings: string[];
}

const FACTION_IDS = ['alliance', 'turian', 'asari', 'salarian', 'quarian', 'geth', 'cerberus', 'reaper'] as const;

export const TECH_RANGE: Record<keyof TechModifiers, [number, number]> = {
  massAcceleratorDamage: [0.1, 10],
  massAcceleratorPenetration: [0.1, 5],
  massAcceleratorRange: [0.3, 3],
  fireRate: [0.2, 4],
  heatCapacity: [0.3, 4],
  kineticBarrierStrength: [0.05, 10],
  barrierRegen: [0, 10],
  armourStrength: [0.1, 10],
  hullIntegrity: [0.1, 10],
  speed: [0.3, 3],
  sensors: [0.3, 3],
  electronicWarfare: [0, 3],
  accuracy: [0.3, 1.6],
  fighterStrength: [0.1, 5],
  torpedoDamage: [0.1, 5],
  gardianEffectiveness: [0, 5],
  beamDamage: [0.1, 10],
  crewQuality: [0.3, 2],
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function num(v: unknown, fallback: number, range: [number, number], path: string, warnings: string[]): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    if (v !== undefined) warnings.push(`${path}: expected number, using ${fallback}`);
    return fallback;
  }
  const clamped = Math.min(range[1], Math.max(range[0], v));
  if (clamped !== v) warnings.push(`${path}: ${v} clamped to ${clamped}`);
  return clamped;
}

function bool(v: unknown, fallback: boolean, path: string, warnings: string[]): boolean {
  if (typeof v !== 'boolean') {
    if (v !== undefined) warnings.push(`${path}: expected boolean, using ${fallback}`);
    return fallback;
  }
  return v;
}

function str(v: unknown, fallback: string, max = 2000): string {
  return typeof v === 'string' ? v.slice(0, max) : fallback;
}

function techFrom(v: unknown, path: string, warnings: string[], partial = false): TechModifiers | Partial<TechModifiers> {
  const src = isObj(v) ? v : {};
  const out: Partial<TechModifiers> = {};
  for (const k of TECH_KEYS) {
    if (partial && src[k] === undefined) continue;
    out[k] = num(src[k], CANON_TECH[k], TECH_RANGE[k], `${path}.${k}`, warnings);
  }
  return out;
}

export function validateRuleSet(input: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObj(input)) {
    return { ok: false, errors: ['Rule set must be a JSON object'], warnings };
  }
  const id = str(input.id, 'imported', 64).replace(/[^a-zA-Z0-9_-]/g, '_');
  const name = str(input.name, 'Imported Timeline', 80);
  if (!name.trim()) errors.push('name must not be empty');
  const category = input.category === 'canon' || input.category === 'au' ? input.category : 'custom';
  if (input.category === 'canon' && id !== 'canon_me3') {
    warnings.push('Imported rule sets cannot claim canon status; marked as custom.');
  }

  const organic = techFrom(input.organic, 'organic', warnings) as TechModifiers;
  const reaper = techFrom(input.reaper, 'reaper', warnings) as TechModifiers;

  const factionOverrides: RuleSet['factionOverrides'] = {};
  if (isObj(input.factionOverrides)) {
    for (const [k, v] of Object.entries(input.factionOverrides)) {
      if (!([...FACTION_IDS, ...CROSSOVER_FACTION_IDS, ...SANDBOX_FACTION_IDS] as readonly string[]).includes(k)) {
        warnings.push(`factionOverrides.${k}: unknown faction ignored`);
        continue;
      }
      factionOverrides[k as keyof RuleSet['factionOverrides']] = techFrom(v, `factionOverrides.${k}`, warnings, true);
    }
  }

  const sp = isObj(input.special) ? input.special : {};
  const thanix = sp.thanixAvailability;
  const special: SpecialTechnology = {
    hyperMassAccelerators: bool(sp.hyperMassAccelerators, CANON_SPECIAL.hyperMassAccelerators, 'special.hyperMassAccelerators', warnings),
    hadesRounds: bool(sp.hadesRounds, CANON_SPECIAL.hadesRounds, 'special.hadesRounds', warnings),
    thanixAvailability: thanix === 'canon' || thanix === 'fleetwide' || thanix === 'none' ? thanix : 'canon',
    reaperCommandVulnerability: bool(sp.reaperCommandVulnerability, false, 'special.reaperCommandVulnerability', warnings),
    indoctrinationDisabled: bool(sp.indoctrinationDisabled, false, 'special.indoctrinationDisabled', warnings),
  };

  const fs = isObj(input.fleetStrength) ? input.fleetStrength : {};
  const fleetStrength = { ...CANON_FLEETS } as FleetStrength;
  for (const f of FACTION_IDS) {
    fleetStrength[f] = num(fs[f], 1, [0, 5], `fleetStrength.${f}`, warnings);
  }

  const st = isObj(input.strategic) ? input.strategic : {};
  const stance = st.cerberusStance;
  const strategic: StrategicVariables = {
    alliedCoordination: num(st.alliedCoordination, CANON_STRATEGIC.alliedCoordination, [0, 1], 'strategic.alliedCoordination', warnings),
    reaperCompetence: num(st.reaperCompetence, 1, [0.5, 1.5], 'strategic.reaperCompetence', warnings),
    indoctrinationEffectiveness: num(st.indoctrinationEffectiveness, 1, [0, 2], 'strategic.indoctrinationEffectiveness', warnings),
    reaperReinforcements: num(st.reaperReinforcements, 1, [0, 4], 'strategic.reaperReinforcements', warnings),
    conventionalVictoryPossible: bool(st.conventionalVictoryPossible, false, 'strategic.conventionalVictoryPossible', warnings),
    crucibleAvailable: bool(st.crucibleAvailable, true, 'strategic.crucibleAvailable', warnings),
    shepardAlive: bool(st.shepardAlive, true, 'strategic.shepardAlive', warnings),
    shepardEffectiveness: num(st.shepardEffectiveness, 1, [0, 2], 'strategic.shepardEffectiveness', warnings),
    illusiveManIndoctrinated: bool(st.illusiveManIndoctrinated, true, 'strategic.illusiveManIndoctrinated', warnings),
    cerberusStance:
      stance === 'hostile' || stance === 'neutral' || stance === 'cooperative' || stance === 'controls_reapers'
        ? stance
        : 'hostile',
    harbingerOperational: bool(st.harbingerOperational, true, 'strategic.harbingerOperational', warnings),
    catalystOperational: bool(st.catalystOperational, true, 'strategic.catalystOperational', warnings),
    homeworldIndependence: bool(st.homeworldIndependence, false, 'strategic.homeworldIndependence', warnings),
    relayIndependentHumanFTL: bool(st.relayIndependentHumanFTL, false, 'strategic.relayIndependentHumanFTL', warnings),
  };

  // Prerequisite consistency.
  if (!strategic.shepardAlive && strategic.shepardEffectiveness > 0) {
    warnings.push('Shepard is dead; shepardEffectiveness forced to 0.');
    strategic.shepardEffectiveness = 0;
  }
  if (strategic.cerberusStance === 'controls_reapers' && strategic.catalystOperational) {
    warnings.push('Cerberus control of the Reapers requires the Catalyst destroyed; catalystOperational forced to false.');
    strategic.catalystOperational = false;
  }
  if (strategic.illusiveManIndoctrinated && strategic.cerberusStance !== 'hostile') {
    warnings.push('An indoctrinated Illusive Man cannot cooperate; cerberusStance forced to hostile.');
    strategic.cerberusStance = 'hostile';
  }

  const historyChanges = Array.isArray(input.historyChanges)
    ? input.historyChanges.filter((x): x is string => typeof x === 'string').map((s) => s.slice(0, 300)).slice(0, 40)
    : [];
  const families = ['human_au', 'historical_au', 'hfy', 'crossover'] as const;
  const family = typeof input.family === 'string' && (families as readonly string[]).includes(input.family)
    ? input.family as RuleSet['family'] : undefined;
  if (input.family !== undefined && !family) warnings.push('family: unknown AU grouping ignored');
  const knownFactions = [...FACTION_IDS, ...CROSSOVER_FACTION_IDS, ...SANDBOX_FACTION_IDS] as const;
  const preferredFaction = typeof input.preferredFaction === 'string' && (knownFactions as readonly string[]).includes(input.preferredFaction)
    ? input.preferredFaction as RuleSet['preferredFaction'] : undefined;
  if (input.preferredFaction !== undefined && !preferredFaction) warnings.push('preferredFaction: unknown faction ignored');

  const rules: RuleSet = {
    id: id === 'canon_me3' || id === 'strict_lore' ? `${id}_imported` : id,
    name,
    tagline: str(input.tagline, '', 160),
    category: category === 'canon' ? 'custom' : category,
    ...(family ? { family } : {}),
    ...(preferredFaction ? { preferredFaction } : {}),
    ...(input.campaignCompatible !== undefined ? { campaignCompatible: bool(input.campaignCompatible, true, 'campaignCompatible', warnings) } : {}),
    description: str(input.description, ''),
    historyChanges,
    organic,
    reaper,
    factionOverrides,
    special,
    fleetStrength,
    strategic,
  };
  return { ok: errors.length === 0, rules: errors.length === 0 ? rules : undefined, errors, warnings };
}

export const exportRuleSet = (rules: RuleSet): string => JSON.stringify(rules, null, 2);

export function importRuleSet(json: string): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return { ok: false, errors: [`Invalid JSON: ${(e as Error).message}`], warnings: [] };
  }
  return validateRuleSet(parsed);
}
