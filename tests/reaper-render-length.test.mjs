import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

// Build the Reaper hulls without a browser: transpile the builder and its two helpers to CommonJS next to each
// other (Three.js ships a CommonJS build; the one ESM helper it pulls in loads through Node's require(esm)).
const directory = mkdtempSync(join(tmpdir(), 'reaper-render-'));
const files = { geometry: '../src/rendering/geometry.ts', materials: '../src/rendering/materials.ts', reaper: '../src/rendering/ships/reaper.ts', reaperMotion: '../src/rendering/reaperMotion.ts' };
for (const [name, path] of Object.entries(files)) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    .replace(/from '\.\.\/geometry'/g, "from './geometry.cjs'")
    .replace(/from '\.\.\/materials'/g, "from './materials.cjs'")
    // The rig only asks the gunnery module which mount is the main battery; a stand-in keeps this test to the rig.
    .replace("import { primaryGunneryMount } from './gunnery';", 'const primaryGunneryMount = (ship) => ship.weapons.find((w) => !w.def.antiSmall) ?? ship.weapons[0];');
  writeFileSync(join(directory, name + '.cjs'), ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
  }).outputText);
}
const projectRequire = createRequire(import.meta.url);
const THREE = projectRequire('three');
// The temporary directory has no node_modules: point the transpiled requires at the project's copies.
for (const name of Object.keys(files)) {
  const file = join(directory, name + '.cjs');
  writeFileSync(file, readFileSync(file, 'utf8')
    .replace(/require\("three"\)/g, 'require(' + JSON.stringify(projectRequire.resolve('three')) + ')')
    .replace(/require\("three\/examples\/jsm\/utils\/BufferGeometryUtils\.js"\)/g, 'require(' + JSON.stringify(projectRequire.resolve('three/examples/jsm/utils/BufferGeometryUtils.js')) + ')'));
}
const { buildReaperCapital, buildHarbinger, buildReaperDestroyer, buildReaperAscendant } = projectRequire(join(directory, 'reaper.cjs'));
const { captureReaperRig, animateReaperRig } = projectRequire(join(directory, 'reaperMotion.cjs'));

test('the Ascendant renders at its catalogue 30 km (300 units), not 36', () => {
  const built = buildReaperAscendant();
  assert.ok(Math.abs(built.lengthUnits - 300) < 1e-6, 'lengthUnits ' + built.lengthUnits);
  const bounds = new THREE.Box3().setFromObject(built.group);
  const extent = bounds.max.z - bounds.min.z;
  assert.ok(extent > 285 && extent < 315, 'z extent ' + extent);
});

test('the only hidden layers in a Reaper template are the static stand-in limbs', () => {
  // The rig keeps merged static limbs hidden behind the articulated ones (as the Codex build does); instanced
  // batches skip hidden meshes (src/rendering/instancedFleet.ts), so nothing else may hide inside a template.
  for (const [name, build] of Object.entries({ buildReaperCapital, buildHarbinger, buildReaperDestroyer })) {
    const built = build();
    const hidden = new Set();
    let carapace = 0;
    built.group.traverse((obj) => {
      if (!obj.isMesh) return;
      if (obj.name === 'carapace') carapace++;
      for (let o = obj; o && o !== built.group; o = o.parent) if (!o.visible) { hidden.add(obj.name); break; }
    });
    assert.deepEqual([...hidden].sort(), ['reaper-static-arms', 'reaper-static-seams'], name + ' hidden layers');
    assert.ok(carapace > 0, name + ' has a structural carapace mesh');
  }
});

test('rebuilt Reaper hulls keep their catalogue lengths and weapon attachment points', () => {
  // Values measured on the hulls before the rebuild (Codex tests/reaper-carapace.test.ts pins the same).
  const expected = {
    buildReaperCapital: { length: 20, muzzle: [0, -1.223, -0.219] },
    buildHarbinger: { length: 24, muzzle: [0, -1.678, -0.224] },
    buildReaperDestroyer: { length: 1.6, muzzle: [0, -0.196, 0.028] },
  };
  for (const [name, build] of Object.entries({ buildReaperCapital, buildHarbinger, buildReaperDestroyer })) {
    const built = build();
    assert.equal(built.lengthUnits, expected[name].length, name + ' length');
    const m = [built.muzzle.x, built.muzzle.y, built.muzzle.z];
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(m[i] - expected[name].muzzle[i]) < expected[name].length * 0.02, name + ' muzzle axis ' + i + ': ' + m[i]);
  }
});

test('Reaper limbs open into a combat stance and gather again, slowly and one after another', () => {
  // Port of the Codex build's tests/reaper-stance.test.ts: before, a capital's claw tips moved about 15 m in a whole
  // idle cycle and engaging changed nothing.
  const ship = { role: 'reaper_capital', faction: 'reaper', vel: { x: 0, y: 0, z: 0 }, maxSpeed: 1, targetId: undefined,
    weapons: [{ beamRemaining: 0, cooldown: 5, def: { kind: 'reaper_beam', antiSmall: false } }] };
  const built = buildReaperCapital();
  const rig = captureReaperRig(built.group, 'stance-capital');
  const tips = () => rig.elbows.map((elbow) => {
    elbow.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(elbow);
    return new THREE.Vector3((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.max.z);
  });
  const span = (points) => { let widest = 0; for (const a of points) for (const b of points) widest = Math.max(widest, Math.hypot(a.x - b.x, a.y - b.y)); return widest; };
  let t = 0;
  const run = (seconds, engaged) => { for (let i = 0; i < seconds * 20; i++) { animateReaperRig(rig, ship, t, 0.05, engaged); t += 0.05; } };
  run(2, false);
  const travel = tips();
  run(2, true);
  assert.ok(Math.max(...rig.stance) < 0.6, 'a capital is not open after two seconds');
  assert.ok(Math.max(...rig.stance) - Math.min(...rig.stance) > 0.03, 'limbs run on their own clocks');
  run(40, true);
  const combat = tips();
  assert.ok(span(combat) - span(travel) > 2, 'claw-tip span grows by more than 2 units: ' + (span(combat) - span(travel)));
  for (let i = 0; i < travel.length; i++) assert.ok(combat[i].distanceTo(travel[i]) > 1, 'tip ' + i + ' moves over 100 m');
  run(60, false);
  assert.ok(Math.abs(span(tips()) - span(travel)) < 0.3, 'the limbs gather again');
});
