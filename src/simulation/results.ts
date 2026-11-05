import { getShipClass } from '@/data/ships';
import type { FactionId } from '@/data/types';
import type { BattleSimulation } from './battle';
import type { BattleResult, Side, SideSummary } from './types';

const isCapital = (role: string): boolean => role === 'dreadnought' || role === 'carrier' || role === 'reaper_capital';

export function summariseSide(sim: BattleSimulation, side: Side): SideSummary {
  const ships = sim.ships.filter((s) => s.side === side);
  const factions = [...new Set(ships.map((s) => s.faction))] as FactionId[];
  const combat = ships.filter((s) => s.role !== 'fighter');
  const destroyed = combat.filter((s) => !s.alive);
  const lossesByClass: SideSummary['lossesByClass'] = {};
  for (const s of ships) {
    const e = (lossesByClass[s.classId] ??= { deployed: 0, lost: 0, name: getShipClass(s.classId).name });
    e.deployed++;
    if (!s.alive) e.lost++;
  }
  const pointsDeployed = combat.reduce((a, s) => a + s.pointValue, 0);
  const pointsLost = destroyed.reduce((a, s) => a + s.pointValue, 0);
  const damageDealt = ships.reduce((a, s) => a + s.stats.damageDealt, 0);
  const damageTaken = ships.reduce((a, s) => a + s.stats.damageTaken, 0);
  return {
    side,
    factions,
    deployed: combat.length,
    destroyed: destroyed.length,
    survivors: combat.length - destroyed.length,
    capitalDeployed: combat.filter((s) => isCapital(s.role)).length,
    capitalLost: destroyed.filter((s) => isCapital(s.role)).length,
    reaperCapitalLost: destroyed.filter((s) => s.role === 'reaper_capital').length,
    reaperDestroyersLost: destroyed.filter((s) => s.role === 'reaper_destroyer').length,
    damageDealt,
    damageTaken,
    shotsFired: ships.reduce((a, s) => a + s.stats.shotsFired, 0),
    hits: ships.reduce((a, s) => a + s.stats.hits, 0),
    pointsDeployed,
    pointsLost,
    survivalPercent: pointsDeployed > 0 ? (100 * (pointsDeployed - pointsLost)) / pointsDeployed : 0,
    tacticalEffectiveness: pointsLost > 0 ? damageDealt / pointsLost : damageDealt,
    lossesByClass,
  };
}

export function summarise(sim: BattleSimulation): BattleResult {
  const endEvent = [...sim.events].reverse().find((e) => e.type === 'battle_end');
  const winner = endEvent && endEvent.type === 'battle_end' ? endEvent.winner : 'draw';
  const reason = endEvent && endEvent.type === 'battle_end' ? endEvent.reason : 'In progress';
  const perspective = sim.config.perspectiveSide;
  const outcome = winner === 'draw' ? 'draw' : winner === perspective ? 'victory' : 'defeat';
  return {
    configId: sim.config.id,
    scenarioId: sim.config.scenarioId,
    rulesId: sim.rules.id,
    rulesName: sim.rules.name,
    seed: sim.config.seed,
    duration: sim.time,
    winner,
    reason,
    perspectiveSide: perspective,
    outcome,
    sides: { A: summariseSide(sim, 'A'), B: summariseSide(sim, 'B') },
    eventCount: sim.events.length,
    objectiveCompleted: outcome === 'victory',
  };
}
