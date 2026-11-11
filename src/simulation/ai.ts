import { hardcoreReaperTargetFactor } from './reaperHardcore';
import type { Rng } from '@/core/rng';
import { add, clampLength, distance, dot, lengthSq, normalize, scale, sub, v3, type Vec3 } from '@/core/vec3';
import { FACTIONS, type FactionDoctrine } from '@/data/factions';
import type { RuleSet } from '@/timelines/rules';
import { slotToWorld } from './formations';
import { BATTLESPACE_SCALE as S } from './constants';
import { assignAttackBearings, swingAmount, swingStation, type AttackBearing, type BearingMember } from './manoeuvre';
import type { FleetState, ShipState, TargetPriority } from './types';

/** Fleet orders own translation; ship controllers trim their firing station and
 * track their target independently. No controller injects time-driven orbits. */
export interface AiContext {
  time: number;
  rng: Rng;
  rules: RuleSet;
  ships: ShipState[];
  fleets: Map<string, FleetState>;
  enemiesOf(side: 'A' | 'B'): ShipState[];
  /** Optional contact broad phase; selectors still check exact range and arc. */
  enemiesNear?(side: 'A' | 'B', origin: Vec3, range: number): ShipState[];
  alliesOf(side: 'A' | 'B'): ShipState[];
  getShip(id: string): ShipState | undefined;
}

export interface MovementGoal {
  position: Vec3;
  /** Desired speed fraction (0..1) of max speed. */
  speedFraction: number;
  /** Facing is independent of translation: spinal guns can track while braking. */
  face?: Vec3;
  /** Shared local-clearance thrust, combined within class acceleration limits. */
  avoidanceAcceleration?: Vec3;
}

export const doctrineOf = (ship: ShipState): FactionDoctrine => FACTIONS[ship.faction].doctrine;
const isCombatant = (s: ShipState): boolean => s.alive && !s.escaped && s.role !== 'fighter';
const validEnemy = (ship: ShipState, target: ShipState | undefined): target is ShipState =>
  !!target && target.alive && !target.escaped && target.side !== ship.side;
const attackOrder = (fleet: FleetState): boolean =>
  ['attack', 'attack_target', 'advance', 'intercept'].includes(fleet.orders.order);

export function centroid(ships: ShipState[]): Vec3 | undefined {
  if (ships.length === 0) return undefined;
  const c = v3();
  let w = 0;
  for (const s of ships) {
    const weight = Math.max(1, s.pointValue);
    c.x += s.pos.x * weight;
    c.y += s.pos.y * weight;
    c.z += s.pos.z * weight;
    w += weight;
  }
  return scale(c, 1 / w);
}

/** Principal battery, in simulation units. Turrets/PD never set a capital's
 * standoff, and spent torpedoes never keep their carrier outside gun range. */
export function shipEngagementRange(ship: ShipState): number {
  const usable = ship.weapons.filter(w => w.ammo === undefined || w.ammo > 0);
  const available = usable.filter(w => !w.def.antiSmall);
  const spinal = available.filter(w => w.def.arc < 90 && w.def.kind !== 'disruptor_torpedo' && w.def.kind !== 'missile');
  if (ship.role === 'fighter' || ship.role === 'frigate') {
    const torpedo = available.find(w => w.def.kind === 'disruptor_torpedo');
    if (torpedo) return torpedo.def.range;
  }
  const battery = spinal.length ? spinal : available.length ? available : usable;
  return battery.reduce((range, w) => Math.max(range, w.def.range), 2 * S);
}

export function engagementBand(ship: ShipState): { min: number; preferred: number; max: number } {
  const range = shipEngagementRange(ship);
  switch (ship.role) {
    case 'dreadnought': return { min: range * 0.72, preferred: range * 0.84, max: range * 0.93 };
    case 'carrier': return { min: range * 0.80, preferred: range * 0.90, max: range * 0.96 };
    case 'reaper_capital': return { min: range * 0.50, preferred: range * 0.68, max: range * 0.86 };
    case 'reaper_destroyer': return { min: range * 0.45, preferred: range * 0.64, max: range * 0.84 };
    case 'cruiser': return { min: range * 0.62, preferred: range * 0.76, max: range * 0.91 };
    case 'frigate': return { min: range * 0.56, preferred: range * 0.72, max: range * 0.89 };
    case 'fighter': return { min: range * 0.40, preferred: range * 0.70, max: range * 0.88 };
  }
}

function formationCore(ships: ShipState[]): ShipState[] {
  const capitals = ships.filter(s => s.role === 'dreadnought' || s.role === 'reaper_capital');
  if (capitals.length) return capitals;
  const cruisers = ships.filter(s => s.role === 'cruiser' || s.role === 'reaper_destroyer');
  return cruisers.length ? cruisers : ships;
}

