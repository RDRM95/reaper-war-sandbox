import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

// The Reaper damage glow, tested on the production module without a browser (port of the Codex build's
// tests/damage-glow.test.ts).
const projectRequire = createRequire(import.meta.url);
const directory = mkdtempSync(join(tmpdir(), 'reaper-damage-'));
const source = readFileSync(new URL('../src/rendering/damageGlow.ts', import.meta.url), 'utf8');
writeFileSync(join(directory, 'damageGlow.cjs'), ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
}).outputText.replace(/require\("three"\)/g, 'require(' + JSON.stringify(projectRequire.resolve('three')) + ')'));
const { DAMAGE_ONSET, damageLevel, reaperDamageGlow } = projectRequire(join(directory, 'damageGlow.cjs'));

test('an intact or lightly damaged Reaper keeps pale, steady seams and no ember', () => {
  for (const hull of [1, 0.8, DAMAGE_ONSET]) {
    const a = reaperDamageGlow(hull, 3, 1.2), b = reaperDamageGlow(hull, 47.5, 1.2);
    assert.equal(a.ember, 0);
    assert.equal(a.seam.getHex(), 0x7fb4ff);
    assert.ok(Math.abs(a.seamIntensity - b.seamIntensity) < 1e-9);
  }
  assert.equal(damageLevel(1), 0);
  assert.equal(damageLevel(0), 1);
});

test('the seams run to hot red-orange as the hull fails and the armour never becomes a lantern', () => {
  let lastRed = -1;
  for (let hull = DAMAGE_ONSET; hull >= 0; hull -= 0.05) {
    const g = reaperDamageGlow(hull, 0, 0);
    assert.ok(g.seam.r >= lastRed); lastRed = g.seam.r;
    assert.ok(g.ember <= 0.014);
  }
  const dying = reaperDamageGlow(0, 0, 0);
  assert.ok(dying.seam.r > 0.9 && dying.seam.b < 0.05);
});

test('flicker starts past half-way to destruction, differs between ships and repeats for the same inputs', () => {
  const series = (hull, phase) => Array.from({ length: 80 }, (_, i) => reaperDamageGlow(hull, i * 0.13, phase).seamIntensity);
  const steady = series(0.35, 2);
  assert.ok(Math.max(...steady) - Math.min(...steady) < 1e-9);
  const failing = series(0.08, 2);
  assert.ok(Math.max(...failing) - Math.min(...failing) > 0.3);
  assert.notDeepEqual(series(0.08, 4.4), failing);
  assert.deepEqual(series(0.08, 2), failing);
});
