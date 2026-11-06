import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ShipState } from '@/simulation/types';
import { KM } from './geometry';
import { DETAIL_MESH_NAMES, type LodLevel } from './lod';
import { getShipTemplate } from './ships';

interface Part { mesh: THREE.InstancedMesh; detail: boolean; }
interface Batch { capacity: number; parts: Part[]; trail?: THREE.InstancedMesh; }
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
  private readonly bankQuat = new THREE.Quaternion();
  private readonly trailScale = new THREE.Vector3(1,1,1);
  private trailsEnabled = true;
  configure(quality: 'low'|'medium'|'high'|'ultra'): void { this.trailsEnabled = quality !== 'low'; }

  private createBatch(classId: string, capacity: number): Batch {
    const template = getShipTemplate(classId);
    template.group.updateMatrixWorld(true);
    const parts: Part[] = [];

    // A model may contain dozens of separate meshes using the same faction
    // material. Merge those *once per class*, before instancing, so 5,000
    // ships incur draw calls per material rather than per decorative plate.
    // Hero ships continue to use their original unmodified scene hierarchy.
    type GeometryGroup = {
      geometries: THREE.BufferGeometry[];
      material: THREE.Material | THREE.Material[];
      detail: boolean;
      name: string;
    };
    const groups = new Map<string, GeometryGroup>();
    let standalone = 0;
    template.group.traverse(obj => {
      const source = obj as THREE.Mesh;
      if (!source.isMesh) return;
      const geometry = source.geometry.clone();
      geometry.applyMatrix4(source.matrixWorld);
      const material = source.material;
      const detail = DETAIL_MESH_NAMES.has(source.name);
      const hasMorphs = Object.keys(geometry.morphAttributes).length !== 0;
      const signature = Object.entries(geometry.attributes)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, attr]) => name + ':' + attr.itemSize + ':' + attr.normalized + ':' + attr.constructor.name)
        .join('|');
      // Multi-material and morphing meshes must remain independent. The
      // geometry signature guards mergeGeometries against incompatible data.
      const key = Array.isArray(material) || hasMorphs
        ? 'standalone:' + standalone++
        : material.uuid + ':' + detail + ':' + !!geometry.index + ':' + signature;
      let group = groups.get(key);
      if (!group) {
        group = { geometries: [], material, detail, name: source.name };
        groups.set(key, group);
      }
      group.geometries.push(geometry);
    });

    const addPart = (geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], detail: boolean, name: string): void => {
      const mesh = new THREE.InstancedMesh(geometry, material, capacity);
      mesh.name = 'instanced-' + classId + '-' + name;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Culling happens per ship before it enters a batch. Batch-wide Three.js
      // frustum culling would hide visible ships when other instances move.
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.group.add(mesh);
      parts.push({ mesh, detail });
    };

    for (const group of groups.values()) {
      if (group.geometries.length === 1) {
        addPart(group.geometries[0], group.material, group.detail, group.name);
        continue;
      }
      const merged = mergeGeometries(group.geometries, false);
      if (merged) {
        group.geometries.forEach(g => g.dispose());
        addPart(merged, group.material, group.detail, group.name);
      } else {
        // Defensive fallback for unusual third-party models.
        for (const geometry of group.geometries) addPart(geometry, group.material, group.detail, group.name);
      }
    }
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
        if(batch?.trail){this.group.remove(batch.trail);batch.trail.geometry.dispose();(batch.trail.material as THREE.Material).dispose();batch.trail.dispose();}
        batch = this.createBatch(classId, Math.max(64, 2 ** Math.ceil(Math.log2(count))));
        this.batches.set(classId, batch);
      }
    }
    for (const batch of this.batches.values()) {for (const part of batch.parts) part.mesh.count = 0;if(batch.trail)batch.trail.count=0;}
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
    // ME-style screen behaviour: fighters bank hard during attack passes,
    // escorts bank slightly, while dreadnoughts/Reapers stay massive and level.
    // This is visual only; no change to heading, velocity, physics or AI.
    const turn=ship.prevHeading.x*ship.heading.z-ship.prevHeading.z*ship.heading.x;
    const factor=ship.role==='fighter'?.36:ship.role==='frigate'?.12:
      ship.role==='cruiser'?.025:ship.role==='reaper_destroyer'?.015:0;
    const bank=Math.max(-factor,Math.min(factor,turn*3.5));
    if(bank!==0)this.quat.multiply(this.bankQuat.setFromAxisAngle(this.fwd,bank));
    this.matrix.compose(this.pos, this.quat, IDENTITY);
    for (const part of batch.parts) {
      if (lod === 'reduced' && part.detail) continue;
      const n = part.mesh.count++;
      if (n >= batch.capacity) throw new Error('Instancing capacity exceeded for ' + ship.classId);
      part.mesh.setMatrixAt(n, this.matrix);
    }
    const thrust=ship.engineThrust??.5;
    if (this.trailsEnabled && batch.trail && lod !== 'point' && !ship.inertialCoast && thrust>.09) {
      const i=batch.trail.count++;
      // Reuse the current hull transform but lengthen exhaust only under thrust.
      this.trailScale.z=.2+.8*thrust;
      this.matrix.compose(this.pos,this.quat,this.trailScale);
      batch.trail.setMatrixAt(i,this.matrix);
    }
  }

  end(): void {
    for (const batch of this.batches.values()) {
      for (const part of batch.parts) {
        if (part.mesh.count > 0) part.mesh.instanceMatrix.needsUpdate = true;
        part.mesh.visible = part.mesh.count > 0;
      }
      if(batch.trail){
        batch.trail.visible=this.trailsEnabled&&batch.trail.count>0;
        if(batch.trail.count>0)batch.trail.instanceMatrix.needsUpdate=true;
      }
    }
  }

  dispose(): void {
    for (const batch of this.batches.values()) {
      for (const part of batch.parts) {
        this.group.remove(part.mesh);
        part.mesh.geometry.dispose();
        part.mesh.dispose();
      }
      if(batch.trail){
        this.group.remove(batch.trail);
        batch.trail.geometry.dispose();
        (batch.trail.material as THREE.Material).dispose();
        batch.trail.dispose();
      }
    }
    this.batches.clear();
  }
}
