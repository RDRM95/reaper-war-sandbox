import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';

// Load the real TypeScript models, catalogue and batch renderer through the
// existing Node-test toolchain. No browser, copied hulls or mock materials.
const project = fileURLToPath(new URL('..', import.meta.url));
const sourceRoot = join(project, 'src');
const directory = mkdtempSync(join(tmpdir(), 'reaper-structural-lod-'));
writeFileSync(join(directory, 'package.json'), '{"type":"commonjs"}');
symlinkSync(join(project, 'node_modules'), join(directory, 'node_modules'), 'dir');
const compiled = new Map();
function compile(path) {
  const source = resolve(sourceRoot, path);
  if (compiled.has(source)) return compiled.get(source);
  const output = join(directory, relative(sourceRoot, source).replace(/\.ts$/, '.js'));
  compiled.set(source, output);
  const js = ts.transpileModule(readFileSync(source, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText.replace(/require\("([^\"]+)"\)/g, (match, request) => {
    if (!request.startsWith('.') && !request.startsWith('@/')) return match;
    let target = request.startsWith('@/') ? join(sourceRoot, request.slice(2)) : resolve(dirname(source), request);
    target = existsSync(target + '.ts') ? target + '.ts' : join(target, 'index.ts');
    return `require(${JSON.stringify(compile(target))})`;
  });
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, js);
  return output;
}
const require = createRequire(import.meta.url);
const { instantiateShip, getShipTemplate } = require(compile('rendering/ships/index.ts'));
const { getShipClass } = require(compile('data/ships.ts'));
const { InstancedFleet } = require(compile('rendering/instancedFleet.ts'));
const { captureLodDetails, applyShipLod } = require(compile('rendering/shipLod.ts'));
const { isLodDetail } = require(compile('rendering/lod.ts'));
const classes = ['reaper_capital', 'harbinger', 'reaper_destroyer'];
// Independently measured complete structural geometry after the authored
// carapace rebuild, including both optics and excluding hidden stand-ins.
const reducedVertices = { reaper_capital: 25151, harbinger: 24671, reaper_destroyer: 18143 };
const named = (root, name) => {
  const matches = [];
  root.traverse(object => { if (object.name === name) matches.push(object); });
  return matches;
};
const shipState = classId => ({
  id: `lod-${classId}`, classId, role: getShipClass(classId).role,
  alive: true, escaped: false,
  pos: { x: 3, y: 2, z: -4 }, prevPos: { x: 2, y: 2, z: -4 },
  heading: { x: 0, y: 0, z: 1 }, prevHeading: { x: 0, y: 0, z: 1 },
  vel: { x: 1, y: 0, z: 0 }, engineThrust: .4
});

for (const classId of classes) {
  test(`${classId} keeps its real armour and weapon aperture in reduced GPU batches`, () => {
    const fleet = new InstancedFleet(), ship = shipState(classId);
    const initialState = structuredClone(ship);
    try {
      fleet.begin([ship]); fleet.add(ship, .5, 'reduced'); fleet.end();
      const parts = fleet.group.children;
      const eyes = parts.filter(part => part.name === `instanced-${classId}-eye`);
      assert.equal(eyes.length, 2, 'both distinct optics must survive material batching');
      assert.ok(eyes.every(part => part.count === 1 && part.visible));
      const shownVertices = parts.filter(part => part.visible && part.count > 0)
        .reduce((count, part) => count + part.geometry.attributes.position.count, 0);
      assert.equal(shownVertices, reducedVertices[classId], 'the complete carapace and limbs survive merging');
      const overlays = parts.filter(part => part.name === `instanced-${classId}-plates`);
      assert.ok(overlays.length > 0 && overlays.every(part => part.count === 0 && !part.visible));
      const seams = parts.filter(part => part.name.endsWith('-reaper-arm-seam'));
      assert.ok(seams.length > 0);
      assert.ok(seams.every(part => part.count === 0 && !part.visible));
      assert.deepEqual(ship, initialState, 'visual detail cannot change physical state');
      const partCount = parts.length;
      fleet.begin([ship]); fleet.add(ship, .5, 'full'); fleet.end();
      assert.ok(seams.every(part => part.count === 1 && part.visible));
      assert.ok(overlays.every(part => part.count === 1 && part.visible));
      assert.equal(fleet.group.children.length, partCount, 'LOD transitions reuse material batches');
    } finally { fleet.dispose(); }
  });

  test(`${classId} reduces nested hero details without changing scale or mounts`, () => {
    const built = instantiateShip(classId), role = getShipClass(classId).role;
    const details = captureLodDetails(built.group, role);
    const seams = named(built.group, 'reaper-arm-seam');
    const armour = named(built.group, 'carapace'), overlays = named(built.group, 'plates'), eyes = named(built.group, 'eye');
    const size = new THREE.Box3().setFromObject(built.group).getSize(new THREE.Vector3());
    const muzzle = built.muzzle.clone(), engines = built.engineNodes.map(point => point.clone());
    assert.ok(seams.length > 0 && seams.every(part => part.parent !== built.group));
    applyShipLod(built.group, details, 'reduced');
    assert.ok(seams.every(part => !part.visible));
    assert.ok(armour.length > 0 && armour.every(part => part.visible));
    assert.ok(overlays.length > 0 && overlays.every(part => !part.visible));
    assert.ok(eyes.length > 0 && eyes.every(part => part.visible));
    applyShipLod(built.group, details, 'point'); assert.equal(built.group.visible, false);
    applyShipLod(built.group, details, 'full'); assert.equal(built.group.visible, true);
    assert.ok(seams.every(part => part.visible));
    assert.ok(overlays.every(part => part.visible));
    assert.deepEqual(new THREE.Box3().setFromObject(built.group).getSize(new THREE.Vector3()), size);
    assert.deepEqual(built.muzzle, muzzle); assert.deepEqual(built.engineNodes, engines);
  });
}

test('non-Reaper policy and deliberately hidden nested details remain intact', () => {
  assert.equal(isLodDetail('plates', 'cruiser'), true);
  assert.equal(isLodDetail('eye', 'fighter'), true);
  assert.equal(isLodDetail('lights', 'reaper_capital'), true);
  assert.equal(isLodDetail('reaper-joint', 'reaper_capital'), false);
  const root = new THREE.Group(), nested = new THREE.Group(); root.add(nested);
  const hidden = new THREE.Object3D(); hidden.name = 'lights'; hidden.visible = false; nested.add(hidden);
  const window = new THREE.Object3D(); window.name = 'windows'; nested.add(window);
  const details = captureLodDetails(root, 'reaper_capital');
  applyShipLod(root, details, 'reduced'); assert.equal(window.visible, false);
  applyShipLod(root, details, 'full'); assert.equal(window.visible, true); assert.equal(hidden.visible, false);
});

test('a dedicated nested carapace stays structural while its decorative overlays reduce and restore', () => {
  const root = new THREE.Group(), model = new THREE.Group(), panels = new THREE.Group();
  root.add(model); model.add(panels);
  const carapace = new THREE.Object3D(); carapace.name = 'carapace'; model.add(carapace);
  const eye = new THREE.Object3D(); eye.name = 'eye'; model.add(eye);
  const overlay = new THREE.Object3D(); overlay.name = 'plates'; panels.add(overlay);
  const hidden = new THREE.Object3D(); hidden.name = 'plates'; hidden.visible = false; panels.add(hidden);
  const details = captureLodDetails(root, 'reaper_capital');
  applyShipLod(root, details, 'reduced');
  assert.equal(carapace.visible, true); assert.equal(eye.visible, true);
  assert.equal(overlay.visible, false); assert.equal(hidden.visible, false);
  applyShipLod(root, details, 'point'); assert.equal(root.visible, false);
  applyShipLod(root, details, 'full'); assert.equal(root.visible, true);
  assert.equal(carapace.visible, true); assert.equal(eye.visible, true);
  assert.equal(overlay.visible, true); assert.equal(hidden.visible, false);
});

test('GPU batches distinguish a dedicated nested carapace from legacy plate overlays', () => {
  const template = getShipTemplate('reaper_capital'), nested = new THREE.Group();
  const geometry = new THREE.BoxGeometry(.04, .02, .06), material = new THREE.MeshBasicMaterial({ color: 0x121212 });
  const carapace = new THREE.Mesh(geometry, material); carapace.name = 'carapace'; nested.add(carapace);
  // Represent the new layout in an isolated test scope; no geometry branch is
  // imported or changed. The original cached template is restored afterward.
  template.group.add(nested);
  const fleet = new InstancedFleet(), ship = shipState('reaper_capital');
  try {
    fleet.begin([ship]); fleet.add(ship, 1, 'reduced'); fleet.end();
    const parts = fleet.group.children;
    const shell = parts.find(part => part.name === 'instanced-reaper_capital-carapace');
    const overlay = parts.find(part => part.name === 'instanced-reaper_capital-plates');
    const eye = parts.find(part => part.name === 'instanced-reaper_capital-eye');
    assert.ok(shell && overlay && eye, 'each distinct structural/detail material has a batch');
    assert.equal(shell.count, 1); assert.equal(eye.count, 1); assert.equal(overlay.count, 0);
    fleet.begin([ship]); fleet.add(ship, 1, 'full'); fleet.end();
    assert.equal(shell.count, 1); assert.equal(eye.count, 1); assert.equal(overlay.count, 1);
  } finally {
    fleet.dispose(); template.group.remove(nested); geometry.dispose(); material.dispose();
  }
});

test.after(() => rmSync(directory, { recursive: true, force: true }));
