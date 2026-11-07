import * as THREE from 'three';
import { Rng } from '@/core/rng';

/**
 * Sparse, fixed-world optical reference points for the follow/cinematic camera.
 * Unlike the infinity sky, these objects do NOT ride with the camera: the
 * slight parallax is a consequence of actual travel, not a speed-line overlay.
 *
 * They are deliberately very faint and use ONE draw call, irrespective of
 * fleet size. No simulation, collision, or firing calculation reads them.
 */
export class TravelField {
  readonly points: THREE.Points;
  constructor(seed: number, centre: THREE.Vector3, count = 1450) {
    const rng = new Rng('travel-field-' + seed);
    const pos = new Float32Array(count * 3);
    const colours = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Separate scale bands: rare nearby optical specks and distant anchors.
      // Objects stay at fixed world coordinates even if the camera moves.
      const radius = i % 7 === 0 ? 90 + rng.next() * 550 : 600 + rng.next() * 3400;
      const cosElevation = rng.next() * 2 - 1;
      const angle = rng.next() * Math.PI * 2;
      const spread = Math.sqrt(1 - cosElevation * cosElevation);
      const x = radius * spread * Math.cos(angle);
      const y = radius * cosElevation;
      const z = radius * spread * Math.sin(angle);
      pos[3 * i] = centre.x + x;
      pos[3 * i + 1] = centre.y + y;
      pos[3 * i + 2] = centre.z + z;
      const shade = 0.5 + rng.next() * 0.4;
      colours[3 * i] = shade * 0.69;
      colours[3 * i + 1] = shade * 0.84;
      colours[3 * i + 2] = shade;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    const material = new THREE.PointsMaterial({
      size: 1.0,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
      fog: false,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.name = 'fixed-world-travel-references';
    this.points.frustumCulled = false;
    this.points.renderOrder = -5;
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
