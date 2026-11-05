import * as THREE from 'three';
import type { ShipState } from '@/simulation/types';
import { KM } from './geometry';
import { DETAIL_MESH_NAMES, type LodLevel } from './lod';
import { getShipTemplate } from './ships';

interface Part { mesh: THREE.InstancedMesh; detail: boolean; }
interface Batch { capacity: number; parts: Part[]; full: number; reduced: number; }
const IDENTITY = new THREE.Vector3(1, 1, 1);

/** GPU batches reuse the same original hull geometry/materials as close-up ships.
 * Simulation ships keep their IDs, transforms and weapons. Only their rendering
 * representation changes. Instances have no separate scene-graph hierarchy.
 */
export class InstancedFleet {
  readonly group = new THREE.Group();
  private batches = new Map<string, Batch>();
  private readonly pos = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private readonly matrix = new THREE.Matrix4();
  private readonly fwd = new THREE.Vector3(0, 0, 1);

  private createBatch(classId: string, capacity: number): Batch {
    const template = getShipTemplate(classId);
    template.group.updateMatrixWorld(true);
    const parts: Part[] = [];
    template.group.traverse(obj => {
      const source = obj as THREE.Mesh;
      if (!source.isMesh) return;
      const mesh = new THREE.InstancedMesh(source.geometry, source.material, capacity);
      mesh.name = 'instanced-' + classId + '-' + source.name;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Dynamic large-fleet instance bounds are recomputed only by GPU frustum
      // culling at per-instance LOD; do not cull the entire batch as one hull.
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.matrix.copy(source.matrixWorld);
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      parts.push({ mesh, detail: DETAIL_MESH_NAMES.has(source.name) });
    });
    return { capacity, parts, full: 0, reduced: 0 };
  }

  begin(): void {
    for (const batch of this.batches.values()) {
      batch.full = 0;
      batch.reduced = 0;
      for (const p of batch.parts) p.mesh.count = 0;
    }
  }

  add(ship: ShipState, alpha: number, lod: LodLevel): void {
    let batch = this.batches.get(ship.classId);
    // A batch cannot be resized in-place. Grow geometrically and preserve the
    // shared template geometry and material; old instance buffers are freed.
    if (!batch || Math.max(batch.full, batch.reduced) >= batch.capacity) {
      const capacity = batch ? batch.capacity * 2 : 64;
      if (batch) {
        for (const part of batch.parts) {
          this.group.remove(part.mesh);
          part.mesh.dispose();
        }
      }
      batch = this.createBatch(ship.classId, capacity);
      this.batches.set(ship.classId, batch);
    }
    this.pos.set(
      (ship.prevPos.x + (ship.pos.x - ship.prevPos.x) * alpha) * KM,
      (ship.prevPos.y + (ship.pos.y - ship.prevPos.y) * alpha) * KM,
      (ship.prevPos.z + (ship.pos.z - ship.prevPos.z) * alpha) * KM
    );
    this.dir.set(
      ship.prevHeading.x + (ship.heading.x - ship.prevHeading.x) * alpha,
      ship.prevHeading.y + (ship.heading.y - ship.prevHeading.y) * alpha,
      ship.prevHeading.z + (ship.heading.z - ship.prevHeading.z) * alpha
    ).normalize();
    this.quat.setFromUnitVectors(this.fwd, this.dir);
    this.matrix.compose(this.pos, this.quat, IDENTITY);
    for (const part of batch.parts) {
      if (lod === 'reduced' && part.detail) continue;
      const n = part.mesh.count++;
      if (n >= batch.capacity) throw new Error('Instancing capacity exceeded for ' + ship.classId);
      part.mesh.setMatrixAt(n, this.matrix);
    }
  }

  end(): void {
    for (const batch of this.batches.values()) {
      for (const part of batch.parts) {
        if (part.mesh.count > 0) part.mesh.instanceMatrix.needsUpdate = true;
        part.mesh.visible = part.mesh.count > 0;
      }
    }
  }

  dispose(): void {
    for (const batch of this.batches.values()) for (const part of batch.parts) {
      this.group.remove(part.mesh);
      part.mesh.dispose();
    }
    this.batches.clear();
  }
}
