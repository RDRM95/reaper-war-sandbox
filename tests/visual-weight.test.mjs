import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

// Main batteries read first (port of the Codex build's tests/visual-weight.test.ts; the battle measurement runs in
// the browser suite, e2e/visual-weight.spec.ts). Before: every small-calibre round was drawn 45 m wide against 110 m
// for a dreadnought's slug, point-defence lasers were full-brightness lines, and a distant fighter was a glow as
// bright as a frigate's.
const directory = mkdtempSync(join(tmpdir(), 'visual-weight-'));
const source = readFileSync(new URL('../src/rendering/visualWeight.ts', import.meta.url), 'utf8');
writeFileSync(join(directory, 'visualWeight.cjs'), ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
}).outputText);
const {
  engineGlowSize, explosionSize, explosionSmoke, farPointBrightness, HEAVY_HIT, impactSize, impactSparks, MAIN_CALIBRE, muzzleFlashSize,
  pointDefenceBrightness, SMALL_CRAFT_LENGTH, tracerSize,
} = createRequire(import.meta.url)(join(directory, 'visualWeight.cjs'));

test('a main-battery slug is drawn as it was; lighter rounds are finer the lighter they are', () => {
  assert.deepEqual(tracerSize(MAIN_CALIBRE), { width: 1.1, length: 1.3 });
  assert.deepEqual(tracerSize(40000), { width: 1.1, length: 1.3 });
  // A fighter's cannon does 6 damage a round: an 8 m streak where it was 45 m.
  const fighter = tracerSize(6), frigate = tracerSize(88), cruiser = tracerSize(199);
  assert.ok(fighter.width < 0.1);
  assert.ok(fighter.width < frigate.width);
  assert.ok(frigate.width < cruiser.width);
  assert.ok(cruiser.width < 0.45 * 0.6);
  // Nothing below the main calibre is ever drawn as wide or as long as a main slug.
  for (const calibre of [1, 6, 50, 200, 400, 599]) {
    assert.ok(tracerSize(calibre).width < 0.45, 'width at ' + calibre);
    assert.ok(tracerSize(calibre).length <= 0.7, 'length at ' + calibre);
  }
});

test('point-defence lasers are faint and a distant fighter is a faint mote', () => {
  assert.ok(pointDefenceBrightness(false) < 0.35);
  assert.ok(pointDefenceBrightness(true) < 0.5);
  assert.ok(pointDefenceBrightness(true) > pointDefenceBrightness(false));
  assert.ok(farPointBrightness('fighter') <= 0.3);
  for (const role of ['frigate', 'cruiser', 'dreadnought', 'carrier', 'reaper_destroyer', 'reaper_capital']) assert.equal(farPointBrightness(role), 1);
});

// The flashes that go with the fire, and the glow at a fighter's engines (port of the Codex build's second pass).
// Every gun below main calibre flashed at one size, 60 to 156 m across; a fighter's 6-damage round hit with a 43 to
// 100 m burst and two sparks; a 36 m fighter died with a frigate's explosion and carried a 30 m glow at each engine.
const before = { impact: (damage) => Math.min(8, 0.4 + Math.sqrt(damage) * 0.09), sparks: (hull) => Math.min(10, 2 + Math.floor(hull / 120)), explosion: (length) => Math.max(1.5, length * 0.6) };

test('main guns flash as they did; lighter guns flash in proportion to their round', () => {
  assert.equal(muzzleFlashSize(MAIN_CALIBRE, false), 3.6);
  assert.equal(muzzleFlashSize(40000, false), 3.6);
  assert.equal(muzzleFlashSize(900, true), 1.8);
  const fighter = muzzleFlashSize(6, false), frigate = muzzleFlashSize(88, false), cruiser = muzzleFlashSize(199, false);
  // A fighter's cannon: a flash that grows to 19 m, where it grew to 156 m.
  assert.ok(fighter * 1.3 < 0.2);
  assert.ok(fighter < frigate && frigate < cruiser);
  for (const calibre of [1, 6, 88, 199, 400, 599]) assert.ok(muzzleFlashSize(calibre, false) < 1.2);
  assert.ok(Math.abs(muzzleFlashSize(88, true) / muzzleFlashSize(88, false) - 0.75 / 1.2) < 1e-9);
});

test('heavy hits and hull explosions are unchanged; light hits and small craft are scaled to their size', () => {
  for (const damage of [HEAVY_HIT, 199, 900, 5000, 40000]) {
    assert.equal(impactSize(damage), before.impact(damage));
    assert.equal(impactSparks(damage), before.sparks(damage));
  }
  assert.ok(impactSize(6) / before.impact(6) < 0.4);
  assert.ok(impactSize(88) / before.impact(88) > 0.9);
  assert.equal(impactSparks(6), 0);
  assert.equal(impactSparks(39), 0);
  assert.equal(impactSparks(88), 2);
  assert.ok(Math.abs(impactSize(HEAVY_HIT - 0.001) - impactSize(HEAVY_HIT)) < 1e-3);
  for (const length of [SMALL_CRAFT_LENGTH, 1.7, 5.2, 8.88, 20]) assert.equal(explosionSize(length), before.explosion(length));
  // A Trident (36 m) dies in a 47 m explosion with one cloud of smoke, where it was 150 m with four.
  assert.ok(Math.abs(explosionSize(0.36) - 0.468) < 1e-9);
  assert.equal(explosionSize(0.16), 0.45);
  assert.equal(explosionSmoke(explosionSize(0.36)), 1);
  assert.equal(explosionSmoke(1.5), 4);
  assert.equal(explosionSmoke(5), 10);
});

test("a fighter's engine glow is a fifth of its length, where it was most of it; larger hulls are unchanged", () => {
  assert.ok(Math.abs(engineGlowSize(0.36, 'fighter', false) - 0.072) < 1e-9);
  // The Oculus is 16 m: its glow was 30 m and is 5 m.
  assert.equal(engineGlowSize(0.16, 'fighter', true), 0.05);
  assert.equal(engineGlowSize(1.7, 'frigate', false), 0.3);
  assert.ok(Math.abs(engineGlowSize(8.88, 'dreadnought', false) - 8.88 * 0.11) < 1e-9);
  assert.ok(Math.abs(engineGlowSize(20, 'reaper_capital', true) - 2.4) < 1e-9);
});
