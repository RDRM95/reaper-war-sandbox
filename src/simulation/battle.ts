import { Rng } from '@/core/rng';
import {
  add,
  addScaled,
  clone,
  cross,
  distance,
  dot,
  interceptPoint,
  length,
  lengthSq,
  normalize,
  rotateY,
  scale,
  sub,
  v3,
  type Vec3,
} from '@/core/vec3';
import { FACTIONS, type CommsEvent } from '@/data/factions';
import { getShipClass } from '@/data/ships';
import type { FactionId } from '@/data/types';
import { WEAPONS, getWeapon } from '@/data/weapons';
import { applyRulesToShip, applyRulesToWeapon, cloneRules, type EffectiveWeapon, type RuleSet } from '@/timelines/rules';
import { assertLoreCompatible } from '@/timelines/lore';
import { fleetDecision, movementGoal, shipDecision, type AiContext } from './ai';
import { applyDamage, applyProjectileDamage, hitProbability } from './damage';
import { assignSlots } from './formations';
import { summarise } from './results';
import { BATTLESPACE_SCALE as S } from './constants';
import { advanceMotion } from './motion';
import { SeparationField } from './separation';
import { CombatSpatialIndex } from './spatialIndex';
import { HadesVolleyCoordinator } from './volleys';
import { ShipNameGenerator } from './shipNames';
import {
  batteryIntent, inWeaponArc, isCommandedBattery, PrimaryVolleyControl,
  weaponTarget, weaponWorldOffset,
  type FleetBatteryStatus, type PrimaryBatteryReason, type PrimaryBatteryStatus,
} from './fireControl';

/** Hangar time for a fighter to reload torpedoes alongside its carrier. */
const REARM_SECONDS = 12;
import type {
  BattleConfig,
  BattleEvent,
  BattleResult,
  FleetOrders,
  FleetSpec,
  FleetState,
  Missile,
  Projectile,
  ShipState,
  Side,
  WeaponState,
} from './types';

export const SIM_DT = 0.05;

const DEFAULT_ORDERS: FleetOrders = {
  order: 'attack',
  formation: 'line_abreast',
  focusFire: true,
  primaryFire: 'free',
  priority: 'default',
  protectCapitals: false,
  fightersDeployed: true,
  pointDefenceMissiles: false,
};

/**
 * Deterministic, headless battle simulation. Stepped at a fixed 20 Hz. All
 * randomness comes from a seeded RNG; given identical config the event log
 * is identical, which is what makes replays and canon-vs-AU comparisons valid.
 */
export class BattleSimulation implements AiContext {
  readonly config: BattleConfig;
  readonly rng: Rng;
  readonly rules;
  time = 0;
  tick = 0;
  ships: ShipState[] = [];
  readonly shipById = new Map<string, ShipState>();
  readonly fleets = new Map<string, FleetState>();
  projectiles: Projectile[] = [];
  missiles: Missile[] = [];
  readonly events: BattleEvent[] = [];
  /** Transient per-tick visual notifications (gardian shots etc.). */
  flashes: { from: Vec3; to: Vec3; kind: 'gardian' | 'reaper_pd'; ttl: number }[] = [];
  finished = false;
  result?: BattleResult;
  private nextId = 1;
  private shipCounter = new Map<string, number>();
  private readonly shipNames: ShipNameGenerator;
  private fleetRules = new Map<string, RuleSet>();
  private pendingFleets: FleetSpec[] = [];
  private heavyLossesAnnounced = new Set<Side>();
  private engagementAnnounced = new Set<string>();
  private hadesVolleys = new HadesVolleyCoordinator();
  private separationField?: SeparationField;
  private spatialIndex?: CombatSpatialIndex;
  /** Indexed once per tick instead of scanning the full fleet for every carrier. */
  private carrierFighters = new Map<string, ShipState[]>();
  private primaryVolleys = new PrimaryVolleyControl();
  /** Listener for events (renderer/UI). */
  onEvent?: (e: BattleEvent) => void;

  constructor(config: BattleConfig) {
    assertLoreCompatible(config);
    this.config = config;
    this.rules = config.rules;
    this.rng = new Rng(config.seed);
    // Reserve future arrivals too: an earlier generated name must not steal a
    // scenario's explicitly named vessel before its reinforcement wave lands.
    this.shipNames = new ShipNameGenerator(config.fleets.flatMap(fleet => fleet.ships.flatMap(group => group.names ?? [])));
    this.emit({ t: 0, type: 'battle_start', name: config.name });
    for (const f of config.fleets) {
      if ((f.arrivalTime ?? 0) <= 0) this.deployFleet(f);
      else this.pendingFleets.push(f);
    }
    this.pendingFleets.sort((a, b) => (a.arrivalTime ?? 0) - (b.arrivalTime ?? 0));
    this.comms(undefined, 'battle_start');
  }

  // ------------------------------------------------------------------ setup

  private deployFleet(spec: FleetSpec): void {
    const fleet: FleetState = {
      spec,
      orders: { ...DEFAULT_ORDERS, formation: spec.formation, ...(spec.initialOrder ?? {}), ...(spec.initialOrder?.position ? { position: scale(spec.initialOrder.position, S) } : {}) },
      anchor: scale(spec.position, S),
      heading: normalize(v3(spec.heading.x, 0, spec.heading.z)),
      decisionTimer: 0,
      arrived: true,
      startPoints: 0,
      commsCooldown: 0,
      coordinationPenalty: 0,
    };
    if (spec.faction === 'reaper') {
      if (fleet.orders.order === 'retreat' || fleet.orders.order === 'withdraw') fleet.orders.order = 'attack';
      fleet.orders.primaryFire = 'free';
    }
    this.fleets.set(spec.id, fleet);
    const created: ShipState[] = [];
    for (const group of spec.ships) {
      for (let i = 0; i < group.count; i++) {
        const name = group.names?.[i];
        const ship = this.createShip(group.classId, spec, name);
        created.push(ship);
      }
    }
    fleet.startPoints = created.reduce((a, s) => a + s.pointValue, 0);
    // Slots.
    const slots = assignSlots(
      created.map((s) => ({ id: s.id, role: s.role, lengthKm: s.lengthKm })),
      fleet.orders.formation,
    );
    for (const s of created) {
      s.slot = slots.get(s.id) ?? v3();
      const world = this.slotWorld(fleet, s.slot);
      s.pos = world;
      s.prevPos = clone(world);
      s.heading = clone(fleet.heading);
      s.prevHeading = clone(fleet.heading);
      this.ships.push(s);
      this.shipById.set(s.id, s);
      this.emit({
        t: this.time,
        type: 'ship_deployed',
        shipId: s.id,
        classId: s.classId,
        faction: s.faction,
        side: s.side,
        name: s.name,
      });
    }
    if (this.time > 0) this.emit({ t: this.time, type: 'reinforcement_arrival', fleetId: spec.id, side: spec.side });
  }

