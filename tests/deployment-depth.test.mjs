import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

// Fleets deploy in altitude bands (port of the layout half of the Codex build's tests/deployment-depth.test.ts).
// Before, a hundred-hull line was under 8 km tall whatever its width; the scenario half runs in the browser suite
// (e2e/engagement-3d.spec.ts).
const directory = mkdtempSync(join(tmpdir(), 'deployment-depth-'));
for (const [name, path] of Object.entries({ vec3: '../src/core/vec3.ts', constants: '../src/simulation/constants.ts', formations: '../src/simulation/formations.ts' })) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    .replace(/from '@\/core\/vec3'/g, "from './vec3.cjs'").replace(/from '\.\/constants'/g, "from './constants.cjs'");
  writeFileSync(join(directory, name + '.cjs'), ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
  }).outputText);
}
const { assignSlots, ALTITUDE_BAND_LIMIT } = createRequire(import.meta.url)(join(directory, 'formations.cjs'));

const extent = (points, axis) => Math.max(...points.map(p => p[axis])) - Math.min(...points.map(p => p[axis]));
const capitals = (count) => Array.from({ length: count }, (_, i) => ({ id: 'r' + i, role: 'reaper_capital', lengthKm: 2 }));
const mixed = (multiple) => [
  ...Array.from({ length: 6 * multiple }, (_, i) => ({ id: 'd' + i, role: 'dreadnought', lengthKm: 0.888 })),
  ...Array.from({ length: 14 * multiple }, (_, i) => ({ id: 'c' + i, role: 'cruiser', lengthKm: 0.5 })),
  ...Array.from({ length: 24 * multiple }, (_, i) => ({ id: 'f' + i, role: 'frigate', lengthKm: 0.17 })),
];

test('a hundred-hull line stands in altitude bands, several times wider than tall, with every hull clear', () => {
  const ships = capitals(100), slots = [...assignSlots(ships, 'line_abreast').values()];
  // Measured 13.1 km tall and 104.4 km wide; the flat layout was under 8 km tall.
  assert.ok(extent(slots, 'y') > 10 && extent(slots, 'y') < 16, `height ${extent(slots, 'y')}`);
  assert.ok(extent(slots, 'x') > extent(slots, 'y') * 5);
  for (let i = 0; i < slots.length; i++) for (let j = 0; j < i; j++)
    assert.ok(Math.hypot(slots[i].x - slots[j].x, slots[i].y - slots[j].y, slots[i].z - slots[j].z) >= 2 * 1.1 - 1e-9);
});

test('hulls stand on both sides of the fleet level on each wing, centred on it, not as one tilted sheet', () => {
  const slots = [...assignSlots(capitals(100), 'line_abreast').values()];
  for (const half of [slots.filter(p => p.x < -10), slots.filter(p => p.x > 10)]) {
    // Measured: 19 above and 20 below on the left of 39, 18 above and 24 below on the right of 42.
    assert.ok(half.filter(p => p.y > 2).length > 12);
    assert.ok(half.filter(p => p.y < -2).length > 12);
  }
  const mx = slots.reduce((n, p) => n + p.x, 0) / slots.length, my = slots.reduce((n, p) => n + p.y, 0) / slots.length;
  const cov = slots.reduce((n, p) => n + (p.x - mx) * (p.y - my), 0);
  const sx = Math.sqrt(slots.reduce((n, p) => n + (p.x - mx) ** 2, 0)), sy = Math.sqrt(slots.reduce((n, p) => n + (p.y - my) ** 2, 0));
  assert.ok(Math.abs(cov / (sx * sy)) < 0.15);
  // The bands are centred before clearance moves a few hulls; the mean stays within a fraction of a kilometre.
  assert.ok(Math.abs(my) < 0.5, `mean level ${my}`);
});

test('the height grows with the fleet and stops at the limit; a column and a small fleet stay as they were', () => {
  const height = (ships, formation = 'line_abreast', seed = 7) => extent([...assignSlots(ships, formation, seed).values()], 'y');
  const heights = [1, 4, 12].map(multiple => height(mixed(multiple)));
  assert.ok(heights[0] > 4, `44 hulls ${heights[0]}`);
  assert.ok(heights[1] > heights[0] * 1.5, `176 hulls ${heights[1]}`);
  assert.ok(Math.abs(heights[2] - heights[1]) < 2, `528 hulls ${heights[2]}`);
  assert.ok(heights[2] < 2 * ALTITUDE_BAND_LIMIT + 3);
  // Bands are a share of the frontage: a column, which has almost none, measured 6.0 km.
  assert.ok(height(capitals(100), 'capital_column') < 8);
  // Under the battle-group threshold the layout is the nominal one: two capitals and eight destroyers on three levels.
  const small = [...Array.from({ length: 2 }, (_, i) => ({ id: 'k' + i, role: 'reaper_capital', lengthKm: 2 })), ...Array.from({ length: 8 }, (_, i) => ({ id: 'e' + i, role: 'reaper_destroyer', lengthKm: 0.4 }))];
  assert.ok(height(small, 'strike_wedge') < 2.5);
});

test('the same seed gives the same deployment and another seed a different one', () => {
  const a = [...assignSlots(mixed(4), 'line_abreast', 7).values()], b = [...assignSlots(mixed(4), 'line_abreast', 7).values()], c = [...assignSlots(mixed(4), 'line_abreast', 83).values()];
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});