/** Value-weighted principal range of the battle line, rather than the longest
 * gun in an otherwise short-range fleet. All fallback distances scale too. */
export function fleetEngagementRange(fleetShips: ShipState[]): number {
  const core = formationCore(fleetShips.filter(s => s.role !== 'fighter'));
  let weight = 0;
  let total = 0;
  for (const s of core) {
    const w = Math.max(1, s.pointValue);
    total += shipEngagementRange(s) * w;
    weight += w;
  }
  return weight ? total / weight : 20 * S;
}

export function priorityMultiplier(priority: TargetPriority, target: ShipState): number {
  switch (priority) {
    case 'reaper_destroyers': return target.role === 'reaper_destroyer' ? 4 : 1;
    case 'reaper_capitals': return target.role === 'reaper_capital' ? 4 : 1;
    case 'capitals': return ['dreadnought', 'carrier', 'reaper_capital'].includes(target.role) ? 4 : 1;
    case 'escorts': return ['frigate', 'cruiser', 'reaper_destroyer'].includes(target.role) ? 3 : 1;
    case 'fighters': return target.role === 'fighter' ? 4 : 1;
    default: return 1;
  }
}

export function scoreTarget(ctx: AiContext, shooter: ShipState, fleet: FleetState, target: ShipState, mainRange: number): number {
  const d = doctrineOf(shooter);
  const dist = distance(shooter.pos, target.pos);
  const threat = Math.log2(1 + target.pointValue) / 12;
  const wounded = 1 - target.hull / target.maxHull;
  let score = 0.4 + threat * d.threatPriority * 2 + wounded * d.finishWounded + (target.barriers <= 0 ? 0.25 : 0);
  // Reachable targets dominate remote threats, even when the latter are the
  // fleet focus. This keeps flank escorts firing instead of crossing the line.
  const relativeRange = dist / Math.max(mainRange, S);
  const intercepting = (shooter.role === 'frigate' || shooter.role === 'reaper_destroyer' || shooter.role === 'fighter') &&
    ctx.fleets.get(target.fleetId)?.orders.order === 'retreat';
  // A screen intercepts reachable withdrawing ships while the main gun line
  // maintains its capital focus. Global focus bias otherwise keeps every fast
  // escort on a distant dreadnought until the last cruiser has almost escaped.
  if (intercepting) score = (1 + wounded * 0.2) / (1 + relativeRange * relativeRange);
  else score *= relativeRange <= 1 ? 1.15 : 1 / (relativeRange * relativeRange);
  if (target.role === 'fighter' && shooter.role !== 'fighter') score *= 0.05;
  // Interceptors prioritise hostile fighters over repeatedly chasing capitals.
  if (shooter.role === 'fighter' && target.role === 'fighter') score *= 3.2;
  if (!intercepting && fleet.orders.focusFire && fleet.focusTargetId === target.id && relativeRange <= 1.2) score *= 1 + d.focusFire * 2;
  score *= priorityMultiplier(fleet.orders.priority, target);
  if (fleet.orders.protectCapitals && (shooter.role === 'frigate' || shooter.role === 'cruiser')) {
    const tgt = target.targetId ? ctx.getShip(target.targetId) : undefined;
    if (tgt && (tgt.role === 'dreadnought' || tgt.role === 'carrier') && tgt.side === shooter.side) score *= 1.8;
  }
  score *= hardcoreReaperTargetFactor(ctx.rules, shooter, target, dist, mainRange);
  return score;
}

