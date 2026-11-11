import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

// The Alliance line dreadnought and cruiser have their own outlines (port of the Codex build's
// tests/alliance-hulls.test.ts). What the simulation and the effects read off the model is unchanged: length,
// muzzle and engine nodes are the values measured on the hulls before the rebuild.
const directory = mkdtempSync(join(tmpdir(), 'alliance-hulls-'));
const projectRequire = createRequire(import.meta.url);
const THREE = projectRequire('three');
const files = { normandySR2Geometry: '../src/rendering/ships/normandySR2Geometry.ts', geometry: '../src/rendering/geometry.ts', materials: '../src/rendering/materials.ts', fighterKit: '../src/rendering/ships/fighterKit.ts', alliance: '../src/rendering/ships/alliance.ts' };
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
const { buildAllianceCarrier, buildAllianceCruiser, buildAllianceDreadnought, buildAllianceFighter, buildAllianceFrigate, buildAllianceOmaha, buildNormandySR2 } = projectRequire(join(directory, 'alliance.cjs'));
const { cornerSolid, mirrorX, spindle, wingPanel } = projectRequire(join(directory, 'fighterKit.cjs'));
const { PALETTES } = projectRequire(join(directory, 'materials.cjs'));

const EXPECTED = {
  dreadnought: { build: buildAllianceDreadnought, length: 8.88, muzzle: [0, -0.07992, 4.2624],
    engines: [[-0.43867, 0.21978, -4.44], [0.43867, 0.21978, -4.44], [-0.43867, -0.21978, -4.44], [0.43867, -0.21978, -4.44]], maxTriangles: 2000 },
  cruiser: { build: buildAllianceCruiser, length: 5.2, muzzle: [0, -0.0468, 2.496],
    engines: [[-0.247, 0, -2.6], [0.247, 0, -2.6]], maxTriangles: 1500 },
};
const round = (values) => values.map((v) => +v.toFixed(5));
const meshes = (ship) => ship.group.children.filter((c) => c.isMesh);
const triangles = (ship) => meshes(ship).reduce((n, m) => n + m.geometry.getAttribute('position').count / 3, 0);
const size = (ship) => new THREE.Box3().setFromObject(ship.group).getSize(new THREE.Vector3());

// Half-beam of the pale armour at one station along the hull, as fractions of its length.
function halfBeam(ship, station) {
  const position = ship.group.getObjectByName('hull').geometry.getAttribute('position');
  const z = station * ship.lengthUnits;
  let widest = 0;
  for (let t = 0; t < position.count; t += 3) {
    for (let e = 0; e < 3; e++) {
      const i = t + e, j = t + (e + 1) % 3;
      const zi = position.getZ(i), zj = position.getZ(j);
      if ((zi - z) * (zj - z) > 0 || zi === zj) continue;
      widest = Math.max(widest, Math.abs(position.getX(i) + (position.getX(j) - position.getX(i)) * (z - zi) / (zj - zi)));
    }
  }
  return widest / ship.lengthUnits;
}

// Where along the hull its highest point sits, as a fraction of its length (negative is aft).
function crownStation(ship) {
  let top = -Infinity, station = 0;
  for (const mesh of meshes(ship)) {
    const position = mesh.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) if (position.getY(i) > top) { top = position.getY(i); station = position.getZ(i) / ship.lengthUnits; }
  }
  return station;
}

for (const [name, expected] of Object.entries(EXPECTED)) {
  test(name + ' keeps its length, muzzle and engine nodes, in five merged meshes', () => {
    const ship = expected.build();
    assert.equal(ship.lengthUnits, expected.length);
    assert.ok(size(ship).z > expected.length * 0.985 && size(ship).z <= expected.length + 1e-6, 'z extent ' + size(ship).z);
    assert.deepEqual(round(ship.muzzle.toArray()), expected.muzzle);
    assert.deepEqual(ship.engineNodes.map((p) => round(p.toArray())), expected.engines);
    assert.deepEqual(meshes(ship).map((m) => m.name).sort(), ['accent', 'engine', 'hull', 'hullDark', 'windows']);
    assert.ok(triangles(ship) <= expected.maxTriangles, 'triangles ' + triangles(ship));
    const s = size(ship);
    assert.ok(s.z / s.x > 3 && s.z / s.y > 6, 'proportions ' + s.toArray());
  });
}

test('the dreadnought is an arrowhead narrowing to a spinal blade, with its citadel aft', () => {
  const ship = buildAllianceDreadnought();
  assert.ok(Math.abs(halfBeam(ship, -0.25) - 0.15) < 1e-3);
  assert.ok(halfBeam(ship, 0.05) < 0.11);
  assert.ok(halfBeam(ship, 0.3) > 0.02 && halfBeam(ship, 0.3) < 0.03);
  assert.ok(crownStation(ship) < -0.15);
});

