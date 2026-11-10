import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

// Camera framing of capital-scale hulls, tested on the production rig without a browser (port of the Codex
// build's tests/camera-presence.test.ts). Before: the Reaper view showed none of the hull, and a 2 km Reaper
// side-on in the follow view spanned a quarter of the frame's width.
const projectRequire = createRequire(import.meta.url);
const THREE = projectRequire('three');
const directory = mkdtempSync(join(tmpdir(), 'reaper-camera-'));
const source = readFileSync(new URL('../src/rendering/cameras.ts', import.meta.url), 'utf8');
writeFileSync(join(directory, 'cameras.cjs'), ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
}).outputText.replace(/require\("three"\)/g, 'require(' + JSON.stringify(projectRequire.resolve('three')) + ')'));
const { CameraRig, followLengths, cinematicOrbitLengths } = projectRequire(join(directory, 'cameras.cjs'));

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const subject = (size, heading = V(0, 0, 1)) => ({ position: V(0, 0, 0), velocity: V(0, 0, 0), heading, size });
const settle = (rig, opts) => { for (let i = 0; i < 400; i++) rig.update(0.1, { fleetCentre: V(0, 0, 0), ...opts }); rig.camera.updateMatrixWorld(true); };
const inFrame = (rig, p) => { const view = p.clone().applyMatrix4(rig.camera.matrixWorldInverse); const q = p.clone().project(rig.camera); return view.z < 0 && Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1; };
const widthShare = (rig, size) => { let lo = Infinity, hi = -Infinity; for (const p of [V(0, 0, -size / 2), V(0, 0, size / 2), V(size * 0.18, 0, size / 4), V(-size * 0.18, 0, size / 4)]) { const q = p.clone().project(rig.camera); lo = Math.min(lo, q.x); hi = Math.max(hi, q.x); } return (hi - lo) / 2; };

test('the Reaper view looks over the carapace: hood and limb tips are in the picture', () => {
  const rig = new CameraRig(16 / 9);
  rig.setMode('reaper');
  settle(rig, { subject: subject(20) });
  for (const p of [V(0, 2.2, 1.5), V(0, 0.3, 3.2), V(3, -1.6, 9.6), V(-3, -1.6, 9.6)]) assert.ok(inFrame(rig, p), 'point in frame: ' + p.toArray());
  assert.ok(rig.camera.position.y < 5 && rig.camera.position.z < -6, 'camera rides low over the aft blade');
});

test('a followed Reaper fills the frame while small hulls keep their framing', () => {
  const rig = new CameraRig(16 / 9);
  rig.setMode('follow'); rig.yaw = Math.PI / 2; rig.pitch = 0;
  settle(rig, { subject: subject(20) });
  const share = widthShare(rig, 20);
  assert.ok(share > 0.4 && share < 0.7, 'follow share ' + share);
  assert.equal(followLengths(1.7), 2.4);
  assert.equal(followLengths(5.2), 2.4);
  assert.equal(cinematicOrbitLengths(1.7), 3.2);
  for (let size = 1; size < 40; size += 0.5) assert.ok(followLengths(size + 0.5) <= followLengths(size));
});

test('a solo cinematic orbit of a Reaper is closer and lower than before', () => {
  const rig = new CameraRig(16 / 9);
  rig.setMode('cinematic'); rig.yaw = Math.PI / 2;
  settle(rig, { cinematic: { from: subject(20), age: 0 } });
  assert.ok(widthShare(rig, 20) > 0.24);
  assert.ok(rig.camera.position.y < 14);
});