export function chooseTarget(ctx: AiContext, ship: ShipState, fleet: FleetState): string | undefined {
  if (ship.forcedTargetId) {
    const forced = ctx.getShip(ship.forcedTargetId);
    if (validEnemy(ship, forced)) return forced.id;
    ship.forcedTargetId = undefined;
  }
  const current = ship.targetId ? ctx.getShip(ship.targetId) : undefined;
  const range = shipEngagementRange(ship);
  const sensor = ship.sensorRange * (0.4 + 0.6 * ship.subsystems.sensors);
  const currentValid = validEnemy(ship, current) && distance(ship.pos, current.pos) <= sensor * 1.7;
  const locked = currentValid && ctx.time < (ship.targetLockUntil ?? 0);
  // While a valid target remains inside the engagement band, a locked ship
  // cannot accept any replacement. Avoid a redundant fleet-wide contact scan.
  if (locked && current && distance(ship.pos, current.pos) <= range * 1.4) return current.id;
  const cannotFightFighters = ship.role === 'fighter' && !ship.weapons.some(w => w.def.antiSmall);
  let best = currentValid ? current : undefined;
  let bestScore = best ? scoreTarget(ctx, ship, fleet, best, range) : -Infinity;
  for (const e of (ctx.enemiesNear?.(ship.side, ship.pos, sensor * 1.5) ?? ctx.enemiesOf(ship.side))) {
    if (!validEnemy(ship, e) || distance(ship.pos, e.pos) > sensor * 1.5) continue;
    if (cannotFightFighters && e.role === 'fighter') continue;
    const reachableReplacement = currentValid && distance(ship.pos, current.pos) > range * 1.4 && distance(ship.pos, e.pos) < range;
    if (locked && !reachableReplacement) continue;
    const candidate = scoreTarget(ctx, ship, fleet, e, range);
    const threshold = currentValid && best?.id === current.id && !reachableReplacement ? bestScore * 1.25 : bestScore;
    if (candidate > threshold) { best = e; bestScore = candidate; }
  }
  if (best?.id !== ship.targetId) ship.targetLockUntil = ctx.time + 5;
  return best?.id;
}

/** Each fleet keeps one approach side for its whole battle, not a random
 * individual ship orbit. Identical IDs give identical manoeuvres in replays. */
const approachLanes = new WeakMap<FleetState, number>();
function approachLane(fleet: FleetState): number {
  const cached = approachLanes.get(fleet);
  if (cached !== undefined) return cached;
  let hash = 2166136261;
  for (const c of fleet.spec.id) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  const lane = ((hash >>> 0) % 5 - 2) / 2;
  approachLanes.set(fleet, lane);
  return lane;
}

/**
 * Altitude lanes. Allied fleets that fight side by side do not all come in on one level: the first fleet of a side
 * keeps the altitude it deployed at, and each further fleet, including one that arrives later, takes the next lane
 * above or below it. Fleets on separate levels do not mask each other's fire, and an enemy line facing one of them
 * has the others above or below its guns. A side with a single fleet is unaffected.
 */
export const ALTITUDE_LANES = [0, 1, -1, 0.5, -0.5, 1.5, -1.5] as const;
/** A lane's height is this share of the fleet's engagement range per unit of lane. */
export const ALTITUDE_LANE_STEP = 0.45;
const altitudeLanes = new WeakMap<FleetState, { lane: number; base: number }>();

/** The lane a fleet holds for the battle, from its place among its side's fleets in order of deployment. */
export function altitudeLane(ctx: AiContext, fleet: FleetState): { lane: number; base: number } {
  let cached = altitudeLanes.get(fleet);
  if (!cached) {
    let index = 0;
    for (const other of ctx.fleets.values()) {
      if (other === fleet) break;
      if (other.spec.side === fleet.spec.side) index++;
    }
    // The second side mirrors the first, so opposing fleets of the same rank do not climb together.
    const sign = fleet.spec.side === 'A' ? 1 : -1;
    const step = ALTITUDE_LANES[index % ALTITUDE_LANES.length];
    cached = { lane: step === 0 ? 0 : sign * step, base: fleet.anchor.y };
    altitudeLanes.set(fleet, cached);
  }
  return cached;
}

/** Stable fleet fire control and formation translation. Tactical observations
 * are shared; individual movement never rebuilds a global enemy centroid. */
