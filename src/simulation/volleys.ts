import type { ShipState, WeaponState } from './types';
import { isCommandedBattery } from './fireControl';

/** A little time to assemble a battery; subsequent windows share one fleet clock. */
export const HADES_ASSEMBLY_SECONDS = 0.6;
export const HADES_RELEASE_SECONDS = 0.5;

export function isHadesSpinal(ship: ShipState, weapon: WeaponState): boolean {
  return isCommandedBattery(ship, weapon) && weapon.def.armourBypass > 0;
}

interface VolleyClock {
  releaseAt: number;
  period: number;
}

/**
 * Fleet-wide fire permission for HADES spinal batteries. Call only after the
 * normal readiness, heat, target, range and arc checks have passed. Unready or
 * out-of-position ships therefore never postpone the fleet's release.
 *
 * The first ready gun assembles a salvo for 0.6 s, then every ready gun gets
 * the same 0.5 s release window. Healthy batteries can recharge between windows;
 * damaged or slower mounts skip a window and join the next. This bounds the
 * wait to one fleet cycle and avoids a per-frame scan of every other mount.
 */
export class HadesVolleyCoordinator {
  private clocks = new Map<string, VolleyClock>();

  /** Read-only timing observation. In particular, opening a HUD panel cannot
   * initialise a clock or move its next release. */
  secondsUntilRelease(time: number, fleetId: string, ship: ShipState, weapon: WeaponState): number {
    if (!isHadesSpinal(ship, weapon)) return 0;
    const clock = this.clocks.get(fleetId);
    if (!clock) return HADES_ASSEMBLY_SECONDS;
    let releaseAt = clock.releaseAt;
    if (time > releaseAt + HADES_RELEASE_SECONDS + 1e-8) {
      const cycles = Math.ceil((time - releaseAt - HADES_RELEASE_SECONDS) / clock.period);
      releaseAt += cycles * clock.period;
    }
    return Math.max(0, releaseAt - time);
  }

  canFire(time: number, fleetId: string, ship: ShipState, weapon: WeaponState): boolean {
    if (!isHadesSpinal(ship, weapon)) return true;
    let clock = this.clocks.get(fleetId);
    if (!clock) {
      clock = {
        releaseAt: time + HADES_ASSEMBLY_SECONDS,
        // Existing weapon cooldown jitter tops out at 1.05. Add the release
        // width so a mount firing at the end can join the next fleet salvo.
        period: weapon.def.cooldown * 1.05 + HADES_RELEASE_SECONDS,
      };
      this.clocks.set(fleetId, clock);
    }
    if (time > clock.releaseAt + HADES_RELEASE_SECONDS + 1e-8) {
      // Advance arithmetically after a long interruption; never replay missed
      // salvos, reset the clock for every caller, or wait for a dead target.
      const cycles = Math.ceil((time - clock.releaseAt - HADES_RELEASE_SECONDS) / clock.period);
      clock.releaseAt += cycles * clock.period;
    }
    return time + 1e-8 >= clock.releaseAt && time <= clock.releaseAt + HADES_RELEASE_SECONDS + 1e-8;
  }
}
