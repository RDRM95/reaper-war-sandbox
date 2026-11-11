import {test,expect} from '@playwright/test';

// Fleets fight in depth, not as two sheets in one plane (port of the battle half of the Codex build's
// tests/engagement-3d.test.ts). Measured there before the change: thickness 0.06 to 0.10 of a fleet's width and
// firing lines 4° to 11° off the horizontal; after it: 0.28 to 0.38 and 18° to 34°.
test('a seeded fleet battle spreads above and below its deployment plane',async({page})=>{
 test.slow();
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {BattleSimulation}=await import('/src/simulation/battle.ts');
  const {buildCustomBattle}=await import('/src/scenarios/index.ts');
  const {sampleGeometry}=await import('/src/simulation/engagementGeometry.ts');
  const run=()=>{
   const sim=new BattleSimulation(buildCustomBattle({seed:42,rulesId:'prime_apex',environment:'deep_space',startingDistanceKm:60,maxDuration:100,
    sideA:{faction:'alliance',name:'Alliance line',formation:'line_abreast',counts:{alliance_dreadnought:6,alliance_cruiser:18,alliance_frigate:30}},
    sideB:{faction:'reaper',name:'Reaper pressure',formation:'strike_wedge',counts:{reaper_capital:8,reaper_destroyer:30}}}));
   const samples:any[]=[];let next=0;
   while(!sim.finished&&sim.time<90){sim.step();if(sim.time>=next){next+=5;samples.push(...sampleGeometry(sim));}}
   return {sim,samples};
  };
  const {sim,samples}=run();
  const mean=(side:string,key:string)=>{const rows=samples.filter(s=>s.side===side&&s.time>=40);return rows.reduce((sum,row)=>sum+row[key],0)/Math.max(1,rows.length);};
  const fired=(role:string)=>sim.ships.filter(s=>s.role===role&&s.stats.shotsFired>0).length/sim.ships.filter(s=>s.role===role).length;
  const again=run().sim;
  return {
   first:samples.find(s=>s.side==='A').thickness,
   thicknessA:mean('A','thickness'),thicknessB:mean('B','thickness'),
   elevationA:mean('A','elevationDeg'),elevationB:mean('B','elevationDeg'),
   steepA:mean('A','steepShare'),overlaps:mean('A','overlaps')+mean('B','overlaps'),
   dreadnoughts:fired('dreadnought'),capitals:fired('reaper_capital'),cruisers:fired('cruiser'),
   same:JSON.stringify(sim.ships.map(s=>[s.pos.x,s.pos.y,s.pos.z]))===JSON.stringify(again.ships.map(s=>[s.pos.x,s.pos.y,s.pos.z])),
  };
 });
 // It deploys as a formation and fights in depth.
 expect(result.first).toBeLessThan(0.1);
 expect(result.thicknessA).toBeGreaterThan(0.2);
 expect(result.thicknessB).toBeGreaterThan(0.2);
 expect(result.elevationA).toBeGreaterThan(18);
 expect(result.elevationB).toBeGreaterThan(13);
 expect(result.steepA).toBeGreaterThan(0.45);
 expect(result.overlaps).toBe(0);
 // Guns still take part, and the same seed gives the same battle.
 expect(result.dreadnoughts).toBe(1);
 expect(result.capitals).toBe(1);
 expect(result.cruisers).toBeGreaterThanOrEqual(0.85);
 expect(result.same).toBe(true);
});

// Allied fleets close on separate altitude lanes (port of the Codex build's tests/altitude-lanes.test.ts). Before the
// change the five Alliance fleets of this scenario stayed within about a kilometre of each other in altitude.
test('allied fleets in the Final Battle of Earth stack on separate levels',async({page})=>{
 test.slow();
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {BattleSimulation}=await import('/src/simulation/battle.ts');
  const {buildScenario,buildCustomBattle}=await import('/src/scenarios/index.ts');
  const {altitudeLane,ALTITUDE_LANES}=await import('/src/simulation/ai.ts');
  const {sampleGeometry}=await import('/src/simulation/engagementGeometry.ts');
  const sim=new BattleSimulation(buildScenario('final_battle_of_earth','prime_apex',1));
  const lanes=[...sim.fleets.values()].filter(f=>f.spec.side==='A').map(f=>altitudeLane(sim,f).lane);
  let overlaps=0,next=30;
  while(!sim.finished&&sim.time<100){sim.step();if(sim.time>=next){next+=10;for(const row of sampleGeometry(sim))overlaps+=row.overlaps;}}
  const alliance=[...sim.fleets.values()].filter(f=>f.spec.side==='A');
  const altitudes=alliance.map(f=>f.anchor.y).sort((a,b)=>a-b);
  const onOwnSide=alliance.every(f=>{const l=altitudeLane(sim,f);return l.lane===0||Math.sign(f.anchor.y-l.base)===Math.sign(l.lane);});
  // A side with one fleet does not climb.
  const duel=new BattleSimulation(buildCustomBattle({seed:42,rulesId:'prime_apex',environment:'deep_space',startingDistanceKm:60,maxDuration:100,
   sideA:{faction:'alliance',name:'Line',formation:'line_abreast',counts:{alliance_dreadnought:2,alliance_cruiser:6}},
   sideB:{faction:'reaper',name:'Reapers',formation:'strike_wedge',counts:{reaper_capital:2,reaper_destroyer:6}}}));
  const singleLanes=[...duel.fleets.values()].map(f=>altitudeLane(duel,f).lane);
  return {lanes,expected:ALTITUDE_LANES.slice(0,lanes.length),spread:altitudes[altitudes.length-1]-altitudes[0],
   closest:Math.min(...altitudes.slice(1).map((y,i)=>y-altitudes[i])),onOwnSide,overlaps,singleLanes};
 });
 expect(result.lanes).toEqual(result.expected);
 expect(result.spread).toBeGreaterThan(10);
 expect(result.closest).toBeGreaterThan(1.5);
 expect(result.onOwnSide).toBe(true);
 expect(result.overlaps).toBe(0);
 expect(result.singleLanes).toEqual([0,0]);
});
