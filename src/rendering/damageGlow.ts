import * as THREE from 'three';

/**
 * Damage response of a Reaper's armour. A wounded Reaper does not turn into a red lantern: the armour stays
 * graphite with a faint ember, while the thin seams between the plates, pale and steady on an intact hull, run
 * hot and start to flicker as the hull fails. Render state only.
 */
/** Hull fraction below which damage shows (the same onset the generic hull tint uses). */
export const DAMAGE_ONSET = 0.6;
const COOL = new THREE.Color(0x7fb4ff);
const HOT = new THREE.Color(0xff3a18);

export interface ReaperDamageGlow {
  /** Seam colour (also its emissive colour). */
  seam: THREE.Color;
  seamIntensity: number;
  /** Red emissive of the armour itself, 0 to about 0.014: enough to warm the shadows, never to tint the plates. */
  ember: number;
}

/** 0 at the onset, 1 with the hull gone. */
export function damageLevel(hullFraction: number): number {
  return THREE.MathUtils.clamp((DAMAGE_ONSET - hullFraction) / DAMAGE_ONSET, 0, 1);
}

/**
 * The glow for a hull at `hullFraction`. `time` is simulation time and `phase` a per-ship constant, so two Reapers
 * never flicker in step; the same inputs always give the same glow.
 */
export function reaperDamageGlow(hullFraction: number, time: number, phase: number, out: ReaperDamageGlow = { seam: new THREE.Color(), seamIntensity: 0, ember: 0 }): ReaperDamageGlow {
  const d = damageLevel(hullFraction);
  const s = d * d * (3 - 2 * d);
  out.seam.copy(COOL).lerp(HOT, s);
  // Steady until half-way to destruction, then an irregular flicker that deepens toward the end.
  const unstable = Math.max(0, d - 0.5) * 2;
  const flicker = 1 - unstable * 0.45 * (0.5 + 0.5 * Math.sin(time * 9.1 + phase) * Math.sin(time * 2.3 + phase * 1.7));
  out.seamIntensity = (0.9 + 1.7 * s) * flicker;
  out.ember = 0.014 * s * s;
  return out;
}

/** Mesh names that carry a Reaper's seams, and its armour (for the ember). */
export const REAPER_SEAM_MESHES: ReadonlySet<string> = new Set(['seams', 'reaper-arm-seam', 'reaper-static-seams']);
export const REAPER_ARMOUR_MESHES: ReadonlySet<string> = new Set(['hull', 'carapace', 'reaper-arm-plate', 'reaper-arm-tip', 'reaper-static-arms']);
