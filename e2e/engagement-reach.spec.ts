import { expect, test } from '@playwright/test';

test('canon and APEX reference outcomes and same-seed replay survive the port', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/'); await page.locator('#pause').click();
  const result = await page.evaluate(async () => {
    const { BattleSimulation } = await import('/src/simulation/battle.ts');
    const { buildScenario } = await import('/src/scenarios/index.ts');
    const records = []; let originalEvents = '', originalState = '';
    for (const rules of ['canon_me3', 'prime_apex']) for (const seed of [7, 8]) {
      const sim = new BattleSimulation(buildScenario('alliance_fleet_engagement', rules, seed, { fleet_scaling: 'fixed' }));
      const battle = sim.run();
      records.push({ rules, seed, winner: battle.winner, reapersLost: battle.sides.B.destroyed, reapersDeployed: battle.sides.B.deployed });
      if (rules === 'prime_apex' && seed === 7) {
        originalEvents = JSON.stringify(sim.events);
        originalState = JSON.stringify(sim.ships.map(s => [s.id, s.hull, s.pos]));
      }
    }
    const replay = new BattleSimulation(buildScenario('alliance_fleet_engagement', 'prime_apex', 7, { fleet_scaling: 'fixed' }));
    replay.run();
    return { records, deterministic: JSON.stringify(replay.events) === originalEvents &&
      JSON.stringify(replay.ships.map(s => [s.id, s.hull, s.pos])) === originalState };
  });
  for (const record of result.records) {
    expect(record.winner).toBe(record.rules === 'canon_me3' ? 'B' : 'A');
    if (record.rules === 'prime_apex') expect(record.reapersLost).toBe(record.reapersDeployed);
  }
  expect(result.deterministic).toBe(true);
});

test('production thousand-ship simulation brings rear batteries into action', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/');
  await page.locator('#pause').click();
  await page.evaluate(async () => {
    const { BattleSimulation } = await import('/src/simulation/battle.ts');
    const { buildCustomBattle } = await import('/src/scenarios/index.ts');
    const sim = new BattleSimulation(buildCustomBattle({ seed: 42, rulesId: 'prime_apex', environment: 'deep_space',
      startingDistanceKm: 90, maxDuration: 240,
      sideA: { faction: 'alliance', name: 'Coverage A', formation: 'line_abreast',
        counts: { alliance_dreadnought: 50, alliance_cruiser: 200, alliance_frigate: 250 } },
      sideB: { faction: 'reaper', name: 'Coverage B', formation: 'line_abreast',
        counts: { reaper_capital: 125, reaper_destroyer: 375 } },
    }));
    const mine = sim.ships.filter(s => s.side === 'A').sort((a, b) => b.pos.z - a.pos.z);
    const rear = mine.slice(Math.ceil(mine.length * 2 / 3)).map(s => s.id);
    for (const ship of sim.ships) for (const weapon of ship.weapons) weapon.def = { ...weapon.def, damage: 0 };
    (window as any).__engagementQA = { sim, rear,
      width: Math.max(...mine.map(s => s.pos.x)) - Math.min(...mine.map(s => s.pos.x)) };
  });
  for (let time = 20; time <= 180; time += 20) await page.evaluate(until => {
    const { sim } = (window as any).__engagementQA;
    while (sim.time < until - 1e-6 && !sim.finished) sim.step();
  }, time);
  const result = await page.evaluate(() => {
    const { sim, rear, width } = (window as any).__engagementQA;
    const batteries = new Set(sim.events.filter((e: any) => e.type === 'weapon_fired' &&
      sim.getShip(e.shipId)?.weapons.some((w: any) => w.def.id === e.weaponId && w.def.antiCapital && !w.def.antiSmall))
      .map((e: any) => e.shipId));
    const mine = sim.ships.filter((s: any) => s.side === 'A');
    return { rearCount: rear.length, rearBatteries: rear.filter((id: string) => batteries.has(id)).length,
      time: sim.time, widthRetention: (Math.max(...mine.map((s: any) => s.pos.x)) - Math.min(...mine.map((s: any) => s.pos.x))) / width,
      finite: sim.ships.every((s: any) => [s.pos.x, s.pos.y, s.pos.z].every(Number.isFinite)) };
  });
  console.info('SANDBOX_ENGAGEMENT_COVERAGE ' + JSON.stringify(result));
  expect(result.rearBatteries / result.rearCount).toBeGreaterThan(.9);
  expect(result.widthRetention).toBeGreaterThan(.8);
  expect(result.finite).toBe(true);
});
