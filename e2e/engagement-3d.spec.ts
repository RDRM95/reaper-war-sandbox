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
 // It deploys as a formation with depth of its own (altitude bands: 0.06 when deployments were flat, 0.135 now)
 // and fights deeper still.
 expect(result.first).toBeGreaterThan(0.1);
 expect(result.first).toBeLessThan(0.2);
 expect(result.thicknessA).toBeGreaterThan(result.first*1.5);
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
  // Under the canon rules: under prime_apex this battle now ends at about 70 s, before the slowest fleet has
  // reached its level, because hulls spread their fire and sprint to close. The lanes are the same rule either way.
  const sim=new BattleSimulation(buildScenario('final_battle_of_earth','canon_me3',1));
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

// Hulls keep clear of each other at every tick (port of the Codex build's tests/collision-avoidance.test.ts). A
// contact is a tick on which two live hulls are closer than the sum of their radii, a radius being half a hull's
// length. Looked at every 5 s there were none; counted at every tick, the four seeds below each had one before the
// change, and the Final Battle of Earth deployed hulls of different allied fleets inside each other.
test('no two hulls touch at any tick, at deployment or in battle',async({page})=>{
 test.slow();
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {BattleSimulation}=await import('/src/simulation/battle.ts');
  const {buildScenario,buildCustomBattle}=await import('/src/scenarios/index.ts');
  const contacts=(sim:any,seconds:number)=>{
   let pairTicks=0,deepest=0,atDeployment=0;
   const check=(deploying:boolean)=>{
    const ships=sim.ships.filter((s:any)=>s.alive&&!s.escaped&&s.role!=='fighter');
    for(let i=0;i<ships.length;i++){const a=ships[i];for(let j=0;j<i;j++){const b=ships[j],reach=a.radiusKm+b.radiusKm,dx=a.pos.x-b.pos.x;
     if(dx>reach||dx<-reach)continue;
     const gap=Math.hypot(dx,a.pos.y-b.pos.y,a.pos.z-b.pos.z);if(gap>=reach)continue;
     pairTicks++;deepest=Math.max(deepest,(reach-gap)/reach);if(deploying)atDeployment++;}}
   };
   check(true);
   while(!sim.finished&&sim.time<seconds){sim.step();check(false);}
   return {pairTicks,deepest,atDeployment,destroyed:sim.ships.filter((s:any)=>!s.alive).length};
  };
  const line=(seed:number)=>buildCustomBattle({seed,rulesId:'prime_apex',environment:'deep_space',startingDistanceKm:60,maxDuration:150,
   sideA:{faction:'alliance',name:'Alliance line',formation:'line_abreast',counts:{alliance_dreadnought:6,alliance_cruiser:18,alliance_frigate:30}},
   sideB:{faction:'reaper',name:'Reaper pressure',formation:'strike_wedge',counts:{reaper_capital:8,reaper_destroyer:30}}});
  const seeds=((window as any).__contactSeeds??[5,11,14,36]) as number[];
  const battles=seeds.map(seed=>({seed,...contacts(new BattleSimulation(line(seed)),150)}));
  const deployments=[1,2,3].map(seed=>contacts(new BattleSimulation(buildScenario('final_battle_of_earth','prime_apex',seed)),0).atDeployment);
  const finalBattle=contacts(new BattleSimulation(buildScenario('final_battle_of_earth','prime_apex',1)),100);
  // A second wave arriving at 20 s exactly where the first deployed.
  const config=line(3);const first=config.fleets.find((f:any)=>f.side==='A');
  config.fleets.push({...first,id:'second-wave',name:'Second wave',arrivalTime:20});
  const sim=new BattleSimulation(config);while(sim.time<20.05)sim.step();
  const arrived=sim.ships.filter((s:any)=>s.fleetId==='second-wave'&&s.role!=='fighter');
  let arrivalOverlaps=0;
  for(const ship of arrived)for(const other of sim.ships){if(other===ship||!other.alive||other.role==='fighter')continue;
   if(Math.hypot(ship.pos.x-other.pos.x,ship.pos.y-other.pos.y,ship.pos.z-other.pos.z)<ship.radiusKm+other.radiusKm)arrivalOverlaps++;}
  return {battles,deployments,finalBattle,arrived:arrived.length,arrivalOverlaps};
 });
 for(const battle of result.battles){
  expect(battle.pairTicks,`seed ${battle.seed}`).toBe(0);
  // They did fight: this is not a battle where nothing closed.
  expect(battle.destroyed).toBeGreaterThan(20);
 }
 expect(result.deployments).toEqual([0,0,0]);
 expect(result.finalBattle.pairTicks).toBe(0);
 expect(result.arrived).toBeGreaterThan(40);
 expect(result.arrivalOverlaps).toBe(0);
});

