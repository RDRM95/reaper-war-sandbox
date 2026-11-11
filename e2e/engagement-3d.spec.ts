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
