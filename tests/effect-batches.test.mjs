import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

// Sparks and debris fragments draw through instanced batches (port of the Codex build's
// tests/effect-batches.test.ts): what a pushed spark writes, how many instances are drawn, and fragment growth.
const projectRequire = createRequire(import.meta.url);
const THREE = projectRequire('three');
const directory = mkdtempSync(join(tmpdir(), 'effect-batches-'));
writeFileSync(join(directory, 'effectBatches.cjs'), ts.transpileModule(readFileSync(new URL('../src/rendering/effectBatches.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
}).outputText.replace(/require\("three"\)/g, 'require(' + JSON.stringify(projectRequire.resolve('three')) + ')'));
const { FragmentBatch, SparkBatch } = projectRequire(join(directory, 'effectBatches.cjs'));

test('a spark batch draws exactly the sparks pushed since begin', () => {
  const batch = new SparkBatch(new THREE.Texture(), true, 8);
  batch.begin();
  assert.equal(batch.push(1, 2, 3, 4, 0.5, 0.25, 0.125, 0.75), true);
  assert.equal(batch.push(-1, -2, -3, 0.5, 1, 1, 1, 1), true);
  batch.commit();
  const geometry = batch.mesh.geometry;
  assert.equal(geometry.instanceCount, 2);
  assert.deepEqual(Array.from(geometry.getAttribute('centre').array.slice(0, 8)), [1, 2, 3, 4, -1, -2, -3, 0.5]);
  assert.deepEqual(Array.from(geometry.getAttribute('tint').array.slice(0, 8)), [0.5, 0.25, 0.125, 0.75, 1, 1, 1, 1]);
  batch.begin(); batch.commit();
  assert.equal(geometry.instanceCount, 0);
  batch.dispose();
});

test('a spark batch refuses sparks beyond its capacity', () => {
  const batch = new SparkBatch(new THREE.Texture(), true, 2);
  batch.begin();
  assert.equal(batch.push(0, 0, 0, 1, 1, 1, 1, 1), true);
  assert.equal(batch.push(0, 0, 0, 1, 1, 1, 1, 1), true);
  assert.equal(batch.push(9, 9, 9, 9, 9, 9, 9, 9), false);
  assert.equal(batch.count, 2);
  batch.dispose();
});

test('a spark batch blends as the sprites it replaces did', () => {
  const tested = new SparkBatch(new THREE.Texture()), through = new SparkBatch(new THREE.Texture(), false);
  for (const batch of [tested, through]) {
    assert.equal(batch.mesh.material.blending, THREE.AdditiveBlending);
    assert.equal(batch.mesh.material.transparent, true);
    assert.equal(batch.mesh.material.depthWrite, false);
    assert.equal(batch.mesh.frustumCulled, false);
  }
  assert.equal(tested.mesh.material.depthTest, true);
  assert.equal(through.mesh.material.depthTest, false);
  for (const chunk of ['logdepthbuf_vertex', 'logdepthbuf_fragment', 'tonemapping_fragment', 'colorspace_fragment']) {
    assert.ok((tested.mesh.material.vertexShader + tested.mesh.material.fragmentShader).includes('#include <' + chunk + '>'), chunk);
  }
  tested.dispose(); through.dispose();
});

test('a fragment batch grows instead of dropping fragments', () => {
  const parent = new THREE.Group(), geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial();
  const batch = new FragmentBatch(geometry, material, parent, 2);
  batch.begin();
  for (let i = 0; i < 5; i++) batch.push(new THREE.Matrix4().makeTranslation(i + 1, 0, 0));
  batch.commit();
  assert.equal(batch.count, 5);
  assert.equal(batch.capacity, 8);
  assert.equal(batch.mesh.count, 5);
  const x = (i) => { const m = new THREE.Matrix4(); batch.mesh.getMatrixAt(i, m); return m.elements[12]; };
  assert.deepEqual([0, 1, 2, 3, 4].map(x), [1, 2, 3, 4, 5]);
  assert.deepEqual(parent.children, [batch.mesh]);
  batch.dispose();
  assert.equal(parent.children.length, 0);
  geometry.dispose(); material.dispose();
});
