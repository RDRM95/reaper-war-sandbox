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

// The Regroup order (port of the Codex build's tests/regroup.test.ts). A fleet that has taken losses went on flying
// the formation it deployed in, with a hole wherever a hull had died. Regroup gives the survivors a fresh formation
// of their own number where they stand, and the fleet resumes the attack once formed.
test('a fleet ordered to regroup closes its gaps, forms up and resumes the attack',async({page})=>{
 test.slow();
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {BattleSimulation}=await import('/src/simulation/battle.ts');
  const {buildScenario}=await import('/src/scenarios/index.ts');
  const {regroupProgress}=await import('/src/simulation/ai.ts');
  const hulls=(sim:any,fleet:any)=>sim.ships.filter((s:any)=>s.fleetId===fleet.spec.id&&s.alive&&!s.escaped&&s.role!=='fighter');
  const worstGap=(ships:any[])=>Math.max(...ships.map((a,i)=>Math.min(...ships.filter((_,j)=>j!==i).map(b=>Math.hypot(a.slot.x-b.slot.x,a.slot.y-b.slot.y,a.slot.z-b.slot.z)))));
  const footprint=(ships:any[])=>{const span=(axis:string)=>Math.max(...ships.map(s=>s.slot[axis]))-Math.min(...ships.map(s=>s.slot[axis]));return span('x')*span('z');};
  const first=(sim:any)=>[...sim.fleets.values()].find((f:any)=>f.spec.side==='A') as any;
  // Losses: the Final Battle of Earth under canon rules, 150 s in.
  const lost=new BattleSimulation(buildScenario('final_battle_of_earth','canon_me3',1));const lostFleet=first(lost);
  const deployed=hulls(lost,lostFleet).length,deployedFootprint=footprint(hulls(lost,lostFleet));
  while(lost.time<150)lost.step();
  const survivors=hulls(lost,lostFleet).length,gapBefore=worstGap(hulls(lost,lostFleet)),footprintBefore=footprint(hulls(lost,lostFleet));
  lost.issueOrders(lostFleet.spec.id,{order:'regroup'});
  const after=hulls(lost,lostFleet),gapAfter=worstGap(after),footprintAfter=footprint(after);
  const off=Math.hypot(...(['x','y','z'] as const).map(axis=>lostFleet.anchor[axis]-after.reduce((n:number,s:any)=>n+s.pos[axis],0)/after.length));
  // Forming up: the Battle of Earth, ordered at 80 s.
  const sim=new BattleSimulation(buildScenario('battle_of_earth','prime_apex',1));const fleet=first(sim);
  while(sim.time<80)sim.step();
  const shots=()=>hulls(sim,fleet).reduce((n:number,s:any)=>n+s.stats.shotsFired,0),shotsBefore=shots();
  sim.issueOrders(fleet.spec.id,{order:'regroup'});
  const startProgress=regroupProgress(fleet,sim.ships);let progress=startProgress,contacts=0;
  while(!sim.finished&&sim.time<150&&fleet.orders.order==='regroup'){
   progress=regroupProgress(fleet,sim.ships);sim.step();
   const ships=sim.ships.filter((s:any)=>s.alive&&!s.escaped&&s.role!=='fighter');
   for(let i=0;i<ships.length;i++){const a=ships[i];for(let j=0;j<i;j++){const b=ships[j],reach=a.radiusKm+b.radiusKm,dx=a.pos.x-b.pos.x;
    if(dx>reach||dx<-reach)continue;if(Math.hypot(dx,a.pos.y-b.pos.y,a.pos.z-b.pos.z)<reach)contacts++;}}
  }
  return {deployed,survivors,deployedFootprint,footprintBefore,footprintAfter,gapBefore,gapAfter,off,startProgress,progress,formedAfter:sim.time-80,order:fleet.orders.order,shots:shots()-shotsBefore,contacts};
 });
 // Measured: 21 of 49 hulls left on 482 km² of stations (935 km² at deployment): the formation has not closed up.
 // After: 98 km², worst gap between neighbouring stations 5.1 km to 2.3 km.
 expect(result.survivors).toBeLessThan(result.deployed*0.6);
 expect(result.footprintBefore/result.survivors).toBeGreaterThan(result.deployedFootprint/result.deployed*0.9);
 expect(result.footprintAfter).toBeLessThan(result.footprintBefore*0.5);
 expect(result.gapAfter).toBeLessThan(result.gapBefore);
 expect(result.off).toBeLessThan(1e-6);
 // Measured: no hull on its new station at the order; 80 % formed and attacking again 29.5 s later, 114 shots meanwhile.
 expect(result.startProgress).toBeLessThan(0.2);
 expect(result.formedAfter).toBeGreaterThan(10);
 expect(result.formedAfter).toBeLessThan(50);
 expect(result.progress).toBeGreaterThanOrEqual(0.8);
 expect(result.order).toBe('attack');
 expect(result.shots).toBeGreaterThan(50);
 expect(result.contacts).toBe(0);
});