export function fleetDecision(ctx: AiContext, fleet: FleetState, dt: number): void {
  const mine = ctx.ships.filter(s => s.fleetId === fleet.spec.id && isCombatant(s) && !s.withdrawing);
  if (!mine.length) return;
  const core = formationCore(mine);
  const representative = core.reduce((a, b) => a.pointValue >= b.pointValue ? a : b);
  const doctrine = FACTIONS[fleet.spec.faction].doctrine;
  const enemies = ctx.enemiesOf(fleet.spec.side);
  fleet.decisionTimer -= dt;
  const currentFocus = fleet.focusTargetId ? ctx.getShip(fleet.focusTargetId) : undefined;
  const commanded = fleet.orders.targetId ? ctx.getShip(fleet.orders.targetId) : undefined;
  if (fleet.decisionTimer <= 0 || !validEnemy(representative, currentFocus)) {
    fleet.decisionTimer = doctrine.decisionInterval;
    fleet.enemyCentre = centroid(enemies.filter(isCombatant));
    fleet.engagementRange = fleetEngagementRange(mine);
    if (fleet.orders.order === 'attack_target' && validEnemy(representative, commanded)) {
      fleet.focusTargetId = commanded.id;
    } else {
      let best = validEnemy(representative, currentFocus) ? currentFocus : undefined;
      let bestScore = best ? scoreTarget(ctx, representative, fleet, best, fleet.engagementRange) : -Infinity;
      const locked = !!best && ctx.time < (fleet.focusLockUntil ?? 0);
      for (const e of enemies) {
        if (!validEnemy(representative, e) || e.role === 'fighter') continue;
        const reachableReplacement = !!best && distance(representative.pos, best.pos) > fleet.engagementRange * 1.4 && distance(representative.pos, e.pos) < fleet.engagementRange;
        if (locked && !reachableReplacement) continue;
        const score = scoreTarget(ctx, representative, fleet, e, fleet.engagementRange);
        if (score > bestScore * (best ? 1.25 : 1) || !best) { best = e; bestScore = score; }
      }
      if (fleet.focusTargetId !== best?.id) fleet.focusLockUntil = ctx.time + 8;
      fleet.focusTargetId = best?.id;
    }
  }
  const focus = fleet.focusTargetId ? ctx.getShip(fleet.focusTargetId) : undefined;
  const enemyPosition = validEnemy(representative, focus) ? focus.pos : fleet.enemyCentre;
  const myCentre = centroid(core) ?? fleet.anchor;
  const range = fleet.engagementRange ?? fleetEngagementRange(mine);
  const preferredFactor = core.reduce((sum, s) => sum + engagementBand(s).preferred / shipEngagementRange(s), 0) / core.length;
  // Protect the dreadnought gun line even under Advance/Intercept. Those orders
  // close the formation, not the physical hulls into torpedo range.
  const desiredRange = range * preferredFactor;
  const slowest = Math.min(...core.map(s => s.maxSpeed * (0.25 + 0.75 * s.subsystems.engines)));
  let desired: Vec3 | undefined;
  const o = fleet.orders;
  const noRetreat = fleet.spec.faction === 'reaper';
  const withdrawing = !noRetreat && (o.order === 'withdraw' || o.order === 'retreat');
  if (attackOrder(fleet) || (noRetreat && (o.order === 'withdraw' || o.order === 'retreat'))) {
    const enemy = o.order === 'intercept' && validEnemy(representative, commanded) ? commanded.pos : enemyPosition;
    if (enemy) {
      const delta = sub(enemy, fleet.anchor);
      const dist = Math.sqrt(lengthSq(delta));
      const resumeRange = desiredRange + range * 0.07;
      // A Reaper fleet can win by establishing a firing line. Once contact
      // has happened, do not send the whole capital group after one damaged
      // fleeing vessel across empty space. Fast screens can intercept nearby.
      const fleeing = !!focus && (focus.withdrawing ||
        ctx.fleets.get(focus.fleetId)?.orders.order === 'retreat');
      const stopLongChase = !!ctx.rules.special.reaperHardcore && noRetreat &&
        fleet.engagementMode === 'hold' && fleeing && dist > range * 1.7;
      if (!stopLongChase && fleet.engagementMode !== 'approach' && dist > resumeRange)
        fleet.engagementMode = 'approach';
      if (fleet.engagementMode === 'approach' && dist <= desiredRange) fleet.engagementMode = 'hold';
      if (fleet.engagementMode === 'approach') {
        // Canon-style fleet closure: the whole line follows a gentle, stable
        // lateral approach lane, rather than converging on one central point.
        // The bend vanishes as the formation reaches its firing station.
        const forward = normalize(delta);
        const right = normalize(v3(forward.z, 0, -forward.x));
        const lane = approachLane(fleet);
        const remaining = Math.max(0, dist - desiredRange);
        const bend = ctx.rules.special.reaperHardcore ? Math.min(1, remaining / Math.max(1, 2 * range)) : 0;
        desired = add(add(fleet.anchor, scale(forward, remaining)),
          scale(right, lane * range * 0.12 * bend));
        // Climb or descend to this fleet's altitude lane on the way in. The first fleet of a side has lane 0 and
        // goes on as before, straight at its enemy.
        const altitude = altitudeLane(ctx, fleet);
        if (altitude.lane !== 0) desired.y = altitude.base + altitude.lane * range * ALTITUDE_LANE_STEP;
      }
    }
  } else if (o.order === 'defend_position') {
    desired = o.position;
  } else if (withdrawing) {
    const away = fleet.enemyCentre ? normalize(sub(myCentre, fleet.enemyCentre)) : scale(fleet.heading, -1);
    desired = add(fleet.anchor, scale(away, 60 * S));
  } else if (o.order === 'escort' && commanded?.alive && !commanded.escaped) {
    desired = add(commanded.pos, scale(commanded.heading, -4 * S));
  }

  if (desired) {
    const delta = sub(desired, fleet.anchor);
    const dist = Math.sqrt(lengthSq(delta));
    // A formation may lead its slowest capital, but cannot tow its station
    // away faster than the physical ships can catch up.
    let lag = 0;
    for (const s of core) lag += Math.max(0, dot(sub(slotToWorld(fleet.anchor, fleet.heading, s.slot), s.pos), fleet.heading));
    lag /= core.length;
    const catchup = withdrawing ? 1 : Math.max(0, 1 - lag / Math.max(4 * S, desiredRange * 0.3));
    // Use available thrust to intercept a receding enemy. A permanent 85%
    // formation throttle can otherwise match a slower fleeing capital just
    // outside beam range for an entire battle.
    const receding = validEnemy(representative, focus) && dot(focus.vel, normalize(sub(focus.pos, fleet.anchor))) > slowest * 0.5;
    const pace = receding && attackOrder(fleet) ? 1 : 0.85;
    const step = Math.min(dist, slowest * pace * catchup * dt);
    if (dist > 1e-6) fleet.anchor = add(fleet.anchor, scale(delta, step / dist));
  }

  // Once the line is on station, freeze its basis. Individual hulls still
  // track targets; rotating a world-space line every tick causes orbital pursuit.
  const canTurn = withdrawing || fleet.engagementMode === 'approach' || o.order === 'escort';
  const faceDir = withdrawing && desired ? sub(desired, fleet.anchor) : enemyPosition ? sub(enemyPosition, fleet.anchor) : undefined;
  if (canTurn && faceDir && faceDir.x * faceDir.x + faceDir.z * faceDir.z > 1e-6) {
    const target = normalize(v3(faceDir.x, 0, faceDir.z));
    const cur = fleet.heading;
    const angle = Math.atan2(cur.x * target.z - cur.z * target.x, cur.x * target.x + cur.z * target.z);
    const radius = Math.max(1, ...core.map(s => Math.sqrt(lengthSq(s.slot))));
    const rate = Math.min(0.12, ...core.map(s => s.turnRate * 0.5), slowest * 0.5 / radius);
    const a = Math.sign(angle) * Math.min(Math.abs(angle), rate * dt);
    const c = Math.cos(a), s = Math.sin(a);
    fleet.heading = normalize(v3(cur.x * c - cur.z * s, 0, cur.x * s + cur.z * c));
  }
}