  private slotWorld(fleet: FleetState, slot: Vec3): Vec3 {
    const h = fleet.heading;
    const rx = h.z;
    const rz = -h.x;
    return v3(fleet.anchor.x + rx * slot.x + h.x * slot.z, fleet.anchor.y + slot.y, fleet.anchor.z + rz * slot.x + h.z * slot.z);
  }

  private rulesFor(spec: FleetSpec): RuleSet {
    if (!spec.techOverride) return this.rules;
    let r = this.fleetRules.get(spec.id);
    if (!r) {
      r = cloneRules(this.rules);
      r.factionOverrides[spec.faction] = { ...(r.factionOverrides[spec.faction] ?? {}), ...spec.techOverride };
      this.fleetRules.set(spec.id, r);
    }
    return r;
  }

  private createShip(classId: string, spec: FleetSpec, name?: string, carrierId?: string): ShipState {
    const cls = getShipClass(classId);
    const rules = this.rulesFor(spec);
    const stats = applyRulesToShip(cls, rules);
    const n = (this.shipCounter.get(classId) ?? 0) + 1;
    this.shipCounter.set(classId, n);
    const id = `${spec.id}-${classId}-${n}`;
    const weapons: WeaponState[] = [];
    let wi = 0;
    cls.hardpoints.forEach((hp, hpIndex) => {
      const base = getWeapon(hp.weaponId);
      const nominal = applyRulesToWeapon(base, cls.faction, cls, rules, WEAPONS);
      const def: EffectiveWeapon = { ...nominal, range: nominal.range * S, projectileSpeed: nominal.projectileSpeed * S };
      for (let m = 0; m < hp.count; m++) {
        weapons.push({
          index: wi++,
          hardpointIndex: hpIndex,
          mount: m,
          def,
          // Stagger initial cooldowns so batteries do not fire in lockstep.
          cooldown: def.cooldown * this.rng.next() * 0.6,
          offset: v3(hp.offset[0] / 1000, hp.offset[1] / 1000, hp.offset[2] / 1000),
          facing: (hp.facing * Math.PI) / 180,
          beamRemaining: 0,
          beamHit: false,
          ammo: def.magazine,
          burstLeft: def.burst?.shots,
          burstRecover: 0,
        });
      }
    });
    const lengthKm = cls.lengthM.value / 1000;
    const ship: ShipState = {
      id,
      name: this.shipNames.assign({ faction: cls.faction, role: cls.role, classId: cls.id, explicitName: name,
        reaperFallback: `${cls.shortName ?? cls.name} ${String(n).padStart(2, '0')}` }),
      classId,
      faction: cls.faction,
      role: cls.role,
      side: spec.side,
      fleetId: spec.id,
      pos: v3(),
      prevPos: v3(),
      vel: v3(),
      heading: v3(0, 0, 1),
      prevHeading: v3(0, 0, 1),
      lengthKm,
      radiusKm: Math.max(0.02, lengthKm * 0.5),
      signature: cls.signature,
      hull: stats.hull,
      maxHull: stats.hull,
      armour: stats.armour,
      maxArmour: stats.armour,
      barriers: stats.barriers,
      maxBarriers: stats.barriers,
      barrierRegen: stats.barrierRegen,
      maxSpeed: stats.maxSpeed * S,
      acceleration: stats.acceleration * S,
      turnRate: (stats.turnRate * Math.PI) / 180,
      sensorRange: stats.sensorRange * S,
      ecm: stats.ecm,
      crewQuality: stats.crewQuality,
      heat: 0,
      heatCapacity: stats.heatCapacity,
      overheated: false,
      weapons,
      subsystems: { engines: 1, weapons: 1, sensors: 1 },
      alive: true,
      slot: v3(),
      withdrawing: false,
      escaped: false,
      lastHitAt: -100,
      aiTimer: this.rng.next() * 1.5,
      stats: { damageDealt: 0, damageTaken: 0, shotsFired: 0, hits: 0, kills: 0 },
      pointValue: cls.pointValue,
      carrierId,
    };
    if (cls.fighterComplement) {
      ship.hangar = { classId: cls.fighterComplement.classId, remaining: cls.fighterComplement.count, launchTimer: 2 };
    }
    return ship;
  }

  // -------------------------------------------------------------- AiContext

  private sideCache: { tick: number; A: ShipState[]; B: ShipState[] } = { tick: -1, A: [], B: [] };

  private refreshSideCache(): void {
    if (this.sideCache.tick === this.tick) return;
    const A: ShipState[] = [];
    const B: ShipState[] = [];
    for (const s of this.ships) {
      if (!s.alive || s.escaped) continue;
      (s.side === 'A' ? A : B).push(s);
    }
    this.sideCache = { tick: this.tick, A, B };
  }

  /** Spatial broad-phase, retaining ship deployment order for deterministic ties. */
  enemiesNear(side: Side, origin: Vec3, radius: number): ShipState[] {
    return this.spatialIndex?.enemiesNear(side, origin, radius) ?? this.enemiesOf(side);
  }

  /** Living, present ships on the opposing side (cached per tick). */
  enemiesOf(side: Side): ShipState[] {
    this.refreshSideCache();
    return side === 'A' ? this.sideCache.B : this.sideCache.A;
  }
  alliesOf(side: Side): ShipState[] {
    this.refreshSideCache();
    return side === 'A' ? this.sideCache.A : this.sideCache.B;
  }
  getShip(id: string): ShipState | undefined {
    return this.shipById.get(id);
  }

  // ----------------------------------------------------------------- orders

