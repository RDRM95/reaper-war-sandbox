import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

// Hull breakup pieces on the production modules without a browser (port of the Codex build's tests/breakup.test.ts).
const directory = mkdtempSync(join(tmpdir(), 'reaper-breakup-'));
const files = { geometry: '../src/rendering/geometry.ts', materials: '../src/rendering/materials.ts', reaper: '../src/rendering/ships/reaper.ts', breakup: '../src/rendering/breakup.ts' };
const projectRequire = createRequire(import.meta.url);
for (const [name, path] of Object.entries(files)) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    .replace(/from '\.\.\/geometry'/g, "from './geometry.cjs'")
    .replace(/from '\.\.\/materials'/g, "from './materials.cjs'");
  writeFileSync(join(directory, name + '.cjs'), ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
  }).outputText
    .replace(/require\("three"\)/g, 'require(' + JSON.stringify(projectRequire.resolve('three')) + ')')
    .replace(/require\("three\/examples\/jsm\/utils\/BufferGeometryUtils\.js"\)/g, 'require(' + JSON.stringify(projectRequire.resolve('three/examples/jsm/utils/BufferGeometryUtils.js')) + ')'));
}
const THREE = projectRequire('three');
const { buildReaperCapital, buildHarbinger, buildReaperDestroyer } = projectRequire(join(directory, 'reaper.cjs'));
const { MAX_BREAKUP_PIECES, collectBreakupPieces } = projectRequire(join(directory, 'breakup.cjs'));

// Direct child meshes: what the death sequence used to take, and all it took.
const flatPieces = (group) => group.children.filter((c) => c.isMesh).length;
const materialsOf = (o) => { const out = new Set(); o.traverse((c) => { if (c.isMesh) out.add(c.material); }); return out; };

test('a Reaper breaks into its limbs, mandibles and armour instead of vanishing', () => {
  for (const [name, build, limbs] of [['capital', buildReaperCapital, 6], ['harbinger', buildHarbinger, 6], ['destroyer', buildReaperDestroyer, 4]]) {
    const built = build();
    // Before: the flat rule found nothing to fling for a Reaper (its meshes sit under one model root).
    assert.equal(flatPieces(built.group), 0, name + ' flat pieces');
    const before = materialsOf(built.group);
    const pieces = collectBreakupPieces(built.group);
    assert.ok(pieces.length >= limbs + 4 && pieces.length <= MAX_BREAKUP_PIECES, name + ' pieces ' + pieces.length);
    assert.equal(pieces.filter((p) => p.userData.reaperRig === 'shoulder').length, limbs, name + ' limbs');
    assert.ok(pieces.some((p) => p.name === 'carapace'), name + ' carapace piece');
    // Hidden stand-in limbs are never pieces, and no piece keeps a material shared with the fleet.
    assert.ok(!pieces.some((p) => p.name.startsWith('reaper-static')), name + ' hidden stand-ins');
    for (const piece of pieces) for (const m of materialsOf(piece)) assert.ok(!before.has(m), name + ' shared material');
    // No piece sits inside another.
    for (const a of pieces) for (const b of pieces) if (a !== b) for (let p = a.parent; p; p = p.parent) assert.notEqual(p, b);
  }
});

test('a Reaper showing its static limbs breaks into those, not the hidden articulated ones', () => {
  const built = buildReaperCapital();
  built.group.traverse((o) => {
    if (o.userData.reaperRig === 'shoulder' || o.userData.reaperRig === 'mandible') o.visible = false;
    if (o.name.startsWith('reaper-static')) o.visible = true;
  });
  const pieces = collectBreakupPieces(built.group);
  assert.ok(pieces.some((p) => p.name === 'reaper-static-arms'));
  assert.ok(!pieces.some((p) => p.userData.reaperRig === 'shoulder'));
});

test('a flat model still breaks into its merged meshes', () => {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial();
  for (const name of ['hull', 'hullDark', 'accent', 'engine', 'window']) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    mesh.name = name;
    group.add(mesh);
  }
  const pieces = collectBreakupPieces(group);
  assert.deepEqual(pieces.map((p) => p.name), ['hull', 'hullDark', 'accent', 'engine', 'window']);
  for (const piece of pieces) assert.notEqual(piece.material, material);
});

test('the cap keeps the largest pieces', () => {
  const pieces = collectBreakupPieces(buildReaperCapital().group, 5);
  assert.equal(pieces.length, 5);
  assert.ok(pieces.some((p) => p.name === 'carapace'));
});
