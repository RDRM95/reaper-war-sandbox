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
const { farPointBrightness, MAIN_CALIBRE, pointDefenceBrightness, tracerSize } = createRequire(import.meta.url)(join(directory, 'visualWeight.cjs'));

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
