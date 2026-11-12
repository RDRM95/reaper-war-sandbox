import { expect, test } from '@playwright/test';

// Main batteries read first (port of the battle half of the Codex build's tests/visual-weight.test.ts). Owner's
// report: fighters "draw too much visual attention compared to main weapons, looks messy like rat a tat gunfire or
// sparks". Every small-calibre round was drawn 45 m wide against 110 m for a dreadnought's slug, with about seventy
// of them in the air for each main round.
test('in the Battle of Earth the main guns take half of the tracer picture instead of a tenth, and fighter cannon a twentieth',async({page})=>{
 test.slow();
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {BattleSimulation}=await import('/src/simulation/battle.ts');
  const {buildScenario}=await import('/src/scenarios/index.ts');
  const {tracerSize,tracerShown,MAIN_CALIBRE,BELT_CALIBRE,BELT_INTERVAL}=await import('/src/rendering/visualWeight.ts');
  const {WEAPONS}=await import('/src/data/weapons.ts');
  const KM=10;
  // Picture area a tracer covers, as the renderer sizes it (width times length, render units).
  const area=(calibre:number,speed:number,size:{width:number;length:number})=>size.width*Math.max(calibre>=MAIN_CALIBRE?1.5:0.8,speed*KM*0.06)*size.length;
  const before=(calibre:number)=>calibre>=MAIN_CALIBRE?{width:1.1,length:1.3}:{width:0.45,length:0.7};
  const sim=new BattleSimulation(buildScenario('battle_of_earth','prime_apex',1));
  let mainBefore=0,allBefore=0,mainNow=0,allNow=0,mainRounds=0,lightRounds=0,fighterRounds=0,fighterNow=0,fighterUnthinned=0,next=30;
  while(!sim.finished&&sim.time<120){sim.step();if(sim.time<next)continue;next+=10;
   for(const p of sim.projectiles){const calibre=p.weapon.damage,speed=Math.hypot(p.vel.x,p.vel.y,p.vel.z);
    const was=area(calibre,speed,before(calibre)),drawn=area(calibre,speed,tracerSize(calibre)),now=tracerShown(calibre,p.id)?drawn:0;allBefore+=was;allNow+=now;
    if(calibre>=MAIN_CALIBRE){mainBefore+=was;mainNow+=now;mainRounds++;}else lightRounds++;
    if(p.weapon.id==='fighter_gun'){fighterRounds++;fighterNow+=now;fighterUnthinned+=drawn;}}}
  // The belt rule itself: one fighter round in four is drawn, hull guns round for round.
  let shown=0;for(let serial=0;serial<400;serial++)if(tracerShown(WEAPONS.fighter_gun.damage,serial))shown++;
  const hullGuns=[BELT_CALIBRE,65,70,199,MAIN_CALIBRE,40000].every(c=>[0,1,2,3,4,5,6,7].every(n=>tracerShown(c,n)));
  return {mainRounds,lightRounds,fighterRounds,shareBefore:mainBefore/allBefore,shareNow:mainNow/allNow,total:allNow/allBefore,mainUnchanged:Math.abs(mainNow-mainBefore),fighterGun:WEAPONS.fighter_gun.damage,
   fighterShare:fighterNow/allNow,fighterUnthinned:fighterUnthinned/(allNow-fighterNow+fighterUnthinned),shown,hullGuns,interval:BELT_INTERVAL};
 });
 // Measured (6 main rounds and 896 lighter ones over the looks, 492 of them fighter cannon): main guns were 7.5 %
 // of the area tracers cover and are 53 %; fighter cannon are 4 %, and would be 15 % if every round were drawn;
 // all tracers together cover 14 % of what they did. The main guns' share moves with how many main rounds happen
 // to be in the air at the ten looks: with 9 of them (when fighters went home with their last torpedo) it was
 // 63 %, and its floor here was 0.55; it is 0.45 now, as in the Codex build. The light rounds of hulls are 404
 // in both. The fighter cannon's share is the figure the belt rule controls, and it is bounded here.
 expect(result.mainRounds).toBeGreaterThan(0);
 expect(result.shareBefore).toBeLessThan(0.3);
 expect(result.shareNow).toBeGreaterThan(0.45);
 expect(result.fighterShare).toBeLessThan(0.08);
 expect(result.fighterUnthinned).toBeGreaterThan(0.1);
 expect(result.shown).toBe(100);
 expect(result.interval).toBe(4);
 expect(result.hullGuns).toBe(true);
 expect(result.total).toBeLessThan(0.4);
 expect(result.mainUnchanged).toBeLessThan(1e-6);
 expect(result.fighterGun).toBe(6);
});

