import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

// Compile the pure grid module without loading Three.js or the browser.
const dir = mkdtempSync(join(tmpdir(), 'reaper-spatial-index-'));
const source = readFileSync(new URL('../src/simulation/spatialIndex.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
}).outputText;
writeFileSync(join(dir, 'spatialIndex.cjs'), js);
const { CombatSpatialIndex } = createRequire(import.meta.url)(join(dir, 'spatialIndex.cjs'));

const makeShip = (i) => ({
  id: 'ship-' + i, side: 'B', alive: true, escaped: false,
  role: i % 9 === 0 ? 'fighter' : 'cruiser',
  pos: { x: i % 250 * 4, y: Math.floor(i / 250) * 8, z: i % 11 * 2 },
  maxSpeed: 3, radiusKm: 0.2
});

const intersectsSegment = (a, b, centre, radius) => {
  const v = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const w = { x: centre.x - a.x, y: centre.y - a.y, z: centre.z - a.z };
  const vv = v.x * v.x + v.y * v.y + v.z * v.z;
  const t = Math.max(0, Math.min(1, vv ? (w.x * v.x + w.y * v.y + w.z * v.z) / vv : 0));
  const dx = a.x + v.x * t - centre.x;
  const dy = a.y + v.y * t - centre.y;
  const dz = a.z + v.z * t - centre.z;
  return dx * dx + dy * dy + dz * dz <= radius * radius;
};

test('swept spatial queries retain every narrow-phase contact in deployment order', () => {
  const ships = Array.from({ length: 5000 }, (_, i) => makeShip(i));
  const grid = new CombatSpatialIndex(ships, 0.05);
  assert.equal(grid.maxCollisionRadius, 0.5);
  let checked = 0;
  let naive = 0;
  for (let n = 0; n < 80; n++) {
    const a = { x: (n * 17) % 980, y: (n * 11) % 150, z: (n * 7) % 22 };
    const b = { x: a.x + 6, y: a.y + 0.2, z: a.z };
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
    const half = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / 2;
    const nearby = grid.enemiesNear('A', mid, half + grid.maxCollisionRadius);
    checked += nearby.length;
    naive += ships.length;
    const candidateIds = new Set(nearby.map(s => s.id));
    for (const ship of ships) {
      const radius = ship.radiusKm * (ship.role === 'fighter' ? 2.5 : 1);
      if (intersectsSegment(a, b, ship.pos, radius))
        assert.ok(candidateIds.has(ship.id), 'missed potential contact ' + ship.id);
    }
    const indices = nearby.map(s => Number(s.id.slice(5)));
    assert.deepEqual(indices, [...indices].sort((a, b) => a - b), 'stable collision tie ordering');
  }
  assert.ok(checked < naive / 10, 'broad-phase must reject at least 90% of distant ships');
});

test('spatial query includes target motion between index snapshot and collision update', () => {
  const ship = makeShip(1);
  ship.pos = { x: 5, y: 0, z: 0 };
  const grid = new CombatSpatialIndex([ship], 0.05);
  ship.pos.x += 0.14; // within the two-tick conservative drift margin
  const candidates = grid.enemiesNear('A', { x: 0, y: 0, z: 0 }, 5);
  assert.equal(candidates[0]?.id, ship.id);
});

test.after(() => rmSync(dir, { recursive: true, force: true }));
