import { test, expect } from '@playwright/test';

const diagnostics = (page: any) => page.evaluate(() =>
  (window as Window & { __reaperDiagnostics?: () => any }).__reaperDiagnostics?.());

test('Scripted live scene stays in one real main gun POV instead of cutting on beats', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.locator('#scene-script').click();
  await page.locator('#scene-pov-example').click();
  await expect(page.locator('#scene-json')).toHaveValue(/continuous_pov/);
  await page.locator('#scene-run').click();
  await expect(page.locator('#battle-name')).toContainText('MAIN BATTERY POV');
  await expect(page.locator('.target-telemetry')).toBeVisible();
  const first = await diagnostics(page);
  expect(first.scenePresentation).toBe('continuous_pov');
  expect(first.sceneCameraMode).toBe('gunnery');
  expect(first.sceneLockedShipId).toBeTruthy();
  await expect.poll(async () => (await diagnostics(page)).time, {timeout: 30000})
    .toBeGreaterThan(first.time);
  const next = await diagnostics(page);
  expect(next.sceneCameraMode).toBe('gunnery');
  expect(next.sceneLockedShipId).toBe(first.sceneLockedShipId);
  expect(next.time).toBeGreaterThan(first.time);
  expect(errors).toEqual([]);
});

test('Scripted free exploration moves independent of the still-running battle', async ({ page }) => {
  await page.goto('/');
  await page.locator('#scene-script').click();
  await page.locator('#scene-explore-example').click();
  await page.locator('#scene-run').click();
  await expect(page.locator('#battle-name')).toContainText('FREE EXPLORATION');
  const first = await diagnostics(page);
  expect(first.scenePresentation).toBe('explore');
  expect(first.sceneCameraMode).toBe('free');
  await page.keyboard.down('w');
  await expect.poll(async () => JSON.stringify((await diagnostics(page)).view.camera), {timeout: 30000})
    .not.toBe(JSON.stringify(first.view.camera));
  await page.keyboard.up('w');
  const next = await diagnostics(page);
  expect(next.sceneCameraMode).toBe('free');
  expect(next.time).toBeGreaterThan(first.time);
  expect(next.view.camera).not.toEqual(first.view.camera);
});

test('Scene POV preflight does not replace a running battle with an absent ship', async ({ page }) => {
  await page.goto('/');
  await page.locator('#scene-script').click();
  await page.locator('#scene-pov-example').click();
  const raw = JSON.parse(await page.locator('#scene-json').inputValue());
  raw.pov = { side: 'A', classId: 'reaper_capital' };
  await page.locator('#scene-json').fill(JSON.stringify(raw));
  await page.locator('#scene-run').click();
  await expect(page.locator('#scene-panel')).toBeVisible();
  await expect(page.locator('#scene-status')).toContainText('SCRIPT ERROR');
});
