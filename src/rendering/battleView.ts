import * as THREE from 'three';
import { Rng } from '@/core/rng';
import { cinematicPair, cinematicWing } from './director';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { BattleSimulation } from '@/simulation/battle';
import { SIM_DT } from '@/simulation/battle';
import type { BattleEvent, ShipState, WeaponState } from '@/simulation/types';
import { getFaction } from '@/data/factions';
import { CameraRig, type CameraSubject, type CinematicFrame } from './cameras';
import { EffectsSystem } from './effects';
import { buildEnvironment, disposeEnvironment, type EnvironmentBuild } from './environment';
import { TravelField } from './travelField';
import { KM } from './geometry';
import { instantiateShip, getShipTemplate, type BuiltShip } from './ships';
import { InstancedFleet } from './instancedFleet';
import { DETAIL_MESH_NAMES, lodLevelSquared, type LodLevel } from './lod';
import { weaponBeamOrigin, weaponFlashPose } from './weaponFlash';
import { weaponWorldOffset } from '@/simulation/fireControl';
import { primaryGunneryMount, isMainGunShot, gunneryFrame } from './gunnery';
import { animateReaperRig, captureReaperRig, isArticulatedReaper, type ReaperRig } from './reaperMotion';
import { EmitterLightPool, easeEmitterCharge, emitterTarget } from './emitterLights';
import { collectBreakupPieces } from './breakup';
import { deathLight, deathList, deathPlan, isStagedDeath, type DeathPlan } from './deathSequence';
import { DAMAGE_ONSET, REAPER_ARMOUR_MESHES, REAPER_SEAM_MESHES, reaperDamageGlow, type ReaperDamageGlow } from './damageGlow';

/**
 * Binds a BattleSimulation to a Three.js scene. The simulation owns all
 * state; this class only reads it (with interpolation between fixed steps)
 * and reacts to its events.
 */

export interface ShipVisual {
  ship: ShipState;
  built: BuiltShip;
  glows: THREE.Sprite[];
  dying?: { timer: number; plan: DeathPlan; next: number; seamBase?: number[]; glowBase?: number[] };
  removed: boolean;
  /** Unique materials for damage tinting (cloned lazily on first damage). */
  tinted: boolean;
  /** Current level of detail. */
  lod: LodLevel;
  /** Per-vessel skeletal pivots, only allocated for nearby/selected Reapers. */
  reaperRig?: ReaperRig;
  /** Eased glow of the weapon emitter, 0 to 1 (render state). */
  emitterCharge?: number;
  /** Reaper damage response: unique seam and armour materials (cloned with the tint). */
  seamMats?: THREE.MeshStandardMaterial[];
  emberMats?: THREE.MeshStandardMaterial[];
}

export interface GraphicsSettings {
  quality: 'low' | 'medium' | 'high' | 'ultra';
  /** Subtle HDR bloom, enabled for Ultra by default. */
  bloom?: boolean;
  showEngineGlow: boolean;
  pixelRatioCap: number;
  /** Distance-based level of detail (default on). */
  lod?: boolean;
}

// Shared GPU point buffer for formations beyond detailed mesh range.
const MAX_FAR_POINTS = 16384;

export class BattleView {
  readonly renderer: THREE.WebGLRenderer;
  private composer?: EffectComposer;
  renderCpuMs = 0;
  gpuFrameMs: number | null = null;
  private gpuTimer?: { gl: WebGL2RenderingContext; elapsed: number; disjoint: number; pending: WebGLQuery[] };
  frameTriangles = 0;
  /** Opt-in deterministic screenshot camera; ordinary camera modes are unchanged. */
  referenceCamera = false;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly effects = new EffectsSystem();
  readonly instances = new InstancedFleet();
  private readonly frustum = new THREE.Frustum();
  private readonly frustumMatrix = new THREE.Matrix4();
  private readonly sphere = new THREE.Sphere();
  private readonly MAX_HERO_VISUALS = 96;
  readonly visuals = new Map<string, ShipVisual>();
  env!: EnvironmentBuild;
  /** Static scene objects showing subtle true parallax on following shots. */
  private travelField?: TravelField;
  sim: BattleSimulation;
  /** Interpolation alpha within the current fixed step (0..1). */
  alpha = 0;
  selectedIds = new Set<string>();
  followId?: string;
  /** A gunnery camera can never jump to another hull after locking. */
  gunneryLockedShipId?: string;
  /** Last confirmed non-PD firing mount for the first-person view. */
  gunneryWeaponIndex?: number;
  gunneryShot?: { t: number; shipId: string; targetId: string; weaponIndex: number; kind: string };
  /** 1.15s real-time loss of feed before auto-acquiring another live warship. */
  gunnerySignalUntilMs = 0;
  get gunnerySignalLost(): boolean {return this.rig.mode==='gunnery'&&performance.now()<this.gunnerySignalUntilMs;}
  /** Cinematic director state. */
  private directorRng = new Rng(1);
  private cine: { fromId?: string; toId?: string; age: number; hold: number; wreck?: boolean; members?: string[] } = { age: 0, hold: 0 };
  private cineShot = 0;
  private projectileTrack?: { id: number };
  private nextBeamShieldAt = new Map<string, number>();
  private readonly glowTex: THREE.Texture;
  private sunLight: THREE.DirectionalLight;
  private fillLight: THREE.DirectionalLight;
  /** Local weapon light for the nearest charging or firing Reaper emitters. */
  readonly emitterLights = new EmitterLightPool();
  private readonly damageGlow: ReaperDamageGlow = { seam: new THREE.Color(), seamIntensity: 0, ember: 0 };
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly fwd = new THREE.Vector3(0, 0, 1);
  settings: GraphicsSettings;
  private eventQueue: BattleEvent[] = [];
  /** Beam mounts are indexed once per fixed simulation tick, not at every render frame. */
  private activeBeamTick = -1;
  private readonly activeBeamMounts: { ship: ShipState; weapon: WeaponState }[] = [];
  /** Shared point cloud for ships beyond mesh range (one draw call). */
  private readonly farPoints: THREE.Points;
  private farCapacity = MAX_FAR_POINTS;
  private farPositions = new Float32Array(MAX_FAR_POINTS * 3);
  private farColours = new Float32Array(MAX_FAR_POINTS * 3);
  private readonly tmpColour = new THREE.Color();
  private readonly farColourCache = new Map<string, readonly [number, number, number]>();
  /** Draw calls of the last rendered frame. */
  drawCalls = 0;
  /** Called when a staged death reaches its breakup (render units), so the explosion is heard when it is seen. */
  onBreakup?: (role: string, position: THREE.Vector3) => void;
  lodCounts = { full: 0, reduced: 0, point: 0 };

