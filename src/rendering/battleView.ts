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
import { DETAIL_MESH_NAMES, lodLevel, type LodLevel } from './lod';
import { weaponBeamOrigin, weaponFlashPose } from './weaponFlash';
import { weaponWorldOffset } from '@/simulation/fireControl';
import { primaryGunneryMount, isMainGunShot } from './gunnery';
import { animateReaperRig, captureReaperRig, isArticulatedReaper, type ReaperRig } from './reaperMotion';

/**
 * Binds a BattleSimulation to a Three.js scene. The simulation owns all
 * state; this class only reads it (with interpolation between fixed steps)
 * and reacts to its events.
 */

export interface ShipVisual {
  ship: ShipState;
  built: BuiltShip;
  glows: THREE.Sprite[];
  dying?: { timer: number; duration: number; nextSecondary: number };
  removed: boolean;
  /** Unique materials for damage tinting (cloned lazily on first damage). */
  tinted: boolean;
  /** Current level of detail. */
  lod: LodLevel;
  /** Per-vessel skeletal pivots, only allocated for nearby/selected Reapers. */
  reaperRig?: ReaperRig;
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
  private readonly farPositions = new Float32Array(MAX_FAR_POINTS * 3);
  private readonly farColours = new Float32Array(MAX_FAR_POINTS * 3);
  private readonly tmpColour = new THREE.Color();
  /** Draw calls of the last rendered frame. */
  drawCalls = 0;
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
    this.scene.add(this.effects.group, this.instances.group);
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

