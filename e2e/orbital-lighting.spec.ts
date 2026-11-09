import {test,expect} from '@playwright/test';

test('planet keeps its solar terminator when ship fill lighting changes',async({page},info)=>{
 await page.goto('/?reference=sol-42&t=0');
 const metrics=await page.evaluate(async()=>{
  const {BattleView}=await import('/src/rendering/battleView.ts');
  const {BattleSimulation}=await import('/src/simulation/battle.ts');
  const {buildCustomBattle}=await import('/src/scenarios/index.ts');
  const sim=new BattleSimulation(buildCustomBattle({seed:42,rulesId:'prime_apex',environment:'earth_orbit',startingDistanceKm:60,
   sideA:{faction:'alliance',name:'Alliance',formation:'line_abreast',counts:{alliance_dreadnought:4}},
   sideB:{faction:'reaper',name:'Reapers',formation:'line_abreast',counts:{reaper_capital:2}}}));
  const canvas=document.createElement('canvas');canvas.id='qa-orbit';
  canvas.style.cssText='position:fixed;left:0;top:0;width:960px;height:540px;z-index:99999';document.body.append(canvas);
  const view=new BattleView(canvas,sim,{quality:'high',showEngineGlow:true,pixelRatioCap:1,lod:true,bloom:false});
  view.resize(960,540);view.referenceCamera=true;view.rig.camera.position.set(100,80,-250);view.rig.camera.lookAt(0,-100,100);
  view.rig.camera.updateMatrixWorld(true);view.update(1/60,1);
  const gl=view.renderer.getContext();
  const pixels=()=>{view.render();const data=new Uint8Array(300*65*4);gl.readPixels(330,5,300,65,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
  const fill=(view as any).fillLight;
  fill.intensity=0;const dark=pixels();fill.intensity=8;const lit=pixels();
  let difference=0,brightness=0;
  for(let i=0;i<dark.length;i+=4)for(let c=0;c<3;c++){difference+=Math.abs(dark[i+c]-lit[i+c]);brightness+=dark[i+c];}
  fill.intensity=.9;view.render();
  return {meanFillDifference:difference/(dark.length/4*3),meanPlanetBrightness:brightness/(dark.length/4*3),drawCalls:view.drawCalls};
 });
 await page.locator('#qa-orbit').screenshot({path:info.outputPath('orbital-solar-lighting.png')});
 console.log('ORBITAL_LIGHTING '+JSON.stringify(metrics));
 expect(metrics.meanPlanetBrightness).toBeGreaterThan(4);
 expect(metrics.meanFillDifference).toBeLessThan(.1);
});
