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
 // before). In the long battle 84 % of hull-time is spent firing and 1 % chasing or idle; dreadnoughts fire 72
 // shots a hull-minute and cruisers 62 (32 and 51 before, in the Codex build) and the carrier fires at all.
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

// Fighters attack in wings and keep attacking (port of the Codex build's tests/fighter-wings.test.ts). Before, each
// fighter chose its own target, and an Alliance fighter facing Reapers without Oculus had two torpedoes a sortie
// and nothing else to fire: its gun engaged only small craft and missiles.
test('fighters fly in wings that share a target and strafe the hull they attack',async({page})=>{
 test.slow();
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {BattleSimulation}=await import('/src/simulation/battle.ts');
  const {buildScenario,buildCustomBattle}=await import('/src/scenarios/index.ts');
  const {wingLeader,WING_SIZE}=await import('/src/simulation/ai.ts');
  const {measureActivity}=await import('/src/simulation/combatActivity.ts');
  const number=(id:string)=>Number(id.slice(id.lastIndexOf('-')+1));
  // Wings at 20 s, before any has turned for home to rearm; then how often a wing-mate is on its leader's target.
  const sim=new BattleSimulation(buildScenario('battle_of_earth','prime_apex',1));
  while(!sim.finished&&sim.time<20)sim.step();
  const flying=sim.ships.filter((s:any)=>s.role==='fighter'&&s.alive&&!s.rearming);
  const wingsRight=flying.every((f:any)=>{const l=wingLeader(sim,f);return !!l&&l.role==='fighter'&&Math.floor((number(l.id)-1)/WING_SIZE)===Math.floor((number(f.id)-1)/WING_SIZE)&&number(l.id)<=number(f.id);});
  let together=0,looks=0,next=30;
  while(!sim.finished&&sim.time<120){sim.step();if(sim.time<next)continue;next+=5;
   for(const f of sim.ships){if(f.role!=='fighter'||!f.alive||f.escaped||f.rearming||f.side!=='A')continue;const l=wingLeader(sim,f);if(!l||l===f||!l.targetId)continue;looks++;if(f.targetId===l.targetId)together++;}}
  // Eight fighters against one destroyer that cannot be hurt or hurt them; a frigate that holds its fire keeps
  // their side in the battle.
  const duel=new BattleSimulation(buildCustomBattle({seed:3,rulesId:'canon_me3',environment:'deep_space',startingDistanceKm:30,maxDuration:200,
   sideA:{faction:'alliance',name:'A',formation:'fighter_screen',counts:{alliance_frigate:1,alliance_fighter:8}},sideB:{faction:'reaper',name:'B',formation:'line_abreast',counts:{reaper_destroyer:1}}} as any));
  const destroyer=duel.ships.find((s:any)=>s.role==='reaper_destroyer')!;destroyer.maxHull=destroyer.hull=1e12;
  for(const s of duel.ships)if(s.side==='B'||s.role==='frigate')for(const w of s.weapons)w.def={...w.def,damage:0,range:s.role==='frigate'?0:w.def.range};
  while(!duel.finished&&duel.time<90)duel.step();
  const fired=(id:string)=>duel.events.filter((e:any)=>e.type==='weapon_fired'&&e.targetId===destroyer.id&&e.weaponId===id).length;
  const row=measureActivity(new BattleSimulation(buildScenario('battle_of_earth','canon_me3',1)),300).rows.get('A fighter')!;
  return {flying:flying.length,wingsRight,together,looks,duelTime:duel.time,torpedoes:fired('fighter_torpedo'),guns:fired('fighter_gun'),
   firing:row.seconds.firing/row.hullSeconds,idle:row.seconds.idle/row.hullSeconds,runs:row.runs/(row.hullSeconds/60)};
 });
 // Measured: all 48 fighters in wings at 20 s; a wing-mate is on its leader's target in 257 of 262 looks (189 of
 // 208 when fighters went home with their last torpedo); the eight fighters fire 16 torpedoes and 4,694 gun rounds
 // in 90 s (16 torpedoes and nothing else, before); in the canon Battle of Earth fighters are firing 49 % of the
 // time (20 % before they strafed) and make 5.9 attack runs a minute each.
 expect(result.flying).toBe(48);
 expect(result.wingsRight).toBe(true);
 expect(result.looks).toBeGreaterThan(100);
 expect(result.together/result.looks).toBeGreaterThan(0.85);
 expect(result.duelTime).toBeGreaterThan(89);
 expect(result.torpedoes).toBe(16);
 expect(result.guns).toBeGreaterThan(3000);
 expect(result.firing).toBeGreaterThan(0.3);
 expect(result.idle).toBeLessThan(0.05);
 expect(result.runs).toBeGreaterThan(3);
});

