import * as THREE from 'three';

/**
 * Battle camera rig. All modes write a desired position/look target; the rig
 * smooths toward them so switching modes produces a transition rather than a
 * cut. Positions are in render units.
 */
export type CameraMode = 'tactical' | 'cinematic' | 'follow' | 'free' | 'projectile' | 'reaper' | 'command' | 'gunnery';

export const CAMERA_MODE_LABELS: Record<CameraMode, string> = {
  tactical: 'Tactical',
  cinematic: 'Cinematic',
  follow: 'Ship follow',
  free: 'Free',
  projectile: 'Projectile',
  reaper: 'Reaper',
  command: 'Command',
  gunnery: 'First-person gunnery',
};

export interface CameraSubject {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  heading: THREE.Vector3;
  size: number;
}

export interface CinematicFrame {
  from: CameraSubject;
  to?: CameraSubject;
  age: number;
  group?: { centre: THREE.Vector3; radius: number; heading: THREE.Vector3 };
}

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = 'tactical';
  /** Optical magnification never changes simulation, targeting or camera mount. */
  gunneryZoomed = false;
  /** Orbit state for tactical camera. */
  yaw = 0.6;
  pitch = 0.55;
  distance = 900;
  focus = new THREE.Vector3();
  /** Free camera state. */
  freePos = new THREE.Vector3(0, 300, -900);
  freeYaw = 0;
  freePitch = -0.2;
  /** Smoothing. */
  private desiredPos = new THREE.Vector3();
  private desiredLook = new THREE.Vector3();
  private currentLook = new THREE.Vector3();
  private transition = 0;
  private shake = 0;
  private readonly tmp = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(50, aspect, 1, 600_000);
    this.camera.position.set(0, 400, -1200);
    this.currentLook.set(0, 0, 0);
  }

  setMode(mode: CameraMode): void {
    if (mode === this.mode) return;
    if (mode === 'free') {
      // Start free flight from where the camera currently is.
      this.freePos.copy(this.camera.position);
      const dir = this.tmp.copy(this.currentLook).sub(this.camera.position).normalize();
      this.freeYaw = Math.atan2(dir.x, dir.z);
      this.freePitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
    }
    if (mode === 'follow') {
      // Chase view starts behind and slightly above the ship; dragging then orbits freely around it.
      this.yaw = 0;
      this.pitch = 0.15;
      this.distance = 320;
    }
    this.mode = mode;
    if (mode !== 'gunnery') {
      this.gunneryZoomed = false;
      this.camera.fov = 50;
      this.camera.updateProjectionMatrix();
    }
    // Optical gunnery must stay physically attached to the firing mount.
    this.transition = mode === 'gunnery' ? 0 : 1;
  }

  toggleGunneryZoom(): void {
    if (this.mode !== 'gunnery') return;
    this.gunneryZoomed = !this.gunneryZoomed;

  }

  addShake(amount: number): void {
    this.shake = Math.min(1, this.shake + amount);
  }

  // --- Input hooks (called by the controller).
  orbit(dx: number, dy: number): void {
    if (this.mode === 'gunnery') return; // Reticle is not a steering command.
    if (this.mode === 'free') {
      this.freeYaw -= dx * 0.003;
      this.freePitch = THREE.MathUtils.clamp(this.freePitch - dy * 0.003, -1.5, 1.5);
      return;
    }
    this.yaw -= dx * 0.005;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.005, -1.5, 1.5); // full orbit: above and below the plane
  }
  zoom(delta: number): void {
    if (this.mode === 'gunnery') return; // Explicit optical toggle only.
    this.distance = THREE.MathUtils.clamp(this.distance * Math.exp(delta * 0.0012), 6, 60_000);
  }
  pan(dx: number, dy: number): void {
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const k = this.distance * 0.0015;
    this.focus.addScaledVector(right, -dx * k).addScaledVector(fwd, -dy * k);
  }
  freeMove(forward: number, strafe: number, up: number, dt: number, fast: boolean): void {
    const speed = (fast ? 2500 : 600) * dt;
    const dir = new THREE.Vector3(Math.sin(this.freeYaw) * Math.cos(this.freePitch), Math.sin(this.freePitch), Math.cos(this.freeYaw) * Math.cos(this.freePitch));
    const right = new THREE.Vector3(Math.cos(this.freeYaw), 0, -Math.sin(this.freeYaw));
    this.freePos.addScaledVector(dir, forward * speed).addScaledVector(right, strafe * speed).addScaledVector(new THREE.Vector3(0, 1, 0), up * speed);
  }

  /**
   * Per-frame update. `subject` is the followed ship for follow/reaper
   * modes; `cinematic` supplies a framing pair; `projectile` is the tracked
   * round. Any may be undefined, in which case the rig falls back to tactical.
   */
  update(dt: number, opts: { subject?: CameraSubject; cinematic?: CinematicFrame; projectile?: CameraSubject; gunnery?: { position: THREE.Vector3; aim: THREE.Vector3; signalLost?: boolean }; fleetCentre: THREE.Vector3 }): void {
    const cam = this.camera;
    let instant = false;
    switch (this.mode) {
      case 'tactical': {
        this.desiredLook.copy(this.focus);
        const off = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)).multiplyScalar(this.distance);
        this.desiredPos.copy(this.focus).add(off);
        break;
      }
      case 'command': {
        this.desiredLook.copy(this.focus);
        this.desiredPos.copy(this.focus).add(new THREE.Vector3(Math.sin(this.yaw) * 0.08, 1, Math.cos(this.yaw) * 0.08).normalize().multiplyScalar(Math.max(this.distance, 1200)));
        break;
      }
      case 'gunnery': {
        const station = opts.gunnery;
        if (!station) return this.fallback(dt, opts.fleetCentre);
        if (station.signalLost) this.shake = 0;
        this.desiredPos.copy(station.position);
        this.desiredLook.copy(station.aim);
        instant = true;
        break;
      }
      case 'follow': {
        const s = opts.subject;
        if (!s) return this.fallback(dt, opts.fleetCentre);
        // Free orbit around the followed ship: yaw and pitch rotate the chase offset relative to its heading,
        // so dragging looks at it from any side, above or below; the wheel scales the chase distance.
        const h = Math.atan2(s.heading.x, s.heading.z);
        const dist = (s.size * 2.4 + 3) * THREE.MathUtils.clamp(this.distance / 320, 0.35, 5);
        const a = h + Math.PI + this.yaw;
        const off = new THREE.Vector3(Math.sin(a) * Math.cos(this.pitch), Math.sin(this.pitch) + 0.25, Math.cos(a) * Math.cos(this.pitch)).normalize().multiplyScalar(dist);
        this.desiredPos.copy(s.position).add(off);
        this.desiredLook.copy(s.position).addScaledVector(s.heading, s.size * 0.6);
        break;
      }
      case 'reaper': {
        const s = opts.subject;
        if (!s) return this.fallback(dt, opts.fleetCentre);
        // Looking out from above and behind the Reaper's hood along its heading.
        this.desiredPos.copy(s.position).addScaledVector(s.heading, -s.size * 0.15).add(new THREE.Vector3(0, s.size * 0.5, 0));
        this.desiredLook.copy(s.position).addScaledVector(s.heading, s.size * 6).add(new THREE.Vector3(0, -s.size * 0.3, 0));
        break;
      }
      case 'projectile': {
        const p = opts.projectile;
        if (!p) return this.fallback(dt, opts.fleetCentre);
        const dir = p.velocity.clone().normalize();
        const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
        this.desiredPos.copy(p.position).addScaledVector(dir, -40).addScaledVector(side, 14).add(new THREE.Vector3(0, 8, 0));
        this.desiredLook.copy(p.position).addScaledVector(dir, 60);
        instant = true;
        break;
      }
      case 'cinematic': {
        const c = opts.cinematic;
        if (!c) return this.fallback(dt, opts.fleetCentre);
        const from = c.from;
        const to = c.to;
        if (c.group) {
          const g = c.group;
          const forward = g.heading.clone().setY(0).normalize();
          if (forward.lengthSq() < 1e-6) forward.set(0, 0, 1);
          const side = new THREE.Vector3(forward.z, 0, -forward.x);
          const drift = Math.sin(c.age * 0.08) * 0.06;
          const back = Math.max(30, g.radius * 2.9 / Math.min(1, cam.aspect));
          const offset = forward.clone().negate().addScaledVector(side, 0.50 + drift).add(new THREE.Vector3(0, 0.35, 0)).normalize();
          this.desiredPos.copy(g.centre).addScaledVector(offset, back);
          this.desiredLook.copy(g.centre).addScaledVector(forward, g.radius * 0.12);
        } else if (to) {
          // Frame both subjects from a point off the line between them.
          const mid = from.position.clone().add(to.position).multiplyScalar(0.5);
          const line = to.position.clone().sub(from.position);
          const dist = line.length();
          const side = new THREE.Vector3().crossVectors(line.normalize(), new THREE.Vector3(0, 1, 0));
          if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
          else side.normalize();
          const drift = Math.sin(c.age * 0.10) * 0.07;
          const back = Math.max(from.size * 3, to.size * 3, dist * (0.72 + Math.abs(line.y) * 0.60), 20);
          this.desiredPos.copy(mid).addScaledVector(side, back * (1 + drift)).add(new THREE.Vector3(0, back * 0.30, 0)).addScaledVector(line, -dist * 0.12);
          this.desiredLook.copy(mid);
        } else {
          const ang = this.yaw + Math.sin(c.age * 0.08) * 0.25;
          const r = from.size * 3.2 + 8;
          this.desiredPos.copy(from.position).add(new THREE.Vector3(Math.sin(ang) * r, from.size * 1.0 + 3, Math.cos(ang) * r));
          this.desiredLook.copy(from.position);
        }
        break;
      }
      case 'free': {
        this.desiredPos.copy(this.freePos);
        const dir = new THREE.Vector3(Math.sin(this.freeYaw) * Math.cos(this.freePitch), Math.sin(this.freePitch), Math.cos(this.freeYaw) * Math.cos(this.freePitch));
        this.desiredLook.copy(this.freePos).add(dir.multiplyScalar(100));
        instant = true;
        break;
      }
    }
    this.apply(dt, instant);
  }

  private fallback(dt: number, centre: THREE.Vector3): void {
    this.focus.lerp(centre, 0.05);
    this.desiredLook.copy(this.focus);
    const off = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)).multiplyScalar(this.distance);
    this.desiredPos.copy(this.focus).add(off);
    this.apply(dt, false);
  }

  private apply(dt: number, instant: boolean): void {
    const cam = this.camera;
    if (this.transition > 0) this.transition = Math.max(0, this.transition - dt / 0.9);
    // Slower blend while transitioning, snappier otherwise.
    const k = instant && this.transition === 0 ? 1 : 1 - Math.exp(-dt * (this.transition > 0 ? 4 : 9));
    cam.position.lerp(this.desiredPos, k);
    this.currentLook.lerp(this.desiredLook, k);
    if (this.shake > 0) {
      const s = this.shake * 3;
      cam.position.add(new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s));
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    cam.lookAt(this.currentLook);
    // Optical magnification changes the lens only. Ease in tangent space so
    // the target reaches an exact 2x scale without moving the mounted camera.
    const targetTangent = Math.tan(THREE.MathUtils.degToRad(25)) /
      (this.mode === 'gunnery' && this.gunneryZoomed ? 2 : 1);
    const tangent = THREE.MathUtils.lerp(Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)),
      targetTangent, 1 - Math.exp(-Math.max(0, dt) * 12));
    cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(tangent));
    // Gun cameras sit immediately at the muzzle and need a close near plane.
    const d = cam.position.distanceTo(this.currentLook);
    cam.near = this.mode === 'gunnery' ? 0.06 : THREE.MathUtils.clamp(d * 0.002, 0.2, 50);
    cam.updateProjectionMatrix();
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
