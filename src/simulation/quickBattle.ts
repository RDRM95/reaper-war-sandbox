import { SHIP_CLASSES } from '@/data/ships';
import { WEAPONS } from '@/data/weapons';
import { applyRulesToShip, applyRulesToWeapon, cloneRules } from '@/timelines/rules';
import type { BattleConfig, BattleResult, SideSummary, Side } from './types';

/**
 * Fast aggregate force-on-force estimator. No BattleSimulation instance,
 * no ship allocations, physics, projectiles, combat ticks, graphics or RNG.
 * This is deliberately an approximate Lanchester-strength calculation,
 * NOT a substitute for deterministic replay or the 20 Hz battle results.
 */
export interface QuickBattleReport {
  method: 'aggregate-estimate-v1';
  approximate: true;
  battle: BattleResult;
  shipsAnalysed: number;
  power: Record<Side, number>;
  defence: Record<Side, number>;
  predictedDecisiveSeconds: number;
  warnings: string[];
}
interface ClassGroup {
  classId: string; name: string; count: number; side: Side;
  power: number; endurance: number; pointValue: number;
  role: string;
}
const safe = (n: number): number => Number.isFinite(n) && n > 0 ? n : 0;
const clamp = (v: number, a = 0, b = 1): number => Math.max(a, Math.min(b, v));
const isCapital = (r: string): boolean => r === 'dreadnought' || r === 'carrier' || r === 'reaper_capital';
const empty = (side: Side): SideSummary => ({
  side, factions: [], deployed: 0, destroyed: 0, survivors: 0,
  capitalDeployed: 0, capitalLost: 0, reaperCapitalLost: 0, reaperDestroyersLost: 0,
  damageDealt: 0, damageTaken: 0, shotsFired: 0, hits: 0,
  pointsDeployed: 0, pointsLost: 0, survivalPercent: 0,
  tacticalEffectiveness: 0, lossesByClass: {}
});

function weight(group: ClassGroup): number {
  // Small escorts are exposed before the battle line; strong shields resist.
  const vulnerability = group.role === 'fighter' ? 1.9 :
    group.role === 'frigate' ? 1.45 : group.role === 'cruiser' ? 1.15 :
    group.role === 'reaper_destroyer' ? 1.25 : group.role === 'carrier' ? 0.8 : 0.7;
  return group.count * vulnerability / Math.sqrt(Math.max(1, group.endurance));
}

/** Allocate an expected casualty total over classes, preserving integer rosters. */
function classLosses(groups: ClassGroup[], total: number): Map<ClassGroup, number> {
  const result = new Map(groups.map(g => [g, 0]));
  let remaining = clamp(Math.round(total), 0, groups.reduce((n,g)=>n+g.count,0));
  let active = groups.filter(g => g.count > 0);
  while (remaining > 0 && active.length) {
    const sum = active.reduce((n,g)=>n+weight(g),0);
    if(sum<=0)break;
    const fragments = active.map(g => {
      const capacity=g.count-(result.get(g)??0);
      const exact=remaining*weight(g)/sum;
      return {g,capacity,floor:Math.min(capacity,Math.floor(exact)),fraction:exact%1};
    });
    let awarded=0;
    for (const row of fragments) { result.set(row.g,(result.get(row.g)??0)+row.floor);awarded+=row.floor; }
    let leftover=remaining-awarded;
    fragments.sort((a,b)=>b.fraction-a.fraction||a.g.classId.localeCompare(b.g.classId));
    for(const row of fragments) {
      if(leftover<=0)break;
      if(row.g.count>(result.get(row.g)??0)){result.set(row.g,(result.get(row.g)??0)+1);leftover--;}
    }
    const used=remaining-leftover;
    if(used===0)break;
    remaining=leftover;
    active=active.filter(g=>g.count>(result.get(g)??0));
  }
  return result;
}

