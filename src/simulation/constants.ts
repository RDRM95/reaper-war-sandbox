/**
 * Battlespace compression. Catalogue ranges and speeds are expressed in
 * "nominal km"; the simulation multiplies every distance and speed by this
 * factor so that a two-kilometre Reaper and a forty-kilometre engagement
 * range can share a camera frame. Ship lengths are NOT scaled, so hulls read
 * at their true relative sizes. Flight times, closing times and the balance
 * are unaffected because speeds and ranges scale together.
 */
export const BATTLESPACE_SCALE = 0.4;
