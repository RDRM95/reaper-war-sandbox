import {test,expect} from '@playwright/test';
for (const rulesId of ['prime_apex', 'reaper_hardcore']) test(rulesId + ': controlled four-craft Oculus dogfights use real weapons',async({page},info)=>{
 test.setTimeout(120000);await page.goto('/?reference=sol-42&t=0');
 const records=await page.evaluate(async(rulesId)=>{
  const {BattleView}=await import('/src/rendering/battleView.ts');
  const {BattleSimulation}=await import('/src/simulation/battle.ts');
  const {buildCustomBattle}=await import('/src/scenarios/index.ts');
  const records=[];
  for(const seed of [7,42,1337]){
   const config=buildCustomBattle({seed,rulesId,environment:'deep_space',startingDistanceKm:20,
    sideA:{faction:'alliance',name:'QA Tridents',formation:'fighter_screen',counts:{alliance_carrier:1,alliance_fighter:4}},
    sideB:{faction:'reaper',name:'QA Oculus',formation:'fighter_screen',counts:{reaper_capital:1,reaper_oculus:4}}});
   const sim=new BattleSimulation(config);
   for(const ship of sim.ships)if(ship.role!=='fighter'){
    for(const weapon of ship.weapons)weapon.cooldown=1000;
    if(ship.hangar)ship.hangar.remaining=0;
   }
   for(let n=0;n<200&&!sim.finished;n++)sim.step();
   const shots=sim.events.filter(e=>e.type==='weapon_fired'&&sim.getShip(e.shipId)?.role==='fighter');
   records.push({seed,pulseDamage:sim.ships.find((s:any)=>s.classId==='reaper_oculus')!.weapons[0].def.damage,seconds:sim.time,shotsA:shots.filter(e=>sim.getShip(e.shipId)?.side==='A').length,shotsB:shots.filter(e=>sim.getShip(e.shipId)?.side==='B').length,
    oculusBeams:shots.filter(e=>e.weaponId==='oculus_beam').length,fighters:sim.ships.filter(s=>s.role==='fighter').length,live:sim.ships.filter(s=>s.role==='fighter'&&s.alive).length});
   if(seed===42){
    const canvas=document.createElement('canvas');canvas.id='qa-oculus';canvas.style.cssText='position:fixed;left:0;top:0;width:960px;height:540px;z-index:99999';document.body.append(canvas);
    const view=new BattleView(canvas,sim,{quality:'high',pixelRatioCap:1,showEngineGlow:true,lod:false});view.resize(960,540);
    const eye=sim.ships.find(s=>s.classId==='reaper_oculus'&&s.alive)!;
    view.followId=eye.id;view.rig.setMode('follow');view.rig.yaw=Math.PI-.4;view.rig.pitch=.18;view.rig.distance=80;
    for(let n=0;n<25;n++)view.update(.1,1);view.render();
   }
  }
  return records;
 },rulesId);
 console.log('CONTROLLED_OCULUS_QA '+JSON.stringify(records));
 await page.locator('#qa-oculus').screenshot({path:info.outputPath('oculus-front-optic.png')});
 for(const record of records){expect(record.pulseDamage).toBe(26);expect(record.shotsA).toBeGreaterThan(0);expect(record.shotsB).toBeGreaterThan(0);expect(record.fighters).toBe(8);}
});
