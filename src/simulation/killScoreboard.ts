import { SHIP_CLASSES } from '@/data/ships';
import type { BattleEvent, Side } from './types';

export interface ShipKillRow {
  /** Side to which the destroyed ship belonged; not an assumed killer side. */
  side: Side;
  faction: string;
  classId: string;
  className: string;
  destroyed: number;
}

/**
 * Deterministic, event-sourced destroyed-ship scoreboard.
 *
 * Only genuine ship_destroyed events count; withdrawals, estimated casualties,
 * damage and impact effects do not. Unique ship IDs prevent duplicate credit.
 * The cursor makes HUD updates O(new events), not O(total battle history).
 * One instance per battle naturally resets on redeployment or replay.
 */
export class ShipKillScoreboard {
  private nextEvent = 0;
  private readonly seenShips = new Set<string>();
  private readonly counts = new Map<string, ShipKillRow>();
  private readonly totals: Record<Side, number> = { A: 0, B: 0 };
  lastDestroyed?: Extract<BattleEvent, { type: 'ship_destroyed' }>;

  reset(): void {
    this.nextEvent = 0;
    this.seenShips.clear();
    this.counts.clear();
    this.totals.A = 0;
    this.totals.B = 0;
    this.lastDestroyed = undefined;
  }

  /** Sync against the simulation's append-only, authoritative event history.
   * Returns true if the visible totals changed (so renderers can skip DOM work).
   */
  sync(events: readonly BattleEvent[]): boolean {
    if (events.length < this.nextEvent) this.reset();
    let changed = false;
    for (let i = this.nextEvent; i < events.length; i++) {
      const event = events[i];
      if (event.type !== 'ship_destroyed' || this.seenShips.has(event.shipId)) continue;
      this.seenShips.add(event.shipId);
      const key = [event.side, event.faction, event.classId].join('\u0000');
      let row = this.counts.get(key);
      if (!row) {
        const definition = SHIP_CLASSES[event.classId];
        row = {
          side: event.side,
          faction: event.faction,
          classId: event.classId,
          className: definition?.shortName || definition?.name || event.classId.replaceAll('_', ' '),
          destroyed: 0,
        };
        this.counts.set(key, row);
      }
      row.destroyed++;
      this.totals[event.side]++;
      this.lastDestroyed = event;
      changed = true;
    }
    this.nextEvent = events.length;
    return changed;
  }

  total(side: Side): number { return this.totals[side]; }
  get totalDestroyed(): number { return this.totals.A + this.totals.B; }
  rows(side: Side): ShipKillRow[] {
    return [...this.counts.values()]
      .filter(row => row.side === side)
      .map(row => ({ ...row }))
      .sort((a, b) => b.destroyed - a.destroyed ||
        a.faction.localeCompare(b.faction) || a.className.localeCompare(b.className));
  }
}
