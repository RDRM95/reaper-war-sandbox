import * as THREE from 'three';
import type { ShipState } from '@/simulation/types';
import { KM } from './geometry';
import { DETAIL_MESH_NAMES, type LodLevel } from './lod';
import { getShipTemplate } from './ships';

interface Part { mesh: THREE.InstancedMesh; detail: boolean; }
interface Batch { capacity: number; parts: Part[]; }
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
      // Bake source-local offsets into geometry so eye, engines and plate
      // positions rotate with each ship, rather than the global scene axes.
      const geometry = source.geometry.clone();
      geometry.applyMatrix4(source.matrixWorld);
      const mesh = new THREE.InstancedMesh(geometry, source.material, capacity);
      mesh.name = 'instanced-' + classId + '-' + source.name;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Dynamic large-fleet instance bounds are recomputed only by GPU frustum
      // culling at per-instance LOD; do not cull the entire batch as one hull.
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.group.add(mesh);
      parts.push({ mesh, detail: DETAIL_MESH_NAMES.has(source.name) });
    });
    return { capacity, parts };
  }

  begin(ships: readonly ShipState[]): void {
    const needed = new Map<string, number>();
    for (const ship of ships) if (ship.alive && !ship.escaped) {
      needed.set(ship.classId, (needed.get(ship.classId) ?? 0) + 1);
    }
    for (const [classId, count] of needed) {
      let batch = this.batches.get(classId);
      if (!batch || batch.capacity < count) {
        if (batch) for (const part of batch.parts) {
          this.group.remove(part.mesh);
          part.mesh.geometry.dispose();
          part.mesh.dispose();
        }
        batch = this.createBatch(classId, Math.max(64, 2 ** Math.ceil(Math.log2(count))));
        this.batches.set(classId, batch);
      }
    }
    for (const batch of this.batches.values()) for (const part of batch.parts) part.mesh.count = 0;
  }

  add(ship: ShipState, alpha: number, lod: LodLevel): void {
    let batch = this.batches.get(ship.classId);
    if (!batch) throw new Error('Missing instance batch for ' + ship.classId);

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
      part.mesh.geometry.dispose();
      part.mesh.dispose();
    }
    this.batches.clear();
  }
}