  /** Issue orders to a fleet (player command). */
  issueOrders(fleetId: string, patch: Partial<FleetOrders>): void {
    const fleet = this.fleets.get(fleetId);
    if (!fleet) return;
    if (fleet.spec.faction === 'reaper') {
      if (patch.order === 'retreat' || patch.order === 'withdraw') patch = { ...patch, order: 'attack' };
      if (patch.primaryFire === 'hold') patch = { ...patch, primaryFire: 'free' };
    }
    const prevFormation = fleet.orders.formation;
    fleet.orders = { ...fleet.orders, ...patch, ...(patch.position ? { position: scale(patch.position, S) } : {}) };
    if (patch.formation && patch.formation !== prevFormation) this.reassignSlots(fleet);
    if (patch.order === 'attack_target' && patch.targetId) {
      fleet.focusTargetId = patch.targetId;
      for (const s of this.ships) if (s.fleetId === fleetId && s.alive && s.role !== 'fighter') {
        s.forcedTargetId = patch.targetId;
        const target = this.shipById.get(patch.targetId);
        if (target?.alive && !target.escaped && target.side !== s.side) s.targetId = target.id;
        s.aiTimer = 0;
      }
    } else if (patch.order && patch.order !== 'attack_target') {
      for (const s of this.ships) if (s.fleetId === fleetId) s.forcedTargetId = undefined;
    }
    if (patch.order === 'escort' && patch.targetId) {
      for (const s of this.ships) if (s.fleetId === fleetId && (s.role === 'frigate' || s.role === 'cruiser')) s.escortId = patch.targetId;
    } else if (patch.order && patch.order !== 'escort') {
      for (const s of this.ships) if (s.fleetId === fleetId) s.escortId = undefined;
    }
    if (patch.order === 'withdraw' || patch.order === 'retreat') {
      this.comms(fleet.spec.side, 'withdraw', undefined, fleet);
    }
    if (patch.focusFire === true || patch.order === 'attack_target') this.comms(fleet.spec.side, 'focus_fire', undefined, fleet);
    if (patch.fightersDeployed === true) this.comms(fleet.spec.side, 'fighters_launch', undefined, fleet);
    const label = Object.entries(patch)
      .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      .join(', ');
    this.emit({ t: this.time, type: 'order_issued', fleetId, order: label });
  }

  /** Release one short, non-queued salvo without changing the current fire
   * policy. Every readiness and firing-solution constraint still applies. */
  releasePrimaryVolley(fleetId: string): boolean {
    const fleet = this.fleets.get(fleetId);
    if (this.finished || !fleet || fleet.spec.faction === 'reaper') return false;
    const eligible = this.ships.some(ship => ship.fleetId === fleetId && ship.alive && !ship.escaped && ship.weapons.some(w => isCommandedBattery(ship, w)));
    if (!eligible || !this.primaryVolleys.open(this.time, fleetId)) return false;
    this.emit({ t: this.time, type: 'primary_volley_issued', fleetId, side: fleet.spec.side });
    return true;
  }

  /** Pure HUD observation: reads the same live targeting and firing geometry
   * as tryFire, without touching target commitments, RNG or salvo clocks. */
  primaryBatteryStatus(shipId: string): PrimaryBatteryStatus | undefined {
    const ship = this.shipById.get(shipId);
    if (!ship) return undefined;
    const fleet = this.fleets.get(ship.fleetId);
    if (!fleet) return undefined;
    // Avoid refreshing the simulation's side cache from a UI read.
    const enemies = this.ships.filter(s => s.side !== ship.side && s.alive && !s.escaped);
    return this.observePrimaryBattery(ship, fleet, enemies);
  }

  private observePrimaryBattery(ship: ShipState, fleet: FleetState, enemies: readonly ShipState[]): PrimaryBatteryStatus | undefined {
    const mounts = ship.weapons.filter(w => isCommandedBattery(ship, w));
    if (!mounts.length) return undefined;
    const shipId = ship.id;
    const getShip = (id: string) => this.shipById.get(id);
    const held = fleet.orders.primaryFire === 'hold';
    const volleyRemaining = this.primaryVolleys.remaining(this.time, ship.fleetId);
    let ready = 0, cooling = 0;
    const observations = mounts.map(w => {
      const origin = weaponWorldOffset(ship, w);
      const solution = weaponTarget(ship, fleet, w, getShip, enemies);
      const intended = solution ?? batteryIntent(ship, fleet, getShip, enemies);
      const targetDistance = intended ? distance(origin, intended.pos) : undefined;
      const cooldown = Math.max(0, w.cooldown / (0.4 + 0.6 * ship.subsystems.weapons));
      let reason: PrimaryBatteryReason = 'ready';
      if (!ship.alive) reason = 'destroyed';
      else if (ship.escaped) reason = 'escaped';
      else if (fleet.orders.order === 'retreat') reason = 'retreating';
      else if (w.ammo !== undefined && w.ammo <= 0) reason = 'out_of_ammo';
      else if (ship.overheated && w.def.heat > 0) reason = 'overheated';
      else if (cooldown > 0) { reason = 'cooling'; cooling++; }
      else if (!solution) {
        if (!intended) reason = 'no_target';
        else if (targetDistance! > w.def.range) reason = 'out_of_range';
        else reason = 'aligning';
      }
      if (reason === 'ready') {
        ready++;
        if (volleyRemaining > 1e-8) {
          if (!this.primaryVolleys.allows(this.time, ship.fleetId, ship, w)) reason = 'coordinating';
        } else if (held) reason = 'held';
        else if (fleet.orders.focusFire && this.hadesVolleys.secondsUntilRelease(this.time, ship.fleetId, ship, w) > 1e-8) reason = 'coordinating';
      }
      return { reason, cooldown, range: w.def.range, distance: targetDistance, targetId: intended?.id };
    });
    const rank: Record<PrimaryBatteryReason, number> = {
      ready: 0, held: 1, coordinating: 2, cooling: 3, overheated: 4,
      out_of_range: 5, aligning: 6, no_target: 7, out_of_ammo: 8,
      retreating: 9, escaped: 10, destroyed: 11,
    };
    observations.sort((a, b) => rank[a.reason] - rank[b.reason] || a.cooldown - b.cooldown);
    const best = observations[0];
    return { shipId, reason: best.reason, ready, cooling, total: mounts.length, volleyRemaining,
      cooldownRemaining: best.cooldown, range: best.range, distance: best.distance,
      targetId: best.targetId, held };
  }

