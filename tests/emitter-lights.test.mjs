import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

// The Reaper emitter light pool, tested on the production module without a browser (port of the Codex build's
// tests/emitter-lights.test.ts).
const projectRequire = createRequire(import.meta.url);
const THREE = projectRequire('three');
const directory = mkdtempSync(join(tmpdir(), 'reaper-emitter-'));
const source = readFileSync(new URL('../src/rendering/emitterLights.ts', import.meta.url), 'utf8');
writeFileSync(join(directory, 'emitterLights.cjs'), ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
}).outputText.replace(/require\("three"\)/g, 'require(' + JSON.stringify(projectRequire.resolve('three')) + ')'));
const { EMITTER_FALL_S, EMITTER_LIGHT_COUNT, EMITTER_RISE_S, EmitterLightPool, easeEmitterCharge, emitterLight, emitterTarget, pickEmitters } = projectRequire(join(directory, 'emitterLights.cjs'));
const candidate = (id, charge, distance, size = 20) => ({ id, charge, distanceSq: distance * distance, position: new THREE.Vector3(distance, 0, 0), size, color: 0xff4a20 });

test('the emitter glow rises quickly, fades slowly and settles exactly', () => {
  let c = 0;
  for (let t = 0; t < EMITTER_RISE_S; t += 1 / 60) c = easeEmitterCharge(c, 1, 1 / 60);
  assert.ok(c > 0.9);
  let fall = 1;
  for (let t = 0; t < EMITTER_RISE_S; t += 1 / 60) fall = easeEmitterCharge(fall, 0, 1 / 60);
  assert.ok(fall > 0.35);
  for (let t = 0; t < EMITTER_FALL_S * 4; t += 1 / 60) fall = easeEmitterCharge(fall, 0, 1 / 60);
  assert.equal(fall, 0);
  assert.equal(emitterTarget(true, false), 1);
  assert.equal(emitterTarget(false, false), 0);
});

test('the brightest, nearest emitters win whatever the order, and strength scales with the hull', () => {
  const cands = [candidate('far-firing', 1, 900), candidate('near-charging', 0.55, 60), candidate('near-firing', 1, 80), candidate('idle', 0.01, 10)];
  const picked = pickEmitters(cands).map((c) => c.id);
  assert.deepEqual(picked, ['near-firing', 'near-charging']);
  assert.deepEqual(pickEmitters([...cands].reverse()).map((c) => c.id), picked);
  const at = (size) => emitterLight(size, 1).intensity / (size * 0.2) ** 2;
  assert.ok(Math.abs(at(1.6) - at(20)) < 1e-9);
});

test('the pool keeps a constant number of lights in the scene', () => {
  const pool = new EmitterLightPool();
  const count = () => pool.group.children.filter((o) => o.isPointLight).length;
  pool.begin();
  for (let i = 0; i < 6; i++) pool.offer(candidate('r' + i, 1, 50 + i * 10));
  pool.end();
  assert.equal(pool.lit, EMITTER_LIGHT_COUNT);
  pool.begin(); pool.end();
  assert.equal(pool.lit, 0);
  assert.equal(count(), EMITTER_LIGHT_COUNT);
});
