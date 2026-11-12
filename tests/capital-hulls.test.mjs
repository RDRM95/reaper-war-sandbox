import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

// The geth cruiser and dreadnought and the quarian heavy cruiser were the last hulls built from boxes (port of the
// Codex build's tests/capital-hulls.test.ts). Each keeps what made it its faction's on a rounded hull; what the
// simulation and the effects read off each model is unchanged.
const directory = mkdtempSync(join(tmpdir(), 'capital-hulls-'));
const projectRequire = createRequire(import.meta.url);
const THREE = projectRequire('three');
const files = { normandySR2Geometry: '../src/rendering/ships/normandySR2Geometry.ts', geometry: '../src/rendering/geometry.ts', materials: '../src/rendering/materials.ts',
  fighterKit: '../src/rendering/ships/fighterKit.ts', alliance: '../src/rendering/ships/alliance.ts', geth: '../src/rendering/ships/geth.ts', quarian: '../src/rendering/ships/quarian.ts' };
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
const { buildGethCruiser, buildGethDreadnought } = projectRequire(join(directory, 'geth.cjs'));
const { buildQuarianHeavy } = projectRequire(join(directory, 'quarian.cjs'));

const meshes = (ship) => ship.group.children.filter((c) => c.isMesh);
const points = (mesh) => (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry).getAttribute('position');
const part = (ship, name) => points(ship.group.getObjectByName(name));
const volume = (mesh) => {
  const p = points(mesh), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let v = 0;
  for (let i = 0; i < p.count; i += 3) v += a.fromBufferAttribute(p, i).dot(b.fromBufferAttribute(p, i + 1).cross(c.fromBufferAttribute(p, i + 2))) / 6;
  return v;
};
const round = (values) => values.map((v) => +v.toFixed(4));

// Length, muzzle and engine nodes as measured on the box models; triangles before and after.
const EXPECTED = [
  { name: 'geth cruiser', build: buildGethCruiser, length: 5.2, muzzle: [0, 0, 2.76], engines: [[0.26, 0, -2.72], [-0.26, 0, -2.72]], before: 676, after: 944 },
  { name: 'geth dreadnought', build: buildGethDreadnought, length: 11, muzzle: [0, 0, 5.4], engines: [[0.42, 0.28, -5.69], [-0.42, 0.28, -5.69], [0.42, -0.28, -5.69], [-0.42, -0.28, -5.69]], before: 1828, after: 2312 },
  { name: 'quarian heavy cruiser', build: buildQuarianHeavy, length: 8.2, muzzle: [0, 0.1, 4.264], engines: [[0.45, 0.25, -4.32], [-0.45, 0.25, -4.32], [0, -0.3, -4.32]], before: 720, after: 928 },
];

for (const expected of EXPECTED) {
  test(`the ${expected.name} keeps its length, muzzle and engine nodes on a rounded hull with every surface outward`, () => {
    const ship = expected.build();
    assert.equal(ship.lengthUnits, expected.length);
    assert.deepEqual(round(ship.muzzle.toArray()), expected.muzzle);
    assert.deepEqual(ship.engineNodes.map((p) => round(p.toArray())), expected.engines);
    assert.deepEqual(meshes(ship).map((m) => m.name).sort(), ['accent', 'engine', 'hull', 'hullDark', 'windows']);
    let triangles = 0;
    for (const mesh of meshes(ship)) {
      triangles += points(mesh).count / 3;
      assert.ok(volume(mesh) > 0, mesh.name);
    }
    assert.equal(triangles, expected.after);
    assert.ok(triangles < expected.before * 1.45);
    // A rounded body: the pale hull was 36 or 108 triangles of boxes and is now a body of revolution.
    assert.ok(part(ship, 'hull').count / 3 > 200);
    // The main gun reaches the muzzle and stops there.
    const dark = part(ship, 'hullDark');
    let reach = -Infinity;
    for (let i = 0; i < dark.count; i++) if (Math.hypot(dark.getX(i), dark.getY(i) - expected.muzzle[1]) < 0.3) reach = Math.max(reach, dark.getZ(i));
    assert.ok(Math.abs(reach - expected.muzzle[2]) < 1e-3);
  });
}

test('the geth hulls keep the head and optic, between forward-swept mandibles; the dreadnought keeps its ring', () => {
  for (const build of [buildGethCruiser, buildGethDreadnought]) {
    const ship = build(), L = ship.lengthUnits;
    const lit = part(ship, 'windows');
    let optic = -Infinity;
    for (let i = 0; i < lit.count; i++) if (Math.hypot(lit.getX(i), lit.getY(i)) < L * 0.05) optic = Math.max(optic, lit.getZ(i));
    assert.ok(optic > L * 0.3);
    const dark = part(ship, 'hullDark');
    let tip = 0;
    for (let i = 0; i < dark.count; i++) if (dark.getZ(i) > ship.muzzle.z - L * 0.02) tip = Math.max(tip, Math.abs(dark.getX(i)));
    assert.ok(tip > L * 0.15);
  }
  const ring = new THREE.Box3().setFromBufferAttribute(part(buildGethDreadnought(), 'accent'));
  assert.ok(Math.abs(ring.max.x - 1.85) < 0.01 && Math.abs(ring.max.y - 1.85) < 0.01);
  assert.ok(new THREE.Box3().setFromBufferAttribute(part(buildGethCruiser(), 'accent')).max.x < 0.5);
});

test('the quarian heavy cruiser keeps its bolted-on modules and carries stub wings', () => {
  const ship = buildQuarianHeavy();
  // Ten modules, each with a lit strip (twelve triangles apiece), plus the bridge's one lit band.
  assert.equal(part(ship, 'windows').count / 36, 11);
  const hull = new THREE.Box3().setFromBufferAttribute(part(ship, 'hull'));
  assert.ok(Math.abs(hull.max.x - 1.6) < 0.01);
  assert.ok(hull.max.x - hull.min.x > 3);
});
