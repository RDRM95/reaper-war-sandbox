import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

// The geth and Cerberus frigates were the last frigates made of boxes (port of the Codex build's
// tests/frigate-hulls.test.ts). What the simulation and the effects read off each model is unchanged.
const directory = mkdtempSync(join(tmpdir(), 'frigate-hulls-'));
const projectRequire = createRequire(import.meta.url);
const THREE = projectRequire('three');
const files = { normandySR2Geometry: '../src/rendering/ships/normandySR2Geometry.ts', geometry: '../src/rendering/geometry.ts', materials: '../src/rendering/materials.ts',
  fighterKit: '../src/rendering/ships/fighterKit.ts', alliance: '../src/rendering/ships/alliance.ts', geth: '../src/rendering/ships/geth.ts', cerberus: '../src/rendering/ships/cerberus.ts' };
for (const [name, path] of Object.entries(files)) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    .replace(/from '\.\.\/geometry'/g, "from './geometry.cjs'")
    .replace(/from '\.\.\/materials'/g, "from './materials.cjs'")
    .replace(/from '\.\/normandySR2Geometry'/g, "from './normandySR2Geometry.cjs'")
    .replace(/from '\.\/fighterKit'/g, "from './fighterKit.cjs'")
    .replace(/from '\.\/alliance'/g, "from './alliance.cjs'");
  writeFileSync(join(directory, name + '.cjs'), ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
  }).outputText
    .replace(/require\("three"\)/g, 'require(' + JSON.stringify(projectRequire.resolve('three')) + ')')
    .replace(/require\("three\/examples\/jsm\/utils\/BufferGeometryUtils\.js"\)/g, 'require(' + JSON.stringify(projectRequire.resolve('three/examples/jsm/utils/BufferGeometryUtils.js')) + ')'));
}
const { buildGethFrigate } = projectRequire(join(directory, 'geth.cjs'));
const { buildCerberusFrigate } = projectRequire(join(directory, 'cerberus.cjs'));

const meshes = (ship) => ship.group.children.filter((c) => c.isMesh);
const points = (mesh) => (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry).getAttribute('position');
const part = (ship, name) => points(ship.group.getObjectByName(name));
const volume = (mesh) => {
  const p = points(mesh), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let v = 0;
  for (let i = 0; i < p.count; i += 3) v += a.fromBufferAttribute(p, i).dot(b.fromBufferAttribute(p, i + 1).cross(c.fromBufferAttribute(p, i + 2))) / 6;
  return v;
};
// Greatest and least distance from the centre line of a part's vertices between two stations.
const reach = (p, from, to) => {
  let outer = 0, inner = Infinity;
  for (let i = 0; i < p.count; i++) if (p.getZ(i) >= from && p.getZ(i) <= to) { outer = Math.max(outer, Math.abs(p.getX(i))); inner = Math.min(inner, Math.abs(p.getX(i))); }
  return { outer, inner };
};

const EXPECTED = [
  { name: 'geth', build: buildGethFrigate, length: 1.5, muzzle: [0, 0, 0.75], engines: [[0.07, 0, -0.75], [-0.07, 0, -0.75]] },
  { name: 'Cerberus', build: buildCerberusFrigate, length: 1.8, muzzle: [0, 0, 0.9], engines: [[0.72, -0.05, -0.75], [-0.72, -0.05, -0.75]] },
];

for (const expected of EXPECTED) {
  test(`the ${expected.name} frigate keeps its length, muzzle and engine nodes, with every surface facing outward`, () => {
    const ship = expected.build();
    assert.equal(ship.lengthUnits, expected.length);
    assert.deepEqual(ship.muzzle.toArray(), expected.muzzle);
    assert.deepEqual(ship.engineNodes.map((p) => p.toArray()), expected.engines);
    assert.deepEqual(meshes(ship).map((m) => m.name).sort(), ['accent', 'engine', 'hull', 'hullDark', 'windows']);
    // The model reaches its own muzzle (the old geth frigate stopped 0.19 units short of it, the old Cerberus one 0.13).
    assert.ok(Math.abs(new THREE.Box3().setFromObject(ship.group).max.z - expected.length / 2) < 1e-3);
    let triangles = 0;
    for (const mesh of meshes(ship)) {
      triangles += points(mesh).count / 3;
      assert.ok(volume(mesh) > 0, mesh.name);
    }
    // Measured: geth 644 (was 328), Cerberus 552 (was 280).
    assert.ok(triangles <= 700);
  });
}

test('the geth frigate carries its head and optic between two forward-swept mandibles', () => {
  const ship = buildGethFrigate();
  const tips = reach(part(ship, 'hullDark'), 0.68, 0.76);
  assert.ok(tips.outer > 0.33 && tips.inner > 0.3);
  assert.ok(new THREE.Box3().setFromBufferAttribute(part(ship, 'hull')).max.z < 0.56);
  const lit = part(ship, 'windows');
  let optic = 0, lights = 0;
  for (let i = 0; i < lit.count; i++) { if (lit.getZ(i) > 0.45) optic++; else lights++; }
  assert.ok(optic > 0 && lights > 0);
  assert.ok(part(ship, 'hull').count / 3 > 100);
});

test('the Cerberus frigate is a pointed hull with twin booms and its drives on the wing tips', () => {
  const ship = buildCerberusFrigate(), hull = part(ship, 'hull');
  assert.ok(reach(hull, 0.8, 0.9).outer < 0.04);
  const booms = reach(hull, 0.6, 0.63);
  assert.ok(booms.outer > 0.18 && booms.outer < 0.23);
  assert.ok(reach(hull, -0.74, -0.6).outer > 0.75);
  const lit = part(ship, 'engine');
  for (let i = 0; i < lit.count; i++) assert.ok(Math.abs(Math.abs(lit.getX(i)) - 0.72) < 0.06);
  assert.equal(part(ship, 'windows').count / 3, 12);
});