export function shipDecision(ctx: AiContext, ship: ShipState, fleet: FleetState): void {
  ship.targetId = chooseTarget(ctx, ship, fleet);
  const doctrine = doctrineOf(ship);
  if (ship.faction === 'reaper') { ship.withdrawing = false; return; }
  if (!ship.withdrawing && doctrine.withdrawThreshold > 0 && ship.role !== 'fighter') {
    if (ship.hull / ship.maxHull < doctrine.withdrawThreshold && ship.barriers < ship.maxBarriers * 0.25) ship.withdrawing = true;
  } else if (ship.withdrawing) {
    const recovered = ship.barriers >= ship.maxBarriers * 0.7 || ship.maxBarriers === 0;
    if (recovered && ctx.time - ship.lastHitAt > 8) ship.withdrawing = false;
  }
}

interface RoleStations {
  formation: FleetState['orders']['formation'];
  shipCount: number;
  referenceByShip: Map<string, Vec3>;
  bearingByShip: Map<string, AttackBearing>;
}

const roleStations = new WeakMap<FleetState, RoleStations>();

/** Formation references are deployment geometry, not the live centroid. Dead
 * members keep their station in this calculation so casualties do not pull the
 * survivors sideways. Rebuild only for assignment changes or new deployments. */
function roleStationsOf(ctx: AiContext, fleet: FleetState): RoleStations {
  let cached = roleStations.get(fleet);
  if (!cached || cached.formation !== fleet.orders.formation || cached.shipCount !== ctx.ships.length) {
    const members = ctx.ships.filter(member => member.fleetId === fleet.spec.id);
    const sums = new Map<string, { centre: Vec3; count: number }>();
    for (const member of members) {
      const key = member.role;
      const value = sums.get(key) ?? { centre: v3(), count: 0 };
      value.centre = add(value.centre, member.slot);
      value.count++;
      sums.set(key, value);
    }
    const referenceByShip = new Map<string, Vec3>();
    const byRole = new Map<ShipState['role'], BearingMember[]>();
    for (const member of members) {
      const value = sums.get(member.role)!;
      const reference = scale(value.centre, 1 / value.count);
      referenceByShip.set(member.id, reference);
      const list = byRole.get(member.role) ?? [];
      list.push({ id: member.id, lateral: member.slot.x - reference.x });
      byRole.set(member.role, list);
    }
    // Attack bearings come from the same deployment geometry, so they are as stable as the stations.
    const bearingByShip = new Map<string, AttackBearing>();
    for (const [role, list] of byRole) for (const [id, bearing] of assignAttackBearings(role, list)) bearingByShip.set(id, bearing);
    cached = { formation: fleet.orders.formation, shipCount: ctx.ships.length, referenceByShip, bearingByShip };
    roleStations.set(fleet, cached);
  }
  return cached;
}