// Large fleets deploy in altitude bands (port of the scenario half of the Codex build's
// tests/deployment-depth.test.ts). Before, the Fifth Fleet was 41.9 km wide and 2.6 km tall.
test('scenario fleets deploy as a volume, with every hull clear and small fleets unchanged',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {BattleSimulation}=await import('/src/simulation/battle.ts');
  const {buildScenario}=await import('/src/scenarios/index.ts');
  const extent=(points:any[],axis:string)=>Math.max(...points.map(p=>p[axis]))-Math.min(...points.map(p=>p[axis]));
  const fleet=(scenario:string,id:string)=>{
   const ships=new BattleSimulation(buildScenario(scenario,'prime_apex',1)).ships.filter((s:any)=>s.fleetId===id&&s.role!=='fighter');
   const slots=ships.map((s:any)=>s.slot);let overlaps=0;
   for(let i=0;i<ships.length;i++)for(let j=0;j<i;j++)if(Math.hypot(slots[i].x-slots[j].x,slots[i].y-slots[j].y,slots[i].z-slots[j].z)<=ships[i].radiusKm+ships[j].radiusKm)overlaps++;
   return {id,hulls:ships.length,width:extent(slots,'x'),height:extent(slots,'y'),overlaps};
  };
  return {
   large:[fleet('battle_of_earth','alliance-5th'),fleet('final_battle_of_earth','sword-alliance'),fleet('final_battle_of_earth','sword-turian'),fleet('final_battle_of_earth','reaper-blockade'),fleet('defence_of_palaven','hierarchy-palaven')],
   small:fleet('battle_of_earth','reaper-sol'),
  };
 });
 for(const fleet of result.large){
  // Measured 13 % to 28 % of the width (2 % to 9 % when flat).
  expect(fleet.height/fleet.width,fleet.id).toBeGreaterThan(0.125);
  expect(fleet.overlaps,fleet.id).toBe(0);
 }
 // Under the battle-group threshold nothing changes: the ten-hull Reaper group keeps its three levels, 1.98 km.
 expect(result.small.height).toBeCloseTo(1.98,1);
});

// Hulls do not give way to fighters (port of the Codex build's tests/carrier-station.test.ts). A carrier was pushed
// about by its own wing: holding formation at Earth, carriers drifted 5.1, 5.4 and 6.0 km off station (seeds 1 to 3).
test('a carrier holding formation stays on station with its wing in the air',async({page})=>{
 test.slow();
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {BattleSimulation}=await import('/src/simulation/battle.ts');
  const {buildScenario}=await import('/src/scenarios/index.ts');
  const {slotToWorld}=await import('/src/simulation/formations.ts');
  return [1,2,3].map(seed=>{
   const sim=new BattleSimulation(buildScenario('battle_of_earth','prime_apex',seed));
   const fleet=[...sim.fleets.values()].find((f:any)=>f.spec.side==='A') as any;
   sim.issueOrders(fleet.spec.id,{order:'hold_formation'});
   let carrier=0,launched=0,inside=0;
   while(!sim.finished&&sim.time<150){
    sim.step();if(sim.time<20)continue;
    const live=sim.ships.filter((s:any)=>s.alive&&!s.escaped);
    for(const s of live){if(s.fleetId!==fleet.spec.id||s.withdrawing||s.role!=='carrier')continue;
     const station=slotToWorld(fleet.anchor,fleet.heading,s.slot);carrier=Math.max(carrier,Math.hypot(s.pos.x-station.x,s.pos.y-station.y,s.pos.z-station.z));}
    if(sim.tick%10!==0)continue;
    const fighters=live.filter((s:any)=>s.role==='fighter'),hulls=live.filter((s:any)=>s.role!=='fighter');launched=Math.max(launched,fighters.length);
    for(const f of fighters)for(const h of hulls){if(h.id===f.carrierId)continue;if(Math.hypot(f.pos.x-h.pos.x,f.pos.y-h.pos.y,f.pos.z-h.pos.z)<h.radiusKm*0.5)inside++;}
   }
   return {seed,carrier,launched,inside};
  });
 });
 for(const run of result){
  // Measured 0.01, 0.11 and 0.00 km.
  expect(run.carrier,`seed ${run.seed}`).toBeLessThan(0.5);
  // The wings did fly, and no fighter ended up deep inside a hull that was not its own carrier.
  expect(run.launched).toBeGreaterThan(20);
  expect(run.inside).toBe(0);
 }
});

