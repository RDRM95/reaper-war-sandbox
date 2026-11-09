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

const bruteNearest = (ships, side, origin) => {
  let nearest, distance = Infinity;
  for (const ship of ships) {
    if (ship.side === side || !ship.alive || ship.escaped || ship.role === 'fighter') continue;
    const d = Math.hypot(ship.pos.x - origin.x, ship.pos.y - origin.y, ship.pos.z - origin.z);
    if (d < distance) { distance = d; nearest = ship; }
  }
  return nearest;
};

test('nearest shared contacts match a full scan for distant and local observers', () => {
  const ships = Array.from({ length: 5000 }, (_, i) => makeShip(i));
  ships[20].alive = false; ships[30].escaped = true;
  const grid = new CombatSpatialIndex(ships, .05);
  for (let n = 0; n < 80; n++) {
    const origin = { x: n * 27 - 500, y: n * 9 - 200, z: n % 3 * 50 - 30 };
    assert.equal(grid.nearestEnemy('A', origin)?.id, bruteNearest(ships, 'A', origin)?.id);
  }
});

test('nearest contact handles motion, deployment ties and newly added hulls', () => {
  const a = { ...makeShip(1), pos: { x: 12, y: 0, z: 0 } };
  const b = { ...makeShip(2), pos: { x: -12, y: 0, z: 0 } };
  const fighter = { ...makeShip(0), pos: { x: 0, y: 0, z: 0 } };
  const friend = { ...makeShip(3), side: 'A', pos: { x: 0, y: 0, z: 0 } };
  const grid = new CombatSpatialIndex([a, b, fighter, friend], .05);
  const origin = { x: 0, y: 0, z: 0 };
  assert.equal(grid.nearestEnemy('A', origin), a, 'deployment order breaks exact ties');
  a.pos.x += .14;
  assert.equal(grid.nearestEnemy('A', origin), b, 'reads current positions within conservative drift bounds');
  const reinforcement = { ...makeShip(4), pos: { x: 1, y: 0, z: 0 } };
  grid.add(reinforcement, 4);
  assert.equal(grid.nearestEnemy('A', origin), reinforcement);
  reinforcement.alive = false;
  assert.equal(grid.nearestEnemy('A', origin), b);
});

test('20,000-ship nearest queries prune distant hulls instead of scanning every enemy', () => {
  const ships = Array.from({ length: 20000 }, (_, i) => makeShip(i));
  const grid = new CombatSpatialIndex(ships, .05);
  const observers = Array.from({ length: 12 }, (_, n) => ({ x: n * 140 - 400, y: n * 80 - 200, z: n * 25 - 100 }));
  for (const observer of observers)
    assert.equal(grid.nearestEnemy('A', observer)?.id, bruteNearest(ships, 'A', observer)?.id);
  assert.ok(grid.nearestCandidateChecks < ships.length * observers.length / 20,
    'must reject at least 95% of the all-enemy candidate work');
  console.info('NEAREST_CONTACT_CANDIDATES ' + grid.nearestCandidateChecks + '/' + ships.length * observers.length);
});

test.after(() => rmSync(dir, { recursive: true, force: true }));