function roleReference(ctx: AiContext, ship: ShipState, fleet: FleetState): Vec3 {
  return roleStationsOf(ctx, fleet).referenceByShip.get(ship.id) ?? ship.slot;
}

/** The direction in which this hull swings round its target once it is engaging, if its class manoeuvres. */
function attackBearing(ctx: AiContext, ship: ShipState, fleet: FleetState): AttackBearing | undefined {
  return roleStationsOf(ctx, fleet).bearingByShip.get(ship.id);
}

interface BroadsideBearing {
  flank: 1 | -1;
  active: boolean;
}

const broadsideBearings = new WeakMap<ShipState, BroadsideBearing>();

/** Warhammer hulls bring their actual side batteries to bear after arrival.
 * This changes only gun facing: station translation never becomes an orbit.
 * Other factions retain their existing spinal/forward engagement policy. */
function combatFacing(ship: ShipState, target: ShipState, station: Vec3): Vec3 {
  if (ship.faction !== 'imperium' && ship.faction !== 'chaos') return target.pos;
  let portRange = 0, starboardRange = 0;
  for (const weapon of ship.weapons) {
    if (weapon.def.antiSmall || !weapon.def.antiCapital || weapon.def.kind !== 'mass_accelerator' ||
      weapon.def.arc < 60 || weapon.def.arc >= 180 || Math.abs(Math.sin(weapon.facing)) < 0.9 ||
      (weapon.ammo !== undefined && weapon.ammo <= 0)) continue;
    if (Math.sin(weapon.facing) > 0) starboardRange = Math.max(starboardRange, weapon.def.range);
    else portRange = Math.max(portRange, weapon.def.range);
  }
  if (!portRange && !starboardRange) {
    broadsideBearings.delete(ship);
    return target.pos;
  }
  const delta = sub(target.pos, ship.pos);
  const dist = Math.sqrt(lengthSq(delta));
  const bearing = normalize(v3(delta.x, 0, delta.z));
  let state = broadsideBearings.get(ship);
  if (!state || !(state.flank === 1 ? starboardRange : portRange)) {
    const starboardHeading = v3(-bearing.z, 0, bearing.x);
    const portHeading = scale(starboardHeading, -1);
    const difference = dot(ship.heading, starboardHeading) - dot(ship.heading, portHeading);
    // Equal turns use a stable per-hull choice, never the simulation RNG.
    const tie = [...ship.id].reduce((value, character) => value + character.charCodeAt(0), 0) % 2 === 0 ? 1 : -1;
    const flank: 1 | -1 = !portRange ? 1 : !starboardRange ? -1 : Math.abs(difference) < 1e-6 ? tie : difference > 0 ? 1 : -1;
    state = { flank, active: false };
    broadsideBearings.set(ship, state);
  }
  const macroRange = state.flank === 1 ? starboardRange : portRange;
  const speed = Math.sqrt(lengthSq(ship.vel));
  const stationDistance = distance(ship.pos, station);
  if (state.active && (dist > macroRange * 1.08 ||
    (stationDistance > Math.max(0.8, ship.maxSpeed * 10) && speed > ship.maxSpeed * 0.45))) state.active = false;
  if (!state.active && dist <= macroRange * 0.96 && speed <= ship.maxSpeed * 0.25 &&
    stationDistance <= Math.max(0.1, ship.maxSpeed * 2)) state.active = true;
  if (!state.active) return target.pos;
  const heading = state.flank === 1 ? v3(-bearing.z, 0, bearing.x) : v3(bearing.z, 0, -bearing.x);
  return add(ship.pos, heading);
}

/** Stable individual fighter attack passes. A four-craft wing shares the
 * launch lane while each pilot gets its own offset. The pass-through leg is
 * latched for seconds, avoiding frame-by-frame oscillation at knife range. */
