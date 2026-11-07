import { test, expect } from '@playwright/test';

test('original-engine simulator boots and both spectator modes render', async ({page}) => {
  const errors:string[]=[];
  page.on('pageerror', error=>errors.push(error.message));
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#launch')).toBeVisible();
  await expect(page.locator('#clock')).not.toHaveText('00:00',{timeout:30000});
  await expect(page.locator('#error')).toBeHidden();
  await expect(page.locator('#scene3d')).toBeVisible();
  await page.screenshot({path:'test-artifacts/3d-spectator.png',fullPage:true});
  await page.locator('#toggle2d').click();
  await expect(page.locator('#scene2d')).toBeVisible();
  await page.screenshot({path:'test-artifacts/2d-spectator.png',fullPage:true});
  await page.locator('#sideB').click();
  await expect(page.locator('#faction')).toHaveValue('reaper');
  await expect(page.locator('#roster input').first()).toBeVisible();
  expect(errors).toEqual([]);
});


test('gunnery HUD and HUD-free mode are real spectator controls', async ({page}) => {
  const errors:string[]=[];
  page.on('pageerror', error=>errors.push(error.message));
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#clock')).not.toHaveText('00:00',{timeout:30000});
  await page.locator('#gunner').click();
  await expect(page.locator('.target-telemetry')).toBeVisible();
  // Live gunnery automatically acquires a friendly weapon platform.
  await expect(page.locator('.target-panel')).toContainText('WEAPON READY');
  await page.locator('#clean').click();
  await expect(page.locator('.target-telemetry')).toBeHidden();
  await expect(page.locator('#stage')).toHaveClass(/clean-recording/);
  await page.locator('#clean').click();
  await expect(page.locator('#stage')).not.toHaveClass(/clean-recording/);
  expect(errors).toEqual([]);
});