  fleetBatteryStatus(fleetId: string): FleetBatteryStatus {
    const fleet = this.fleets.get(fleetId);
    const result: FleetBatteryStatus = { fleetId, ready: 0, cooling: 0, total: 0,
      volleyRemaining: this.primaryVolleys.remaining(this.time, fleetId), held: fleet?.orders.primaryFire === 'hold' };
    if (!fleet) return result;
    // One shared enemy snapshot per fleet read, without a persistent cache:
    // paused commands and inspection can change state without advancing a tick.
    const enemies = this.ships.filter(s => s.side !== fleet.spec.side && s.alive && !s.escaped);
    for (const ship of this.ships) {
      if (ship.fleetId !== fleetId || !ship.alive || ship.escaped) continue;
      const status = this.observePrimaryBattery(ship, fleet, enemies);
      if (!status) continue;
      result.ready += status.ready;
      result.cooling += status.cooling;
      result.total += status.total;
    }
    return result;
  }

  /** Order a single ship (or selection) to attack a target. */
  orderShipsAttack(shipIds: string[], targetId: string): void {
    const target = this.shipById.get(targetId);
    if (!target || !target.alive || target.escaped) return;
    for (const id of shipIds) {
      const s = this.shipById.get(id);
      if (s && s.alive && !s.escaped && target.side !== s.side) {
        s.forcedTargetId = targetId;
        s.targetId = targetId;
      }
    }
    const first = this.shipById.get(shipIds[0]);
    if (first) this.emit({ t: this.time, type: 'order_issued', fleetId: first.fleetId, order: `ships ${shipIds.length} attack ${targetId}` });
  }

  private reassignSlots(fleet: FleetState): void {
    const mine = this.ships.filter((s) => s.fleetId === fleet.spec.id && s.alive && !s.escaped);
    const slots = assignSlots(
      mine.map((s) => ({ id: s.id, role: s.role, lengthKm: s.lengthKm })),
      fleet.orders.formation,
    );
    for (const s of mine) s.slot = slots.get(s.id) ?? s.slot;
  }

  // ------------------------------------------------------------------- loop

  /** Advance the simulation by one fixed step. */
  step(): void {
    if (this.finished) return;
    const dt = SIM_DT;
    this.time += dt;
    this.tick++;

    // Reinforcements.
    while (this.pendingFleets.length > 0 && (this.pendingFleets[0].arrivalTime ?? 0) <= this.time) {
      const f = this.pendingFleets.shift()!;
      this.deployFleet(f);
      this.comms(f.side, 'battle_start', undefined, this.fleets.get(f.id));
    }

    for (const fleet of this.fleets.values()) {
      fleet.commsCooldown = Math.max(0, fleet.commsCooldown - dt);
      fleet.coordinationPenalty = Math.max(0, fleet.coordinationPenalty - dt / 30);
      fleetDecision(this, fleet, dt);
    }

    this.carrierFighters.clear();
    for (const fighter of this.ships) {
      if (!fighter.carrierId || !fighter.alive || fighter.escaped) continue;
      let group = this.carrierFighters.get(fighter.carrierId);
      if (!group) { group = []; this.carrierFighters.set(fighter.carrierId, group); }
      group.push(fighter);
    }
    this.spatialIndex = new CombatSpatialIndex(this.ships, dt);
    this.separationField = new SeparationField(this.ships);
    for (const ship of this.ships) {
      if (!ship.alive || ship.escaped) continue;
      ship.prevPos = clone(ship.pos);
      ship.prevHeading = clone(ship.heading);
      const fleet = this.fleets.get(ship.fleetId)!;
      ship.aiTimer -= dt;
      if (ship.aiTimer <= 0) {
        ship.aiTimer = FACTIONS[ship.faction].doctrine.decisionInterval * (0.7 + 0.6 * this.rng.next());
        const wasWithdrawing = ship.withdrawing;
        shipDecision(this, ship, fleet);
        if (ship.withdrawing && !wasWithdrawing) this.emit({ t: this.time, type: 'ship_withdrawing', shipId: ship.id });
      }
      this.updateMovement(ship, fleet, dt);
      this.updateHousekeeping(ship, dt);
      this.updateCarrier(ship, fleet, dt);
      this.updateWeapons(ship, fleet, dt);
    }

    this.updateProjectiles(dt);
    this.updateMissiles(dt);
    for (const f of this.flashes) f.ttl -= dt;
    this.flashes = this.flashes.filter((f) => f.ttl > 0);

    this.checkEscapes();
    this.checkEnd();
  }

  /** Run to completion (headless). Returns the result. */
  run(maxSteps = 200_000): BattleResult {
    let n = 0;
    while (!this.finished && n++ < maxSteps) this.step();
    if (!this.finished) this.end('draw', 'Simulation step limit reached');
    return this.result!;
  }

  // --------------------------------------------------------------- movement

  private updateMovement(ship: ShipState, fleet: FleetState, dt: number): void {
    const goal = movementGoal(this, ship, fleet);
    goal.avoidanceAcceleration = this.separationField?.acceleration(ship);
    const engineFactor = 0.25 + 0.75 * ship.subsystems.engines;
    const maxSpeed = ship.maxSpeed * engineFactor;
    advanceMotion(ship, goal, dt);
    const speed = length(ship.vel);

    // Heading.
    let faceDir: Vec3 | undefined;
    if (goal.face) faceDir = sub(goal.face, ship.pos);
    else if (speed > maxSpeed * 0.15) faceDir = ship.vel;
    else if (ship.role !== 'fighter') faceDir = fleet.heading;
    if (faceDir && lengthSq(faceDir) > 1e-8) {
      const target = normalize(faceDir);
      const cur = ship.heading;
      const cosA = Math.max(-1, Math.min(1, dot(cur, target)));
      const angle = Math.acos(cosA);
      const maxTurn = ship.turnRate * (0.3 + 0.7 * ship.subsystems.engines) * dt;
      if (angle <= maxTurn || angle < 1e-4) ship.heading = target;
      else {
        // Rotate cur towards target around their common normal.
        let axis = cross(cur, target);
        if (lengthSq(axis) < 1e-8) axis = v3(0, 1, 0);
        axis = normalize(axis);
        const c = Math.cos(maxTurn);
        const s = Math.sin(maxTurn);
        // Rodrigues rotation.
        const term1 = scale(cur, c);
        const term2 = scale(cross(axis, cur), s);
        const term3 = scale(axis, dot(axis, cur) * (1 - c));
        ship.heading = normalize(add(add(term1, term2), term3));
      }
    }
  }

