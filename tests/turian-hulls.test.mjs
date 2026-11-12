import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

// The turian frigate is a blade, not a handful of boxes (port of the Codex build's tests/turian-hulls.test.ts).
// What the simulation and the effects read off the model is unchanged: length, muzzle and engine nodes.
const directory = mkdtempSync(join(tmpdir(), 'turian-hulls-'));
const projectRequire = createRequire(import.meta.url);
const THREE = projectRequire('three');
const files = { normandySR2Geometry: '../src/rendering/ships/normandySR2Geometry.ts', geometry: '../src/rendering/geometry.ts', materials: '../src/rendering/materials.ts',
  fighterKit: '../src/rendering/ships/fighterKit.ts', alliance: '../src/rendering/ships/alliance.ts', turian: '../src/rendering/ships/turian.ts' };
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
const { buildTurianFrigate } = projectRequire(join(directory, 'turian.cjs'));

const meshes = (ship) => ship.group.children.filter((c) => c.isMesh);
const points = (mesh) => (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry).getAttribute('position');
const volume = (mesh) => {
  const p = points(mesh), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let v = 0;
  for (let i = 0; i < p.count; i += 3) v += a.fromBufferAttribute(p, i).dot(b.fromBufferAttribute(p, i + 1).cross(c.fromBufferAttribute(p, i + 2))) / 6;
  return v;
};
// Half-beam and height of the pale hull between two stations along it (render units).
const section = (ship, from, to) => {
  const p = points(ship.group.getObjectByName('hull'));
  let beam = 0, low = Infinity, high = -Infinity, inner = Infinity;
  for (let i = 0; i < p.count; i++) {
    if (p.getZ(i) < from || p.getZ(i) > to) continue;
    beam = Math.max(beam, Math.abs(p.getX(i))); inner = Math.min(inner, Math.abs(p.getX(i)));
    low = Math.min(low, p.getY(i)); high = Math.max(high, p.getY(i));
  }
  return { beam, inner, low, high };
};

test('the turian frigate keeps its length, muzzle and engine nodes, with every surface facing outward', () => {
  const ship = buildTurianFrigate();
  assert.equal(ship.lengthUnits, 1.6);
  assert.deepEqual(ship.muzzle.toArray(), [0, 0, 0.8]);
  assert.deepEqual(ship.engineNodes.map((p) => p.toArray()), [[0.09, -0.02, -0.8], [-0.09, -0.02, -0.8]]);
  const box = new THREE.Box3().setFromObject(ship.group);
  // The pincer blades reach the muzzle (the old model stopped 0.1 units short of it).
  assert.ok(Math.abs(box.max.z - 0.8) < 1e-5);
  assert.ok(box.min.z < -0.79 && box.min.z > -0.81);
  assert.deepEqual(meshes(ship).map((m) => m.name).sort(), ['accent', 'engine', 'hull', 'hullDark', 'windows']);
  let triangles = 0;
  for (const mesh of meshes(ship)) {
    triangles += points(mesh).count / 3;
    assert.ok(volume(mesh) > 0, mesh.name);
  }
  // Measured 464 (the box model was 160).
  assert.ok(triangles <= 600);
});

test('the turian frigate is a blade: wings swept hard back and down, a split bow, a tall fin', () => {
  const ship = buildTurianFrigate();
  assert.ok(section(ship, -0.5, -0.36).beam > 0.65);
  assert.ok(section(ship, 0.16, 0.26).beam < 0.12);
  const bow = section(ship, 0.66, 0.8);
  assert.ok(bow.beam < 0.08 && bow.inner > 0.03);
  assert.ok(section(ship, -0.5, -0.36).low < -0.17);
  const all = new THREE.Box3().setFromObject(ship.group);
  assert.ok(all.max.y > 0.4);
  const hull = section(ship, -0.12, -0.08);
  assert.ok(hull.high - hull.low > 0.3);
  const dark = points(ship.group.getObjectByName('hullDark'));
  let top = -Infinity, topZ = 0;
  for (let i = 0; i < dark.count; i++) if (dark.getY(i) > top) { top = dark.getY(i); topZ = dark.getZ(i); }
  assert.ok(Math.abs(top - all.max.y) < 1e-6 && topZ < -0.3);
});