  update(dt: number, alpha: number): void {
    this.alpha = alpha;
    this.processEvents();
    const sim = this.sim;
    const cam = this.rig.camera.position;
    const lodOn = this.settings.lod !== false;
    let far = 0;
    this.lodCounts = { full: 0, reduced: 0, point: 0 };
    this.instances.begin(sim.ships);
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
      const dist = Math.hypot(px - cam.x, py - cam.y, pz - cam.z);
      const level = lodLevel(dist, lengthUnits, ship.role, lodOn);
      this.lodCounts[level]++;
      this.sphere.center.set(px, py, pz);
      this.sphere.radius = lengthUnits * 0.8 + 2;
      const onScreen = this.frustum.intersectsSphere(this.sphere);
      const priority = this.selectedIds.has(ship.id) || this.followId === ship.id ||
        this.cine.fromId === ship.id || this.cine.toId === ship.id;
      if (level === 'point') {
        if (existing) existing.built.group.visible = false;
        if (onScreen && far < MAX_FAR_POINTS) {
          this.farPositions[far * 3] = px;
          this.farPositions[far * 3 + 1] = py;
          this.farPositions[far * 3 + 2] = pz;
          this.tmpColour.setHex(getFaction(ship.faction).engineColourHex);
          this.farColours[far * 3] = this.tmpColour.r;
          this.farColours[far * 3 + 1] = this.tmpColour.g;
          this.farColours[far * 3 + 2] = this.tmpColour.b;
          far++;
        }
        continue;
      }
      if (!onScreen && !priority) {
        if (existing) existing.built.group.visible = false;
        continue;
      }
      const nearby = dist <= Math.max(75, lengthUnits * 22);
      const hero = priority || (nearby && nearVisuals < this.MAX_HERO_VISUALS);
      if (hero) {
        const v = existing ?? this.ensureVisual(ship);
        if (v.removed) continue;
        this.placeVisual(v, alpha);
        if (v.reaperRig) animateReaperRig(v.reaperRig, ship, sim.time, dt);
        this.applyLod(v, level);
        v.built.group.visible = true;
        nearVisuals++;
        const speedFrac = Math.min(1, Math.hypot(ship.vel.x, ship.vel.y, ship.vel.z) / Math.max(0.01, ship.maxSpeed));
        if (level === 'full') for (const gl of v.glows)
          (gl.material as THREE.SpriteMaterial).opacity = 0.35 + 0.6 * speedFrac * ship.subsystems.engines;
        const hullFrac = ship.hull / ship.maxHull;
        if (hullFrac < 0.6 && !v.tinted) this.tintDamage(v);
        if (v.tinted) {
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
          const intensity = kind === 'reaper_beam' ? (ship.role === 'reaper_capital' ? 1.3 : 0.7) : 0.9;
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
    v.built.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.name === 'hull') mesh.material = (mesh.material as THREE.Material).clone();
    });
    v.tinted = true;
  }

  private updateDying(v: ShipVisual, dt: number): void {
    const ship = v.ship;
    if (!v.dying) {
      const big = ship.role === 'dreadnought' || ship.role === 'carrier' || ship.role === 'reaper_capital';
      v.dying = { timer: 0, duration: big ? 2.2 : ship.role === 'cruiser' || ship.role === 'reaper_destroyer' ? 0.9 : 0.15, nextSecondary: 0 };
      if (!big && v.dying.duration < 0.2) {
        this.finishDeath(v);
        return;
      }
    }
    const d = v.dying;
    d.timer += dt;
    // Keep drifting on last velocity, shedding secondary explosions.
    v.built.group.position.add(this.tmpA.set(ship.vel.x, ship.vel.y, ship.vel.z).multiplyScalar(KM * dt * 0.6));
    v.built.group.rotateX(dt * 0.05);
    if (d.timer >= d.nextSecondary) {
      d.nextSecondary = d.timer + 0.12 + Math.random() * 0.25;
      const p = v.built.group.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * v.built.lengthUnits, (Math.random() - 0.5) * v.built.lengthUnits * 0.3, (Math.random() - 0.5) * v.built.lengthUnits));
      this.effects.secondary(p, v.built.lengthUnits * 0.5);
    }
    if (d.timer >= d.duration) this.finishDeath(v);
  }

  private finishDeath(v: ShipVisual): void {
    const ship = v.ship;
    const pos = v.built.group.position.clone();
    const pieces: THREE.Object3D[] = [];
    // Break the model apart: each merged part becomes a debris chunk.
    if (ship.role !== 'fighter') {
      for (const child of [...v.built.group.children]) {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          const original = mesh.material as THREE.Material;
          mesh.material = original.clone();
          if (v.tinted && mesh.name === 'hull') original.dispose();
          pieces.push(mesh);
        }
      }
    }
    const vel = new THREE.Vector3(ship.vel.x, ship.vel.y, ship.vel.z).multiplyScalar(KM * 0.5);
    this.effects.explosion(pos, v.built.lengthUnits, ship.faction === 'reaper', pieces, vel);
    for (const gl of v.glows) gl.visible = false;
    this.scene.remove(v.built.group);
    v.removed = true;
    const camDist = this.rig.camera.position.distanceTo(pos);
    this.rig.addShake(Math.min(1, (v.built.lengthUnits * 30) / Math.max(50, camDist)));
    if (this.followId === ship.id) this.followId = undefined;
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
    let gunnery: { position: THREE.Vector3; aim: THREE.Vector3 } | undefined;
    if (this.rig.mode === 'gunnery') {
      let ship = this.followId ? sim.getShip(this.followId) : undefined;
      if ((!ship || !ship.alive || ship.escaped) && this.gunnerySignalLost) {
        // Hold the last optical orientation while the ship's feed drops.
        const station=this.rig.camera.position.clone();
        const aim=station.clone().add(new THREE.Vector3(0,0,-1000).applyQuaternion(this.rig.camera.quaternion));
        gunnery={position:station,aim};
      } else if (!ship || !ship.alive || ship.escaped) {
        // Fallback picks one persistent live warship, never a random camera cut.
        ship = sim.ships.find(s => s.alive && !s.escaped &&
          s.side === sim.config.perspectiveSide && s.role === 'dreadnought') ??
          sim.ships.find(s => s.alive && !s.escaped &&
          s.side === sim.config.perspectiveSide && s.weapons.some(w => !w.def.antiSmall));
        this.followId = ship?.id;
        this.gunneryWeaponIndex = undefined;
      }
      if (ship && ship.alive && !ship.escaped && !this.gunnerySignalLost) {
        // First-person optics always remain on the selected MAIN emitter.
        const weapon = primaryGunneryMount(ship);
        if (weapon) {
          // The weapon offset and selected target come from the current sim tick.
          const pos = weaponWorldOffset(ship, weapon);
          const interpolation = Math.max(0, Math.min(1, this.alpha));
          const fwd = new THREE.Vector3(ship.heading.x, ship.heading.y, ship.heading.z).normalize();
          const station = new THREE.Vector3(
            (pos.x + (ship.prevPos.x - ship.pos.x) * (1 - interpolation)) * KM,
            (pos.y + (ship.prevPos.y - ship.pos.y) * (1 - interpolation)) * KM,
            (pos.z + (ship.prevPos.z - ship.pos.z) * (1 - interpolation)) * KM
          ).addScaledVector(fwd, Math.max(0.18, ship.radiusKm * KM * 0.2));
          const targetId = weapon.beamRemaining > 0 && weapon.beamTargetId ?
            weapon.beamTargetId : ship.targetId;
          const target = targetId ? sim.getShip(targetId) : undefined;
          const aim = target && target.alive && !target.escaped ?
            new THREE.Vector3(target.pos.x, target.pos.y, target.pos.z).multiplyScalar(KM) :
            station.clone().addScaledVector(fwd, 2000);
          // Optical alignment is observational; the combat solver still
          // determines if the actual mount can fire or hit the target.
          gunnery = { position: station, aim };
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