// Port of the Codex build's station-time case (tests/fighter-wings.test.ts). A fighter turned for its carrier in the
// tick its last torpedo left, though its gun needs no reloading, and spent more of a battle flying to and from the
// hangar than fighting.
test('a fighter out of torpedoes stays over its target with its guns before it turns for its carrier',async({page})=>{
 test.slow();
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {BattleSimulation,STATION_SECONDS}=await import('/src/simulation/battle.ts');
  const {buildScenario,buildCustomBattle}=await import('/src/scenarios/index.ts');
  const {measureActivity}=await import('/src/simulation/combatActivity.ts');
  // One carrier's wings against a destroyer that cannot be hurt and does no damage; the carrier holds its fire.
  const sim=new BattleSimulation(buildCustomBattle({seed:3,rulesId:'canon_me3',environment:'deep_space',startingDistanceKm:40,maxDuration:200,
   sideA:{faction:'alliance',name:'A',formation:'line_abreast',counts:{alliance_carrier:1}},sideB:{faction:'reaper',name:'B',formation:'line_abreast',counts:{reaper_destroyer:1}}} as any));
  const destroyer=sim.ships.find((s:any)=>s.role==='reaper_destroyer')!;destroyer.maxHull=destroyer.hull=1e12;
  for(const s of sim.ships)if(s.side==='B'||s.role==='carrier')for(const w of s.weapons)w.def={...w.def,damage:0,range:s.role==='carrier'?0:w.def.range};
  const spent=new Map<string,number>(),turned=new Map<string,number>();let seen=0;
  while(!sim.finished&&sim.time<150){sim.step();
   for(;seen<sim.events.length;seen++){const e:any=sim.events[seen];if(e.type==='ammunition_depleted'&&!spent.has(e.shipId)&&sim.getShip(e.shipId)?.role==='fighter')spent.set(e.shipId,e.t);}
   for(const f of sim.ships)if(f.role==='fighter'&&f.rearming&&!turned.has(f.id))turned.set(f.id,sim.time);}
  const waits=[...turned].map(([id,t])=>t-(spent.get(id)??-1e9));
  let rounds=0;for(const e of sim.events as any[])if(e.type==='weapon_fired'&&e.weaponId==='fighter_gun'&&spent.has(e.shipId)&&e.t>spent.get(e.shipId)!&&e.t<=(turned.get(e.shipId)??-1))rounds++;
  const row=measureActivity(new BattleSimulation(buildScenario('battle_of_earth','canon_me3',1)),300).rows.get('A fighter')!;
  return {station:STATION_SECONDS,spent:spent.size,turned:turned.size,shortest:Math.min(...waits),longest:Math.max(...waits),rounds,
   reloads:sim.events.filter((e:any)=>e.type==='fighter_rearmed').length,firing:row.seconds.firing/row.hullSeconds,runs:row.runs/(row.hullSeconds/60)};
 });
 // Measured: all 24 fighters spend their torpedoes and each turns for the carrier 15.00 s later, having fired 2,049
 // gun rounds between them meanwhile; 72 reloads in 150 s; fighters firing 49 % of the canon Battle of Earth with
 // 5.9 attack runs a minute each (37 % and 3.5 when they went home with their last torpedo).
 expect(result.spent).toBe(24);
 expect(result.turned).toBe(24);
 expect(result.shortest).toBeGreaterThan(result.station-0.1);
 expect(result.longest).toBeLessThan(result.station+0.1);
 expect(result.rounds).toBeGreaterThan(1500);
 expect(result.reloads).toBeGreaterThanOrEqual(48);
 expect(result.firing).toBeGreaterThan(0.42);
 expect(result.runs).toBeGreaterThan(4.5);
});
