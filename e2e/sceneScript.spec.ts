import { test, expect } from '@playwright/test';

test('Scene Script mode stages real fleet reinforcements with timed cinematography', async ({page}) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('#scene-script')).toBeVisible();
  await page.locator('#scene-script').click();
  await expect(page.locator('#scene-panel')).toBeVisible();
  const source = await page.locator('#scene-json').inputValue();
  const script = JSON.parse(source);
  expect(script.environment).toBe('relay');
  expect(script.beats).toHaveLength(7);
  expect(script.waves).toHaveLength(2);
  await page.locator('#scene-run').click();
  await expect(page.locator('#scene-panel')).toBeHidden();
  await expect(page.locator('#battle-name')).toHaveText('CHARON RELAY — INTERCEPTION');
  await expect(page.locator('#scene-caption')).toContainText('CHARON RELAY');
  // Scenario is live: this is not a prerecorded cutscene.
  await expect(page.locator('#clock')).not.toHaveText('00:00', {timeout: 30000});
  const info = await page.evaluate(() =>
    (window as Window & {__reaperDiagnostics?:()=>any}).__reaperDiagnostics?.());
  expect(info.shipCount).toBeGreaterThan(40);
  expect(info.tick).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('Scene Script rejects invalid waves without resetting a running battle', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('#clock')).not.toHaveText('00:00', {timeout: 30000});
  const before = await page.evaluate(() =>
    (window as Window & {__reaperDiagnostics?:()=>any}).__reaperDiagnostics?.());
  await page.locator('#scene-script').click();
  await page.locator('#scene-json').fill(JSON.stringify({
    title: 'Invalid script',
    beats: [{at: 0, shot: 'wide', caption: 'test'}],
    waves: [{at: 6, side: 'A', name: 'Wrong faction', ships: {reaper_capital: 100}}],
  }));
  await page.locator('#scene-run').click();
  await expect(page.locator('#scene-panel')).toBeVisible();
  await expect(page.locator('#scene-status')).toContainText('SCRIPT ERROR');
  const after = await page.evaluate(() =>
    (window as Window & {__reaperDiagnostics?:()=>any}).__reaperDiagnostics?.());
  expect(after.seed).toBe(before.seed);
  expect(after.time).toBeGreaterThanOrEqual(before.time);
});