  private updateHousekeeping(ship: ShipState, dt: number): void {
    // Barrier regeneration after a pause in incoming fire.
    if (ship.barriers < ship.maxBarriers && this.time - ship.lastHitAt > 3) {
      ship.barriers = Math.min(ship.maxBarriers, ship.barriers + ship.barrierRegen * dt);
    }
    // Heat.
    ship.heat = Math.max(0, ship.heat - ship.heatCapacity * 0.08 * dt);
    if (ship.overheated && ship.heat < ship.heatCapacity * 0.55) ship.overheated = false;
    if (!ship.overheated && ship.heat > ship.heatCapacity) ship.overheated = true;
  }

  private updateCarrier(ship: ShipState, fleet: FleetState, dt: number): void {
    if (!ship.hangar) return;
    const h = ship.hangar;
    if (fleet.orders.fightersDeployed && h.remaining > 0) {
      h.launchTimer -= dt;
      if (h.launchTimer <= 0) {
        h.launchTimer = 0.4;
        const n = Math.min(2, h.remaining);
        for (let i = 0; i < n; i++) {
          const f = this.createShip(h.classId, fleet.spec, undefined, ship.id);
          const off = rotateY(v3((i === 0 ? 1 : -1) * 0.12, -0.05, 0.1), Math.atan2(ship.heading.x, ship.heading.z));
          f.pos = add(ship.pos, off);
          f.prevPos = clone(f.pos);
          f.heading = clone(ship.heading);
          f.prevHeading = clone(ship.heading);
          f.vel = scale(ship.heading, 0.6);
          f.slot = v3((this.rng.next() - 0.5) * 6 * S, (2 + this.rng.next() * 2) * S, (10 + this.rng.next() * 3) * S);
          this.ships.push(f);
          this.shipById.set(f.id, f);
          this.sideCache.tick = -1;
          this.spatialIndex?.add(f, this.ships.length - 1);
          this.emit({ t: this.time, type: 'ship_deployed', shipId: f.id, classId: f.classId, faction: f.faction, side: f.side, name: f.name });
        }
        h.remaining -= n;
        if (h.remaining === 0 || h.remaining % 8 === 0) this.emit({ t: this.time, type: 'fighters_launched', carrierId: ship.id, count: n });
      }
    }
    // Recall: fighters near the carrier return to the hangar.
    if (!fleet.orders.fightersDeployed) {
      for (const f of this.carrierFighters.get(ship.id) ?? []) {
        if (f.carrierId === ship.id && f.alive && !f.escaped && distance(f.pos, ship.pos) < ship.lengthKm) {
          f.escaped = true; // Treated as recovered: not a loss, no longer in battle.
          f.alive = true;
          h.remaining++;
        }
      }
    }
    // Rearming: fighters that have spent their torpedoes reload alongside the carrier.
    for (const f of this.carrierFighters.get(ship.id) ?? []) {
      if (f.carrierId !== ship.id || !f.rearming || !f.alive || f.escaped) continue;
      if (distance(f.pos, ship.pos) > ship.lengthKm * 1.5) continue;
      f.rearmTimer = (f.rearmTimer ?? REARM_SECONDS) - dt;
      if (f.rearmTimer > 0) continue;
      for (const w of f.weapons) if (w.def.magazine !== undefined) w.ammo = w.def.magazine;
      f.rearming = false;
      f.rearmTimer = undefined;
      this.emit({ t: this.time, type: 'fighter_rearmed', shipId: f.id, carrierId: ship.id });
    }
  }

  // ---------------------------------------------------------------- weapons

  private weaponWorldOffset(ship: ShipState, w: WeaponState): Vec3 {
    return weaponWorldOffset(ship, w);
  }

  private inArc(ship: ShipState, w: WeaponState, target: Vec3): boolean {
    return inWeaponArc(ship, w, target);
  }

  private updateWeapons(ship: ShipState, fleet: FleetState, dt: number): void {
    const wpnFactor = 0.4 + 0.6 * ship.subsystems.weapons;
    for (const w of this.iterWeapons(ship)) {
      // Active beams deal damage over time.
      if (w.beamRemaining > 0) {
        w.beamRemaining -= dt;
        const target = w.beamTargetId ? this.shipById.get(w.beamTargetId) : undefined;
        w.beamStart = this.weaponWorldOffset(ship, w);
        if (target && target.alive && !target.escaped && distance(w.beamStart, target.pos) <= w.def.range && this.inArc(ship, w, target.pos) && w.beamHit) {
          w.beamEnd = clone(target.pos);
          const dmg = w.def.damage * dt;
          const out = applyDamage(target, dmg, w.def, this.rng, this.time);
          ship.stats.damageDealt += out.hullDamage + out.barrierDamage;
          if (out.barriersCollapsed) this.emit({ t: this.time, type: 'barriers_down', shipId: target.id });
          if (out.subsystem) this.emit({ t: this.time, type: 'subsystem_disabled', shipId: target.id, subsystem: out.subsystem.name, level: out.subsystem.level });
          if (out.destroyed) this.destroyShip(target, ship);
        } else if (!w.beamHit && target?.alive && !target.escaped && w.beamEnd) {
          // Missed beam keeps pointing at its miss point.
        } else {
          w.beamRemaining = 0;
        }
        if (w.beamRemaining <= 0) {
          w.beamTargetId = undefined;
          w.beamEnd = undefined;
          w.beamStart = undefined;
        }
        continue;
      }
      w.cooldown -= dt * wpnFactor;
      // Heat-limited point-defence bursts recover while the mount is silent.
      if (w.def.burst && w.burstLeft !== undefined && w.burstLeft <= 0) {
        w.burstRecover -= dt;
        if (w.burstRecover > 0) continue;
        w.burstLeft = w.def.burst.shots;
      }
      if (w.cooldown > 0) continue;
      if (w.ammo !== undefined && w.ammo <= 0) continue;
      if (ship.overheated && w.def.heat > 0) continue;
      if (fleet.orders.order === 'retreat' && ship.role !== 'fighter' && w.def.arc < 180) continue;
      this.tryFire(ship, fleet, w);
    }
  }

  private *iterWeapons(ship: ShipState): Generator<WeaponState> {
    for (const w of ship.weapons) yield w;
  }

