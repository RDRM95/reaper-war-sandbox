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
  expect(output.chapters).toBeGreaterThanOrEqual(43);
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

test('hull impacts vary with barrel and shot number; Reaper beams stay on rotating hulls',async({page})=>{
  await page.goto('/?reference=sol-42&t=0');
  const result=await page.evaluate(async()=>{
    const {BattleSimulation}=await import('/src/simulation/battle.ts');
    const {buildCustomBattle}=await import('/src/scenarios/index.ts');
    const {beamContactLocal,worldHullContact,spreadProjectileAim,glanceMultiplier}
      =await import('/src/simulation/impactGeometry.ts');
    const {distance,v3}=await import('/src/core/vec3.ts');
    const sim=new BattleSimulation(buildCustomBattle({
      seed:27,rulesId:'prime_apex',environment:'deep_space',startingDistanceKm:55,
      sideA:{faction:'alliance',name:'Main gun',formation:'capital_column',counts:{alliance_aegis_command:1}},
      sideB:{faction:'reaper',name:'Capital',formation:'capital_column',counts:{reaper_capital:1}}
    }));
    const a=sim.ships.find(s=>s.side==='A')!,b=sim.ships.find(s=>s.side==='B')!;
    const p1=spreadProjectileAim(b.pos,a.pos,b,1,0);
    const p2=spreadProjectileAim(b.pos,a.pos,b,2,0);
    const local=beamContactLocal(b,a,3,0);
    const first=worldHullContact(a,local);
    a.heading=v3(1,0,0);
    const rotated=worldHullContact(a,local);
    return {different:distance(p1,p2)>.01,within:distance(p1,b.pos)<b.radiusKm,
      moving:distance(first,rotated)>.1,
      glance:glanceMultiplier(v3(0,0,1),v3(b.pos.x+b.radiusKm,b.pos.y,b.pos.z),b)};
  });
  expect(result.different).toBe(true);
  expect(result.within).toBe(true);
  expect(result.moving).toBe(true);
  expect(result.glance).toBeLessThan(1);
});