// The Screen order (port of the Codex build's tests/screen.test.ts). Weapons do no damage and the Reapers flank: a
// fleet holding formation ends with 7 of its 16 escorts between its capitals and the enemy; a screening fleet, 16.
test('a screening fleet keeps its escorts between its capitals and a flanking enemy',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {BattleSimulation}=await import('/src/simulation/battle.ts');
  const {buildCustomBattle}=await import('/src/scenarios/index.ts');
  const escort=(s:any)=>s.role==='cruiser'||s.role==='frigate'||s.role==='reaper_destroyer';
  const centre=(ships:any[])=>({x:ships.reduce((n,s)=>n+s.pos.x,0)/ships.length,y:ships.reduce((n,s)=>n+s.pos.y,0)/ships.length,z:ships.reduce((n,s)=>n+s.pos.z,0)/ships.length});
  const flanked=(order:string)=>{
   const sim=new BattleSimulation(buildCustomBattle({seed:42,rulesId:'prime_apex',environment:'deep_space',startingDistanceKm:70,maxDuration:900,
    sideA:{faction:'alliance',name:'Line',formation:'line_abreast',counts:{alliance_dreadnought:4,alliance_cruiser:8,alliance_frigate:8}},
    sideB:{faction:'reaper',name:'Reapers',formation:'line_abreast',counts:{reaper_capital:3,reaper_destroyer:8}}}));
   for(const ship of sim.ships)for(const weapon of ship.weapons)weapon.def={...weapon.def,damage:0};
   sim.issueOrders('custom-a',{order:order as any});sim.issueOrders('custom-b',{order:'flank'});
   while(sim.time<160)sim.step();
   const mine=sim.ships.filter((s:any)=>s.side==='A'&&s.role!=='fighter'),capitals=mine.filter((s:any)=>!escort(s)),escorts=mine.filter(escort),enemy=sim.ships.filter((s:any)=>s.side==='B');
   const c=centre(capitals),t=centre(enemy),axis={x:t.x-c.x,y:t.y-c.y,z:t.z-c.z},length=Math.hypot(axis.x,axis.y,axis.z);
   const bearings=escorts.map((s:any)=>{const v={x:s.pos.x-c.x,y:s.pos.y-c.y,z:s.pos.z-c.z},along=(v.x*axis.x+v.y*axis.y+v.z*axis.z)/length;return {along,angle:Math.acos(along/Math.hypot(v.x,v.y,v.z))*180/Math.PI};});
   return {between:bearings.filter((b:any)=>b.angle<45&&b.along>1).length,escorts:escorts.length,offAxis:bearings.reduce((n:number,b:any)=>n+b.angle,0)/bearings.length,
    nearest:Math.min(...enemy.map((e:any)=>Math.min(...capitals.map((k:any)=>Math.hypot(e.pos.x-k.pos.x,e.pos.y-k.pos.y,e.pos.z-k.pos.z))))),
    fired:mine.filter((s:any)=>s.stats.shotsFired>0).length/mine.length};
  };
  return {held:flanked('hold_formation'),screened:flanked('screen')};
 });
 // Holding formation: measured 7 of 16 between, 60° off the line, nearest Reaper 6.4 km from a dreadnought.
 expect(result.held.between).toBeLessThanOrEqual(9);
 expect(result.held.offAxis).toBeGreaterThan(45);
 // Screening: measured 16 of 16, 22° off the line, nearest Reaper 9.0 km from a dreadnought.
 expect(result.screened.between).toBe(result.screened.escorts);
 expect(result.screened.offAxis).toBeLessThan(30);
 expect(result.screened.nearest).toBeGreaterThan(result.held.nearest*1.3);
 expect(result.screened.fired).toBe(1);
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
