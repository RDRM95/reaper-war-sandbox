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

// Fleet intents (port of the Codex build's tests/fleet-intent.test.ts): a fleet ordered to flank goes round to the
// enemy's side at its own range; one ordered to break through drives past the enemy. Weapons do no damage here, so
// this is a control experiment on movement.
test('a fleet ordered to flank goes round the enemy, and one ordered to break through goes past it',async({page})=>{
 test.slow();
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {BattleSimulation}=await import('/src/simulation/battle.ts');
  const {buildCustomBattle}=await import('/src/scenarios/index.ts');
  const {centroid,manoeuvreReached}=await import('/src/simulation/ai.ts');
  const {sampleGeometry}=await import('/src/simulation/engagementGeometry.ts');
  const exercise=(order)=>{
   const sim=new BattleSimulation(buildCustomBattle({seed:42,rulesId:'prime_apex',environment:'deep_space',startingDistanceKm:70,maxDuration:900,
    sideA:{faction:'alliance',name:'Line',formation:'line_abreast',counts:{alliance_dreadnought:4,alliance_cruiser:8,alliance_frigate:8}},
    sideB:{faction:'reaper',name:'Reapers',formation:'line_abreast',counts:{reaper_capital:3,reaper_destroyer:8}}}));
   for(const ship of sim.ships)for(const weapon of ship.weapons)weapon.def={...weapon.def,damage:0};
   sim.issueOrders('custom-b',{order:'hold_formation'});
   const fleet=sim.fleets.get('custom-a');
   const start=centroid(sim.ships.filter(s=>s.side==='B'));
   const axis={x:fleet.anchor.x-start.x,z:fleet.anchor.z-start.z},length=Math.hypot(axis.x,axis.z);
   sim.issueOrders('custom-a',{order});
   let reachedAt=-1,overlaps=0;
   for(let i=0;i<8000&&!sim.finished;i++){sim.step();if(reachedAt<0&&manoeuvreReached(fleet))reachedAt=sim.time;if(sim.tick%200===0)for(const row of sampleGeometry(sim))overlaps+=row.overlaps;}
   const enemy=centroid(sim.ships.filter(s=>s.side==='B'));
   const v={x:fleet.anchor.x-enemy.x,z:fleet.anchor.z-enemy.z},d=Math.hypot(v.x,v.z);
   const hulls=sim.ships.filter(s=>s.side==='A'&&s.role!=='fighter');
   const along=(p)=>((p.x-enemy.x)*axis.x+(p.z-enemy.z)*axis.z)/length;
   return {reachedAt,angle:Math.acos(Math.max(-1,Math.min(1,(v.x*axis.x+v.z*axis.z)/(d*length))))*180/Math.PI,distance:d/fleet.engagementRange,along:along(fleet.anchor),
    past:hulls.filter(s=>along(s.pos)<0).length,fired:hulls.filter(s=>s.stats.shotsFired>0).length,hulls:hulls.length,overlaps,mode:fleet.engagementMode};
  };
  return {attack:exercise('attack'),flank:exercise('flank'),breakthrough:exercise('breakthrough')};
 });
 expect(result.attack.reachedAt).toBe(-1);
 expect(result.attack.angle).toBeLessThan(5);
 // Flank: on station in under 200 s, about 65 degrees round the enemy at its own range, every hull firing.
 expect(result.flank.reachedAt).toBeGreaterThan(40);
 expect(result.flank.reachedAt).toBeLessThan(200);
 expect(result.flank.angle).toBeGreaterThan(55);
 expect(result.flank.angle).toBeLessThan(70);
 expect(result.flank.distance).toBeGreaterThan(0.7);
 expect(result.flank.distance).toBeLessThan(1.1);
 expect(result.flank.fired).toBe(result.flank.hulls);
 expect(result.flank.overlaps).toBe(0);
 // Break through: past the enemy's centre in under 300 s with most of its hulls.
 expect(result.breakthrough.reachedAt).toBeGreaterThan(100);
 expect(result.breakthrough.reachedAt).toBeLessThan(300);
 expect(result.breakthrough.along).toBeLessThan(-4);
 expect(result.breakthrough.past).toBeGreaterThanOrEqual(12);
 expect(result.breakthrough.fired).toBe(result.breakthrough.hulls);
 expect(result.breakthrough.overlaps).toBe(0);
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