interface FighterPass { targetId: string; until: number; waypoint: Vec3 }
const fighterPasses = new WeakMap<ShipState, FighterPass>();
function fighterAttackGoal(ctx: AiContext, ship: ShipState, target: ShipState, range: number): MovementGoal {
  const to = sub(target.pos, ship.pos);
  const dist = Math.sqrt(lengthSq(to));
  const leadSeconds = Math.min(1.8, dist / Math.max(0.2, ship.maxSpeed + Math.sqrt(lengthSq(target.vel))));
  const lead = add(target.pos, scale(target.vel, leadSeconds));
  const right = normalize(v3(ship.heading.z, 0, -ship.heading.x));
  const lane = Math.max(-1, Math.min(1, ship.slot.x / Math.max(1, 3 * S)));
  const ongoing = fighterPasses.get(ship);
  if (ongoing && ongoing.targetId === target.id && ctx.time < ongoing.until)
    return { position: ongoing.waypoint, speedFraction: 1, face: lead };

  if (dist < Math.max(range * 0.32, 0.65 * S) && dot(ship.vel, normalize(to)) > 0) {
    // The craft banks away and extends past the contact before its next pass.
    // A fixed station at the target centre creates a permanent dogfight knot.
    const waypoint = add(add(ship.pos, scale(ship.heading, range * 0.92)),
      scale(right, (lane || 0.35) * range * 0.38));
    fighterPasses.set(ship, { targetId: target.id,
      until: ctx.time + Math.max(1.2, range / Math.max(1, ship.maxSpeed) * 0.82), waypoint });
    return { position: waypoint, speedFraction: 1, face: waypoint };
  }
  const approachSide = scale(right, lane * range * 0.16);
  return { position: add(lead, approachSide), speedFraction: 1, face: lead };
}

/** A bounded firing station relative to the fleet line. Different roles use
 * different batteries, but do not alternate between mutually exclusive goals. */
