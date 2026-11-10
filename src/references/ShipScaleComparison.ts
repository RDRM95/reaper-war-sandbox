import * as THREE from 'three';
import { getShipTemplate } from '@/rendering/ships';
import { measureShip, METRES_PER_RENDER_UNIT, SCALE_COMPARISON_CLASSES, visibleMeshBounds } from './shipDimensions';

/** One static renderer shared by all views, released immediately after capture.
 * Ship templates remain at their authored scale; only their placement changes. */
export function createShipScaleComparison(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'ship-scale-comparison';
  section.setAttribute('aria-label', 'True-scale fleet comparison');
  const heading = document.createElement('h3'); heading.textContent = 'TRUE-SCALE FLEET COMPARISON';
  const note = document.createElement('p');
  note.textContent = 'One orthographic scale for every ship. No perspective shrinking or size exaggeration. Measurements include visible armour, wings and engines in the neutral pose. Length runs along the ship’s forward axis.';
  const controls = document.createElement('div'); controls.className = 'shipref-top';
  const canvas = document.createElement('canvas'); canvas.width = 1440; canvas.height = 800;
  canvas.style.cssText = 'display:block;width:100%;max-width:1100px;height:auto;margin:0 auto;background:#050b13';
  canvas.setAttribute('aria-label', 'Reaper capital beside Alliance dreadnought, cruiser, frigate, Reaper destroyer and fighter at identical scale');
  const table = document.createElement('table'); table.style.width = '100%';
  const caption = table.createCaption(); caption.textContent = 'Metres · catalogue values retain their canon / inferred / simulation provenance';
  const header = table.createTHead().insertRow();
  for (const name of ['Ship', 'Catalogue length', 'Mesh length', 'Width', 'Height', 'Length provenance']) {
    const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = name; header.append(cell);
  }
  const body = table.createTBody();
  const measurements = SCALE_COMPARISON_CLASSES.map(measureShip);
  const format = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 1 });
  measurements.forEach((m, i) => {
    const row = body.insertRow(); row.dataset.classId = m.classId;
    for (const value of [`${i + 1}. ${m.name}`, format(m.catalogueMetres), format(m.lengthMetres), format(m.widthMetres), format(m.heightMetres), m.provenance.replaceAll('_', ' ')]) row.insertCell().textContent = value;
  });
  let angle: 'top' | 'quarter' = 'top';
  const boxes = document.createElement('input'); boxes.type = 'checkbox';
  const label = document.createElement('label'); label.append(boxes, ' Show measured bounds');
  const buttons: HTMLButtonElement[] = [];
  for (const [key, title] of [['top', 'Top — scale chart'], ['quarter', 'Three-quarter — hull depth']] as const) {
    const button = document.createElement('button'); button.textContent = title;
    button.onclick = () => { angle = key; draw(); }; buttons.push(button); controls.append(button);
  }
  controls.append(label); boxes.onchange = draw;
  const tableScroll = document.createElement('div'); tableScroll.style.overflowX = 'auto';
  table.style.minWidth = '700px'; tableScroll.append(table);
  section.append(heading, note, controls, canvas, tableScroll);

  function draw(): void {
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String((i === 0) === (angle === 'top'))));
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(canvas.width, canvas.height, false);
    renderer.setClearColor(0x050b13); renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene(), bounds = new THREE.Box3();
    const items: { box: THREE.Box3; number: number }[] = [];
    const helpers: THREE.Box3Helper[] = [];
    try {
      let x = 0;
      SCALE_COMPARISON_CLASSES.forEach((id, i) => {
        const clone = getShipTemplate(id).group.clone(true);
        const local = visibleMeshBounds(clone), size = local.getSize(new THREE.Vector3());
        // Common bow datum. The short craft stay short in the frame.
        clone.position.x += x - local.min.x;
        clone.position.z -= local.max.z;
        scene.add(clone);
        const box = visibleMeshBounds(clone); bounds.union(box); items.push({ box, number: i + 1 });
        x += size.x + 1.2;
        if (boxes.checked) { const helper = new THREE.Box3Helper(box, 0x76b6d6); scene.add(helper); helpers.push(helper); }
      });
      scene.add(new THREE.AmbientLight(0x9fb4cb, 1.5));
      const sun = new THREE.DirectionalLight(0xfff0db, 3); sun.position.set(-20, 35, 15); scene.add(sun);
      const fill = new THREE.DirectionalLight(0x80a8d8, .7); fill.position.set(20, 10, -20); scene.add(fill);
      const centre = bounds.getCenter(new THREE.Vector3());
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 1000);
      camera.up.set(0, 0, -1);
      camera.position.copy(centre).add(angle === 'top' ? new THREE.Vector3(0, 80, 0) : new THREE.Vector3(15, 65, -28));
      camera.lookAt(centre); camera.updateMatrixWorld(true);
      // Fit the entire comparison, not each hull. Project all eight corners.
      const projected = new THREE.Box3();
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        projected.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
      }
      const size = projected.getSize(new THREE.Vector3()), aspect = canvas.width / canvas.height;
      const halfHeight = Math.max(size.y / 2, size.x / (2 * aspect)) * 1.22;
      camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect;
      camera.top = halfHeight; camera.bottom = -halfHeight; camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      const ctx = canvas.getContext('2d')!; ctx.drawImage(renderer.domElement, 0, 0);
      ctx.font = '18px system-ui'; ctx.fillStyle = '#d9ebfa'; ctx.textAlign = 'center';
      for (const { box, number } of items) {
        const p = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, box.max.z + .65).project(camera);
        ctx.fillText(String(number), (p.x + 1) * canvas.width / 2, (1 - p.y) * canvas.height / 2);
      }
      const barPixels = (500 / METRES_PER_RENDER_UNIT) / (camera.right - camera.left) * canvas.width;
      ctx.strokeStyle = '#9ac5df'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(30, 755); ctx.lineTo(30 + barPixels, 755); ctx.stroke();
      ctx.textAlign = 'left'; ctx.fillText('500 m', 30, 782);
      section.dataset.glError = String(renderer.getContext().getError());
      section.dataset.drawCalls = String(renderer.info.render.calls);
    } finally {
      // Do not dispose shared template geometry or materials.
      for (const helper of helpers) { helper.geometry.dispose(); (helper.material as THREE.Material).dispose(); }
      renderer.dispose(); renderer.forceContextLoss();
    }
  }
  draw();
  return section;
}
