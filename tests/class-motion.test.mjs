import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const directory = mkdtempSync(join(tmpdir(), 'apex-class-motion-'));
for (const name of ['core/vec3', 'simulation/propulsion', 'simulation/motion', 'simulation/engagementReach']) {
  const source = readFileSync(new URL('../src/' + name + '.ts', import.meta.url), 'utf8').replaceAll('@/core/vec3', './vec3');
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  writeFileSync(join(directory, name.split('/').at(-1) + '.js'), output);
}
writeFileSync(join(directory, 'package.json'), '{"type":"commonjs"}');
const require = createRequire(import.meta.url);
const { manoeuvreVelocity } = require(join(directory, 'propulsion.js'));
const { advanceMotion } = require(join(directory, 'motion.js'));
const { localReachTarget, reachableStation } = require(join(directory, 'engagementReach.js'));
const { v3, length, sub, distance } = require(join(directory, 'vec3.js'));
const hull = () => ({ role: 'dreadnought', lengthKm: 1, pos: v3(), vel: v3(), heading: v3(0, 0, 1),
  maxSpeed: .26, acceleration: .036, subsystems: { engines: 1 } });

test('capital RCS cruise is slower than forward thrust while fighters retain vector agility', () => {
  const bow = v3(0, 0, 1);
  assert.deepEqual(manoeuvreVelocity('dreadnought', bow, v3(0, 0, 1), 1), bow);
  assert.ok(length(manoeuvreVelocity('dreadnought', bow, v3(1, 0, 0), 1)) < .3);
  assert.ok(length(manoeuvreVelocity('reaper_capital', bow, v3(0, 0, -1), 1)) < .2);
  assert.ok(length(manoeuvreVelocity('fighter', bow, v3(1, 0, 0), 1)) > .9);
});

test('a sustained sideways or reverse capital manoeuvre cannot reach main-engine speed', () => {
  for (const position of [v3(1000, 0, 0), v3(0, 0, -1000)]) {
    const ship = hull();
    for (let n = 0; n < 2400; n++) {
      const before = ship.vel;
      advanceMotion(ship, { position, speedFraction: 1 }, .05);
      assert.ok(length(sub(ship.vel, before)) <= ship.acceleration * .05 + 1e-9);
    }
    assert.ok(length(ship.vel) < ship.maxSpeed * .3);
  }
});

test('new cruise limits brake existing momentum gradually and engine failure preserves inertia', () => {
  const ship = hull(); ship.vel = v3(ship.maxSpeed, 0, 0);
  const before = { ...ship.vel };
  advanceMotion(ship, { position: v3(1000, 0, 0), speedFraction: 1 }, .05);
  assert.ok(length(sub(ship.vel, before)) <= ship.acceleration * .05 + 1e-9);
  assert.ok(length(ship.vel) > ship.maxSpeed * .95);
  ship.subsystems.engines = 0;
  const disabled = { ...ship.vel };
  advanceMotion(ship, { position: v3(), speedFraction: 1 }, .05);
  assert.deepEqual(ship.vel, disabled);
});

test('a rear firing station is reachable and a useful station stays in place', () => {
  const useful = v3(0, 0, 10);
  assert.equal(reachableStation(useful, v3(), 20), useful);
  assert.ok(distance(reachableStation(v3(0, 0, -30), v3(0, 0, 15), 20), v3(0, 0, 15)) < 20);
});

test('local contact repairs an unreachable focus while a reachable or explicit target stays committed', () => {
  const ship = { pos: v3(), side: 'A' };
  const near = { id: 'near', pos: v3(0, 0, 15), side: 'B', alive: true, role: 'cruiser' };
  const remote = { id: 'remote', pos: v3(0, 0, 30), side: 'B', alive: true, role: 'reaper_capital' };
  assert.equal(localReachTarget(ship, remote, near, 20), near);
  assert.equal(localReachTarget(ship, near, remote, 20), near);
  ship.forcedTargetId = remote.id;
  assert.equal(localReachTarget(ship, remote, near, 20), remote);
});

test.after(() => rmSync(directory, { recursive: true, force: true }));
