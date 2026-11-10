import * as THREE from 'three';

/**
 * Local weapon light for Reaper emitters. A Reaper's main weapon sits under the hood between the limb roots, so the
 * lens itself is hidden from most angles; what a viewer should see when it charges is its light on the claws and
 * the underside of the hood. A small fixed pool of point lights is handed, every frame, to the brightest emitters
 * nearest the camera. The pool never changes size, so the scene's light count (and with it every shader) is
 * constant. Render state only: nothing here reads or writes the simulation.
 */
export const EMITTER_LIGHT_COUNT = 2;
/** Seconds for the glow to rise when a shot is imminent, and to fade once the beam ends. */
export const EMITTER_RISE_S = 0.45;
export const EMITTER_FALL_S = 1.6;

export interface EmitterCandidate {
  id: string;
  /** Eased charge, 0 to 1. */
  charge: number;
  /** Squared distance from the camera (render units). */
  distanceSq: number;
  /** Emitter position in world space. */
  position: THREE.Vector3;
  /** Hull length in render units: sets the light's strength and reach. */
  size: number;
  color: number;
}

/** Eases `prior` toward `target` (both 0 to 1): quick to rise, slow to fade. */
export function easeEmitterCharge(prior: number, target: number, dt: number): number {
  const step = Math.min(Math.max(dt, 0), 0.25);
  const seconds = target > prior ? EMITTER_RISE_S : EMITTER_FALL_S;
  const next = prior + (target - prior) * (1 - Math.exp(-step * 3 / seconds));
  return Math.abs(next - target) < 1e-3 ? target : next;
}

/** How strongly an emitter should be lit: 1 while the beam fires, partly when a shot is imminent. */
export function emitterTarget(firing: boolean, imminent: boolean): number {
  return firing ? 1 : imminent ? 0.55 : 0;
}

/**
 * Ranks emitters by how much light they put on screen (charge over distance) and returns the first `count`.
 * Ties resolve by id, so the choice never depends on iteration order.
 */
export function pickEmitters(candidates: readonly EmitterCandidate[], count = EMITTER_LIGHT_COUNT): EmitterCandidate[] {
  const score = (c: EmitterCandidate): number => c.charge * c.size / Math.sqrt(Math.max(c.distanceSq, 1e-6));
  return candidates.filter(c => c.charge > 0.02)
    .sort((a, b) => score(b) - score(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, count);
}

/** Light intensity and cutoff for a hull of `size` at `charge`: inverse-square, sized so the limbs a fifth of a hull
 *  length away receive roughly sunlight-level light at full charge. */
export function emitterLight(size: number, charge: number): { intensity: number; distance: number } {
  return { intensity: 0.1 * size * size * charge, distance: size * 0.6 };
}

export class EmitterLightPool {
  readonly group = new THREE.Group();
  private readonly lights: THREE.PointLight[] = [];
  private readonly candidates: EmitterCandidate[] = [];

  constructor() {
    for (let i = 0; i < EMITTER_LIGHT_COUNT; i++) {
      const light = new THREE.PointLight(0xff4a20, 0, 1, 2);
      light.name = 'reaper-emitter-light';
      this.lights.push(light);
      this.group.add(light);
    }
  }

  begin(): void { this.candidates.length = 0; }
  offer(candidate: EmitterCandidate): void { this.candidates.push(candidate); }
  /** Assigns the pool; unused lights go dark but stay in the scene. */
  end(): void {
    const picked = pickEmitters(this.candidates);
    for (let i = 0; i < this.lights.length; i++) {
      const light = this.lights[i];
      const c = picked[i];
      if (!c) { light.intensity = 0; continue; }
      const { intensity, distance } = emitterLight(c.size, c.charge);
      light.position.copy(c.position);
      light.color.setHex(c.color);
      light.intensity = intensity;
      light.distance = distance;
    }
  }
  /** Lit lights this frame (test and QA hook). */
  get lit(): number { return this.lights.filter(l => l.intensity > 0).length; }
}