  constructor(canvas: HTMLCanvasElement, sim: BattleSimulation, settings: GraphicsSettings) {
    this.settings = settings;
    this.effects.configure(settings.quality);
    this.instances.configure(settings.quality);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: settings.quality !== 'low', powerPreference: 'high-performance', logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.pixelRatioCap));
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const timer = typeof gl.createQuery === 'function' ?
      gl.getExtension('EXT_disjoint_timer_query_webgl2') : null;
    if (timer) this.gpuTimer = {
      gl, elapsed: timer.TIME_ELAPSED_EXT, disjoint: timer.GPU_DISJOINT_EXT, pending: []
    };
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // Cinematic is a darker space photograph, not an all-scene exposure boost.
    this.renderer.toneMappingExposure = settings.quality === 'ultra' ? 0.82 : 1.05;
    this.rig = new CameraRig(canvas.clientWidth / Math.max(1, canvas.clientHeight));
    // Image-based lighting so metallic hull plating reads as metal rather than
    // black: a neutral PMREM environment at low intensity.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = settings.quality === 'ultra' ? 0.22 : 0.35;
    pmrem.dispose();
    this.sim = sim;

    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    this.glowTex = new THREE.CanvasTexture(c);

    this.sunLight = new THREE.DirectionalLight(0xfff2e0, settings.quality === 'ultra' ? 2.25 : 2.6);
    this.scene.add(this.sunLight);
    this.scene.add(new THREE.HemisphereLight(0x8fb4ff, 0x1a1420, settings.quality === 'ultra' ? 0.35 : 0.7));
    this.scene.add(new THREE.AmbientLight(0x404a60, settings.quality === 'ultra' ? 0.16 : 0.45));
    // Camera-relative fill so hulls stay readable when viewed against the sun.
    this.fillLight = new THREE.DirectionalLight(0xb8c8e8, settings.quality === 'ultra' ? 0.24 : 0.9);
    this.scene.add(this.fillLight, this.fillLight.target);
    this.scene.add(this.effects.group, this.instances.group, this.emitterLights.group);
    const farGeom = new THREE.BufferGeometry();
    farGeom.setAttribute('position', new THREE.BufferAttribute(this.farPositions, 3));
    farGeom.setAttribute('color', new THREE.BufferAttribute(this.farColours, 3));
    farGeom.setDrawRange(0, 0);
    this.farPoints = new THREE.Points(farGeom, new THREE.PointsMaterial({ size: 2.2, vertexColors: true, map: this.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    this.farPoints.frustumCulled = false;
    this.farPoints.name = 'far-points';
    this.scene.add(this.farPoints);
    if (settings.bloom ?? settings.quality === 'ultra') {
      const composer = new EffectComposer(this.renderer);
      composer.addPass(new RenderPass(this.scene, this.rig.camera));
      // Only true HDR emitters should bloom. Keep hulls, planet, and stars crisp.
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.075, 0.055, 1.5));
      composer.addPass(new OutputPass());
      this.composer = composer;
    }
    this.bind(sim);
  }

  /** Attach to a (new) simulation, rebuilding the scene content. */
  bind(sim: BattleSimulation): void {
    this.sim = sim;
    this.activeBeamTick = -1;
    this.activeBeamMounts.length = 0;
    for (const v of this.visuals.values()) this.scene.remove(v.built.group);
    this.visuals.clear();
    this.effects.clear();
    this.nextBeamShieldAt.clear();
    if (this.env) { this.scene.remove(this.env.group); disposeEnvironment(this.env); }
    if (this.travelField) { this.scene.remove(this.travelField.points); this.travelField.dispose(); }
    const resolution = this.settings.quality === 'ultra' ? 2048 :
      this.settings.quality === 'high' ? 1536 : this.settings.quality === 'medium' ? 1024 : 512;
    this.env = buildEnvironment(sim.config.environment, resolution, this.settings.quality !== 'low', this.settings.quality === 'ultra');
    this.scene.add(this.env.group);
    // Fixed-world foreground references; no fake warp streaks or camera-locked sky movement.
    const theatreCentre = this.sideCentre('A').add(this.sideCentre('B')).multiplyScalar(0.5);
    this.travelField = new TravelField(sim.config.seed, theatreCentre);
    this.travelField.points.visible = false;
    this.scene.add(this.travelField.points);
    this.sunLight.position.copy(this.env.sunDirection).multiplyScalar(10_000);
    this.sunLight.target.position.set(0, 0, 0);
    this.scene.add(this.sunLight.target);
    // Build detailed objects lazily for nearby/selected ships; the rest use GPU batches.
    sim.onEvent = e => this.queueEvent(e);
    this.selectedIds.clear();
    this.followId = undefined;
    this.gunneryWeaponIndex = undefined;
    this.gunneryShot = undefined;
    this.cine = { age: 0, hold: 0 };
    this.cineShot = 0;
    this.directorRng = new Rng(`director-${sim.config.seed}`);
    // Frame the player's fleet.
    const centre = this.sideCentre(sim.config.perspectiveSide);
    this.rig.focus.copy(centre);
    let deploymentRadius = 0;
    for (const ship of sim.ships) if (ship.side === sim.config.perspectiveSide && ship.role !== 'fighter' && ship.alive && !ship.escaped) {
      deploymentRadius = Math.max(deploymentRadius, this.tmpA.set(ship.pos.x, ship.pos.y, ship.pos.z).multiplyScalar(KM).distanceTo(centre) + ship.lengthKm * KM * 0.6);
    }
    this.rig.distance = Math.max(320, deploymentRadius * 2.6);
    this.rig.yaw = Math.PI + 0.6;
    this.rig.pitch = 0.42;
  }

  private ensureVisual(ship: ShipState): ShipVisual {
    let v = this.visuals.get(ship.id);
    if (v) return v;
    const built = instantiateShip(ship.classId);
    const glows: THREE.Sprite[] = [];
    if (this.settings.showEngineGlow) {
      const color = ship.faction === 'reaper' ? built.glowColor : getFaction(ship.faction).engineColourHex;
      built.engineNodes.forEach((node, i) => {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 }));
        sp.position.copy(node);
        const s = Math.max(0.3, built.lengthUnits * (ship.faction === 'reaper' ? 0.12 : 0.11)) * (built.glowScales?.[i] ?? 1);
        sp.scale.set(s, s, 1);
        built.group.add(sp);
        glows.push(sp);
      });
    }
    built.group.name = ship.id;
    built.group.userData.shipId = ship.id;
    this.scene.add(built.group);
    v = { ship, built, glows, removed: false, tinted: false, lod: 'full',
      reaperRig: isArticulatedReaper(ship) ? captureReaperRig(built.group, ship.id) : undefined };
    this.visuals.set(ship.id, v);
    this.placeVisual(v, 1);
    return v;
  }

  private placeVisual(v: ShipVisual, alpha: number): void {
    const s = v.ship;
    const g = v.built.group;
    g.position.set(
      (s.prevPos.x + (s.pos.x - s.prevPos.x) * alpha) * KM,
      (s.prevPos.y + (s.pos.y - s.prevPos.y) * alpha) * KM,
      (s.prevPos.z + (s.pos.z - s.prevPos.z) * alpha) * KM,
    );
    this.tmpA.set(s.prevHeading.x + (s.heading.x - s.prevHeading.x) * alpha, s.prevHeading.y + (s.heading.y - s.prevHeading.y) * alpha, s.prevHeading.z + (s.heading.z - s.prevHeading.z) * alpha).normalize();
    this.tmpQ.setFromUnitVectors(this.fwd, this.tmpA);
    g.quaternion.copy(this.tmpQ);
    // Engine exhaust is driven by commanded acceleration, not current speed.
    // Coasting / disabled engines retain only a dim idle lens.
    const output=THREE.MathUtils.clamp(s.engineThrust??0.5,0,1);
    for(const glow of v.glows) {
      const material=glow.material as THREE.SpriteMaterial;
      material.opacity=s.inertialCoast?.12:(.22+.62*Math.sqrt(output));
    }

    // Match GPU-instanced animation: agile fighter attack banking, subtle
    // escort roll, and heavy capital hulls remaining level during slow turns.
    const turn = s.prevHeading.x * s.heading.z - s.prevHeading.z * s.heading.x;
    const right = this.tmpB.set(this.tmpA.z, 0, -this.tmpA.x);
    const lat = s.vel.x * right.x + s.vel.z * right.z;
    const factor = s.role === 'fighter' ? 0.36 : s.role === 'frigate' ? 0.12 :
      s.role === 'cruiser' ? 0.025 : s.role === 'reaper_destroyer' ? 0.015 : 0;
    const bank = THREE.MathUtils.clamp(turn * 3.5 + lat * factor * 0.12, -factor, factor);
    if (bank) g.rotateZ(bank);
  }

  // ------------------------------------------------------------- per frame

  /** Whether a ship's target is alive and within 1.1 × the reach of its main battery (read-only on the simulation). */
  private reaperEngaged(ship: ShipState): boolean {
    const target = ship.targetId ? this.sim.getShip(ship.targetId) : undefined;
    if (!target?.alive || target.escaped) return false;
    let reach = 0;
    for (const w of ship.weapons) if (!w.def.antiSmall && w.def.range > reach) reach = w.def.range;
    const tx = target.pos.x - ship.pos.x, ty = target.pos.y - ship.pos.y, tz = target.pos.z - ship.pos.z;
    return tx * tx + ty * ty + tz * tz <= reach * reach * 1.21;
  }

  /** Apply a level of detail to a visual: toggles detail meshes, glow sprites and the far-point fallback. */
  private applyLod(v: ShipVisual, level: LodLevel): void {
    if (v.lod === level) return;
    v.lod = level;
    const g = v.built.group;
    g.visible = level !== 'point';
    for (const child of g.children) {
      if ((child as THREE.Sprite).isSprite) child.visible = level === 'full';
      else if (DETAIL_MESH_NAMES.has(child.name)) child.visible = level === 'full';
    }
  }

  /**
   * Preserve every far-away ship, including battles larger than the original
   * 16,384-point buffer. Resize only on fleet growth, never in the hot loop.
   */
  private ensureFarPointCapacity(needed: number): void {
    if (needed <= this.farCapacity) return;
    while (this.farCapacity < needed) this.farCapacity *= 2;
    this.farPositions = new Float32Array(this.farCapacity * 3);
    this.farColours = new Float32Array(this.farCapacity * 3);
    const geometry = this.farPoints.geometry;
    geometry.setAttribute('position', new THREE.BufferAttribute(this.farPositions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.farColours, 3).setUsage(THREE.DynamicDrawUsage));
  }

  update(dt: number, alpha: number): void {
    this.alpha = alpha;
    this.processEvents();
    const sim = this.sim;
    const cam = this.rig.camera.position;
    const lodOn = this.settings.lod !== false;
    let far = 0;
    this.lodCounts = { full: 0, reduced: 0, point: 0 };
    this.instances.begin(sim.ships);
    this.emitterLights.begin();
    this.ensureFarPointCapacity(sim.ships.length);
    this.rig.camera.updateMatrixWorld();
    this.frustumMatrix.multiplyMatrices(this.rig.camera.projectionMatrix, this.rig.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.frustumMatrix);
    let nearVisuals = 0;
    for (const ship of sim.ships) {
      const existing = this.visuals.get(ship.id);
      if (!ship.alive) {
        if (existing && !existing.removed) this.updateDying(existing, dt);
        continue;
      }
      if (ship.escaped) {
        if (existing) existing.built.group.visible = false;
        continue;
      }
      const lengthUnits = getShipTemplate(ship.classId).lengthUnits;
      const px = (ship.prevPos.x + (ship.pos.x - ship.prevPos.x) * alpha) * KM;
      const py = (ship.prevPos.y + (ship.pos.y - ship.prevPos.y) * alpha) * KM;
      const pz = (ship.prevPos.z + (ship.pos.z - ship.prevPos.z) * alpha) * KM;
      const dx = px - cam.x, dy = py - cam.y, dz = pz - cam.z;
      const distanceSquared = dx * dx + dy * dy + dz * dz;
      const level = lodLevelSquared(distanceSquared, lengthUnits, ship.role, lodOn);
      this.lodCounts[level]++;
      this.sphere.center.set(px, py, pz);
      this.sphere.radius = lengthUnits * 0.8 + 2;
      const onScreen = this.frustum.intersectsSphere(this.sphere);
      const priority = this.selectedIds.has(ship.id) || this.followId === ship.id ||
        this.cine.fromId === ship.id || this.cine.toId === ship.id;
      if (level === 'point') {
        if (existing) existing.built.group.visible = false;
        if (onScreen && far < this.farCapacity) {
          this.farPositions[far * 3] = px;
          this.farPositions[far * 3 + 1] = py;
          this.farPositions[far * 3 + 2] = pz;
          let colour = this.farColourCache.get(ship.faction);
          if (!colour) {
            this.tmpColour.setHex(getFaction(ship.faction).engineColourHex);
            colour = [this.tmpColour.r, this.tmpColour.g, this.tmpColour.b];
            this.farColourCache.set(ship.faction, colour);
          }
          this.farColours[far * 3] = colour[0];
          this.farColours[far * 3 + 1] = colour[1];
          this.farColours[far * 3 + 2] = colour[2];
          far++;
        }
        continue;
      }
      if (!onScreen && !priority) {
        if (existing) existing.built.group.visible = false;
        continue;
      }
      const nearRange = Math.max(75, lengthUnits * 22);
      const nearby = distanceSquared <= nearRange * nearRange;
      const hero = priority || (nearby && nearVisuals < this.MAX_HERO_VISUALS);
      if (hero) {
        const v = existing ?? this.ensureVisual(ship);
        if (v.removed) continue;
        this.placeVisual(v, alpha);
        if (v.reaperRig) {
          // Combat stance once the target is within reach of the main battery (render-side reading of the
          // simulation; nothing is written back).
          const engaged = this.reaperEngaged(ship);
          animateReaperRig(v.reaperRig, ship, sim.time, dt, engaged);
          if (v.built.muzzle) {
            // Weapon light: full while the main beam fires, partial when a shot at a target is imminent.
            let firing = false, imminent = false;
            for (const w of ship.weapons) {
              if (w.def.antiSmall || (w.def.kind !== 'reaper_beam' && w.def.kind !== 'thanix')) continue;
              if (w.beamRemaining > 0) firing = true;
              else if (ship.targetId && w.cooldown < 1.5) imminent = true;
            }
            const charge = easeEmitterCharge(v.emitterCharge ?? 0, emitterTarget(firing, imminent && engaged), dt);
            v.emitterCharge = charge;
            if (charge > 0.02) this.emitterLights.offer({ id: ship.id, charge, distanceSq: distanceSquared, size: lengthUnits, color: v.built.glowColor,
              position: this.tmpA.copy(v.built.muzzle).applyQuaternion(v.built.group.quaternion).add(v.built.group.position).clone() });
          }
        }
        this.applyLod(v, level);
        v.built.group.visible = true;
        nearVisuals++;
        const speedFrac = Math.min(1, Math.hypot(ship.vel.x, ship.vel.y, ship.vel.z) / Math.max(0.01, ship.maxSpeed));
        if (level === 'full') for (const gl of v.glows)
          (gl.material as THREE.SpriteMaterial).opacity = 0.35 + 0.6 * speedFrac * ship.subsystems.engines;
        const hullFrac = ship.hull / ship.maxHull;
        if (hullFrac < DAMAGE_ONSET && !v.tinted) this.tintDamage(v);
        if (v.seamMats && v.emberMats && v.reaperRig) {
          // Reapers: the seams run hot and flicker; the armour keeps its graphite with a faint ember.
          const glow = reaperDamageGlow(hullFrac, sim.time, v.reaperRig.phase, this.damageGlow);
          for (const mat of v.seamMats) { mat.color.copy(glow.seam); mat.emissive.copy(glow.seam); mat.emissiveIntensity = glow.seamIntensity; }
          for (const mat of v.emberMats) { mat.emissive.setRGB(glow.ember, glow.ember * 0.12, 0); mat.emissiveIntensity = 1; }
        } else if (v.tinted) {
          const t = 1 - hullFrac;
          v.built.group.traverse(o => {
            const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
            if (m && m.isMeshStandardMaterial && o.name === 'hull') {
              m.emissive.setRGB(0.25 * t * (0.6 + 0.4 * Math.sin(sim.time * 7 + ship.id.length)), 0.05 * t, 0);
              m.emissiveIntensity = 1;
            }
          });
        }
      } else {
        if (existing) existing.built.group.visible = false;
        this.instances.add(ship, alpha, level);
      }
    }
    this.instances.end();
    this.emitterLights.end();
    const farGeom = this.farPoints.geometry;
    farGeom.setDrawRange(0, far);
    (farGeom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (farGeom.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    this.farPoints.visible = far > 0;
    // Effects from sim state.
    // Reuse authoritative simulation arrays; avoid allocating a temporary
    // object for every projectile and missile every render frame.
    this.effects.setTracers(sim.projectiles, alpha, SIM_DT);
    this.effects.setMissiles(sim.missiles, alpha, SIM_DT);
    if (this.activeBeamTick !== sim.tick) {
      this.activeBeamTick = sim.tick;
      this.activeBeamMounts.length = 0;
      for (const ship of sim.ships) {
        if (!ship.alive) continue;
        for (const weapon of ship.weapons) {
          if (weapon.beamRemaining > 0 && weapon.beamStart && weapon.beamEnd)
            this.activeBeamMounts.push({ ship, weapon });
        }
      }
    }
    const beams: { start: THREE.Vector3; end: THREE.Vector3; kind: 'thanix' | 'reaper_beam'; intensity: number }[] = [];
    for (const { ship, weapon: w } of this.activeBeamMounts) {
      if (ship.alive && w.beamRemaining > 0 && w.beamStart && w.beamEnd) {
          const kind = w.def.kind === 'thanix' ? 'thanix' : 'reaper_beam';
          const v = this.visuals.get(ship.id);
          // Eyes and narrow forward projectors use their model muzzle;
          // turreted lance decks use the actual visible-hull hardpoint.
          let start: THREE.Vector3;
          if (v) start = weaponBeamOrigin(v.built.group, v.built.muzzle, w, ship.faction === 'reaper');
          else start = new THREE.Vector3(w.beamStart.x * KM, w.beamStart.y * KM, w.beamStart.z * KM);
          const t = w.beamTargetId ? sim.getShip(w.beamTargetId) : undefined;
          // Render fixed-step, rotating hull contact; never snap to target centre.
          const end = new THREE.Vector3(w.beamEnd.x * KM, w.beamEnd.y * KM, w.beamEnd.z * KM);
          if (w.beamHit && t?.alive && t.barriers > 0 && sim.time >= (this.nextBeamShieldAt.get(t.id) ?? 0)) {
            const victim = this.visuals.get(t.id);
            if (victim && !victim.removed) {
              this.effects.barriers.hit(t.id, t.classId, victim.built.group, end, w.def.damage * 0.25);
              this.nextBeamShieldAt.set(t.id, sim.time + 0.25);
            }
          }
          const intensity = w.def.id === 'oculus_beam' ? 0.055 :
            kind === 'reaper_beam' ? (ship.role === 'reaper_capital' ? 1.3 : 0.7) : 0.9;
          beams.push({ start, end, kind, intensity });
      }
    }
    this.effects.setBeams(beams);
    this.effects.setPointDefence(sim.flashes, KM);
    this.effects.update(dt);

    // Camera.
    this.cine.age += dt;
    if (!this.referenceCamera) this.updateCamera(dt);
    if (this.travelField) this.travelField.points.visible =
      !this.referenceCamera && (this.rig.mode === 'follow' || this.rig.mode === 'cinematic' ||
      this.rig.mode === 'reaper' || this.rig.mode === 'free' || this.rig.mode === 'projectile');
    // Fill light rides with the camera.
    this.fillLight.position.copy(this.rig.camera.position);
    this.fillLight.target.position.copy(this.rig.camera.position).add(this.rig.camera.getWorldDirection(this.tmpB).multiplyScalar(100));
    // Sky objects follow the camera so the starfield never parallaxes.
    for (const o of this.env.skyObjects) if (o.name !== 'sun') o.position.copy(this.rig.camera.position);
    this.env.group.getObjectByName('sun')?.position.copy(this.rig.camera.position).addScaledVector(this.env.sunDirection, 150_000);
    if (this.env.clouds) this.env.clouds.rotation.y = 1.218 + sim.time * 0.00005;
  }

  private tintDamage(v: ShipVisual): void {
    if (v.reaperRig) {
      // One clone per distinct shared material, so this ship's seams and armour can change without touching the fleet's.
      const clones = new Map<THREE.Material, THREE.MeshStandardMaterial>();
      const seamMats: THREE.MeshStandardMaterial[] = [], emberMats: THREE.MeshStandardMaterial[] = [];
      v.built.group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || Array.isArray(mesh.material)) return;
        const seam = REAPER_SEAM_MESHES.has(mesh.name);
        if (!seam && !REAPER_ARMOUR_MESHES.has(mesh.name)) return;
        let clone = clones.get(mesh.material);
        if (!clone) {
          clone = (mesh.material as THREE.MeshStandardMaterial).clone();
          clones.set(mesh.material, clone);
          (seam ? seamMats : emberMats).push(clone);
        }
        mesh.material = clone;
      });
      v.seamMats = seamMats;
      v.emberMats = emberMats;
      v.tinted = true;
      return;
    }
    v.built.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.name === 'hull') mesh.material = (mesh.material as THREE.Material).clone();
    });
    v.tinted = true;
  }

  private updateDying(v: ShipVisual, dt: number): void {
    const ship = v.ship;
    if (!v.dying) {
      const plan = deathPlan(ship.role, ship.id);
      v.dying = { timer: 0, plan, next: 0 };
      if (plan.duration < 0.2) {
        this.finishDeath(v);
        return;
      }
      if (plan.staged) {
        // A Reaper killed outright never passed through the damage tint: give it its own seam materials now, hot.
        if (v.reaperRig && !v.tinted) this.tintDamage(v);
        if (v.seamMats && v.emberMats && v.reaperRig) {
          const glow = reaperDamageGlow(0, this.sim.time, v.reaperRig.phase, this.damageGlow);
          for (const mat of v.seamMats) { mat.color.copy(glow.seam); mat.emissive.copy(glow.seam); mat.emissiveIntensity = glow.seamIntensity; }
          for (const mat of v.emberMats) { mat.emissive.setRGB(glow.ember, glow.ember * 0.12, 0); mat.emissiveIntensity = 1; }
        }
        v.dying.seamBase = (v.seamMats ?? []).map(mat => mat.emissiveIntensity);
        v.dying.glowBase = v.glows.map(gl => (gl.material as THREE.SpriteMaterial).opacity);
      }
    }
    const d = v.dying;
    d.timer += dt;
    const f = Math.min(1, d.timer / d.plan.duration);
    const group = v.built.group;
    // Keep drifting on the last velocity.
    const drift = this.tmpA.set(ship.vel.x, ship.vel.y, ship.vel.z).multiplyScalar(KM * 0.6).clone();
    group.position.addScaledVector(drift, dt);
    if (d.plan.staged) {
      // The hull lists, slowly and then faster; the lights surge and fail; the limbs curl in.
      const list = deathList(f);
      group.rotateZ(dt * list.roll);
      group.rotateX(dt * list.pitch);
      const light = deathLight(f, this.sim.time, v.reaperRig?.phase ?? 0);
      (v.seamMats ?? []).forEach((mat, i) => { mat.emissiveIntensity = (d.seamBase?.[i] ?? mat.emissiveIntensity) * light; });
      v.glows.forEach((gl, i) => { (gl.material as THREE.SpriteMaterial).opacity = (d.glowBase?.[i] ?? 0) * Math.min(1, light); });
      if (v.reaperRig && isArticulatedReaper(ship)) animateReaperRig(v.reaperRig, ship, this.sim.time, dt * 1.8, false);
    } else {
      group.rotateX(dt * 0.05);
    }
    // Secondary explosions on the hull itself, in the ship's own axes.
    const length = v.built.lengthUnits;
    while (d.next < d.plan.bursts.length && d.plan.bursts[d.next].t <= d.timer) {
      const burst = d.plan.bursts[d.next++];
      const p = this.tmpB.set(burst.across * length, burst.up * length, burst.along * length).applyQuaternion(group.quaternion).add(group.position);
      this.effects.secondary(p.clone(), length * burst.scale, drift);
    }
    if (d.timer >= d.plan.duration) this.finishDeath(v);
  }

  private finishDeath(v: ShipVisual): void {
    const ship = v.ship;
    const pos = v.built.group.position.clone();
    let pieces: THREE.Object3D[] = [];
    // Break the model apart: each merged part, and each limb of a Reaper, becomes a debris chunk.
    if (ship.role !== 'fighter') {
      // The per-ship damage materials (tinted hull, hot seams, ember armour) end with the hull.
      const spent = new Set<THREE.Material>([...(v.seamMats ?? []), ...(v.emberMats ?? [])]);
      if (v.tinted) v.built.group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && mesh.name === 'hull' && !Array.isArray(mesh.material)) spent.add(mesh.material);
      });
      // The pieces take their own clones first (from the damaged look), then the per-ship ones are released.
      pieces = collectBreakupPieces(v.built.group);
      for (const mat of spent) mat.dispose();
      v.seamMats = v.emberMats = undefined;
    }
    const vel = new THREE.Vector3(ship.vel.x, ship.vel.y, ship.vel.z).multiplyScalar(KM * 0.5);
    this.effects.explosion(pos, v.built.lengthUnits, ship.faction === 'reaper', pieces, vel);
    if (v.dying?.plan.staged) this.onBreakup?.(ship.role, pos);
    for (const gl of v.glows) gl.visible = false;
    this.scene.remove(v.built.group);
    v.removed = true;
    const camDist = this.rig.camera.position.distanceTo(pos);
    this.rig.addShake(Math.min(1, (v.built.lengthUnits * 30) / Math.max(50, camDist)));
    if (this.followId === ship.id && this.rig.mode !== 'gunnery') this.followId = undefined;
    this.selectedIds.delete(ship.id);
  }

  /** Public event entry point: the controller attaches one listener even
   * when toggling Fullscreen, 2D or rebuilding graphics presets. */
  queueEvent(e: BattleEvent): void {
    if(e.type==='ship_destroyed'&&e.shipId===this.followId&&this.rig.mode==='gunnery')
      this.gunnerySignalUntilMs=performance.now()+1150;
    this.eventQueue.push(e);
  }

  private processEvents(): void {
    const q = this.eventQueue;
    this.eventQueue = [];
    for (const e of q) {
      switch (e.type) {
        case 'weapon_fired': {
          // Natural cinematic opportunity: the sim has actually fired a
          // high-energy main beam. The camera observes an existing action;
          // it never invents a shot, kill, target or combat order.
          if (this.sim.rules.special.reaperHardcore && e.kind === 'reaper_beam' &&
              this.rig.mode === 'cinematic' && this.cine.age > 5) {
            const shooter = this.sim.getShip(e.shipId);
            const weapon = shooter?.weapons[e.weaponIndex];
            const target = e.targetId ? this.sim.getShip(e.targetId) : undefined;
            if (shooter?.role === 'reaper_capital' && weapon?.def.id === 'reaper_capital_beam' &&
                weapon.beamHit && target?.alive) {
              this.cine = { fromId: shooter.id, toId: target.id, age: 0, hold: 6 };
            }
          }
          // This is an authoritative fixed-step fire event, not an animation timer.
          if (this.rig.mode === 'gunnery' && e.shipId === this.followId) {
            const shooter = this.sim.getShip(e.shipId);
            const mount = shooter?.weapons[e.weaponIndex];
            if (mount && shooter && isMainGunShot(shooter,e.weaponIndex)) {
              this.gunneryShot = { t: e.t, shipId: e.shipId, targetId: e.targetId, weaponIndex: e.weaponIndex, kind: e.kind };
              this.rig.addShake(.045);
            }
          }
          if (e.kind !== 'mass_accelerator') break;
          const ship = this.sim.getShip(e.shipId);
          const v = ship ? this.visuals.get(ship.id) : undefined;
          if (!ship || !v) break;
          const w = ship.weapons[e.weaponIndex];
          if (!w) break;
          const big = w.def.damage >= 600;
          if (!big && Math.random() > 0.35) break; // thin out small-gun flashes
          const pose = weaponFlashPose(v.built.group, v.built.muzzle, w);
          const pov = this.rig.mode === 'gunnery' && ship.id === this.followId;
          this.effects.muzzleFlash(pose.position, pose.direction,
            pov ? (big ? 1.8 : 0.75) : (big ? 3.6 : 1.2), ship.faction === 'reaper');
          if (big && this.rig.mode === 'projectile') this.projectileTrack = { id: this.sim.projectiles[this.sim.projectiles.length - 1]?.id ?? 0 };
          break;
        }
        case 'projectile_impact': {
          const t = this.sim.getShip(e.targetId);
          const v = t ? this.visuals.get(t.id) : undefined;
          const pos = new THREE.Vector3(e.pos.x * KM, e.pos.y * KM, e.pos.z * KM);
          if (v && e.barrierDamage > 3) this.effects.barriers.hit(t!.id, t!.classId, v.built.group, pos, e.barrierDamage);
          this.effects.impact(pos, e.barrierDamage, e.hullDamage, v ? v.built.lengthUnits * 0.55 : 2, () => (v && !v.removed ? v.built.group.position : undefined), e.damageType, e.glancing);
          break;
        }
        case 'hades_detonation': {
          const ship = this.sim.getShip(e.targetId);
          const visual = ship ? this.visuals.get(ship.id) : undefined;
          if (!ship || !visual || visual.removed) break;
          this.effects.hadesBurst(new THREE.Vector3(e.pos.x * KM, e.pos.y * KM, e.pos.z * KM), visual.built.lengthUnits,
            e.payloadDamage, new THREE.Vector3(ship.heading.x, ship.heading.y, ship.heading.z), new THREE.Vector3(ship.vel.x, ship.vel.y, ship.vel.z).multiplyScalar(KM));
          break;
        }
        case 'barriers_down': {
          const ship = this.sim.getShip(e.shipId);
          const visual = ship ? this.visuals.get(ship.id) : undefined;
          if (ship && visual) this.effects.barriers.hit(ship.id, ship.classId, visual.built.group, visual.built.group.position, 0, true);
          break;
        }
        case 'missile_intercepted': {
          this.effects.impact(new THREE.Vector3(e.pos.x * KM, e.pos.y * KM, e.pos.z * KM), 0, 30, 1, () => undefined, 'warhead');
          break;
        }
        case 'ship_destroyed': {
          const v = this.visuals.get(e.shipId);
          // No hero mesh, so no staged death is shown: the breakup is now.
          if (!v && isStagedDeath(e.role)) this.onBreakup?.(e.role, new THREE.Vector3(e.pos.x * KM, e.pos.y * KM, e.pos.z * KM));
          if (v && this.rig.mode === 'cinematic' && this.cine.age >= 5 && (e.role === 'dreadnought' || e.role === 'reaper_capital' || e.role === 'carrier')) {
            // Cinematic director jumps to capital ship deaths.
            this.cine = { fromId: e.shipId, toId: undefined, age: 0, hold: 7, wreck: true };
          }
          break;
        }
        default:
          break;
      }
    }
  }

  // ------------------------------------------------------------- cameras

  private subjectFor(ship: ShipState | undefined): CameraSubject | undefined {
    if (!ship) return undefined;
    const v = this.visuals.get(ship.id);
    return {
      position: v && v.built.group.visible ? v.built.group.position.clone() :
        new THREE.Vector3(ship.pos.x, ship.pos.y, ship.pos.z).multiplyScalar(KM),
      velocity: new THREE.Vector3(ship.vel.x, ship.vel.y, ship.vel.z).multiplyScalar(KM),
      heading: new THREE.Vector3(ship.heading.x, ship.heading.y, ship.heading.z),
      size: v?.built.lengthUnits ?? getShipTemplate(ship.classId).lengthUnits,
    };
  }

  sideCentre(side: 'A' | 'B'): THREE.Vector3 {
    const c = new THREE.Vector3();
    let n = 0;
    for (const s of this.sim.ships) {
      if (s.side !== side || !s.alive || s.escaped || s.role === 'fighter') continue;
      c.add(this.tmpA.set(s.pos.x, s.pos.y, s.pos.z).multiplyScalar(KM));
      n++;
    }
    return n > 0 ? c.multiplyScalar(1 / n) : c;
  }

  private updateCamera(dt: number): void {
    const sim = this.sim;
    const fleetCentre = this.sideCentre(sim.config.perspectiveSide);
    let subject: CameraSubject | undefined;
    if (this.rig.mode === 'follow') {
      const id = this.followId ?? [...this.selectedIds][0];
      const ship = id ? sim.getShip(id) : undefined;
      subject = this.subjectFor(ship && ship.alive ? ship : undefined);
      if (!subject) {
        // Default to the most valuable friendly ship.
        const best = sim.ships.filter((s) => s.alive && !s.escaped && s.side === sim.config.perspectiveSide).sort((a, b) => b.pointValue - a.pointValue)[0];
        if (best) this.followId = best.id;
        subject = this.subjectFor(best);
      }
    } else if (this.rig.mode === 'reaper') {
      const id = this.followId;
      let ship = id ? sim.getShip(id) : undefined;
      if (!ship || !ship.alive || ship.faction !== 'reaper') {
        ship = sim.ships.filter((s) => s.alive && !s.escaped && s.faction === 'reaper').sort((a, b) => b.pointValue - a.pointValue)[0];
        if (ship) this.followId = ship.id;
      }
      subject = this.subjectFor(ship);
    }
    let gunnery: { position: THREE.Vector3; aim: THREE.Vector3; signalLost?: boolean } | undefined;
    if (this.rig.mode === 'gunnery') {
      const id = this.gunneryLockedShipId ?? this.followId;
      const ship = id ? sim.getShip(id) : undefined;
      if (!ship || !ship.alive || ship.escaped || this.gunnerySignalLost) {
        // Never switch ship, barrel or target after signal loss. Hold the last
        // optical orientation until the user explicitly chooses another POV.
        const station = this.rig.camera.position.clone();
        const aim = station.clone().add(new THREE.Vector3(0,0,-1000).applyQuaternion(this.rig.camera.quaternion));
        gunnery = { position: station, aim, signalLost: true };
      }
      if (ship && ship.alive && !ship.escaped && !this.gunnerySignalLost) {
        // First-person optics always remain on the selected MAIN emitter.
        const weapon = primaryGunneryMount(ship);
        if (weapon) {
          // Match the smoothly rendered hull, without following AI targets.
          gunnery = gunneryFrame(ship, weapon, this.alpha, this.visuals.get(ship.id)?.built);
        }
      }
    }
    let cinematic: CinematicFrame | undefined;
    if (this.rig.mode === 'cinematic') {
      this.cine.hold -= dt;
      const from = this.cine.fromId ? sim.getShip(this.cine.fromId) : undefined;
      if (this.cine.hold <= 0 || !from || (!from.alive && !this.cine.wreck)) this.pickCinematicShot();
      const f = this.cine.fromId ? sim.getShip(this.cine.fromId) : undefined;
      const t = this.cine.toId ? sim.getShip(this.cine.toId) : undefined;
      const fs = this.subjectFor(f);
      if (fs) {
        cinematic = { from: fs, to: this.subjectFor(t && t.alive ? t : undefined), age: this.cine.age };
        const members = (this.cine.members ?? []).map(id => sim.getShip(id)).filter((s): s is ShipState => !!s && s.alive && !s.escaped);
        if (members.length >= 3) {
          const centre = new THREE.Vector3();
          for (const ship of members) centre.add(this.tmpA.set(ship.pos.x, ship.pos.y, ship.pos.z).multiplyScalar(KM));
          centre.multiplyScalar(1 / members.length);
          let radius = fs.size;
          for (const ship of members) radius = Math.max(radius, this.tmpA.set(ship.pos.x, ship.pos.y, ship.pos.z).multiplyScalar(KM).distanceTo(centre) + ship.lengthKm * KM * 0.6);
          cinematic.group = { centre, radius, heading: fs.heading };
        }
      }
    }
    let projectile: CameraSubject | undefined;
    if (this.rig.mode === 'projectile') {
      let p = this.projectileTrack ? sim.projectiles.find((x) => x.id === this.projectileTrack!.id) : undefined;
      if (!p) {
        p = [...sim.projectiles].sort((a, b) => b.weapon.damage - a.weapon.damage)[0];
        if (p) this.projectileTrack = { id: p.id };
      }
      if (p) {
        projectile = {
          position: new THREE.Vector3(p.pos.x, p.pos.y, p.pos.z).multiplyScalar(KM),
          velocity: new THREE.Vector3(p.vel.x, p.vel.y, p.vel.z).multiplyScalar(KM),
          heading: new THREE.Vector3(p.vel.x, p.vel.y, p.vel.z).normalize(),
          size: 2,
        };
      } else {
        // Between shots: hover near the biggest active beam or the fleet.
        const beamShip = sim.ships.find((s) => s.alive && s.weapons.some((w) => w.beamRemaining > 0 && w.def.kind === 'reaper_beam'));
        subject = this.subjectFor(beamShip);
        if (subject) {
          projectile = { position: subject.position.clone().addScaledVector(subject.heading, subject.size * 0.6), velocity: subject.heading.clone().multiplyScalar(50), heading: subject.heading, size: 2 };
        }
      }
    }
    this.rig.update(dt, { subject, cinematic, projectile, gunnery, fleetCentre });
  }

  private pickCinematicShot(): void {
    const pair = cinematicPair(this.sim.ships, this.directorRng, this.cine.fromId);
    if (!pair) return;
    const wide = this.cineShot++ % 3 === 0 && this.sim.ships.filter(s => s.alive && !s.escaped && s.role !== 'fighter').length >= 24;
    this.cine = { ...pair, age: 0, hold: 11 + this.directorRng.next() * 7,
      members: wide ? cinematicWing(this.sim.ships, pair.fromId) : undefined };
  }

  // ------------------------------------------------------------ picking

  /** Pick the ship nearest to a screen point (CSS px). */
  pick(x: number, y: number, width: number, height: number): ShipState | undefined {
    const cam = this.rig.camera;
    let best: ShipState | undefined;
    let bestD = Infinity;
    for (const ship of this.sim.ships) {
      if (!ship.alive || ship.escaped) continue;
      const p = this.tmpA.set(ship.pos.x * KM, ship.pos.y * KM, ship.pos.z * KM);
      const dist = cam.position.distanceTo(p);
      const radius = getShipTemplate(ship.classId).lengthUnits * 0.5;
      p.project(cam);
      if (p.z > 1 || p.z < -1) continue;
      const sx = (p.x * 0.5 + 0.5) * width;
      const sy = (-p.y * 0.5 + 0.5) * height;
      const radiusPx = Math.max(14, radius / Math.max(1, dist) * (height / (2 * Math.tan(cam.fov * Math.PI / 360))));
      const d = Math.hypot(sx - x, sy - y);
      if (d < radiusPx + 6 && d < bestD) { bestD = d; best = ship; }
    }
    return best;
  }

  /** Project a world position (km) to screen; returns undefined when behind the camera. */
  project(pos: { x: number; y: number; z: number }, width: number, height: number): { x: number; y: number; depth: number } | undefined {
    const p = this.tmpA.set(pos.x * KM, pos.y * KM, pos.z * KM);
    const depth = p.distanceTo(this.rig.camera.position);
    p.project(this.rig.camera);
    if (p.z > 1) return undefined;
    return { x: (p.x * 0.5 + 0.5) * width, y: (-p.y * 0.5 + 0.5) * height, depth };
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.composer?.setSize(width, height);
    this.rig.resize(width / Math.max(1, height));
  }

  render(): void {
    const started = performance.now();
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    const timer = this.gpuTimer;
    if (timer) {
      const previous = timer.pending[0];
      if (previous && timer.gl.getQueryParameter(previous, timer.gl.QUERY_RESULT_AVAILABLE)) {
        if (!timer.gl.getParameter(timer.disjoint)) {
          this.gpuFrameMs = timer.gl.getQueryParameter(previous, timer.gl.QUERY_RESULT) / 1e6;
        }
        timer.gl.deleteQuery(previous);
        timer.pending.shift();
      }
    }
    const query = timer && timer.pending.length < 3 ? timer.gl.createQuery() : null;
    if (query && timer) timer.gl.beginQuery(timer.elapsed, query);
    try {
      if (this.composer) this.composer.render();
      else this.renderer.render(this.scene, this.rig.camera);
    } finally {
      if (query && timer) {
        timer.gl.endQuery(timer.elapsed);
        timer.pending.push(query);
      }
    }
    this.renderCpuMs = performance.now() - started;
    this.drawCalls = this.renderer.info.render.calls;
    this.frameTriangles = this.renderer.info.render.triangles;
  }

  dispose(): void {
    if (this.env) { this.scene.remove(this.env.group); disposeEnvironment(this.env); }
    if (this.travelField) { this.scene.remove(this.travelField.points); this.travelField.dispose(); this.travelField = undefined; }
    this.effects.dispose();
    this.instances.dispose();
    if(this.gpuTimer)for(const query of this.gpuTimer.pending)this.gpuTimer.gl.deleteQuery(query);
    this.composer?.dispose();
    this.glowTex.dispose();
    for (const v of this.visuals.values()) {
      for (const glow of v.glows) glow.material.dispose();
      for (const mat of v.seamMats ?? []) mat.dispose();
      for (const mat of v.emberMats ?? []) mat.dispose();
      if (v.tinted && !v.removed) v.built.group.traverse(object => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh && mesh.name === 'hull') (mesh.material as THREE.Material).dispose();
      });
    }
    this.farPoints.geometry.dispose();
    (this.farPoints.material as THREE.Material).dispose();
    // The next battle reuses this canvas/context. Clear texture unpack flags
    // before its renderer creates typed-array 3D placeholder textures.
    this.renderer.resetState();
    this.renderer.dispose();
  }
}
