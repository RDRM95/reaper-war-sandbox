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

test('Reaper templates carry no hidden layers here, so instanced batches merge exactly what they show', () => {
  // The Codex build keeps static stand-in limbs hidden behind the articulated ones and its batch skips hidden
  // meshes (tests/instanced-template-batch.test.ts there). This sandbox has no hidden layers: the same guard in
  // src/rendering/instancedFleet.ts is a no-op, and this test says so if a hidden layer ever appears.
  for (const [name, build] of Object.entries({ buildReaperCapital, buildHarbinger, buildReaperDestroyer })) {
    const built = build();
    let hidden = 0;
    built.group.traverse((obj) => {
      if (!obj.isMesh) return;
      for (let o = obj; o && o !== built.group; o = o.parent) if (!o.visible) { hidden++; break; }
    });
    assert.equal(hidden, 0, name + ' has meshes under hidden ancestors');
  }
});