test('the cruiser is its own forked silhouette, not a scaled dreadnought', () => {
  const cruiser = buildAllianceCruiser(), dreadnought = buildAllianceDreadnought();
  assert.ok(Math.abs(halfBeam(cruiser, 0.3) - 0.135) < 1e-3);
  assert.ok(halfBeam(cruiser, 0.3) > 4 * halfBeam(dreadnought, 0.3));
  assert.ok(halfBeam(cruiser, 0.42) < 0.03);
});

test('the frigate is a swept-wing dart: same length, muzzle and four engine nodes, low chisel bow', () => {
  const ship = buildAllianceFrigate();
  assert.equal(ship.lengthUnits, 1.7);
  assert.deepEqual(round(ship.muzzle.toArray()), [0, -0.02, 0.85]);
  assert.deepEqual(ship.engineNodes.map((p) => round(p.toArray())), [[0.78, -0.06, -0.8], [-0.78, -0.06, -0.8], [0.09, 0, -0.85], [-0.09, 0, -0.85]]);
  assert.deepEqual(meshes(ship).map((m) => m.name).sort(), ['accent', 'engine', 'hull', 'hullDark', 'windows']);
  assert.ok(triangles(ship) <= 900, 'triangles ' + triangles(ship));
  const box = new THREE.Box3().setFromObject(ship.group);
  assert.ok(Math.abs(box.max.z - 0.85) < 1e-5 && box.min.z > -0.87, 'z ' + box.min.z + ' ' + box.max.z);
  assert.ok(halfBeam(ship, -0.3) > 0.45 && halfBeam(ship, 0) < 0.26 && halfBeam(ship, 0.2) < 0.08);
  assert.ok(halfBeam(ship, 0.4) < halfBeam(ship, 0.2) * 0.6);
  const position = ship.group.getObjectByName('hull').geometry.getAttribute('position');
  const top = (station) => {
    let highest = -Infinity;
    for (let i = 0; i < position.count; i++) if (Math.abs(position.getZ(i) / ship.lengthUnits - station) < 0.02) highest = Math.max(highest, position.getY(i));
    return highest / ship.lengthUnits;
  };
  assert.ok(top(0.5) < 0.01 && top(-0.3) > 0.05);
});

test('the carrier is a twin-prong flight deck with an island, in the armour of the line hulls', () => {
  const ship = buildAllianceCarrier(), dreadnought = buildAllianceDreadnought();
  assert.equal(ship.lengthUnits, 9);
  // Prong tips to exhaust is the stated length; the old model was 9.82 units long for a stated 9.
  const box = new THREE.Box3().setFromObject(ship.group);
  assert.ok(Math.abs(box.max.z - 4.5) < 1e-5);
  assert.ok(box.min.z > -4.5 && box.min.z < -4.45);
  assert.deepEqual(ship.engineNodes.map((p) => round(p.toArray())), [[0.603, 0.18, -4.5], [-0.603, 0.18, -4.5], [0, -0.27, -4.5]]);
  assert.deepEqual(meshes(ship).map((m) => m.name).sort(), ['accent', 'engine', 'hull', 'hullDark', 'windows']);
  // Measured 1,976 (the box model was 432; the dreadnought is 1,660). A fleet carries one to four carriers.
  assert.ok(triangles(ship) <= 2100);
  const s = size(ship);
  assert.ok(s.z / s.x > 3 && s.z / s.y > 5);
  // Full beam past amidships, and the prongs still carry most of it where the dreadnought is down to its blade.
  assert.ok(Math.abs(halfBeam(ship, -0.2) - 0.15) < 0.0005);
  assert.ok(halfBeam(ship, 0.35) > 0.12);
  assert.ok(halfBeam(ship, 0.35) > 4 * halfBeam(dreadnought, 0.35));
  // The launch channel: forward of the recovery deck no pale armour comes within 5 % of the length of the centre line.
  const hull = ship.group.getObjectByName('hull').geometry.getAttribute('position');
  let innermost = Infinity;
  for (let i = 0; i < hull.count; i++) if (hull.getZ(i) > 0.23 * 9) innermost = Math.min(innermost, Math.abs(hull.getX(i)));
  assert.ok(innermost / 9 > 0.05);
  // The highest point is the island's mast: aft of amidships and on the starboard deck edge.
  let top = -Infinity, topX = 0, topZ = 0;
  for (const mesh of meshes(ship)) {
    const position = mesh.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) if (position.getY(i) > top) { top = position.getY(i); topX = position.getX(i); topZ = position.getZ(i); }
  }
  assert.ok(topX / 9 > 0.1 && topZ / 9 < -0.15);
  // Hangars are openings with a strip of light in them, not lit slabs 30 m tall: no lit element is taller than 4.5 m.
  const lit = ship.group.getObjectByName('windows').geometry.getAttribute('position');
  let tallest = 0;
  for (let t = 0; t < lit.count; t += 36) {
    let low = Infinity, high = -Infinity;
    for (let i = t; i < t + 36; i++) { low = Math.min(low, lit.getY(i)); high = Math.max(high, lit.getY(i)); }
    tallest = Math.max(tallest, high - low);
  }
  assert.ok(tallest < 0.045);
});

