import { test, expect } from '@playwright/test';

type Diagnostics = {
  seed:number;time:number;shipCount:number;liveShips:number;
  ships:Array<{id:string;side:string;position:{x:number;y:number;z:number}}>;
  view:{camera:number[];quaternion:number[];drawCalls:number;triangles:number;quality:string}|null;
};

async function snapshot(page:import('@playwright/test').Page):Promise<Diagnostics>{
  return page.evaluate(() => {
    const method=(window as typeof window & {__reaperDiagnostics?:()=>unknown}).__reaperDiagnostics;
    if(!method)throw new Error('Missing renderer diagnostics');
    return method() as Diagnostics;
  });
}

test('fixed sol battle uses identical ships and camera at low and cinematic fidelity',async({page},info)=>{
  await page.goto('/?reference=sol-42&t=18');
  await expect(page.locator('#scene3d')).toBeVisible();
  await page.waitForFunction(() => !!(window as typeof window & {__reaperDiagnostics?:()=>unknown}).__reaperDiagnostics?.());
  await page.waitForTimeout(1200);
  await page.locator('#graphics').selectOption('low');
  await page.waitForTimeout(800);
  const low=await snapshot(page);
  await page.locator('#scene3d').screenshot({path:info.outputPath('reference-performance.png')});
  await page.locator('#graphics').selectOption('ultra');
  await page.waitForTimeout(1200);
  const ultra=await snapshot(page);
  await page.locator('#scene3d').screenshot({path:info.outputPath('reference-cinematic.png')});
  expect(low.seed).toBe(42);
  expect(low.time).toBeCloseTo(18,4);
  expect(ultra.time).toBe(low.time);
  expect(ultra.shipCount).toBe(low.shipCount);
  expect(ultra.ships).toEqual(low.ships);
  expect(ultra.view?.camera).toEqual(low.view?.camera);
  expect(ultra.view?.quaternion).toEqual(low.view?.quaternion);
  expect(ultra.view?.quality).toBe('ultra');
  expect(low.view?.quality).toBe('low');
  expect((ultra.view?.drawCalls??0)).toBeGreaterThan(0);
});

test('fleet camera and controls remain functional with instanced rendering',async({page})=>{
  await page.goto('/?reference=sol-42&t=0');
  await expect(page.locator('#launch')).toBeVisible();
  await expect(page.locator('#toggle2d')).toBeVisible();
  await page.locator('#toggle2d').click();
  await expect(page.locator('#scene2d')).toBeVisible();
  await page.locator('#toggle3d').click();
  await expect(page.locator('#scene3d')).toBeVisible();
  const state=await snapshot(page);
  expect(state.shipCount).toBeGreaterThan(0);
  expect(state.view?.drawCalls).toBeGreaterThanOrEqual(0);
});
