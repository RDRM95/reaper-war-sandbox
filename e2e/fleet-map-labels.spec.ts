import {test,expect} from '@playwright/test';
test('large fleet map labels fleets at distance and restores selected/close ship detail',async({page},info)=>{
 await page.goto('/?reference=sol-42&t=0');
 const result=await page.evaluate(async()=>{
  const {FleetMap2D}=await import('/src/spectator/flatView.ts');
  const {BattleSimulation}=await import('/src/simulation/battle.ts');
  const {buildCustomBattle}=await import('/src/scenarios/index.ts');
  const sim=new BattleSimulation(buildCustomBattle({seed:42,rulesId:'prime_apex',environment:'deep_space',startingDistanceKm:110,
   sideA:{faction:'alliance',name:'Alliance battlegroup',formation:'line_abreast',counts:{alliance_dreadnought:100,alliance_cruiser:400,alliance_frigate:300}},
   sideB:{faction:'reaper',name:'Reaper vanguard',formation:'strike_wedge',counts:{reaper_capital:50,reaper_destroyer:150}}}));
  const canvas=document.createElement('canvas');canvas.id='qa-map';canvas.style.cssText='position:fixed;left:0;top:0;width:960px;height:540px;z-index:99999';document.body.append(canvas);
  const map=new FleetMap2D(canvas),context=canvas.getContext('2d')!,labels:string[]=[];
  const text=context.fillText.bind(context);context.fillText=(value,x,y)=>{labels.push(value);text(value,x,y);};
  map.draw(sim);const far=labels.slice();labels.length=0;
  const selected=sim.ships.find(s=>s.side==='A')!;map.selected=selected.id;map.draw(sim);const selection=labels.slice();labels.length=0;
  canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:-1500,cancelable:true}));map.draw(sim);const close=labels.slice();
  // Restore the ordinary fleet overview for its reference screenshot.
  map.reset();map.draw(sim);
  return{far,selection,close,selectedName:selected.name,ships:sim.ships.length};
 });
 await page.locator('#qa-map').screenshot({path:info.outputPath('thousand-ship-fleet-labels.png')});
 expect(result.ships).toBe(1000);
 expect(result.far.filter(s=>s.includes(' SHIPS'))).toHaveLength(2);
 expect(result.far).not.toContain(result.selectedName);
 expect(result.selection).toContain(result.selectedName);
 expect(result.close.some(s=>!s.includes(' SHIPS')&&!s.includes('SPECTATOR'))).toBe(true);
});