// Fighters are winged craft, not boxes with lights on (port of the Codex build's tests/fighter-models.test.ts).
// Every faction's fighter was four to six boxes with a canopy drawn as a cube in the lit-window material.
test('each faction has a winged fighter of its stated length, faces outward, with no lit canopy',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {getShipTemplate}=await import('/src/rendering/ships/index.ts');
  // Plain arithmetic on the vertex buffers: a template's meshes sit untransformed in its group.
  const points=(geometry:any)=>{const g=geometry.index?geometry.toNonIndexed():geometry;return g.getAttribute('position');};
  const volume=(geometry:any)=>{const p=points(geometry);let v=0;
   for(let i=0;i<p.count;i+=3){const ax=p.getX(i),ay=p.getY(i),az=p.getZ(i),bx=p.getX(i+1),by=p.getY(i+1),bz=p.getZ(i+1),cx=p.getX(i+2),cy=p.getY(i+2),cz=p.getZ(i+2);
    v+=(ax*(by*cz-bz*cy)+ay*(bz*cx-bx*cz)+az*(bx*cy-by*cx))/6;}return v;};
  const extent=(meshes:any[])=>{const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
   for(const m of meshes){const p=points(m.geometry);for(let i=0;i<p.count;i++){const v=[p.getX(i),p.getY(i),p.getZ(i)];for(let k=0;k<3;k++){low[k]=Math.min(low[k],v[k]);high[k]=Math.max(high[k],v[k]);}}}
   return {x:high[0]-low[0],y:high[1]-low[1],z:high[2]-low[2]};};
  return ['alliance_fighter','turian_fighter','salarian_fighter','cerberus_fighter','geth_fighter','quarian_fighter'].map((id)=>{
   const ship=getShipTemplate(id),meshes=ship.group.children.filter((c:any)=>c.isMesh) as any[],box=extent(meshes);
   const lit=meshes.find((m)=>m.name==='windows'),lens=lit?extent([lit]):undefined;
   return {id,length:ship.lengthUnits,z:box.z,span:box.x/box.z,height:box.y/box.z,
    triangles:meshes.reduce((n,m)=>n+points(m.geometry).count/3,0),
    inward:meshes.filter((m)=>volume(m.geometry)<=0).map((m)=>m.name),
    engines:ship.engineNodes.length,astern:ship.engineNodes.every((n:any)=>n.z<-ship.lengthUnits*0.48),lens:lens?Math.max(lens.x,lens.y,lens.z)/ship.lengthUnits:0};
  });
 });
 for(const ship of result){
  // Measured: 220 to 380 triangles (the box models were 60 to 108).
  expect(ship.triangles,ship.id).toBeGreaterThan(180);
  expect(ship.triangles,ship.id).toBeLessThanOrEqual(420);
  expect(ship.inward,ship.id).toEqual([]);
  expect(ship.z/ship.length,ship.id).toBeGreaterThan(0.98);
  expect(ship.z/ship.length,ship.id).toBeLessThan(1.04);
  expect(ship.span,ship.id).toBeGreaterThan(0.45);
  expect(ship.span,ship.id).toBeLessThan(0.85);
  expect(ship.height,ship.id).toBeLessThan(0.42);
  expect(ship.engines,ship.id).toBeGreaterThanOrEqual(1);
  expect(ship.astern,ship.id).toBe(true);
  // No piloted fighter has a lit canopy; the geth fighter has one small lens.
  if(ship.id==='geth_fighter'){expect(ship.lens).toBeGreaterThan(0);expect(ship.lens).toBeLessThan(0.08);}else expect(ship.lens,ship.id).toBe(0);
 }
 // Each faction has its own silhouette.
 for(let i=0;i<result.length;i++)for(let j=0;j<i;j++)expect(Math.hypot(result[i].span-result[j].span,result[i].height-result[j].height),result[i].id+' '+result[j].id).toBeGreaterThan(0.02);
});