export function movementGoal(ctx: AiContext, ship: ShipState, fleet: FleetState): MovementGoal {
  const candidate = ship.targetId ? ctx.getShip(ship.targetId) : undefined;
  const target = validEnemy(ship, candidate) ? candidate : undefined;
  const slotPos = slotToWorld(fleet.anchor, fleet.heading, ship.slot);
  const noRetreat = ship.faction === 'reaper';
  if (ship.role === 'fighter' && (!fleet.orders.fightersDeployed || ship.rearming) && ship.carrierId) {
    const carrier = ctx.getShip(ship.carrierId);
    if (carrier?.alive && !carrier.escaped) return { position: carrier.pos, speedFraction: 1 };
    if (ship.rearming) ship.rearming = false;
  }
  if (!noRetreat && fleet.orders.order === 'retreat') {
    const away = fleet.enemyCentre ? normalize(sub(ship.pos, fleet.enemyCentre)) : scale(fleet.heading, -1);
    return { position: add(ship.pos, scale(away, 40 * S)), speedFraction: 1 };
  }
  if (!noRetreat && ship.withdrawing) {
    // Recover behind the line, without a perpetual sinusoidal weave.
    return { position: add(slotPos, scale(fleet.heading, -8 * S)), speedFraction: 0.8, face: target?.pos ?? fleet.enemyCentre };
  }
  if (ship.escortId) {
    const escort = ctx.getShip(ship.escortId);
    if (escort?.alive && !escort.escaped) return { position: slotToWorld(escort.pos, escort.heading, scale(ship.slot, 0.35)), speedFraction: 1, face: target?.pos };
  }
  const engaging = attackOrder(fleet) || (noRetreat && ['withdraw', 'retreat'].includes(fleet.orders.order));
  if (!target || (!engaging && ship.role !== 'fighter')) return { position: slotPos, speedFraction: 1, face: target ? combatFacing(ship, target, slotPos) : undefined };

  const band = engagementBand(ship);
  const range = shipEngagementRange(ship);
  const dist = distance(ship.pos, target.pos);
  if (ship.role === 'fighter') return fighterAttackGoal(ctx, ship, target, range);
  const screen = ship.role === 'frigate' || ship.role === 'reaper_destroyer';
  if (screen && ctx.fleets.get(target.fleetId)?.orders.order === 'retreat') {
    // Intercept at the battle edge, then return to the fleet. A Reaper
    // destroyer does not follow a lone escaping frigate indefinitely.
    if (noRetreat && ctx.rules.special.reaperHardcore &&
        distance(fleet.anchor, target.pos) > Math.max(range * 2.4,
          (fleet.engagementRange ?? range) * 1.8)) {
      return { position: slotPos, speedFraction: 1, face: target.pos };
    }
    // Once the enemy abandons the engagement, a fast screen intercepts at its
    // own gun range. Keeping it tethered to the slow capital line can match a
    // fleeing cruiser forever, despite the escort's available closing speed.
    const toward = normalize(sub(target.pos, ship.pos));
    const pursuit = normalize(sub(target.pos, fleet.anchor));
    const local = sub(ship.slot, roleReference(ctx, ship, fleet));
    const spread = clampLength(v3(local.x * 0.35, local.y * 0.35, 0), range * 0.35);
    const right = v3(fleet.heading.z, 0, -fleet.heading.x);
    // Keep a stable escort spread rather than giving every pursuer the same
    // point. Clearance can then protect hulls without holding the entire screen
    // outside its firing envelope while it jostles for that single station.
    let position = add(add(add(target.pos, scale(pursuit, -band.preferred)), scale(right, spread.x)), v3(0, spread.y, 0));
    if (noRetreat && dot(sub(position, ship.pos), toward) < -1e-6) position = ship.pos;
    ship.engagementMode = dist > band.max ? 'approach' : 'hold';
    ship.firingOffset = sub(position, slotPos);
    ship.firingTargetId = target.id;
    return { position, speedFraction: 1, face: target.pos };
  }
  const reference = slotToWorld(fleet.anchor, fleet.heading, roleReference(ctx, ship, fleet));
  const toReference = sub(target.pos, reference);
  const referenceDistance = Math.sqrt(lengthSq(toReference));
  const axialDistance = dot(toReference, fleet.heading);
  if (ship.firingTargetId !== target.id) {
    ship.firingTargetId = target.id;
    ship.engagementMode = dist > band.max ? 'approach' : 'hold';
  }
  if (dist > band.max) ship.engagementMode = 'approach';
  else if (dist < band.min && !noRetreat) ship.engagementMode = 'reposition';
  else if (ship.engagementMode === 'approach' && dist <= band.preferred) ship.engagementMode = 'hold';
  else if (ship.engagementMode === 'reposition' && dist >= band.min) ship.engagementMode = 'hold';

  // Translate a role's line as a whole. Radially projecting every hull onto a
  // target-centred sphere contracted broad wings and erased the depth between
  // battlegroups. A forward translation retains the assigned lateral/vertical
  // stations, and the cached reference prevents the same contraction in depth.
  const normalLeash = screen ? Math.max(range, (fleet.engagementRange ?? range) * 1.1) : range * 0.55;
  // Heavy units advance as a battle line under their fleet anchor. They do
  // not independently charge a target and lose their mutual firing screen.
  // Cruisers can manoeuvre further; frigates and fighters retain wide freedom.
  const lineFraction = ship.role === 'carrier' ? 0.12 :
    ship.role === 'dreadnought' ? 0.24 :
    ship.role === 'reaper_capital' ? 0.35 :
    ship.role === 'cruiser' ? 0.42 : 1;
  const leash = ctx.rules.special.reaperHardcore ? Math.min(normalLeash, range * lineFraction) : normalLeash;
  let advance = Math.min(Math.max(0, referenceDistance - band.preferred), Math.max(0, axialDistance - band.min), leash);
  if (!noRetreat && referenceDistance < band.min) advance = -Math.min(band.min - referenceDistance, range * 0.25);
  let position = add(slotPos, scale(fleet.heading, advance));

  // A flank can still correct an unusable firing solution, within a bounded
  // trim. In-range ships keep their station instead of all seeking precisely
  // the same preferred radius. This is not a new pursuit/retargeting controller.
  const toTarget = sub(target.pos, position);
  const stationDistance = Math.sqrt(lengthSq(toTarget));
  const trimLimit = range * 0.15;
  if (stationDistance > range * 0.97) {
    position = add(position, scale(normalize(toTarget), Math.min(trimLimit, stationDistance - range * 0.94)));
  } else if (!noRetreat && stationDistance < band.min) {
    position = add(position, scale(normalize(toTarget), -Math.min(trimLimit, band.min - stationDistance)));
  }
  // Take the station round the target on this hull's attack bearing: over, under or round the flank, at the
  // range just worked out. The swing opens as the hull closes, so a fleet deploys in formation and fights in depth.
  const bearing = attackBearing(ctx, ship, fleet);
  if (bearing) position = swingStation(position, target.pos, bearing, swingAmount(dist, range));
  ship.firingOffset = sub(position, slotPos);
  if (noRetreat) {
    // A station behind the enemy must not turn into a reverse thrust command
    // or a tangential orbit. Brake in place until forward pressure is needed.
    const toEnemy = normalize(sub(target.pos, ship.pos));
    if (dot(sub(position, ship.pos), toEnemy) < -1e-6) position = ship.pos;
  }
  return { position, speedFraction: 1, face: combatFacing(ship, target, position) };
}
