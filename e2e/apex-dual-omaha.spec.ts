import { test, expect } from '@playwright/test';

test('APEX Omegas have separate selectable factions, authored hulls and weapon mounts', async ({ page }) => {
  await page.goto('/?reference=apex-model-qa');
  const report = await page.evaluate(async () => {
    const { SHIP_CLASSES } = await import('/src/data/ships.ts');
    const { WEAPONS } = await import('/src/data/weapons.ts');
    const { hasModel, getShipTemplate } = await import('/src/rendering/ships/index.ts');
    const { isShipAllowedInRules } = await import('/src/timelines/lore.ts');
    const THREE = await import('three');

    const alliance = SHIP_CLASSES.alliance_omaha;
    const cerberus = SHIP_CLASSES.cerberus_omaha;
    const aModel = getShipTemplate(alliance.id);
    const cModel = getShipTemplate(cerberus.id);
    const aSize = new THREE.Box3().setFromObject(aModel.group).getSize(new THREE.Vector3());
    const cSize = new THREE.Box3().setFromObject(cModel.group).getSize(new THREE.Vector3());
    return {
      factions: [alliance.faction, cerberus.faction],
      bothModelled: hasModel(alliance.id) && hasModel(cerberus.id),
      distinctModels: aModel.group !== cModel.group &&
        aModel.group.name !== cModel.group.name,
      sizes: [aSize.toArray(), cSize.toArray()],
      lengths: [aModel.lengthUnits, cModel.lengthUnits],
      muzzle: cModel.muzzle?.toArray(),
      engineCount: cModel.engineNodes.length,
      mounts: cerberus.hardpoints.map(h => h.weaponId),
      completeWeapons: cerberus.hardpoints.every(h => !!WEAPONS[h.weaponId]),
      loreRestricted: !isShipAllowedInRules(cerberus, { strictLore: true } as any),
      auVisible: isShipAllowedInRules(cerberus, { strictLore: false } as any),
    };
  });
  expect(report.factions).toEqual(['alliance', 'cerberus']);
  expect(report.bothModelled).toBe(true);
  expect(report.distinctModels).toBe(true);
  expect(report.lengths).toEqual([18, 18]);
  for (const dimensions of report.sizes) {
    expect(dimensions.every((n: number) => Number.isFinite(n) && n > 0)).toBe(true);
  }
  expect(report.muzzle?.[2]).toBeGreaterThan(8);
  expect(report.engineCount).toBeGreaterThanOrEqual(4);
  expect(report.mounts).toContain('cerberus_hades_spinal');
  expect(report.mounts).toContain('cerberus_omega_battery');
  expect(report.completeWeapons).toBe(true);
  expect(report.loreRestricted).toBe(true);
  expect(report.auVisible).toBe(true);
});
