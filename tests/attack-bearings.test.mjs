import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

// Three-dimensional attack bearings (port of the unit half of the Codex build's tests/engagement-3d.test.ts):
// engaging hulls swing their firing stations round their targets, over, under and round the flanks. The seeded
// battle half of that test runs in the browser suite here (e2e/engagement-3d.spec.ts).
const directory = mkdtempSync(join(tmpdir(), 'attack-bearings-'));
for (const [name, path] of Object.entries({ vec3: '../src/core/vec3.ts', manoeuvre: '../src/simulation/manoeuvre.ts' })) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8').replace(/from '@\/core\/vec3'/g, "from './vec3.cjs'");
  writeFileSync(join(directory, name + '.cjs'), ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
  }).outputText);
}
const projectRequire = createRequire(import.meta.url);
const { ATTACK_SWING, assignAttackBearings, swingAmount, swingStation } = projectRequire(join(directory, 'manoeuvre.cjs'));

const DEG = Math.PI / 180;
const line = (count, width = 20) => Array.from({ length: count }, (_, i) => ({ id: 's' + String(i).padStart(2, '0'), lateral: count === 1 ? 0 : -width / 2 + width * i / (count - 1) }));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const angleAt = (centre, a, b) => {
  const u = { x: a.x - centre.x, y: a.y - centre.y, z: a.z - centre.z }, v = { x: b.x - centre.x, y: b.y - centre.y, z: b.z - centre.z };
  return Math.acos((u.x * v.x + u.y * v.y + u.z * v.z) / (Math.hypot(u.x, u.y, u.z) * Math.hypot(v.x, v.y, v.z)));
};

test('classes that manoeuvre get a bearing within their limits; carriers and fighters keep their stations', () => {
  assert.equal(assignAttackBearings('carrier', line(4)).size, 0);
  assert.equal(assignAttackBearings('fighter', line(4)).size, 0);
  for (const role of ['dreadnought', 'cruiser', 'frigate', 'reaper_capital', 'reaper_destroyer']) {
    const bearings = assignAttackBearings(role, line(12));
    assert.equal(bearings.size, 12);
    for (const bearing of bearings.values()) {
      assert.ok(bearing.swing >= ATTACK_SWING[role][0] - 1e-9 && bearing.swing <= ATTACK_SWING[role][1] + 1e-9);
      assert.ok(Math.abs(Math.hypot(bearing.right, bearing.up) - 1) < 1e-9);
    }
  }
});

test('a class swings as far as its job needs: a firing line least, a screen most', () => {
  const most = (role) => ATTACK_SWING[role][1];
  assert.ok(most('dreadnought') < most('cruiser') && most('cruiser') < most('frigate'));
  assert.ok(most('reaper_capital') < most('reaper_destroyer'));
  assert.ok(most('dreadnought') <= 15 * DEG);
  assert.ok(most('frigate') > 90 * DEG);
});

test('the middle of a line goes over or under; the wings go round their own side', () => {
  const members = line(11);
  const bearings = assignAttackBearings('cruiser', members);
  const centre = bearings.get('s05'), left = bearings.get('s00'), right = bearings.get('s10');
  assert.ok(Math.abs(centre.up) > 0.9);
  assert.ok(left.right < -0.9 && right.right > 0.9);
  for (const member of members) if (Math.abs(member.lateral) > 1e-6) assert.equal(Math.sign(bearings.get(member.id).right), Math.sign(member.lateral));
  assert.ok(right.swing > centre.swing);
});

test('neighbours never share a bearing, both above and below are used, and listing order does not matter', () => {
  const members = line(16);
  const bearings = assignAttackBearings('frigate', members);
  const ups = [...bearings.values()].map((b) => Math.sign(b.up));
  assert.ok(ups.filter((u) => u > 0).length >= 6 && ups.filter((u) => u < 0).length >= 6);
  for (let i = 0; i + 1 < members.length; i++) {
    const a = bearings.get(members[i].id), b = bearings.get(members[i + 1].id);
    assert.ok(Math.abs(a.swing - b.swing) + Math.abs(a.right - b.right) + Math.abs(a.up - b.up) > 0.05);
  }
  const backward = assignAttackBearings('frigate', [...members].reverse());
  for (const member of members) assert.deepEqual(backward.get(member.id), bearings.get(member.id));
});

test('a swung station keeps its range, turns by the bearing and opens as the hull closes', () => {
  const target = { x: 0, y: 0, z: 20 }, station = { x: 3, y: 0.5, z: 4 };
  const swung = swingStation(station, target, { swing: 40 * DEG, right: 0, up: 1 }, 1);
  assert.ok(Math.abs(dist(swung, target) - dist(station, target)) < 1e-9);
  assert.ok(Math.abs(angleAt(target, swung, station) / DEG - 40) < 1e-6);
  assert.ok(swung.y > station.y + 5);
  assert.deepEqual(swingStation(station, target, { swing: 40 * DEG, right: 0, up: 1 }, 0), station);
  const right = swingStation({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 10 }, { swing: 30 * DEG, right: 1, up: 0 }, 1);
  assert.ok(right.x > 4.9 && Math.abs(right.y) < 1e-9);
  assert.equal(swingAmount(40, 20), 0);
  assert.equal(swingAmount(23, 20), 1);
  let previous = 0;
  for (let d = 40; d >= 23; d -= 1) { const a = swingAmount(d, 20); assert.ok(a >= previous); previous = a; }
});
