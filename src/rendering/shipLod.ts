import type * as THREE from 'three';
import type { ShipRole } from '@/data/types';
import { isLodDetail, type LodLevel } from './lod';

export interface LodDetail { object: THREE.Object3D; visible: boolean }

/** Capture once when a hero is created, including meshes below articulated
 * pivots. Preserve authored hidden parts; rig replacement layers own their
 * visibility separately and must never be resurrected by a LOD transition.
 */
export function captureLodDetails(root: THREE.Object3D, role: ShipRole): LodDetail[] {
  const details: LodDetail[] = [];
  const hasDedicatedCarapace = !!root.getObjectByName('carapace');
  root.traverse(object => {
    if (object === root || object.name === 'reaper-static-arms' || object.name === 'reaper-static-seams') return;
    if ((object as THREE.Sprite).isSprite || isLodDetail(object.name, role, hasDedicatedCarapace)) details.push({ object, visible: object.visible });
  });
  return details;
}

/** Called on transitions only; traversal/allocation stays out of render frames. */
export function applyShipLod(root: THREE.Object3D, details: readonly LodDetail[], level: LodLevel): void {
  root.visible = level !== 'point';
  for (const detail of details) detail.object.visible = detail.visible && level === 'full';
}
