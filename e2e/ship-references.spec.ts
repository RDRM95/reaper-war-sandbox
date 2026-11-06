import {test,expect} from '@playwright/test';

test('ship registry is immutable and distinguishes original AU models from on-screen models',async({page})=>{
  await page.goto('/?reference=sol-42&t=0');
  const data=await page.evaluate(async()=>{
    const {ShipReferenceRegistry,auditShipReferences}=await import('/src/references/ShipReferenceRegistry.ts');
    const {buildShipQAAudit}=await import('/src/references/shipQA.ts');
    const list=[...ShipReferenceRegistry.values()],audit=auditShipReferences(),qa=buildShipQAAudit();
    return {total:list.length,p0:list.filter(r=>r.build_priority==='P0').length,
      apex:list.filter(r=>r.apex_original).length,
      immutable:list.every(r=>Object.isFrozen(r)&&Object.isFrozen(r.primary_source_ids)),
      unapproved:audit.every(a=>!a.actualGameMesh&&a.approval!=='pass'),
      missing:audit.filter(a=>!a.modelAvailable).map(a=>a.reference.id),
      sovereign:qa.find(a=>a.registryId==='REP-001')?.referenceLengthM,
      destroyer:qa.find(a=>a.registryId==='REP-003')?.referenceLengthM
    };
  });
  expect(data.total).toBe(43);expect(data.p0).toBe(13);expect(data.apex).toBe(7);
  expect(data.immutable).toBe(true);expect(data.unapproved).toBe(true);
  expect(data.missing).not.toContain('ALL-001');
  expect(data.sovereign).toBe(2000);expect(data.destroyer).toBe(160);
});

test('six-view compare opens without modifying a frozen battle',async({page})=>{
  await page.goto('/?reference=sol-42&t=0');
  await expect(page.locator('#ship-reference-launch')).toBeVisible();
  const before=await page.evaluate(()=>window.__reaperDiagnostics?.()?.time);
  await page.locator('#ship-reference-launch').click();
  await expect(page.locator('#ship-reference-panel')).toBeVisible();
  await page.locator('#ship-reference-panel select').selectOption('REP-001');
  await expect(page.locator('.shipref-cell')).toHaveCount(6);
  await expect(page.locator('.shipref-cell canvas')).toHaveCount(6);
  await page.locator('.shipref-top input[type=range]').fill('35');
  await page.locator('.shipref-cell').first().getByRole('button',{name:'FAIL'}).click();
  await expect(page.locator('.shipref-cell').first()).toContainText('FAIL');
  await page.getByRole('button',{name:'CLOSE',exact:true}).click();
  await expect(page.locator('#ship-reference-panel')).toHaveCount(0);
  const after=await page.evaluate(()=>window.__reaperDiagnostics?.()?.time);
  expect(after).toBe(before);
});
