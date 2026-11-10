import * as THREE from 'three';
import { getShipClass } from '@/data/ships';
import { KM } from '@/rendering/geometry';
import { getShipTemplate } from '@/rendering/ships';

export const METRES_PER_RENDER_UNIT = 1000 / KM;
export const SCALE_COMPARISON_CLASSES = ['reaper_capital', 'alliance_dreadnought', 'alliance_cruiser',
  'alliance_frigate', 'reaper_destroyer', 'alliance_fighter'] as const;

/** Actual visible vertices, including all ancestor transforms. Box3.setFromObject
 * also counts invisible replacement rigs; those must not enlarge the measurement.
 * This is an on-demand inspection operation, never a per-frame battle query. */
export function visibleMeshBounds(root: THREE.Object3D): THREE.Box3 {
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3(), point = new THREE.Vector3();
  root.traverseVisible(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const positions = mesh.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
      box.expandByPoint(point);
    }
  });
  return box;
}

export function measureShip(classId: string) {
  const template = getShipTemplate(classId), definition = getShipClass(classId);
  const size = visibleMeshBounds(template.group).getSize(new THREE.Vector3()).multiplyScalar(METRES_PER_RENDER_UNIT);
  return {
    classId, name: definition.name, provenance: definition.lengthM.provenance,
    catalogueMetres: definition.lengthM.value,
    declaredMetres: template.lengthUnits * METRES_PER_RENDER_UNIT,
    widthMetres: size.x, heightMetres: size.y, lengthMetres: size.z,
  };
}
