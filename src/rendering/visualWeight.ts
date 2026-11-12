/**
 * How much of the picture a weapon effect or a distant craft may take. Main batteries should read first: a
 * dreadnought's slug and a Reaper's beam. Before this, every small-calibre round was drawn 45 m wide (a main slug is
 * 110 m), point-defence lasers were full-brightness lines flickering ten times a second, and a fighter at distance
 * was a 220 m glow as bright as a frigate's. Pure: no rendering objects, so it can be unit tested.
 */
import type { ShipRole } from '@/data/types';

/** Damage per round from which a round is drawn as a main-battery slug. */
export const MAIN_CALIBRE = 600;

/** Width (render units, 1 = 100 m) and length factor of a tracer, by damage per round. */
export function tracerSize(calibre: number): { width: number; length: number } {
  if (calibre >= MAIN_CALIBRE) return { width: 1.1, length: 1.3 };
  // A light round is a fine streak; it thickens and lengthens toward the main calibre without reaching it.
  const weight = Math.max(0, Math.min(1, calibre / MAIN_CALIBRE));
  // Sized so that main-battery rounds take about half the picture tracers cover; they took an eighth.
  return { width: 0.08 + 0.2 * weight, length: 0.22 + 0.3 * weight };
}

/** Damage per round under which a gun is a rapid-fire light cannon, drawn as a belt of tracer. */
export const BELT_CALIBRE = 20;
/** One round in this many of a light cannon's is a tracer. */
export const BELT_INTERVAL = 4;

/**
 * Whether a round is drawn at all. A fighter's cannon fires four rounds a second, and since fighters strafe the
 * hull they attack and stay over it, there are several hundred of those rounds in the air at once: drawn one for
 * one, they were up to a fifth of everything tracers cover. They are drawn as a belt of tracer ammunition is
 * loaded, one round in four. Every round still flies and hits in the simulation; `serial` is the round's id.
 */
export function tracerShown(calibre: number, serial: number): boolean {
  return calibre >= BELT_CALIBRE || serial % BELT_INTERVAL === 0;
}

/** Brightness of a point-defence laser line. GARDIAN lasers are infrared: a faint trace, not a searchlight. */
export const pointDefenceBrightness = (reaper: boolean): number => (reaper ? 0.45 : 0.28);

/** Brightness of the glow a craft is drawn as when it is too far away to be a model. */
export const farPointBrightness = (role: ShipRole): number => (role === 'fighter' ? 0.3 : 1);

/**
 * Size of an engine's glow sprite (render units). A hull's glow is a ninth of its length and never under 30 m, so
 * that a frigate's drives still show. That floor made a fighter's glow 30 m on a 36 m craft: a ball of light the
 * size of the fighter at each of its two engines. A fighter's glow is a fifth of its length, and never under 5 m.
 */
export function engineGlowSize(lengthUnits: number, role: ShipRole, reaper: boolean): number {
  if (role === 'fighter') return Math.max(0.05, lengthUnits * 0.2);
  return Math.max(0.3, lengthUnits * (reaper ? 0.12 : 0.11));
}

/**
 * Size of a gun's muzzle flash (render units; the flash sprite grows from half of this to 1.3 times it). Every gun
 * below main calibre flashed at 1.2: a 60 to 156 m burst of light at the nose of a 36 m fighter, four times a
 * second. Light guns now flash in proportion to their round, as their tracers are drawn.
 */
export function muzzleFlashSize(calibre: number, gunneryView: boolean): number {
  if (calibre >= MAIN_CALIBRE) return gunneryView ? 1.8 : 3.6;
  const weight = Math.max(0, Math.min(1, calibre / MAIN_CALIBRE));
  return (0.14 + 0.7 * weight) * (gunneryView ? 0.625 : 1);
}

/** Damage from which a hit is drawn at full size and throws sparks. */
export const HEAVY_HIT = 100;

/**
 * Size of a hit's flash (render units). The rule had a floor that made a fighter's 6-damage round flash as a 43
 * to 100 m burst; hits under HEAVY_HIT are now scaled down toward a third. Heavier hits are as they were.
 */
export function impactSize(damage: number): number {
  const size = Math.min(8, 0.4 + Math.sqrt(damage) * 0.09);
  return damage >= HEAVY_HIT ? size : size * (0.35 + 0.65 * damage / HEAVY_HIT);
}

/** Sparks thrown by a hit on a hull. Light rounds throw none: they threw two each, at four rounds a second. */
export function impactSparks(hullDamage: number): number {
  return hullDamage < HEAVY_HIT * 0.4 ? 0 : Math.min(10, 2 + Math.floor(hullDamage / 120));
}

/** Hull length (render units) under which a craft is small: fighters and drones. */
export const SMALL_CRAFT_LENGTH = 0.6;

/**
 * Size of the explosion when a hull dies (render units). Hulls: six tenths of their length, never under 150 m, as
 * before. That floor gave a 36 m fighter a frigate's death: a 330 m flash, four clouds of smoke lasting up to eight
 * seconds and four pieces of wreckage for twenty. A small craft's explosion is its own size.
 */
export function explosionSize(lengthUnits: number): number {
  return lengthUnits < SMALL_CRAFT_LENGTH ? Math.max(0.45, lengthUnits * 1.3) : Math.max(1.5, lengthUnits * 0.6);
}

/** Smoke clouds left by an explosion of the given size. */
export function explosionSmoke(size: number): number {
  return size > 4 ? 10 : size < 1 ? 1 : 4;
}
