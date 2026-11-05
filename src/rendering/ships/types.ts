import type * as THREE from 'three';

export interface BuiltShip {
  group: THREE.Group;
  /** Local positions of engine exhausts for glow sprites. */
  engineNodes: THREE.Vector3[];
  /** Overall length in render units. */
  lengthUnits: number;
  /** Local position of the primary weapon muzzle. */
  muzzle?: THREE.Vector3;
  glowColor: number;
  /** Optional per-engine-node glow sprite scale multipliers (default 1). */
  glowScales?: number[];
}
