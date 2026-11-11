/** Capture original SR-2 geometry from a Vite dev server; no reference assets are loaded.
 * node scripts/normandy-sr2-qa.mjs <output> <url> <before|after>
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const [out, url = 'http://127.0.0.1:4173', label = 'after'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // Use the dev server's modules without starting either application's loop.
  await page.route('**/*', route => route.request().isNavigationRequest()
    ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' })
    : route.continue());
  await page.goto(url);
  await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { buildNormandySR2 } = await import('/src/rendering/ships/alliance.ts');
    document.body.innerHTML = ''; document.body.style.margin = '0';
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(1000, 800); renderer.setPixelRatio(1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    document.body.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x101926);
    const ship = buildNormandySR2(); scene.add(ship.group);
    scene.add(new THREE.HemisphereLight(0xb9d6ff, 0x39435a, 2));
    const key = new THREE.DirectionalLight(0xfff1df, 3); key.position.set(3, 4, 5); scene.add(key);
    const fill = new THREE.DirectionalLight(0x8fbaff, 1.5); scene.add(fill);
    const camera = new THREE.OrthographicCamera(-1.5, 1.5, 1.2, -1.2, 0.01, 100);
    window.sr2QA = { THREE, renderer, scene, ship, camera, fill };
  });
  const views = { top: [0, 5, 0], bottom: [0, -5, 0], port: [-5, 0, 0], starboard: [5, 0, 0], front: [0, 0, 5], rear: [0, 0, -5], quarter: [3, 2, 4], close: [-3, 1.3, 4] };
  for (const [name, position] of Object.entries(views)) {
    await page.evaluate(({ name, position }) => {
      const q = window.sr2QA;
      q.camera.position.set(...position); q.camera.up.set(0, 1, 0);
      if (name === 'top' || name === 'bottom') q.camera.up.set(0, 0, -1);
      q.camera.lookAt(0, 0, 0); q.camera.zoom = name === 'close' ? 1.5 : 1;
      q.camera.updateProjectionMatrix(); q.fill.position.copy(q.camera.position);
      q.renderer.render(q.scene, q.camera);
    }, { name, position });
    await page.screenshot({ path: `${out}/${label}-${name}.png` });
  }
  const metrics = await page.evaluate(() => {
    const q = window.sr2QA, size = new q.THREE.Box3().setFromObject(q.ship.group).getSize(new q.THREE.Vector3());
    return { dimensions: size.toArray(), lengthUnits: q.ship.lengthUnits, muzzle: q.ship.muzzle.toArray(),
      engines: q.ship.engineNodes.map(n => n.toArray()), triangles: q.renderer.info.render.triangles,
      calls: q.renderer.info.render.calls, meshes: q.ship.group.children.map(m => m.name),
      renderer: (() => { const gl = q.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
        return gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER); })(), glError: q.renderer.getContext().getError() };
  });
  const fleet = await page.evaluate(async () => {
    const { InstancedFleet } = await import('/src/rendering/instancedFleet.ts');
    const q = window.sr2QA, instances = new InstancedFleet();
    q.scene.remove(q.ship.group); q.scene.add(instances.group);
    const ships = Array.from({ length: 1000 }, (_, i) => {
      const pos = { x: ((i % 40) - 19.5) * 0.15, y: 0, z: (Math.floor(i / 40) - 12) * 0.25 };
      const heading = { x: 0, y: 0, z: 1 };
      return { classId: 'alliance_frigate_thanix', alive: true, escaped: false, role: 'frigate', pos, prevPos: pos, heading, prevHeading: heading };
    });
    q.camera.position.set(0, 100, 0); q.camera.up.set(0, 0, -1); q.camera.lookAt(0, 0, 0);
    q.camera.zoom = 0.033; q.camera.updateProjectionMatrix();
    const result = {};
    for (const level of ['full', 'reduced']) {
      instances.begin(ships); ships.forEach(s => instances.add(s, 1, level)); instances.end();
      q.renderer.render(q.scene, q.camera);
      result[level] = { calls: q.renderer.info.render.calls, triangles: q.renderer.info.render.triangles,
        instances: instances.group.children.filter(m => m.visible).map(m => m.count), glError: q.renderer.getContext().getError() };
    }
    window.sr2QA.instances = instances;
    return result;
  });
  await page.screenshot({ path: `${out}/${label}-fleet-reduced.png` });
  metrics.fleet1000 = fleet;
  if (fleet.full.calls !== 5 || fleet.reduced.calls !== 2 || fleet.full.glError || fleet.reduced.glError) throw new Error(JSON.stringify(fleet));
  writeFileSync(`${out}/${label}-metrics.json`, JSON.stringify({ ...metrics, errors }, null, 2));
  if (errors.length || metrics.glError) throw new Error(JSON.stringify({ errors, metrics }));
  console.log(JSON.stringify(metrics));
} finally { await browser.close(); }
