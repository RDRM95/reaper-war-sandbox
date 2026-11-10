import { test, expect } from '@playwright/test';

test('equal-scale fleet inspection exposes the real dimensions and leaves the reference battle frozen', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?reference=sol-42&t=0');
  await expect(page.locator('#ship-reference-launch')).toBeVisible();
  await page.locator('#toggle2d').click();
  const before = await page.evaluate(() => window.__reaperDiagnostics?.()?.time);
  await page.locator('#ship-reference-launch').click();
  await page.locator('#ship-reference-panel select').selectOption('REP-001');
  await expect(page.locator('.shipref-context')).toContainText('length 2,000 m');
  await page.getByRole('button', { name: 'TRUE-SCALE COMPARISON', exact: true }).click();
  const comparison = page.getByRole('region', { name: 'True-scale fleet comparison' });
  await expect(comparison.locator('tbody tr')).toHaveCount(6);
  await expect(comparison.locator('[data-class-id="reaper_capital"] td').nth(2)).toHaveText('2,000');
  await expect(comparison.locator('[data-class-id="reaper_destroyer"] td').nth(2)).toHaveText('160');
  await expect(comparison.locator('[data-class-id="alliance_fighter"] td').nth(2)).toHaveText('18');
  await expect(comparison).toHaveAttribute('data-gl-error', '0');
  await comparison.screenshot({ path: testInfo.outputPath('sandbox-measured-scale.png') });
  await page.getByLabel('Show measured bounds').check();
  await page.getByRole('button', { name: 'Three-quarter — hull depth' }).click();
  await expect(comparison).toHaveAttribute('data-gl-error', '0');
  await page.getByRole('button', { name: 'BACK TO SIX VIEWS' }).click();
  await expect(page.locator('.shipref-cell')).toHaveCount(6);
  await page.getByRole('button', { name: 'CLOSE', exact: true }).click();
  expect(await page.evaluate(() => window.__reaperDiagnostics?.()?.time)).toBe(before);
  expect(errors).toEqual([]);
});