// Hulls close to gun range, and Reaper capitals advance as individuals (ports of the Codex build's
// tests/gun-range.test.ts and tests/reaper-advance.test.ts). Before: in a battle four times the default size 76 % of
// Alliance frigates and 74 % of cruisers fired in a given 20 s, the rest parked at about 1.2 times their gun range;
// Reaper capitals moved in unison (velocity alignment 0.73) within 1.1 km of one level.
test('escorts in a large fleet are in range and firing, and Reaper capitals do not move as a rank',async({page})=>{
 test.slow();
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {BattleSimulation}=await import('/src/simulation/battle.ts');
  const {buildCustomBattle}=await import('/src/scenarios/index.ts');
  const battle=(scale:number,seed:number)=>new BattleSimulation(buildCustomBattle({seed,rulesId:'canon_me3',environment:'deep_space',theatreLayout:'three_dimensional',startingDistanceKm:76,maxDuration:420,
   sideA:{faction:'alliance',name:'Alliance Task Force',formation:'line_abreast',counts:{alliance_dreadnought:8*scale,alliance_carrier:scale,alliance_cruiser:16*scale,alliance_frigate:30*scale,alliance_frigate_thanix:scale}},
   sideB:{faction:'reaper',name:'Reaper harvest group',formation:'strike_wedge',counts:{reaper_capital:4*scale,reaper_destroyer:8*scale}}} as any));
  // Firing share by class in the four-times battle, 60 to 140 s; a hull counts from its second look on.
  const big=battle(4,1),shots=new Map<string,number>(),looks:Record<string,number>={},firing:Record<string,number>={};let next=60;
  while(!big.finished&&big.time<140){big.step();if(big.time<next)continue;next+=20;
   for(const ship of big.ships){if(!ship.alive||ship.escaped||ship.role==='fighter')continue;const key=ship.side+' '+ship.role;
    if(shots.has(ship.id)){looks[key]=(looks[key]??0)+1;if(ship.stats.shotsFired>shots.get(ship.id)!)firing[key]=(firing[key]??0)+1;}
    shots.set(ship.id,ship.stats.shotsFired);}}
  const share:Record<string,number>={};for(const key of Object.keys(looks))share[key]=(firing[key]??0)/looks[key];
  // Reaper capitals in the default battle, three seeds, 40 to 140 s.
  let alignment=0,pairs=0,height=0,samples=0;
  for(const seed of [1,2,3]){const sim=battle(1,seed);let at=40;
   while(!sim.finished&&sim.time<140){sim.step();if(sim.time<at)continue;at+=10;
    const ships=sim.ships.filter((s:any)=>s.alive&&s.role==='reaper_capital');if(ships.length<3)continue;
    const moving=ships.filter((s:any)=>Math.hypot(s.vel.x,s.vel.y,s.vel.z)>0.02);
    for(let i=0;i<moving.length;i++)for(let j=0;j<i;j++){const a=moving[i].vel,b=moving[j].vel;alignment+=(a.x*b.x+a.y*b.y+a.z*b.z)/(Math.hypot(a.x,a.y,a.z)*Math.hypot(b.x,b.y,b.z));pairs++;}
    const mean=ships.reduce((n:number,s:any)=>n+s.pos.y,0)/ships.length;height+=Math.sqrt(ships.reduce((n:number,s:any)=>n+(s.pos.y-mean)**2,0)/ships.length);samples++;}}
  return {share,alignment:alignment/pairs,height:height/samples};
 });
 // Measured: frigates 100 %, cruisers 100 %, dreadnoughts 100 %, Reaper destroyers 98 %.
 expect(result.share['A frigate']).toBeGreaterThan(0.8);
 expect(result.share['A cruiser']).toBeGreaterThan(0.75);
 expect(result.share['A dreadnought']).toBeGreaterThan(0.8);
 expect(result.share['B reaper_destroyer']).toBeGreaterThan(0.85);
 // Measured: velocity alignment 0.37, height spread 2.3 km.
 expect(result.alignment).toBeLessThan(0.62);
 expect(result.height).toBeGreaterThan(1.6);
});
