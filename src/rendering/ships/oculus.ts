import * as THREE from 'three';
import { at, taperedBox, zCylinder } from '../geometry';
import { assemble, newParts } from './alliance';
import type { BuiltShip } from './types';

/**
 * Original procedural reconstruction of the canon Reaper/Collector Oculus.
 * An armoured flying optic with a red iris and radial protective shell.
 * This is NOT an imported BioWare asset. Bow faces +Z, length is 16 metres.
 * Five shared-material batches allow large interceptor wings to be instanced.
 */
export function buildReaperOculus(): BuiltShip {
  const parts = newParts();
  const L = 0.16;
  const shell = new THREE.SphereGeometry(0.068, 18, 12);
  shell.scale(1.12, 0.92, 0.9);
  shell.translate(0, 0, -0.012);
  parts.hull.push(shell);
  const ventral = new THREE.SphereGeometry(0.047, 12, 8);
  ventral.scale(0.92, 0.74, 0.45);
  ventral.translate(0, -0.028, 0.019);
  parts.hullDark.push(ventral);

  // Segmented, rigid armour around an exposed forward optic.
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    const blade = taperedBox(0.020, 0.013, 0.075, 0.38, 0.95);
    blade.rotateZ(a);
    blade.translate(Math.cos(a) * 0.052, Math.sin(a) * 0.052, 0.027);
    parts.hull.push(blade);
    const seam = new THREE.BoxGeometry(0.005, 0.015, 0.044);
    seam.rotateZ(a);
    seam.translate(Math.cos(a) * 0.067, Math.sin(a) * 0.067, 0.026);
    parts.accent.push(seam);
  }
  const iris = new THREE.TorusGeometry(0.028, 0.008, 6, 24);
  iris.translate(0, 0, 0.064);
  parts.accent.push(iris);
  const eye = new THREE.SphereGeometry(0.023, 16, 12);
  eye.scale(1, 1, 0.52);
  eye.translate(0, 0, 0.068);
  parts.windows.push(eye);
  const aperture = new THREE.TorusGeometry(0.012, 0.0035, 5, 16);
  aperture.translate(0, 0, 0.078);
  parts.windows.push(aperture);

  // Compact aft manoeuvre assembly, not the long fins of an organic fighter.
  for (const side of [-1, 1]) {
    parts.hullDark.push(at(taperedBox(0.022, 0.020, 0.065, 0.35, 0.92),
      side * 0.050, 0, -0.057));
  }
  parts.engine.push(at(zCylinder(0.019, 0.014, 0.008, 10), 0, 0, -0.085));
  const built = assemble(parts, 'reaper', [new THREE.Vector3(0, 0, -0.085)],
    L, new THREE.Vector3(0, 0, 0.081), 0xff3038);
  built.group.name = 'Oculus — Reaper cybernetic interceptor';
  return built;
}
