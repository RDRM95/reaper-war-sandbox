/**
 * Every important statistic in the lore/data layer carries a provenance tag
 * so the UI and codex can tell the player what is established canon, what is
 * inferred from canon, what is a simulation estimate, and what an alternate
 * universe changed. See LORE_REFERENCE.md.
 */
export type Provenance =
  | 'CANON_CONFIRMED'
  | 'CANON_INFERRED'
  | 'SIMULATION_ESTIMATE'
  | 'AU_MODIFIED';

export interface Sourced<T> {
  value: T;
  provenance: Provenance;
  /** Short note: where the figure comes from or how it was estimated. */
  note?: string;
}

export const canon = <T>(value: T, note?: string): Sourced<T> => ({
  value,
  provenance: 'CANON_CONFIRMED',
  note,
});
export const inferred = <T>(value: T, note?: string): Sourced<T> => ({
  value,
  provenance: 'CANON_INFERRED',
  note,
});
export const estimate = <T>(value: T, note?: string): Sourced<T> => ({
  value,
  provenance: 'SIMULATION_ESTIMATE',
  note,
});

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  CANON_CONFIRMED: 'Canon (confirmed)',
  CANON_INFERRED: 'Canon (inferred)',
  SIMULATION_ESTIMATE: 'Simulation estimate',
  AU_MODIFIED: 'AU modified',
};
