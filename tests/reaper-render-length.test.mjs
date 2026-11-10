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
const files = { geometry: '../src/rendering/geometry.ts', materials: '../src/rendering/materials.ts', reaper: '../src/rendering/ships/reaper.ts' };
for (const [name, path] of Object.entries(files)) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    .replace(/from '\.\.\/geometry'/g, "from './geometry.cjs'")
    .replace(/from '\.\.\/materials'/g, "from './materials.cjs'")
    ;
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
