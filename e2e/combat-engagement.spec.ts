import { expect, test } from '@playwright/test';

// Fighting, not chasing (port of the Codex build's tests/combat-engagement.test.ts). Owner's directive: "The
// simulator currently spends too much time showing ships chasing one another rather than fighting." Before: a whole
// fleet chose one target and flew at it past enemies in range; cruisers' and carriers' side batteries never bore,
// because every hull stood bow-on; hulls crossed to an out-ranging enemy at combat speed.
test('a fleet spreads its fire, cruisers fight on the beam, and most hull-time is spent firing',async({page})=>{
 test.slow();
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {BattleSimulation}=await import('/src/simulation/battle.ts');
  const {buildScenario,buildCustomBattle}=await import('/src/scenarios/index.ts');
  const {batteryAspect,shipEngagementRange,closingSprint,CLOSING_SPRINT}=await import('/src/simulation/ai.ts');
  const {measureActivity,hullTotals}=await import('/src/simulation/combatActivity.ts');
  // Target spread at 15 s in the Battle of Earth.
  const earth=new BattleSimulation(buildScenario('battle_of_earth','prime_apex',1));
  while(earth.time<15)earth.step();
  const hulls=earth.ships.filter((s:any)=>s.side==='A'&&s.alive&&s.role!=='fighter'),aimed=new Map<string,number>();
  for(const h of hulls)if(h.targetId)aimed.set(h.targetId,(aimed.get(h.targetId)??0)+1);
  const one=(id:string)=>earth.ships.find((s:any)=>s.classId===id)!;
  const aspects=Object.fromEntries(['alliance_cruiser','alliance_carrier','alliance_dreadnought','alliance_frigate','reaper_capital'].map(id=>[id,batteryAspect(one(id)).aspect]));
  // A cruiser against a destroyer that stays put; neither can be killed.
  const fight=new BattleSimulation(buildCustomBattle({seed:5,rulesId:'canon_me3',environment:'deep_space',startingDistanceKm:60,maxDuration:400,
   sideA:{faction:'alliance',name:'A',formation:'line_abreast',counts:{alliance_cruiser:1}},sideB:{faction:'reaper',name:'B',formation:'line_abreast',counts:{reaper_destroyer:1}}} as any));
  const cruiser=fight.ships.find((s:any)=>s.side==='A')!,destroyer=fight.ships.find((s:any)=>s.side==='B')!;
  destroyer.maxHull=destroyer.hull=1e12;cruiser.maxHull=cruiser.hull=1e12;fight.issueOrders(destroyer.fleetId,{order:'hold_formation'});
  let off=0,samples=0,next=60;
  while(!fight.finished&&fight.time<150){fight.step();if(fight.time<next)continue;next+=5;
   const dx=destroyer.pos.x-cruiser.pos.x,dy=destroyer.pos.y-cruiser.pos.y,dz=destroyer.pos.z-cruiser.pos.z,d=Math.hypot(dx,dy,dz);
   if(d<=batteryAspect(cruiser).beamRange){off+=Math.acos(Math.max(-1,Math.min(1,(dx*cruiser.heading.x+dy*cruiser.heading.y+dz*cruiser.heading.z)/d)));samples++;}}
  const broadsides=fight.events.filter((e:any)=>e.type==='weapon_fired'&&e.shipId===cruiser.id&&e.weaponId==='alliance_broadside').length;
  // What hulls spend a long battle doing.
  const report=measureActivity(new BattleSimulation(buildCustomBattle({seed:1,rulesId:'canon_me3',environment:'deep_space',theatreLayout:'three_dimensional',startingDistanceKm:76,maxDuration:300,
   sideA:{faction:'alliance',name:'Alliance Task Force',formation:'line_abreast',counts:{alliance_dreadnought:8,alliance_carrier:1,alliance_cruiser:16,alliance_frigate:30,alliance_frigate_thanix:1}},
   sideB:{faction:'reaper',name:'Reaper harvest group',formation:'strike_wedge',counts:{reaper_capital:4,reaper_destroyer:8}}} as any)),300);
  const totals=hullTotals(report),row=(k:string)=>report.rows.get(k)!;
  return {busiest:Math.max(...aimed.values())/hulls.length,targeted:aimed.size,aspects,cruiserRange:shipEngagementRange(one('alliance_cruiser')),
   offBowDeg:off/samples*180/Math.PI,samples,broadsides,sprintFar:closingSprint(one('alliance_cruiser'),80,10),sprintFull:CLOSING_SPRINT,sprintReaper:closingSprint(one('reaper_capital'),80,10),
   firing:totals.share.firing,lost:totals.share.chasing+totals.share.idle,switches:totals.targetChangesPerMinute,
   dreadnoughtShots:row('A dreadnought').shots/(row('A dreadnought').hullSeconds/60),cruiserShots:row('A cruiser').shots/(row('A cruiser').hullSeconds/60),carrierShots:row('A carrier').shots};
 });
 // Measured: the busiest Reaper has 27 % of the 89 Alliance hulls on it and all ten are targeted (before: every hull
 // on one). The cruiser holds its target 79 degrees off the bow and fires its broadside 160 times in 150 s (never,
 // before). In the long battle 83 % of hull-time is spent firing and 1 % chasing or idle; dreadnoughts and cruisers
 // fire 63 shots a hull-minute each (32 and 51 before, in the Codex build) and the carrier fires at all.
 expect(result.busiest).toBeLessThan(0.45);
 expect(result.targeted).toBeGreaterThanOrEqual(8);
 expect(result.aspects).toEqual({alliance_cruiser:'beam',alliance_carrier:'beam',alliance_dreadnought:'bow',alliance_frigate:'bow',reaper_capital:'bow'});
 expect(result.cruiserRange).toBeCloseTo(12.8,6);
 expect(result.samples).toBe(19);
 expect(result.offBowDeg).toBeGreaterThan(76);
 expect(result.offBowDeg).toBeLessThan(84);
 expect(result.broadsides).toBeGreaterThan(120);
 expect(result.sprintFar).toBe(result.sprintFull);
 expect(result.sprintReaper).toBe(1);
 expect(result.firing).toBeGreaterThan(0.76);
 expect(result.lost).toBeLessThan(0.05);
 expect(result.switches).toBeLessThan(3);
 expect(result.dreadnoughtShots).toBeGreaterThan(50);
 expect(result.cruiserShots).toBeGreaterThan(55);
 expect(result.carrierShots).toBeGreaterThan(0);
});