  private tryFire(ship: ShipState, fleet: FleetState, w: WeaponState): void {
    const def = w.def;
    const origin = this.weaponWorldOffset(ship, w);
    let target: ShipState | undefined;
    let missile: Missile | undefined;

    if (def.antiSmall) {
      // Point defence: missiles threatening our side first, then fighters, then (lasers) anything close.
      let best = Infinity;
      if (def.kind === 'gardian') {
        for (const m of this.missiles) {
          if (!m.alive || m.side === ship.side) continue;
          const d = distance(origin, m.pos);
          const tgt = this.shipById.get(m.targetId);
          const threatBonus = tgt && tgt.id === ship.id ? 0.5 : fleet.orders.pointDefenceMissiles ? 0.6 : 1;
          if (d <= def.range && d * threatBonus < best) {
            best = d * threatBonus;
            missile = m;
          }
        }
      }
      if (!missile) {
        for (const e of this.enemiesNear(ship.side, origin, def.range)) {
          if (!e.alive || e.escaped) continue;
          if (e.role !== 'fighter') continue;
          const d = distance(origin, e.pos);
          if (d <= def.range && d < best && this.inArc(ship, w, e.pos)) {
            best = d;
            target = e;
          }
        }
      }
      if (!missile && !target && def.kind === 'gardian') {
        // GARDIAN lasers can scorch nearby hulls (bypassing barriers) — low priority.
        for (const e of this.enemiesNear(ship.side, origin, def.range)) {
          if (!e.alive || e.escaped) continue;
          const d = distance(origin, e.pos);
          if (d <= def.range && d < best) {
            best = d;
            target = e;
          }
        }
      }
      if (!missile && !target) return;
    } else {
      target = weaponTarget(ship, fleet, w, id => this.shipById.get(id), this.enemiesNear(ship.side, origin, def.range));
      if (!target) return;
    }

    const commanded = isCommandedBattery(ship, w);
    const manualWindow = commanded && this.primaryVolleys.remaining(this.time, fleet.spec.id) > 1e-8;
    if (commanded) {
      if (manualWindow && !this.primaryVolleys.allows(this.time, fleet.spec.id, ship, w)) return;
      if (!manualWindow && fleet.orders.primaryFire === 'hold') return;
    }
    // A manual command releases ready spinal mounts immediately. It never
    // resets a cooldown, creates a firing solution, or moves the HADES clock.
    if (!manualWindow && fleet.orders.focusFire && !this.hadesVolleys.canFire(this.time, fleet.spec.id, ship, w)) return;
    if (manualWindow) this.primaryVolleys.fired(fleet.spec.id, ship, w);

    // Fire.
    const reloadJitter = 0.95 + 0.1 * this.rng.next();
    w.cooldown = def.cooldown * (this.rules.strictLore && def.id === 'alliance_dn_main' ? 1 : reloadJitter);
    ship.heat += def.heat;
    ship.stats.shotsFired++;
    if (w.burstLeft !== undefined && def.burst) {
      w.burstLeft--;
      if (w.burstLeft <= 0) w.burstRecover = def.burst.recovery;
    }
    if (w.ammo !== undefined) {
      w.ammo--;
      if (w.ammo <= 0 && !ship.weapons.some((o) => o.def.id === def.id && (o.ammo ?? 1) > 0)) {
        this.emit({ t: this.time, type: 'ammunition_depleted', shipId: ship.id, weaponId: def.id });
        if (ship.role === 'fighter' && ship.carrierId) ship.rearming = true;
      }
    }
    if (ship.firstShotAt === undefined) {
      ship.firstShotAt = this.time;
      if (!this.engagementAnnounced.has(fleet.spec.id) && ship.role !== 'fighter') {
        this.engagementAnnounced.add(fleet.spec.id);
        this.comms(ship.side, 'engage', undefined, fleet);
      }
    }
    const targetId = target?.id ?? `missile-${missile!.id}`;
    this.emit({ t: this.time, type: 'weapon_fired', shipId: ship.id, weaponId: def.id, targetId, weaponIndex: w.index, kind: def.kind });

    const coordination = 1 - fleet.coordinationPenalty * 0.5;

    if (missile) {
      const p = Math.min(0.95, def.accuracy * (0.5 + 0.5 * ship.subsystems.sensors) * coordination);
      this.flashes.push({ from: origin, to: clone(missile.pos), kind: ship.faction === 'reaper' ? 'reaper_pd' : 'gardian', ttl: 0.12 });
      if (this.rng.chance(p)) {
        missile.hp -= def.damage;
        ship.stats.hits++;
        if (missile.hp <= 0) {
          missile.alive = false;
          this.emit({ t: this.time, type: 'missile_intercepted', missileId: missile.id, interceptorId: ship.id, pos: clone(missile.pos) });
        }
      }
      return;
    }
    if (!target) return;

    const dist = distance(origin, target.pos);
    const closing = length(sub(target.vel, ship.vel));
    const p = hitProbability(ship, target, def, dist, closing) * coordination;

    switch (def.kind) {
      case 'mass_accelerator': {
        const aim = interceptPoint(origin, target.pos, target.vel, def.projectileSpeed);
        let aimPoint = aim;
        const hit = this.rng.chance(p);
        if (!hit) {
          // Deliberate miss offset larger than the target's bounding sphere.
          const dir = normalize(sub(aim, origin));
          let perp = cross(dir, v3(0, 1, 0));
          if (lengthSq(perp) < 1e-6) perp = v3(1, 0, 0);
          perp = normalize(perp);
          const up = cross(perp, dir);
          const ang = this.rng.next() * Math.PI * 2;
          const mag = target.radiusKm * (1.6 + this.rng.next() * 3) + 0.05;
          aimPoint = add(aim, add(scale(perp, Math.cos(ang) * mag), scale(up, Math.sin(ang) * mag)));
        }
        const dir = normalize(sub(aimPoint, origin));
        this.projectiles.push({
          id: this.nextId++,
          shooterId: ship.id,
          side: ship.side,
          weapon: def,
          pos: clone(origin),
          prevPos: clone(origin),
          vel: scale(dir, def.projectileSpeed),
          ttl: (def.range * 1.6) / def.projectileSpeed + 0.5,
          intendedTargetId: target.id,
        });
        break;
      }
      case 'thanix':
      case 'reaper_beam': {
        const hit = this.rng.chance(p);
        w.beamRemaining = def.beamDuration ?? 1.5;
        w.beamTargetId = target.id;
        w.beamHit = hit;
        if (hit) ship.stats.hits++;
        w.beamStart = origin;
        if (hit) w.beamEnd = clone(target.pos);
        else {
          const dir = normalize(sub(target.pos, origin));
          let perp = cross(dir, v3(0, 1, 0));
          if (lengthSq(perp) < 1e-6) perp = v3(1, 0, 0);
          perp = normalize(perp);
          const mag = target.radiusKm * 2.5 + 0.3;
          const ang = this.rng.next() * Math.PI * 2;
          const up = cross(perp, dir);
          w.beamEnd = add(addScaled(target.pos, dir, 6), add(scale(perp, Math.cos(ang) * mag), scale(up, Math.sin(ang) * mag)));
        }
        break;
      }
      case 'gardian': {
        this.flashes.push({ from: origin, to: clone(target.pos), kind: ship.faction === 'reaper' ? 'reaper_pd' : 'gardian', ttl: 0.1 });
        if (this.rng.chance(p)) {
          this.applyHit(ship, target, def, def.damage, clone(target.pos));
        }
        break;
      }
      case 'disruptor_torpedo':
      case 'missile': {
        const dir = normalize(sub(target.pos, origin));
        this.missiles.push({
          id: this.nextId++,
          shooterId: ship.id,
          side: ship.side,
          weapon: def,
          pos: clone(origin),
          prevPos: clone(origin),
          vel: scale(dir, def.projectileSpeed),
          targetId: target.id,
          hp: def.missileHp ?? 10,
          ttl: (def.range * 2.5) / def.projectileSpeed + 4,
          alive: true,
        });
        break;
      }
    }
  }

