import {test,expect} from '@playwright/test';

test('a pitched barrel and its interpolated sight match the rendered hull',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {BattleSimulation}=await import('/src/simulation/battle.ts');
  const {buildCustomBattle}=await import('/src/scenarios/index.ts');
  const {gunneryFrame,primaryGunneryMount}=await import('/src/rendering/gunnery.ts');
  const sim=new BattleSimulation(buildCustomBattle({seed:42,rulesId:'prime_apex',environment:'deep_space',startingDistanceKm:60,
   sideA:{faction:'alliance',name:'Mount',formation:'line_abreast',counts:{alliance_dreadnought:1}},
   sideB:{faction:'reaper',name:'Contact',formation:'line_abreast',counts:{reaper_capital:1}}}));
  const ship=sim.ships[0],weapon=primaryGunneryMount(ship)!;
  ship.prevHeading={x:0,y:0,z:1};ship.heading={x:0,y:.8,z:.6};
  ship.prevPos={x:0,y:0,z:0};ship.pos={x:1,y:2,z:3};weapon.offset={x:.2,y:-.3,z:.8};
  const frame=gunneryFrame(ship,weapon,.5);
  const direction=frame.aim.clone().sub(frame.position).normalize();
  const expectedHeading={x:0,y:1/Math.sqrt(5),z:2/Math.sqrt(5)};
  return {sightError:Math.hypot(direction.x-expectedHeading.x,direction.y-expectedHeading.y,direction.z-expectedHeading.z)};
 });
 expect(result.sightError).toBeLessThan(1e-8);
});

test('live main-gun optics stay on one ship through zoom and graphics changes',async({page},info)=>{
 await page.goto('/');
 await page.locator('#graphics').selectOption('low');
 await page.locator('#gunner').click();
 await expect(page.locator('.target-telemetry')).toBeVisible();
 const state=()=>page.evaluate(()=>(window as any).__reaperDiagnostics());
 const before=await state();
 expect(before.sceneLockedShipId).toBeTruthy();
 await page.locator('.gunnery-zoom').click();
 await expect(page.locator('.gunnery-zoom')).toContainText('×1');
 await page.locator('#graphics').selectOption('high');
 await expect.poll(async()=>(await state()).time).toBeGreaterThan(before.time);
 const after=await state();
 expect(after.sceneLockedShipId).toBe(before.sceneLockedShipId);
 expect(after.sceneCameraMode).toBe('gunnery');
 await page.screenshot({path:info.outputPath('live-main-gun.png')});
});

test('destroyed gunner station holds its last camera and persistent signal loss',async({page},info)=>{
 await page.goto('/');
 await page.locator('#graphics').selectOption('low');
 await page.locator('#scenario').selectOption('duel');
 await page.locator('#rules').selectOption('reaper_hardcore');
 await page.locator('#distance').fill('90');
 await page.locator('#launch').click();
 await page.locator('#gunner').click();
 const state=()=>page.evaluate(()=>(window as any).__reaperDiagnostics(true));
 const first=await state();
 expect(first.sceneLockedShipId).toBeTruthy();
 await page.locator('#speed').selectOption('8');
 await expect(page.locator('.gunnery-line')).toHaveText('SIGNAL LOST · STATION ENDED',{timeout:30000});
 const lost=await state();
 await page.waitForTimeout(1400);
 const held=await state();
 expect(held.sceneLockedShipId).toBe(first.sceneLockedShipId);
 expect(held.sceneCameraMode).toBe('gunnery');
 expect(held.view.camera).toEqual(lost.view.camera);
 expect(Math.hypot(...held.view.quaternion.map((n:number,i:number)=>n-lost.view.quaternion[i]))).toBeLessThan(1e-8);
 await expect(page.locator('.target-telemetry')).toHaveClass(/signal-lost/);
 await page.screenshot({path:info.outputPath('station-ended.png')});
});
