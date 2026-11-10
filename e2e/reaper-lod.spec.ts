import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test('real Reaper hero and instanced LOD transitions retain armour without changing combat', async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /webgl|shader|three|program/i.test(message.text())) errors.push(message.text());
  });
  await page.goto('/?reference=sol-42&t=0');
  // The spectator's own battle remains paused; avoid rendering two WebGL
  // scenes while exercising an independent production view below.
  await page.locator('#toggle2d').click();
  await page.evaluate(async () => {
    const { BattleView } = await import('/src/rendering/battleView.ts');
    const { BattleSimulation } = await import('/src/simulation/battle.ts');
    const { buildCustomBattle } = await import('/src/scenarios/index.ts');
    const { getShipTemplate } = await import('/src/rendering/ships/index.ts');
    const sim = new BattleSimulation(buildCustomBattle({ seed: 42, rulesId: 'canon_me3',
      environment: 'deep_space', startingDistanceKm: 70,
      sideA: { faction: 'alliance', name: 'Scale reference', formation: 'line_abreast', counts: { alliance_frigate: 1 } },
      sideB: { faction: 'reaper', name: 'Reaper review', formation: 'line_abreast', counts: { reaper_capital: 1, harbinger: 1, reaper_destroyer: 1 } }
    }));
    const canvas = document.createElement('canvas'); canvas.id = 'qa-reaper-lod';
    canvas.style.cssText = 'position:fixed;left:0;top:0;width:960px;height:540px;z-index:99999'; document.body.append(canvas);
    const view = new BattleView(canvas, sim, { quality: 'high', showEngineGlow: true, pixelRatioCap: 1, lod: true, bloom: false });
    view.resize(960, 540); view.referenceCamera = true;
    const physics = () => JSON.stringify({ tick: sim.tick, rng: sim.rng.getState(), ships: sim.ships,
      events: sim.events, projectiles: sim.projectiles, missiles: sim.missiles });
    const gl = view.renderer.getContext(), extension = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    (window as any).__qaReaperLod = { sim, view, getShipTemplate, physics, before: physics(), renderer };
  });

  const records: any[] = [];
  try {
    for (const classId of ['reaper_capital', 'harbinger', 'reaper_destroyer']) {
      for (const level of ['full', 'reduced', 'full']) {
        const record = await page.evaluate(({ classId, level }) => {
          const state = (window as any).__qaReaperLod;
          const { sim, view, getShipTemplate } = state;
          const ship = sim.ships.find((item: any) => item.classId === classId);
          const length = getShipTemplate(classId).lengthUnits;
          // Selected ships remain heroes outside the normal hero distance.
          // Other visible ships use the real GPU-instanced path concurrently.
          view.selectedIds.clear(); view.selectedIds.add(ship.id); view.followId = undefined;
          view.rig.camera.position.set(ship.pos.x * 10, ship.pos.y * 10, ship.pos.z * 10 + length * (level === 'full' ? 3 : 80));
          view.rig.camera.lookAt(ship.pos.x * 10, ship.pos.y * 10, ship.pos.z * 10);
          view.update(0, 1); view.render();
          const visual = view.visuals.get(ship.id);
          if (!visual) throw new Error('Selected production hero was not created.');
          const groups: Record<string, boolean[]> = { plates: [], eye: [], 'reaper-arm-seam': [] };
          visual.built.group.traverse((part: any) => { if (groups[part.name]) groups[part.name].push(part.visible); });
          const activeBatches = view.instances.group.children.filter((part: any) => part.isInstancedMesh && part.visible && part.count > 0);
          const hero = { classId, level, observed: visual.lod, visible: visual.built.group.visible, lengthUnits: length,
            groups, mixedInstances: activeBatches.reduce((count: number, part: any) => count + part.count, 0),
            drawCalls: view.drawCalls, glError: view.renderer.getContext().getError(), simulationUnchanged: state.before === state.physics() };
          // Use the production batching API for the same hull's reduced form.
          view.instances.begin(sim.ships); view.instances.add(ship, 1, 'reduced'); view.instances.end();
          const batch = view.instances.group.children.filter((part: any) => part.isInstancedMesh && part.visible && part.count > 0)
            .map((part: any) => ({ name: part.name, count: part.count }));
          // Restore the actual scene before saving its visual evidence.
          view.update(0, 1); view.render();
          return { ...hero, batch };
        }, { classId, level });
        records.push(record);
        expect(record.observed).toBe(level);
        expect(record.visible).toBe(true);
        expect(record.glError).toBe(0);
        expect(record.drawCalls).toBeGreaterThan(0);
        expect(record.simulationUnchanged).toBe(true);
        expect(record.groups.plates.length).toBeGreaterThan(0);
        expect(record.groups.eye.length).toBeGreaterThan(0);
        expect(record.groups['reaper-arm-seam'].length).toBeGreaterThan(0);
        expect(record.groups.plates.every(Boolean)).toBe(true);
        expect(record.groups.eye.every(Boolean)).toBe(true);
        expect(record.groups['reaper-arm-seam'].every((visible: boolean) => visible === (level === 'full'))).toBe(true);
        expect(record.batch.some((part: any) => part.name.endsWith('-plates'))).toBe(true);
        expect(record.batch.some((part: any) => part.name.endsWith('-eye'))).toBe(true);
        expect(record.batch.some((part: any) => /seam/.test(part.name))).toBe(false);
        if (classId === 'reaper_capital' && level === 'reduced') {
          expect(record.mixedInstances).toBeGreaterThan(0);
          await page.locator('#qa-reaper-lod').screenshot({ path: info.outputPath('reaper-capital-reduced-hero-and-batches.png') });
        }
        if (level === 'reduced') {
          // The normal reduced distance is intentionally too far for a hull
          // portrait. Magnify its already-selected production representation
          // for inspection, without re-running LOD or changing mesh scale.
          const magnified = await page.evaluate(classId => {
            const state = (window as any).__qaReaperLod, { sim, view } = state;
            const ship = sim.ships.find((item: any) => item.classId === classId);
            const visual = view.visuals.get(ship.id), length = visual.built.lengthUnits;
            view.rig.camera.position.set(ship.pos.x * 10 + length * 1.4, ship.pos.y * 10 + length * .65, ship.pos.z * 10 + length * 1.6);
            view.rig.camera.lookAt(ship.pos.x * 10, ship.pos.y * 10, ship.pos.z * 10);
            view.render();
            return { level: visual.lod, glError: view.renderer.getContext().getError(), simulationUnchanged: state.before === state.physics() };
          }, classId);
          expect(magnified).toEqual({ level: 'reduced', glError: 0, simulationUnchanged: true });
          await page.locator('#qa-reaper-lod').screenshot({ path: info.outputPath(`${classId}-reduced-magnified.png`) });
        }
      }
    }
    const renderer = await page.evaluate(() => (window as any).__qaReaperLod.renderer);
    const path = info.outputPath('reaper-lod-transition-records.json');
    await writeFile(path, JSON.stringify({ renderer, errors, records }, null, 2));
    await info.attach('reaper-lod-transition-records', { path, contentType: 'application/json' });
    expect(errors).toEqual([]);
    await page.locator('#qa-reaper-lod').screenshot({ path: info.outputPath('reaper-destroyer-restored-full.png') });
  } finally {
    await page.evaluate(() => {
      (window as any).__qaReaperLod?.view.dispose();
      document.getElementById('qa-reaper-lod')?.remove();
      delete (window as any).__qaReaperLod;
    });
  }
});