export function resolveQuickBattle(config: BattleConfig): QuickBattleReport {
  const groups: ClassGroup[]=[];
  const warnings: string[]=[
    'Aggregate estimate, not a simulated combat result; individual targeting, missile interception and battlefield manoeuvres are omitted.',
    'Losses, hit counts and duration are approximate and should not be compared directly with the 20 Hz battle replay.'
  ];
  for (const fleet of config.fleets) {
    // Mirror BattleSimulation.rulesFor: fleet-specific AU technology overrides
    // must affect the numerical solver as well as full combat.
    const rules=fleet.techOverride?cloneRules(config.rules):config.rules;
    if(fleet.techOverride)rules.factionOverrides[fleet.faction]={
      ...(rules.factionOverrides[fleet.faction]??{}),...fleet.techOverride
    };
    for (const spec of fleet.ships) {
      const count=Math.max(0,Math.floor(spec.count));
      if (!count)continue;
      const cls=SHIP_CLASSES[spec.classId];
      if (!cls)throw new Error('Unknown ship class in quick resolver: '+spec.classId);
      if (cls.faction!==fleet.faction)throw new Error('Fleet/class faction mismatch: '+spec.classId);
      const stats=applyRulesToShip(cls,rules);
      let damagePerSecond=0;
      let shotsPerSecond=0;
      for(const hp of cls.hardpoints){
        const base=WEAPONS[hp.weaponId];
        if(!base)throw new Error('Unknown hardpoint weapon: '+hp.weaponId);
        const w=applyRulesToWeapon(base,fleet.faction,cls,rules,WEAPONS);
        // Forward firing opportunities + weapon range, not arbitrary fire every tick.
        const arc=clamp(w.arc/160,0.28,1);
        const beams=w.beamDuration??1;
        const hit=clamp(w.accuracy * stats.crewQuality * (1-stats.ecm*0.1),0.12,.95);
        const effectiveHit=w.antiSmall ? .22 : hit;
        const capacity=w.magazine===undefined?1:clamp(w.magazine/Math.max(1,config.maxDuration/w.cooldown),.25,1);
        const pdDiscount=w.antiSmall ? .2 : 1;
        const firingRate=hp.count/Math.max(0.1,w.cooldown);
        damagePerSecond+=safe(w.damage)*beams*firingRate*arc*effectiveHit*pdDiscount*capacity*
          (w.damageType==='kinetic'?0.78:w.damageType==='warhead'?0.9:1);
        shotsPerSecond+=firingRate*arc*capacity;
      }
      // Barriers are vulnerable to different energy types, but cannot be
      // assigned a unique opposing weapon during a fast analytical estimate.
      const endurance=Math.max(1,stats.hull+stats.armour*5+stats.barriers*0.82);
      groups.push({classId:cls.id,name:cls.name,count,side:fleet.side,
        power:damagePerSecond*count,
        endurance:Math.max(1,endurance),pointValue:cls.pointValue,role:cls.role});
    }
  }
  const bySide=(side:Side)=>groups.filter(g=>g.side===side);
  const A=bySide('A'),B=bySide('B');
  const totals=(rows:ClassGroup[])=>({
    ships:rows.reduce((n,g)=>n+g.count,0),
    power:rows.reduce((n,g)=>n+g.power,0),
    defence:rows.reduce((n,g)=>n+g.endurance*g.count,0)
  });
  const ta=totals(A),tb=totals(B);
  if(!ta.ships || !tb.ships)warnings.push('One side has no vessels; the estimate is an automatic no-op.');
  // Continuous strength approximation, akin to Lanchester square law.
  // Avoid a per-ship or per-tick loop even for multi-million-ship rosters.
  const sa=Math.sqrt(Math.max(0,ta.power*ta.defence));
  const sb=Math.sqrt(Math.max(0,tb.power*tb.defence));
  const stronger:Side=sa>=sb?'A':'B';
  const ratio=Math.min(sa,sb)/Math.max(1,sa,sb);
  const margin=Math.sqrt(Math.max(0,1-ratio*ratio));
  const weaker=stronger==='A'?tb:ta;
  const winner=stronger==='A'?ta:tb;
  const openingDelay=Math.max(0,Math.max(0,...config.fleets.map(f=>f.arrivalTime??0))*0.2);
  const decisive=Math.max(10,weaker.defence/Math.max(1,winner.power))*1.25+openingDelay;
  const engagement=clamp(config.maxDuration/Math.max(1,decisive));
  const decisiveReached=engagement>=0.999;
  const remainingWinner=clamp((1-engagement)+engagement*margin);
  const remainingLoser=clamp(1-engagement);
  const lossesA=ta.ships*(1-(stronger==='A'?remainingWinner:remainingLoser));
  const lossesB=tb.ships*(1-(stronger==='B'?remainingWinner:remainingLoser));
  const casualtyCounts={A:classLosses(A,lossesA),B:classLosses(B,lossesB)};
  const elapsed=Math.min(config.maxDuration,decisive);
  const summaries={A:empty('A'),B:empty('B')};
  for(const side of ['A','B'] as Side[]){
    const summary=summaries[side];
    const rows=bySide(side), enemy=side==='A'?summaries.B:summaries.A;
    const factions=config.fleets.filter(f=>f.side===side).map(f=>f.faction);
    summary.factions=[...new Set(factions)];
    for(const g of rows){
      const lost=casualtyCounts[side].get(g)??0;
      summary.deployed+=g.count;summary.destroyed+=lost;summary.survivors+=g.count-lost;
      if(isCapital(g.role)){summary.capitalDeployed+=g.count;summary.capitalLost+=lost;}
      if(g.role==='reaper_capital')summary.reaperCapitalLost+=lost;
      if(g.role==='reaper_destroyer')summary.reaperDestroyersLost+=lost;
      summary.pointsDeployed+=g.count*g.pointValue;
      summary.pointsLost+=lost*g.pointValue;
      const existing=summary.lossesByClass[g.classId];
      if(existing){existing.deployed+=g.count;existing.lost+=lost;}
      else summary.lossesByClass[g.classId]={deployed:g.count,lost,name:g.name};
    }
    summary.survivalPercent=summary.deployed?100*summary.survivors/summary.deployed:0;
    summary.damageDealt=Math.round((side==='A'?ta:tb).power*elapsed*0.65);
    summary.shotsFired=Math.round((side==='A'?ta:tb).ships*elapsed*0.75);
    summary.hits=Math.round(summary.shotsFired*0.55);
    summary.tacticalEffectiveness=summary.damageDealt/Math.max(1,summary.pointsLost);
    // Damage taken derived later from opponent's expected output.
    void enemy;
  }
  summaries.A.damageTaken=summaries.B.damageDealt;
  summaries.B.damageTaken=summaries.A.damageDealt;
  const victorious: Side|'draw' = !ta.ships?'B':!tb.ships?'A':
    decisiveReached && Math.abs(sa-sb)/Math.max(1,sa,sb)>.035 ? stronger:'draw';
  const perspective=config.perspectiveSide;
  const battle:BattleResult={
    configId:config.id,scenarioId:config.scenarioId,rulesId:config.rules.id,
    rulesName:config.rules.name,seed:config.seed,duration:elapsed,winner:victorious,
    reason:victorious==='draw'?'Aggregate estimate: inconclusive within configured engagement window':
      'Aggregate estimate: expected attrition advantage',
    perspectiveSide:perspective,outcome:victorious==='draw'?'draw':victorious===perspective?'victory':'defeat',
    sides:summaries,eventCount:0,objectiveCompleted:victorious===perspective
  };
  return {method:'aggregate-estimate-v1',approximate:true,battle,
    shipsAnalysed:ta.ships+tb.ships,
    power:{A:ta.power,B:tb.power},defence:{A:ta.defence,B:tb.defence},
    predictedDecisiveSeconds:decisive,warnings};
}
