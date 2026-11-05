import * as THREE from 'three';
import { Rng } from '@/core/rng';
import { cinematicPair, cinematicWing } from './director';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { BattleSimulation } from '@/simulation/battle';
import { SIM_DT } from '@/simulation/battle';
import type { BattleEvent, ShipState } from '@/simulation/types';
import { getFaction } from '@/data/factions';
import { CameraRig, type CameraSubject, type CinematicFrame } from './cameras';
import { EffectsSystem } from './effects';
import { buildEnvironment, type EnvironmentBuild } from './environment';
import { KM } from './geometry';
import { instantiateShip, type BuiltShip } from './ships';
import { DETAIL_MESH_NAMES, lodLevel, type LodLevel } from './lod';
import { weaponBeamOrigin, weaponFlashPose } from './weaponFlash';

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
}

export interface GraphicsSettings {
  quality: 'low' | 'medium' | 'high';
  showEngineGlow: boolean;
  pixelRatioCap: number;
  /** Distance-based level of detail (default on). */
  lod?: boolean;
}

// Shared GPU point buffer for formations beyond detailed mesh range.
const MAX_FAR_POINTS = 16384;

export class BattleView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly effects = new EffectsSystem();
  readonly visuals = new Map<string, ShipVisual>();
  env!: EnvironmentBuild;
  sim: BattleSimulation;
  /** Interpolation alpha within the current fixed step (0..1). */
  alpha = 0;
  selectedIds = new Set<string>();
  followId?: string;
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
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: settings.quality !== 'low', powerPreference: 'high-performance', logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.pixelRatioCap));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.rig = new CameraRig(canvas.clientWidth / Math.max(1, canvas.clientHeight));
    // Image-based lighting so metallic hull plating reads as metal rather than
    // black: a neutral PMREM environment at low intensity.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
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

    this.sunLight = new THREE.DirectionalLight(0xfff2e0, 2.6);
    this.scene.add(this.sunLight);
    this.scene.add(new THREE.HemisphereLight(0x8fb4ff, 0x1a1420, 0.7));
    this.scene.add(new THREE.AmbientLight(0x404a60, 0.45));
    // Camera-relative fill so hulls stay readable when viewed against the sun.
    this.fillLight = new THREE.DirectionalLight(0xb8c8e8, 0.9);
    this.scene.add(this.fillLight, this.fillLight.target);
    this.scene.add(this.effects.group);
    const farGeom = new THREE.BufferGeometry();
    farGeom.setAttribute('position', new THREE.BufferAttribute(this.farPositions, 3));
    farGeom.setAttribute('color', new THREE.BufferAttribute(this.farColours, 3));
    farGeom.setDrawRange(0, 0);
    this.farPoints = new THREE.Points(farGeom, new THREE.PointsMaterial({ size: 2.2, vertexColors: true, map: this.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    this.farPoints.frustumCulled = false;
    this.farPoints.name = 'far-points';
    this.scene.add(this.farPoints);
    this.bind(sim);
  }

  /** Attach to a (new) simulation, rebuilding the scene content. */
  bind(sim: BattleSimulation): void {
    this.sim = sim;
    for (const v of this.visuals.values()) this.scene.remove(v.built.group);
    this.visuals.clear();
    this.effects.clear();
    this.nextBeamShieldAt.clear();
    if (this.env) this.scene.remove(this.env.group);
    this.env = buildEnvironment(sim.config.environment);
    this.scene.add(this.env.group);
    this.sunLight.position.copy(this.env.sunDirection).multiplyScalar(10_000);
    this.sunLight.target.position.set(0, 0, 0);
    this.scene.add(this.sunLight.target);
    for (const s of sim.ships) this.ensureVisual(s);
    sim.onEvent = (e) => this.eventQueue.push(e);
    this.selectedIds.clear();
    this.followId = undefined;
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
    v = { ship, built, glows, removed: false, tinted: false, lod: 'full' };
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
    // Subtle bank for small ships based on lateral velocity.
    if (s.role === 'fighter' || s.role === 'frigate') {
      const right = this.tmpB.set(this.tmpA.z, 0, -this.tmpA.x);
      const lat = s.vel.x * right.x + s.vel.z * right.z;
      g.rotateZ(-lat * (s.role === 'fighter' ? 0.5 : 0.25));
    }
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
    for (const ship of sim.ships) {
      const v = this.ensureVisual(ship);
      if (v.removed) continue;
      if (!ship.alive) {
        this.updateDying(v, dt);
        continue;
      }
      if (ship.escaped) {
        v.built.group.visible = false;
        continue;
      }
      this.placeVisual(v, alpha);
      // Level of detail by distance; far ships collapse into the shared point cloud.
      const dist = cam.distanceTo(v.built.group.position);
      const level = lodLevel(dist, v.built.lengthUnits, ship.role, lodOn);
      this.applyLod(v, level);
      this.lodCounts[level]++;
      if (level === 'point' && far < MAX_FAR_POINTS) {
        const p = v.built.group.position;
        this.farPositions[far * 3] = p.x;
        this.farPositions[far * 3 + 1] = p.y;
        this.farPositions[far * 3 + 2] = p.z;
        this.tmpColour.setHex(getFaction(ship.faction).engineColourHex);
        this.farColours[far * 3] = this.tmpColour.r;
        this.farColours[far * 3 + 1] = this.tmpColour.g;
        this.farColours[far * 3 + 2] = this.tmpColour.b;
        far++;
        continue;
      }
      // Engine glow intensity follows throttle.
      const speedFrac = Math.min(1, Math.hypot(ship.vel.x, ship.vel.y, ship.vel.z) / Math.max(0.01, ship.maxSpeed));
      if (level === 'full') for (const gl of v.glows) (gl.material as THREE.SpriteMaterial).opacity = 0.35 + 0.6 * speedFrac * ship.subsystems.engines;
      // Damage tint.
      const hullFrac = ship.hull / ship.maxHull;
      if (hullFrac < 0.6 && !v.tinted) this.tintDamage(v);
      if (v.tinted) {
        const t = 1 - hullFrac;
        v.built.group.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
          if (m && (m as THREE.MeshStandardMaterial).isMeshStandardMaterial && o.name === 'hull') {
            m.emissive.setRGB(0.25 * t * (0.6 + 0.4 * Math.sin(sim.time * 7 + ship.id.length)), 0.05 * t, 0);
            m.emissiveIntensity = 1;
          }
        });
      }
    }
    const farGeom = this.farPoints.geometry;
    farGeom.setDrawRange(0, far);
    (farGeom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (farGeom.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    this.farPoints.visible = far > 0;
    // Effects from sim state.
    const tracers = sim.projectiles.map((p) => ({ pos: p.pos, vel: p.vel, big: p.weapon.damage >= 600 }));
    this.effects.setTracers(tracers, alpha, SIM_DT);
    this.effects.setMissiles(sim.missiles.filter((m) => m.alive).map((m) => ({ pos: m.pos, vel: m.vel })), alpha, SIM_DT);
    const beams: { start: THREE.Vector3; end: THREE.Vector3; kind: 'thanix' | 'reaper_beam'; intensity: number }[] = [];
    for (const ship of sim.ships) {
      if (!ship.alive) continue;
      for (const w of ship.weapons) {
        if (w.beamRemaining > 0 && w.beamStart && w.beamEnd) {
          const kind = w.def.kind === 'thanix' ? 'thanix' : 'reaper_beam';
          const v = this.visuals.get(ship.id);
          // Eyes and narrow forward projectors use their model muzzle;
          // turreted lance decks use the actual visible-hull hardpoint.
          let start: THREE.Vector3;
          if (v) start = weaponBeamOrigin(v.built.group, v.built.muzzle, w, ship.faction === 'reaper');
          else start = new THREE.Vector3(w.beamStart.x * KM, w.beamStart.y * KM, w.beamStart.z * KM);
          const t = w.beamTargetId ? sim.getShip(w.beamTargetId) : undefined;
          const end = w.beamHit && t ? new THREE.Vector3(t.pos.x * KM, t.pos.y * KM, t.pos.z * KM) : new THREE.Vector3(w.beamEnd.x * KM, w.beamEnd.y * KM, w.beamEnd.z * KM);
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
    }
    this.effects.setBeams(beams);
    this.effects.setPointDefence(sim.flashes.map((f) => ({ from: new THREE.Vector3(f.from.x * KM, f.from.y * KM, f.from.z * KM), to: new THREE.Vector3(f.to.x * KM, f.to.y * KM, f.to.z * KM), reaper: f.kind === 'reaper_pd' })));
    this.effects.update(dt);

    // Camera.
    this.cine.age += dt;
    this.updateCamera(dt);
    // Fill light rides with the camera.
    this.fillLight.position.copy(this.rig.camera.position);
    this.fillLight.target.position.copy(this.rig.camera.position).add(this.rig.camera.getWorldDirection(this.tmpB).multiplyScalar(100));
    // Sky objects follow the camera so the starfield never parallaxes.
    for (const o of this.env.skyObjects) if (o.name !== 'sun') o.position.copy(this.rig.camera.position);
    this.env.group.getObjectByName('sun')?.position.copy(this.rig.camera.position).addScaledVector(this.env.sunDirection, 150_000);
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

  private processEvents(): void {
    const q = this.eventQueue;
    this.eventQueue = [];
    for (const e of q) {
      switch (e.type) {
        case 'weapon_fired': {
          if (e.kind !== 'mass_accelerator') break;
          const ship = this.sim.getShip(e.shipId);
          const v = ship ? this.visuals.get(ship.id) : undefined;
          if (!ship || !v) break;
          const w = ship.weapons[e.weaponIndex];
          if (!w) break;
          const big = w.def.damage >= 600;
          if (!big && Math.random() > 0.35) break; // thin out small-gun flashes
          const pose = weaponFlashPose(v.built.group, v.built.muzzle, w);
          this.effects.muzzleFlash(pose.position, pose.direction, big ? 6 : 1.4, ship.faction === 'reaper');
          if (big && this.rig.mode === 'projectile') this.projectileTrack = { id: this.sim.projectiles[this.sim.projectiles.length - 1]?.id ?? 0 };
          break;
        }
        case 'projectile_impact': {
          const t = this.sim.getShip(e.targetId);
          const v = t ? this.visuals.get(t.id) : undefined;
          const pos = new THREE.Vector3(e.pos.x * KM, e.pos.y * KM, e.pos.z * KM);
          if (v && e.barrierDamage > 3) this.effects.barriers.hit(t!.id, t!.classId, v.built.group, pos, e.barrierDamage);
          this.effects.impact(pos, e.barrierDamage, e.hullDamage, v ? v.built.lengthUnits * 0.55 : 2, () => (v && !v.removed ? v.built.group.position : undefined), e.damageType);
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
    if (!v) return undefined;
    return {
      position: v.built.group.position.clone(),
      velocity: new THREE.Vector3(ship.vel.x, ship.vel.y, ship.vel.z).multiplyScalar(KM),
      heading: new THREE.Vector3(ship.heading.x, ship.heading.y, ship.heading.z),
      size: v.built.lengthUnits,
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
    this.rig.update(dt, { subject, cinematic, projectile, fleetCentre });
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
    for (const v of this.visuals.values()) {
      if (!v.ship.alive || v.ship.escaped || v.removed) continue;
      const p = this.tmpA.copy(v.built.group.position).project(cam);
      if (p.z > 1) continue;
      const sx = (p.x * 0.5 + 0.5) * width;
      const sy = (-p.y * 0.5 + 0.5) * height;
      const dist = cam.position.distanceTo(v.built.group.position);
      const radiusPx = Math.max(14, ((v.built.lengthUnits * 0.5) / Math.max(1, dist)) * (height / (2 * Math.tan((cam.fov * Math.PI) / 360))));
      const d = Math.hypot(sx - x, sy - y);
      if (d < radiusPx + 6 && d < bestD) {
        bestD = d;
        best = v.ship;
      }
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
    this.rig.resize(width / Math.max(1, height));
  }

  render(): void {
    this.renderer.render(this.scene, this.rig.camera);
    this.drawCalls = this.renderer.info.render.calls;
  }

  dispose(): void {
    this.effects.dispose();
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
