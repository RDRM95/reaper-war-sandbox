import {test,expect} from '@playwright/test';

test('shared AU catalogue validates all references and registers strategic-scale chapters',async({page})=>{
  await page.goto('/?reference=sol-42&t=0');
  const output=await page.evaluate(async()=>{
    const {AU_CHAPTERS}=await import('/src/scenarios/auLibrary.ts');
    const {auditAULibrary}=await import('/src/scenarios/catalogQA.ts');
    const {buildScenario}=await import('/src/scenarios/index.ts');
    const audit=auditAULibrary();
    const valid=AU_CHAPTERS.every(chapter=>{
      const c=buildScenario(chapter.id,chapter.rules,47);
      return c.alternateHistory&&c.fleets.length>=2;
    });
    return {...audit,valid};
  });
  expect(output.issues).toEqual([]);
  expect(output.chapters).toBeGreaterThanOrEqual(37);
  expect(output.valid).toBe(true);
});

test('strategic numerical calculation handles 75,100 ships without rendering or spawning battle units',async({page})=>{
  await page.goto('/?reference=sol-42&t=0');
  const result=await page.evaluate(async()=>{
    const {buildScenario}=await import('/src/scenarios/index.ts');
    const {resolveQuickBattle}=await import('/src/simulation/quickBattle.ts');
    const before=window.__reaperDiagnostics?.();
    const config=buildScenario('apex_52500_final_offensive','prime_apex',42);
    const started=performance.now();
    const report=resolveQuickBattle(config);
    const after=window.__reaperDiagnostics?.();
    return {timeMs:performance.now()-started,total:report.shipsAnalysed,
      isEstimate:report.approximate,
      sameShipCount:before?.shipCount===after?.shipCount,
      sameTime:before?.time===after?.time};
  });
  expect(result.total).toBe(75100);
  expect(result.isEstimate).toBe(true);
  expect(result.timeMs).toBeLessThan(3000);
  expect(result.sameShipCount).toBe(true);
  expect(result.sameTime).toBe(true);
});

test('live kill scoreboard and new Aegis roster are available without resetting battle',async({page})=>{
  await page.goto('/?reference=sol-42&t=0');
  await expect(page.locator('#kill-scoreboard')).toBeVisible();
  await expect(page.locator('#score-total-A')).toHaveText('0');
  await expect(page.locator('#score-total-B')).toHaveText('0');
  await page.locator('#score-toggle').click();
  await expect(page.locator('#kill-scoreboard')).toBeHidden();
  await page.locator('#score-toggle').click();
  await expect(page.locator('#kill-scoreboard')).toBeVisible();
  const state=await page.evaluate(async()=>{
    const {SHIP_CLASSES}=await import('/src/data/ships.ts');
    const {WEAPONS}=await import('/src/data/weapons.ts');
    return {className:SHIP_CLASSES.alliance_aegis_command?.name,
      weapon:WEAPONS.aegis_nova_command?.name};
  });
  expect(state.className).toContain('Aegis');
  expect(state.weapon).toContain('NOVA');
});
