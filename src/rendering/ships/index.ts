import * as THREE from 'three';
import { buildAllianceCarrier, buildAllianceCruiser, buildAllianceDreadnought, buildAllianceFighter, buildAllianceFrigate, buildAllianceOmaha } from './alliance';
import { buildAsariCruiser, buildAsariDreadnought, buildDestinyAscension } from './asari';
import { buildCerberusCruiser, buildCerberusDreadnought, buildCerberusFighter, buildCerberusFrigate } from './cerberus';
import { buildGethCruiser, buildGethDreadnought, buildGethFighter, buildGethFrigate } from './geth';
import { buildQuarianCruiser, buildQuarianFighter, buildQuarianHeavy, buildQuarianLiveship } from './quarian';
import { buildHarbinger, buildReaperCapital, buildReaperDestroyer } from './reaper';
import { buildSalarianCruiser, buildSalarianDreadnought, buildSalarianFighter, buildStgFrigate } from './salarian';
import { buildTurianCruiser, buildTurianDreadnought, buildTurianFighter, buildTurianFrigate } from './turian';
import type { BuiltShip } from './types';
import { buildChaosDesolator, buildChaosMurder, buildCovenantCas, buildCovenantCcs, buildImperiumLunar, buildImperiumRetribution, buildUnscInfinity, buildUnscMarathon } from './crossover';
import { buildPastCycleCruiser, buildPastCycleDreadnought, buildPlayerCivCruiser, buildPlayerCivDreadnought, buildProtheanCruiser, buildProtheanDreadnought, buildSkynetHarvester, buildSkynetHunter } from './auHumanity';

export type { BuiltShip } from './types';

const BUILDERS: Record<string, () => BuiltShip> = {
  alliance_dreadnought: buildAllianceDreadnought,
  alliance_omaha: buildAllianceOmaha,
  alliance_carrier: buildAllianceCarrier,
  alliance_cruiser: buildAllianceCruiser,
  alliance_frigate: () => buildAllianceFrigate(false),
  alliance_frigate_thanix: () => buildAllianceFrigate(true),
  alliance_fighter: buildAllianceFighter,
  turian_dreadnought: buildTurianDreadnought,
  turian_cruiser: buildTurianCruiser,
  turian_frigate: buildTurianFrigate,
  turian_fighter: buildTurianFighter,
  asari_dreadnought: buildAsariDreadnought,
  asari_cruiser: buildAsariCruiser,
  destiny_ascension: buildDestinyAscension,
  salarian_dreadnought: buildSalarianDreadnought,
  salarian_cruiser: buildSalarianCruiser,
  salarian_frigate: buildStgFrigate,
  salarian_fighter: buildSalarianFighter,
  cerberus_dreadnought: buildCerberusDreadnought,
  cerberus_cruiser: buildCerberusCruiser,
  cerberus_frigate: buildCerberusFrigate,
  cerberus_fighter: buildCerberusFighter,
  geth_dreadnought: buildGethDreadnought,
  geth_cruiser: buildGethCruiser,
  geth_frigate: buildGethFrigate,
  geth_fighter: buildGethFighter,
  quarian_liveship: buildQuarianLiveship,
  quarian_heavy: buildQuarianHeavy,
  quarian_cruiser: buildQuarianCruiser,
  quarian_fighter: buildQuarianFighter,
  reaper_capital: buildReaperCapital,
  reaper_destroyer: buildReaperDestroyer,
  harbinger: buildHarbinger,
  unsc_marathon: buildUnscMarathon,
  unsc_infinity: buildUnscInfinity,
  covenant_ccs: buildCovenantCcs,
  covenant_cas: buildCovenantCas,
  imperium_lunar: buildImperiumLunar,
  imperium_retribution: buildImperiumRetribution,
  chaos_murder: buildChaosMurder,
  chaos_desolator: buildChaosDesolator,
  prothean_cruiser: buildProtheanCruiser,
  prothean_dreadnought: buildProtheanDreadnought,
  past_cycle_cruiser: buildPastCycleCruiser,
  past_cycle_dreadnought: buildPastCycleDreadnought,
  player_civ_cruiser: buildPlayerCivCruiser,
  player_civ_dreadnought: buildPlayerCivDreadnought,
  skynet_hunter: buildSkynetHunter,
  skynet_harvester: buildSkynetHarvester,
};

/** Cache of template groups per class; instances are cloned (sharing geometry). */
const templates = new Map<string, BuiltShip>();

export function getShipTemplate(classId: string): BuiltShip {
  let t = templates.get(classId);
  if (!t) {
    const builder = BUILDERS[classId];
    if (!builder) throw new Error(`No ship model builder for ${classId}`);
    t = builder();
    templates.set(classId, t);
  }
  return t;
}

export function instantiateShip(classId: string): BuiltShip {
  const t = getShipTemplate(classId);
  const group = t.group.clone(true);
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).matrixAutoUpdate = true;
  });
  return { ...t, group, engineNodes: t.engineNodes.map((v) => v.clone()), muzzle: t.muzzle?.clone() };
}

export const hasModel = (classId: string): boolean => classId in BUILDERS;
export const MODELLED_CLASS_IDS = Object.keys(BUILDERS);
