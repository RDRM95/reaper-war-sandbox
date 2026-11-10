import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

// How a destroyed hull dies on screen, tested on the production modules without a browser (port of the Codex
// build's tests/death-sequence.test.ts).
const projectRequire = createRequire(import.meta.url);
const THREE = projectRequire('three');
const directory = mkdtempSync(join(tmpdir(), 'reaper-death-'));
for (const [name, path] of Object.entries({ rng: '../src/core/rng.ts', deathSequence: '../src/rendering/deathSequence.ts', breakup: '../src/rendering/breakup.ts' })) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8').replace(/from '@\/core\/rng'/g, "from './rng.cjs'");
  writeFileSync(join(directory, name + '.cjs'), ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
  }).outputText.replace(/require\("three"\)/g, 'require(' + JSON.stringify(projectRequire.resolve('three')) + ')'));
}
const { Rng } = projectRequire(join(directory, 'rng.cjs'));
const { LIGHTS_FAIL, deathDuration, deathLight, deathList, deathPlan, deathSounds, isStagedDeath } = projectRequire(join(directory, 'deathSequence.cjs'));
const { breakupVelocity } = projectRequire(join(directory, 'breakup.cjs'));

test('a Reaper dies slowly; other classes keep their timing', () => {
  assert.equal(deathDuration('reaper_capital'), 5.2);
  assert.equal(deathDuration('reaper_destroyer'), 2.4);
  assert.equal(deathDuration('dreadnought'), 2.2);
  assert.equal(deathDuration('cruiser'), 0.9);
  assert.equal(deathDuration('frigate'), 0.15);
  assert.equal(deathPlan('frigate', 'f1').bursts.length, 0);
});

test('every burst is on the hull, in the ship\'s own axes', () => {
  for (const role of ['reaper_capital', 'reaper_destroyer', 'dreadnought', 'cruiser']) for (const seed of ['a', 'b', 'c']) {
    const plan = deathPlan(role, seed);
    assert.ok(plan.bursts.length > 1);
    for (const burst of plan.bursts) {
      assert.ok(Math.abs(burst.along) <= 0.5 && Math.abs(burst.across) <= 0.08 && Math.abs(burst.up) <= 0.06, role + ' burst on hull');
      assert.ok(burst.t >= 0 && burst.t < plan.duration);
    }
  }
});

test('a Reaper\'s bursts march from the hood aft and quicken', () => {
  const plan = deathPlan('reaper_capital', 'sovereign');
  assert.equal(plan.staged, true);
  assert.equal(plan.bursts.length, 16);
  for (let i = 1; i < plan.bursts.length; i++) assert.ok(plan.bursts[i].t > plan.bursts[i - 1].t);
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  assert.ok(mean(plan.bursts.slice(0, 5).map((b) => b.along)) > 0);
  assert.ok(mean(plan.bursts.slice(-5).map((b) => b.along)) < -0.3);
  assert.equal(plan.bursts.filter((b) => b.t > plan.duration * 0.72).length, 7);
  assert.deepEqual(deathPlan('reaper_capital', 'sovereign'), plan);
  assert.equal(deathPlan('dreadnought', 'd').staged, false);
});

test('the lights surge and fail, and the hull lists slowly and then faster', () => {
  let peakEarly = 0, peakLate = 0;
  for (let i = 0; i <= 200; i++) {
    const f = i / 200, light = deathLight(f, f * 5.2, 1.3);
    assert.ok(light > 0 && light < 2.3);
    if (f < LIGHTS_FAIL) { assert.ok(light >= 1); peakEarly = Math.max(peakEarly, light); }
    if (f > 0.9) peakLate = Math.max(peakLate, light);
  }
  assert.ok(peakEarly > 1.3 && peakLate < 0.15);
  let roll = 0;
  for (let i = 0; i < 520; i++) roll += deathList(i / 520).roll * 0.01;
  assert.ok(roll < Math.PI / 4 && deathList(1).roll > deathList(0).roll * 4);
});

test('hull pieces separate outward from the centre of the break', () => {
  const rng = new Rng('pieces');
  for (let i = 0; i < 200; i++) {
    const offset = new THREE.Vector3(rng.gaussian(0, 4), rng.gaussian(0, 2), rng.gaussian(0, 6));
    if (offset.length() < 0.5) continue;
    const velocity = breakupVelocity(offset, 12, rng);
    assert.ok(velocity.dot(offset) > 0 && velocity.length() > 12 * 0.02 && velocity.length() < 12 * 0.25);
  }
});

test('a staged death is heard dying at the kill and exploding at the breakup', () => {
  assert.equal(deathSounds('reaper_capital').atKill, 'reaper_death');
  assert.equal(deathSounds('reaper_destroyer').atKill, 'reaper_death_small');
  for (const role of ['reaper_capital', 'reaper_destroyer']) {
    assert.equal(isStagedDeath(role), true);
    assert.equal(deathSounds(role).atBreakup, 'explosion_large');
  }
  for (const role of ['dreadnought', 'carrier', 'cruiser', 'frigate', 'fighter']) {
    assert.equal(isStagedDeath(role), false);
    assert.equal(deathSounds(role).atBreakup, undefined);
  }
});
