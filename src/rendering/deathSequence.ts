import { Rng } from '@/core/rng';

/**
 * How a destroyed hull dies on screen (render side only; the simulation has already removed the ship).
 *
 * Every hull sheds secondary explosions on the hull itself, placed in hull lengths along, across and above the
 * ship's own axes. A Reaper dies slowly and in order: bursts start at the hood and march aft along the spine,
 * the cadence quickens, the lights flare and then fail, the limbs curl, and only then does the hull break apart. A
 * capital Reaper takes 5.2 s where it took 2.2 s, a destroyer 2.4 s where it took 0.9 s; other classes keep their
 * timing.
 */
export interface DeathBurst {
  /** Seconds after the kill. */
  t: number;
  /** Position in hull lengths: along the heading (−0.5 stern to +0.5 bow), across the beam, and up. */
  along: number;
  across: number;
  up: number;
  /** Burst size in hull lengths. */
  scale: number;
}

export interface DeathPlan {
  duration: number;
  bursts: DeathBurst[];
  /** A Reaper's staged death: lights fail, limbs curl, the hull lists. */
  staged: boolean;
}

/** Fraction of a staged death after which the lights begin to fail. */
export const LIGHTS_FAIL = 0.55;

const isReaper = (role: string): boolean => role === 'reaper_capital' || role === 'reaper_destroyer';

export function deathDuration(role: string): number {
  if (role === 'reaper_capital') return 5.2;
  if (role === 'reaper_destroyer') return 2.4;
  if (role === 'dreadnought' || role === 'carrier') return 2.2;
  if (role === 'cruiser') return 0.9;
  return 0.15;
}

export function deathPlan(role: string, seed: string): DeathPlan {
  const duration = deathDuration(role);
  const rng = new Rng('death:' + seed);
  const bursts: DeathBurst[] = [];
  if (duration < 0.2) return { duration, bursts, staged: false };
  if (isReaper(role)) {
    const n = role === 'reaper_capital' ? 16 : 8;
    for (let i = 0; i < n; i++) {
      const x = 1 - i / n;
      bursts.push({
        // Quickening cadence: seven of sixteen bursts fall in the last 28 % of the death.
        t: duration * 0.96 * (1 - x * x),
        // From the hood, over the emitter, aft along the spine of the carapace (the limbs reach forward of the
        // hull's centre, so the forward half of the length is open space between them).
        along: 0.12 - 0.57 * (i / (n - 1)) + rng.range(-0.04, 0.04),
        across: rng.range(-0.05, 0.05),
        up: rng.range(-0.02, 0.03),
        scale: 0.32 + 0.3 * (i / (n - 1)) + rng.range(0, 0.08),
      });
    }
    return { duration, bursts, staged: true };
  }
  // Other hulls: irregular bursts anywhere on the hull, at the cadence they always had.
  for (let t = 0; t < duration; t += 0.12 + rng.next() * 0.25) {
    bursts.push({ t, along: rng.range(-0.45, 0.45), across: rng.range(-0.07, 0.07), up: rng.range(-0.04, 0.05), scale: 0.5 });
  }
  return { duration, bursts, staged: false };
}

/**
 * Brightness of a dying Reaper's seams and drive glow, as a multiple of what they showed at the kill. `f` is the
 * fraction of the death elapsed. First an irregular surge, then a stuttering fall to almost nothing.
 */
export function deathLight(f: number, time: number, phase: number): number {
  const x = Math.min(1, Math.max(0, f));
  const stutter = 0.5 + 0.5 * Math.sin(time * 23 + phase * 7) * Math.sin(time * 9.1 + phase * 3);
  if (x < LIGHTS_FAIL) return 1 + 0.6 * (x / LIGHTS_FAIL) * stutter;
  const fall = (x - LIGHTS_FAIL) / (1 - LIGHTS_FAIL);
  const envelope = (1 - fall) * (1 - fall);
  return 0.06 + envelope * (0.55 + 1.05 * stutter);
}

/** How fast a dying Reaper lists, in radians per second about its long and cross axes: slow, then gathering. */
export function deathList(f: number): { roll: number; pitch: number } {
  const x = Math.min(1, Math.max(0, f));
  return { roll: 0.03 + 0.14 * x * x, pitch: 0.02 + 0.06 * x };
}
