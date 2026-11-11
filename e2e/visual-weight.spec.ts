import { expect, test } from '@playwright/test';

// Main batteries read first (port of the battle half of the Codex build's tests/visual-weight.test.ts). Owner's
// report: fighters "draw too much visual attention compared to main weapons, looks messy like rat a tat gunfire or
// sparks". Every small-calibre round was drawn 45 m wide against 110 m for a dreadnought's slug, with about seventy
// of them in the air for each main round.
test('in the Battle of Earth the main guns take most of the tracer picture instead of a fifth',async({page})=>{
 test.slow();
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {BattleSimulation}=await import('/src/simulation/battle.ts');
  const {buildScenario}=await import('/src/scenarios/index.ts');
  const {tracerSize,MAIN_CALIBRE}=await import('/src/rendering/visualWeight.ts');
  const {WEAPONS}=await import('/src/data/weapons.ts');
  const KM=10;
  // Picture area a tracer covers, as the renderer sizes it (width times length, render units).
  const area=(calibre:number,speed:number,size:{width:number;length:number})=>size.width*Math.max(calibre>=MAIN_CALIBRE?1.5:0.8,speed*KM*0.06)*size.length;
  const before=(calibre:number)=>calibre>=MAIN_CALIBRE?{width:1.1,length:1.3}:{width:0.45,length:0.7};
  const sim=new BattleSimulation(buildScenario('battle_of_earth','prime_apex',1));
  let mainBefore=0,allBefore=0,mainNow=0,allNow=0,mainRounds=0,lightRounds=0,next=30;
  while(!sim.finished&&sim.time<120){sim.step();if(sim.time<next)continue;next+=10;
   for(const p of sim.projectiles){const calibre=p.weapon.damage,speed=Math.hypot(p.vel.x,p.vel.y,p.vel.z);
    const was=area(calibre,speed,before(calibre)),now=area(calibre,speed,tracerSize(calibre));allBefore+=was;allNow+=now;
    if(calibre>=MAIN_CALIBRE){mainBefore+=was;mainNow+=now;mainRounds++;}else lightRounds++;}}
  return {mainRounds,lightRounds,shareBefore:mainBefore/allBefore,shareNow:mainNow/allNow,total:allNow/allBefore,mainUnchanged:Math.abs(mainNow-mainBefore),fighterGun:WEAPONS.fighter_gun.damage};
 });
 // Measured (9 main rounds and 306 lighter ones over the looks): main guns were 22 % of the area tracers cover and
 // are 70 %; all tracers together cover 31 % of what they did.
 expect(result.mainRounds).toBeGreaterThan(0);
 expect(result.shareBefore).toBeLessThan(0.3);
 expect(result.shareNow).toBeGreaterThan(0.55);
 expect(result.total).toBeLessThan(0.4);
 expect(result.mainUnchanged).toBeLessThan(1e-6);
 expect(result.fighterGun).toBe(6);
});