  private applyHit(shooter: ShipState, target: ShipState, weapon: EffectiveWeapon, damage: number, pos: Vec3): void {
    const out = applyProjectileDamage(target, damage, weapon, this.rng, this.time);
    shooter.stats.hits++;
    shooter.stats.damageDealt += out.hullDamage + out.barrierDamage;
    this.emit({
      t: this.time,
      type: 'projectile_impact',
      shipId: shooter.id,
      targetId: target.id,
      damage,
      damageType: weapon.damageType,
      barrierDamage: out.barrierDamage,
      hullDamage: out.hullDamage,
      pos,
    });
    if (out.internalDetonated) this.emit({ t: this.time, type: 'hades_detonation', shipId: shooter.id, targetId: target.id, weaponId: weapon.id,
      internalDamage: out.internalWarheadDamage ?? 0, payloadDamage: damage * (weapon.internalWarheadFraction ?? 0), pos: clone(target.pos) });
    if (out.barriersCollapsed) this.emit({ t: this.time, type: 'barriers_down', shipId: target.id });
    if (out.subsystem) this.emit({ t: this.time, type: 'subsystem_disabled', shipId: target.id, subsystem: out.subsystem.name, level: out.subsystem.level });
    if (out.destroyed) this.destroyShip(target, shooter);
  }

  // ------------------------------------------------------------ projectiles

  private updateProjectiles(dt: number): void {
    const survivors: Projectile[] = [];
    for (const p of this.projectiles) {
      p.prevPos = clone(p.pos);
      p.pos = addScaled(p.pos, p.vel, dt);
      p.ttl -= dt;
      let hitShip: ShipState | undefined;
      let hitPoint: Vec3 | undefined;
      let bestT = Infinity;
      for (const s of this.ships) {
        if (!s.alive || s.escaped || s.side === p.side) continue;
        if (s.role === 'fighter' && !p.weapon.antiSmall) continue;
        const r = s.radiusKm * (s.role === 'fighter' ? 2.5 : 1);
        const t = segmentSphere(p.prevPos, p.pos, s.pos, r);
        if (t !== undefined && t < bestT) {
          bestT = t;
          hitShip = s;
          hitPoint = addScaled(p.prevPos, sub(p.pos, p.prevPos), t);
        }
      }
      if (hitShip && hitPoint) {
        const shooter = this.shipById.get(p.shooterId);
        if (shooter) this.applyHit(shooter, hitShip, p.weapon, p.weapon.damage, hitPoint);
        continue;
      }
      if (p.ttl > 0) survivors.push(p);
    }
    this.projectiles = survivors;
  }

  private updateMissiles(dt: number): void {
    const survivors: Missile[] = [];
    for (const m of this.missiles) {
      if (!m.alive) continue;
      m.prevPos = clone(m.pos);
      m.ttl -= dt;
      const target = this.shipById.get(m.targetId);
      if (!target || !target.alive || target.escaped || m.ttl <= 0) {
        m.alive = false;
        continue;
      }
      const toT = sub(target.pos, m.pos);
      const d = length(toT);
      const speed = m.weapon.projectileSpeed;
      // Homing: blend current velocity direction toward the target.
      const desired = scale(toT, speed / Math.max(d, 1e-6));
      const turn = Math.min(1, 2.5 * dt);
      m.vel = scale(normalize(add(scale(m.vel, 1 - turn), scale(desired, turn))), speed);
      m.pos = addScaled(m.pos, m.vel, dt);
      if (distance(m.pos, target.pos) <= target.radiusKm + speed * dt) {
        const shooter = this.shipById.get(m.shooterId);
        const pHit = Math.min(0.97, m.weapon.accuracy * (1 - target.ecm * 0.4));
        if (shooter && this.rng.chance(pHit)) {
          this.applyHit(shooter, target, m.weapon, m.weapon.damage, clone(m.pos));
        }
        m.alive = false;
        continue;
      }
      survivors.push(m);
    }
    this.missiles = survivors;
  }

  // ------------------------------------------------------------- lifecycle

