import type { BattleSimulation } from './battle';

/**
 * Reaper strategic assessment, derived from actual simulation state. The
 * Reapers begin every engagement confident: their projections are based on
 * previous harvest cycles. The assessment moves only when the data does.
 */
export interface ReaperAssessment {
  organicTechCapability: number; // 0..1
  organicFleetStrength: number; // fraction of starting value
  reaperLossesFraction: number; // fraction of Reaper value lost
  reaperCapitalLosses: number;
  unexpectedTechnologies: string[];
  militaryCoordination: number; // 0..1
  threatLevel: 'NEGLIGIBLE' | 'LOW' | 'MODERATE' | 'ELEVATED' | 'SEVERE' | 'CRITICAL';
  projectedResistance: string;
  harvestCompletionEstimate: string;
  headline: string;
  lines: string[];
}

export function assessReapers(sim: BattleSimulation): ReaperAssessment {
  const reaperShips = sim.ships.filter((s) => s.faction === 'reaper');
  const organicShips = sim.ships.filter((s) => s.faction !== 'reaper' && s.role !== 'fighter');
  const reaperStart = reaperShips.reduce((a, s) => a + s.pointValue, 0);
  const reaperLost = reaperShips.filter((s) => !s.alive).reduce((a, s) => a + s.pointValue, 0);
  const reaperLossesFraction = reaperStart > 0 ? reaperLost / reaperStart : 0;
  const reaperCapitalLosses = reaperShips.filter((s) => s.role === 'reaper_capital' && !s.alive).length;
  const organicStart = organicShips.reduce((a, s) => a + s.pointValue, 0);
  const organicRemaining = organicShips.filter((s) => s.alive && !s.escaped).reduce((a, s) => a + s.pointValue, 0);
  const organicFleetStrength = organicStart > 0 ? organicRemaining / organicStart : 0;

  // Technology: ratio of hull damage inflicted on Reapers per shot vs canon expectations.
  const organicDamage = organicShips.reduce((a, s) => a + s.stats.damageDealt, 0);
  const organicShots = Math.max(1, organicShips.reduce((a, s) => a + s.stats.shotsFired, 0));
  const dmgPerShot = organicDamage / organicShots;
  const organicTechCapability = Math.max(0, Math.min(1, dmgPerShot / 900));

  const unexpected: string[] = [];
  const rules = sim.rules;
  if (rules.special.hyperMassAccelerators) unexpected.push('Hyper-mass accelerator signatures exceeding all archived organic weapon yields.');
  if (rules.special.hadesRounds) unexpected.push('Penetrator rounds defeating hull plating at anomalous rates.');
  if (rules.special.thanixAvailability === 'fleetwide') unexpected.push('Widespread deployment of weapons derived from our own technology.');
  if (rules.organic.kineticBarrierStrength > 1.3) unexpected.push('Barrier capacity above projected organic capability.');
  if (rules.special.reaperCommandVulnerability) unexpected.push('Command network degradation following capital unit loss.');
  if (unexpected.length === 0 && organicTechCapability > 0.5) unexpected.push('Weapon effectiveness above archived projections.');

  const coordination = Math.max(0, Math.min(1, rules.strategic.alliedCoordination * 0.6 + (organicShots > 50 ? 0.3 : 0.1)));

  let threatLevel: ReaperAssessment['threatLevel'] = 'NEGLIGIBLE';
  const score = reaperLossesFraction * 3 + reaperCapitalLosses * 0.6 + organicTechCapability * 0.8 + (organicFleetStrength > 0.6 && sim.time > 60 ? 0.5 : 0);
  if (score > 3.2) threatLevel = 'CRITICAL';
  else if (score > 2.2) threatLevel = 'SEVERE';
  else if (score > 1.3) threatLevel = 'ELEVATED';
  else if (score > 0.7) threatLevel = 'MODERATE';
  else if (score > 0.3) threatLevel = 'LOW';

  const lines: string[] = [];
  let headline: string;
  if (reaperCapitalLosses === 0 && reaperLossesFraction < 0.05) {
    headline = 'HARVEST RESISTANCE WITHIN EXPECTED PARAMETERS.';
  } else if (reaperCapitalLosses === 0) {
    headline = 'MINOR UNIT LOSSES RECORDED. HARVEST PROCEEDING.';
  } else if (reaperCapitalLosses < 2) {
    headline = 'CAPITAL UNIT LOSS RECORDED. ANOMALY UNDER EVALUATION.';
  } else if (reaperLossesFraction < 0.5) {
    headline = 'CAPITAL UNIT LOSSES EXCEED HISTORICAL PROJECTIONS.';
  } else {
    headline = 'ORGANIC MILITARY DEVELOPMENT REQUIRES STRATEGIC RE-EVALUATION.';
  }
  lines.push(`Organic fleet strength: ${(organicFleetStrength * 100).toFixed(0)}% of initial deployment.`);
  lines.push(`Harvest fleet losses: ${(reaperLossesFraction * 100).toFixed(0)}% of committed force value.`);
  if (reaperCapitalLosses > 0) lines.push(`Capital units destroyed: ${reaperCapitalLosses}.`);
  lines.push(`Organic weapon effectiveness index: ${(organicTechCapability * 100).toFixed(0)}.`);
  if (sim.finished && sim.result) {
    const reaperSide = reaperShips[0]?.side;
    if (reaperSide && sim.result.winner === reaperSide) lines.push('Engagement concluded. Resistance eliminated.');
    else if (sim.result.winner === 'draw') lines.push('Engagement inconclusive. Reassessment required.');
    else lines.push('Engagement lost. This outcome has no precedent in archived cycles.');
  }

  let projectedResistance: string;
  if (threatLevel === 'NEGLIGIBLE' || threatLevel === 'LOW') projectedResistance = 'Organic fleets will be eliminated within projected timeframe.';
  else if (threatLevel === 'MODERATE') projectedResistance = 'Organic fleets inflict measurable attrition. Additional units may be required.';
  else if (threatLevel === 'ELEVATED') projectedResistance = 'Organic fleets threaten capital units. Tactical adaptation initiated.';
  else projectedResistance = 'Organic fleets capable of defeating harvest forces in open engagement.';

  let harvest: string;
  if (threatLevel === 'NEGLIGIBLE') harvest = 'Harvest of this system: within one cycle-standard interval.';
  else if (threatLevel === 'LOW' || threatLevel === 'MODERATE') harvest = 'Harvest of this system: delayed. Reinforcement unnecessary.';
  else if (threatLevel === 'ELEVATED') harvest = 'Harvest of this system: delayed. Reinforcement advisable.';
  else harvest = 'Harvest of this system: cannot be completed with committed forces.';

  return {
    organicTechCapability,
    organicFleetStrength,
    reaperLossesFraction,
    reaperCapitalLosses,
    unexpectedTechnologies: unexpected,
    militaryCoordination: coordination,
    threatLevel,
    projectedResistance,
    harvestCompletionEstimate: harvest,
    headline,
    lines,
  };
}