// The flashes that go with the fire (port of the Codex build's second visual-weight pass).
test('in the Battle of Earth main guns make most of the muzzle flash, and light hits throw fewer sparks',async({page})=>{
 test.slow();
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {BattleSimulation}=await import('/src/simulation/battle.ts');
  const {buildScenario}=await import('/src/scenarios/index.ts');
  const {muzzleFlashSize,impactSize,impactSparks,MAIN_CALIBRE,HEAVY_HIT}=await import('/src/rendering/visualWeight.ts');
  const sim=new BattleSimulation(buildScenario('battle_of_earth','prime_apex',1));
  while(!sim.finished&&sim.time<120)sim.step();
  const square=(n:number)=>n*n;
  let main=0,lightBefore=0,lightNow=0,hitBefore=0,hitNow=0,sparksBefore=0,sparksNow=0,mainShots=0,lightShots=0;
  for(const event of sim.events as any[]){
   if(event.type==='weapon_fired'&&event.kind==='mass_accelerator'){
    const damage=sim.getShip(event.shipId)!.weapons[event.weaponIndex].def.damage;
    if(damage>=MAIN_CALIBRE){main+=square(muzzleFlashSize(damage,false));mainShots++;}
    // Light-gun flashes are thinned to 35 % of shots, before and now.
    else{lightBefore+=0.35*square(1.2);lightNow+=0.35*square(muzzleFlashSize(damage,false));lightShots++;}
   }else if(event.type==='projectile_impact'&&!event.glancing){
    const damage=event.barrierDamage+event.hullDamage;if(damage<=0||damage>=HEAVY_HIT)continue;
    hitBefore+=square(Math.min(8,0.4+Math.sqrt(damage)*0.09));hitNow+=square(impactSize(damage));
    if(!(event.barrierDamage>event.hullDamage&&event.barrierDamage>3)){sparksBefore+=Math.min(10,2+Math.floor(event.hullDamage/120));sparksNow+=impactSparks(event.hullDamage);}
   }
  }
  return {mainShots,lightShots,shareBefore:main/(main+lightBefore),shareNow:main/(main+lightNow),light:lightNow/lightBefore,hits:hitNow/hitBefore,sparksBefore,sparksNow};
 });
 expect(result.mainShots).toBeGreaterThan(0);
 expect(result.shareBefore).toBeLessThan(0.5);
 expect(result.shareNow).toBeGreaterThan(0.8);
 expect(result.light).toBeLessThan(0.1);
 // Measured (53 main shots, 9,792 lighter, most of them fighters strafing): main guns 12 % of muzzle-flash area
 // before, 83 % now; light guns' flashes cover 3 % of what they did; hits under 100 damage 39 %, and they threw
 // 1,028 sparks and now throw none. Before fighters strafed there were 1,866 lighter shots and main guns had 90 %;
 // when fighters strafed but went home with their last torpedo, 5,509 and 86 %.
 expect(result.hits).toBeLessThan(0.75);
 expect(result.sparksBefore).toBeGreaterThan(300);
 expect(result.sparksNow).toBeLessThan(result.sparksBefore*0.2);
});