  private destroyShip(ship: ShipState, killer?: ShipState): void {
    if (killer) killer.stats.kills++;
    ship.alive = false;
    ship.destroyedAt = this.time;
    for (const w of ship.weapons) {
      w.beamRemaining = 0;
      w.beamTargetId = undefined;
      w.beamEnd = undefined;
      w.beamStart = undefined;
    }
    this.emit({
      t: this.time,
      type: 'ship_destroyed',
      shipId: ship.id,
      killerId: killer?.id,
      classId: ship.classId,
      faction: ship.faction,
      side: ship.side,
      name: ship.name,
      pos: clone(ship.pos),
      role: ship.role,
    });
    const fleet = this.fleets.get(ship.fleetId);
    const enemySide: Side = ship.side === 'A' ? 'B' : 'A';
    const isCapital = ship.role === 'dreadnought' || ship.role === 'carrier' || ship.role === 'reaper_capital';
    if (ship.role !== 'fighter') {
      if (isCapital) {
        this.comms(ship.side, 'capital_lost', ship.name, fleet);
        this.comms(enemySide, 'enemy_capital_lost', ship.name);
      } else if (this.rng.chance(0.35)) {
        this.comms(ship.side, 'ally_lost', ship.name, fleet);
        if (this.rng.chance(0.4)) this.comms(enemySide, 'enemy_destroyed', ship.name);
      }
    }
    // Reaper command vulnerability (AU rule): losing a capital Reaper degrades coordination.
    if (ship.role === 'reaper_capital' && this.rules.special.reaperCommandVulnerability) {
      for (const f of this.fleets.values()) if (f.spec.faction === 'reaper') f.coordinationPenalty = Math.min(1, f.coordinationPenalty + 0.6);
    }
    // Heavy losses announcement.
    const sidePoints = this.sidePoints(ship.side);
    if (!this.heavyLossesAnnounced.has(ship.side) && sidePoints.remaining < sidePoints.start * 0.5) {
      this.heavyLossesAnnounced.add(ship.side);
      this.comms(ship.side, 'heavy_losses', undefined, fleet);
    }
  }

  private sidePoints(side: Side): { start: number; remaining: number } {
    let start = 0;
    let remaining = 0;
    for (const f of this.fleets.values()) if (f.spec.side === side) start += f.startPoints;
    for (const s of this.ships) if (s.side === side && s.alive && !s.escaped && s.role !== 'fighter') remaining += s.pointValue;
    return { start, remaining };
  }

  private checkEscapes(): void {
    // Damaged ships no longer leave the battlespace on their own: a tactical withdrawal falls back
    // behind the line and re-engages (see ai.ts). Only an explicit player retreat order escapes.
    for (const f of this.fleets.values()) {
      if (f.spec.faction === 'reaper') continue;
      if (f.orders.order !== 'retreat') continue;
      for (const s of this.ships) {
        if (s.fleetId !== f.spec.id || !s.alive || s.escaped) continue;
        const enemies = this.enemiesOf(s.side);
        let nearest = Infinity;
        for (const e of enemies) nearest = Math.min(nearest, distance(e.pos, s.pos));
        if (nearest > 80 * S) s.escaped = true;
      }
    }
  }

  private checkEnd(): void {
    const a = this.sidePoints('A');
    const b = this.sidePoints('B');
    const aAlive = this.ships.some((s) => s.side === 'A' && s.alive && !s.escaped && s.role !== 'fighter');
    const bAlive = this.ships.some((s) => s.side === 'B' && s.alive && !s.escaped && s.role !== 'fighter');
    if (!aAlive && !bAlive) return this.end('draw', 'Mutual annihilation');
    if (!aAlive) return this.end('B', a.remaining === 0 ? 'Side A fleet destroyed' : 'Side A fleet withdrew from the battlespace');
    if (!bAlive) return this.end('A', b.remaining === 0 ? 'Side B fleet destroyed' : 'Side B fleet withdrew from the battlespace');

    // Nobody runs: there is no fleet-wide auto-retreat any more; a side fights until it is destroyed or the clock runs out.

    if (this.time >= this.config.maxDuration) {
      const fa = a.remaining / Math.max(1, a.start);
      const fb = b.remaining / Math.max(1, b.start);
      if (Math.abs(fa - fb) < 0.08) return this.end('draw', 'Time limit: forces remain evenly matched');
      return this.end(fa > fb ? 'A' : 'B', 'Time limit: attrition judgement');
    }
  }

  private end(winner: Side | 'draw', reason: string): void {
    if (this.finished) return;
    this.finished = true;
    this.emit({ t: this.time, type: 'battle_end', winner, reason });
    if (winner !== 'draw') {
      this.comms(winner, 'victory');
      this.comms(winner === 'A' ? 'B' : 'A', 'defeat');
      this.emit({ t: this.time, type: 'objective_completed', side: winner, text: `${this.config.objective}` });
    }
    this.result = summarise(this);
  }

  // ------------------------------------------------------------------ comms

  private comms(side: Side | undefined, kind: CommsEvent, shipName?: string, fleet?: FleetState): void {
    const fleets = [...this.fleets.values()].filter((f) => (side ? f.spec.side === side : true) && (!fleet || f === fleet));
    const seenFactions = new Set<FactionId>();
    for (const f of fleets) {
      if (seenFactions.has(f.spec.faction)) continue;
      seenFactions.add(f.spec.faction);
      if (kind !== 'battle_start' && kind !== 'victory' && kind !== 'defeat' && f.commsCooldown > 0) continue;
      const lines = FACTIONS[f.spec.faction].comms[kind];
      if (!lines || lines.length === 0) continue;
      const text = this.rng.pick(lines).replace('{ship}', shipName ?? 'ship');
      f.commsCooldown = 4 + this.rng.next() * 4;
      this.emit({ t: this.time, type: 'comms', faction: f.spec.faction, side: f.spec.side, text });
    }
  }

  private emit(e: BattleEvent): void {
    this.events.push(e);
    this.onEvent?.(e);
  }
}

/**
 * Segment-sphere intersection. Returns parametric t in [0,1] of first contact
 * along the segment, or undefined.
 */
export function segmentSphere(a: Vec3, b: Vec3, c: Vec3, r: number): number | undefined {
  const d = sub(b, a);
  const f = sub(a, c);
  const A = dot(d, d);
  if (A < 1e-12) return lengthSq(f) <= r * r ? 0 : undefined;
  const B = 2 * dot(f, d);
  const C = dot(f, f) - r * r;
  let disc = B * B - 4 * A * C;
  if (disc < 0) return undefined;
  disc = Math.sqrt(disc);
  const t1 = (-B - disc) / (2 * A);
  const t2 = (-B + disc) / (2 * A);
  if (t1 >= 0 && t1 <= 1) return t1;
  if (t2 >= 0 && t2 <= 1) return t2;
  if (t1 < 0 && t2 > 1) return 0;
  return undefined;
}