// Signed volume of a triangle soup: positive when its faces wind outward.
function volume(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry, p = g.getAttribute('position');
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let v = 0;
  for (let i = 0; i < p.count; i += 3) v += a.fromBufferAttribute(p, i).dot(b.fromBufferAttribute(p, i + 1).cross(c.fromBufferAttribute(p, i + 2))) / 6;
  return v;
}

test('the fighter kit builds closed solids whose faces wind outward, mirrored or not', () => {
  assert.ok(Math.abs(volume(cornerSolid([[0, 0, 0], [0, 0, 1], [0, 1, 0], [0, 1, 1], [1, 0, 0], [1, 0, 1], [1, 1, 0], [1, 1, 1]])) - 1) < 1e-6);
  const panel = wingPanel(1, 1, 0.5, 0.3, 0.1);
  assert.ok(volume(panel) > 0);
  assert.ok(Math.abs(volume(mirrorX(panel)) - volume(panel)) < 1e-6);
  const body = spindle([{ z: -1, r: 0 }, { z: -0.5, r: 0.5 }, { z: 0.5, r: 0.5 }, { z: 1, r: 0 }], 8, 1);
  assert.ok(volume(body) > 0.5);
  // Stations run tail to nose: the nose station is at +z.
  assert.ok(Math.abs(new THREE.Box3().setFromBufferAttribute(body.getAttribute('position')).max.z - 1) < 1e-3);
});

test('the Alliance fighter is a winged craft of its stated length with no lit canopy', () => {
  // The other five factions' fighters are checked in the browser suite (e2e/visual-weight.spec.ts).
  const ship = buildAllianceFighter(), box = size(ship);
  let count = 0;
  for (const mesh of meshes(ship)) {
    count += (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.getAttribute('position').count) / 3;
    assert.ok(volume(mesh.geometry) > 0, mesh.name);
  }
  // Measured 380 (the box model was 108).
  assert.ok(count > 180 && count <= 420);
  assert.ok(box.z > ship.lengthUnits * 0.98 && box.z < ship.lengthUnits * 1.04);
  assert.ok(box.x / box.z > 0.45 && box.x / box.z < 0.85);
  assert.ok(box.y / box.z < 0.42);
  assert.equal(ship.engineNodes.length, 2);
  for (const node of ship.engineNodes) assert.ok(node.z < -ship.lengthUnits * 0.48);
  assert.equal(ship.group.getObjectByName('windows'), undefined);
});

test('Alliance armour is matt paint over darker machinery', () => {
  const { hull, hullDark } = PALETTES.alliance;
  assert.ok(hull.metalness <= 0.25 && hull.roughness >= 0.7);
  const pale = hull.color.getHSL({ h: 0, s: 0, l: 0 }).l, dark = hullDark.color.getHSL({ h: 0, s: 0, l: 0 }).l;
  assert.ok(pale > 3 * dark);
});

test('the heavy gunship hull of the Omaha family is untouched', () => {
  const omaha = buildAllianceOmaha();
  assert.equal(triangles(omaha), 1952);
  assert.equal(omaha.engineNodes.length, 6);
  assert.ok(Math.abs(size(omaha).z - 17.802) < 1e-3);
});


test('SR-2 keeps a narrow plan, structural fins and five batches', () => {
  const ship = buildNormandySR2(), bounds = size(ship);
  assert.equal(ship.lengthUnits, 2.16);
  assert.deepEqual(ship.muzzle.toArray(), [0, -0.012, 1.068]);
  assert.ok(Math.abs(bounds.z - 2.16) < 0.01);
  assert.ok(bounds.x / bounds.z > 0.44 && bounds.x / bounds.z < 0.50);
  assert.ok(bounds.y > 0.40);
  assert.equal(meshes(ship).length, 5);
  assert.ok(triangles(ship) < 1800);
  assert.ok(meshes(ship).every(m => Array.from(m.geometry.attributes.position.array).every(Number.isFinite)));
});

test('all four SR-2 exhaust nodes lie on their actual emissive aft faces', () => {
  const ship = buildNormandySR2(); ship.group.updateMatrixWorld(true);
  assert.equal(ship.engineNodes.length, 4);
  for (const node of ship.engineNodes) {
    const ray = new THREE.Raycaster(node.clone().add(new THREE.Vector3(0, 0, -0.1)), new THREE.Vector3(0, 0, 1));
    const hit = ray.intersectObject(ship.group.getObjectByName('engine'))[0];
    assert.ok(hit && hit.point.distanceTo(node) < 1e-5);
  }
});
