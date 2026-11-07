import * as THREE from 'three';
import { Rng } from '@/core/rng';
import { KM } from './geometry';
import { HullBarriers } from './barriers';

/**
 * Pooled visual effects: tracer projectiles, beams, impact flashes, barrier
 * shimmer, explosions (sprite bursts + debris) and point-defence laser
 * flashes. Everything is driven from simulation events and state, so the
 * visuals never disagree with the results.
 */

function radialTexture(inner: string, mid: string, outer: string, size = 128): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.12, mid);
  g.addColorStop(0.45, outer.replace(/[\d.]+\)$/, '0.18)'));
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

interface Spark {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
  color: THREE.Color;
}

interface Debris {
  mesh: THREE.Object3D;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  maxLife: number;
}

export class EffectsSystem {
  readonly group = new THREE.Group();
  private readonly rng = new Rng('fx');
  private readonly flashTex = radialTexture('rgba(255,255,255,1)', 'rgba(255,220,160,0.7)', 'rgba(255,120,40,0)');
  private readonly fireTex = radialTexture('rgba(255,250,230,1)', 'rgba(255,150,60,0.8)', 'rgba(120,30,10,0)');
  private readonly smokeTex = radialTexture('rgba(80,80,90,0.9)', 'rgba(40,40,50,0.5)', 'rgba(0,0,0,0)');
  private readonly blueTex = radialTexture('rgba(220,240,255,1)', 'rgba(120,180,255,0.7)', 'rgba(40,80,200,0)');
  private readonly redTex = radialTexture('rgba(255,240,230,1)', 'rgba(255,80,40,0.8)', 'rgba(120,10,0,0)');

  private sparks: Spark[] = [];
  private debris: Debris[] = [];
  readonly barriers = new HullBarriers();
  private spritePool: THREE.Sprite[] = [];
  private nuclearRings: { mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; life: number; size: number }[] = [];
  private ringPool: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly nuclearRingGeometry = new THREE.TorusGeometry(1, 0.025, 5, 64);
  get nuclearRingCount(): number { return this.nuclearRings.length; }

  // Tracers (instanced).
  private readonly tracerCapacity = 8192;
  private tracerMax = 4096;
  private missileMax = 2048;
  private beamMax = 256;
  private pdMax = 2048;
  private readonly tracerMesh: THREE.InstancedMesh;
  private readonly tracerDummy = new THREE.Object3D();

  // Beams.
  private readonly beamPool: { core: THREE.Mesh; glow: THREE.Mesh; impact: THREE.Sprite }[] = [];
  private readonly beamGeometry = new THREE.CylinderGeometry(1,1,1,10,1,true);
  private readonly beamMid = new THREE.Vector3();
  private readonly beamCoreMatReaper = new THREE.MeshBasicMaterial({ color: 0xfff0e0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  private readonly beamGlowMatReaper = new THREE.MeshBasicMaterial({ color: 0xff1738, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
  private readonly beamCoreMatThanix = new THREE.MeshBasicMaterial({ color: 0xf0f8ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  private readonly beamGlowMatThanix = new THREE.MeshBasicMaterial({ color: 0x4fa0ff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false });

  // Point defence lines.
  private readonly pdGeometry = new THREE.BufferGeometry();
  private readonly pdPositions = new Float32Array(4096 * 6);
  private readonly pdColors = new Float32Array(4096 * 6);
  private readonly pdLines: THREE.LineSegments;

  // Missiles (instanced points).
  private readonly missileMesh: THREE.InstancedMesh;

  private readonly debrisGeo = [new THREE.BoxGeometry(1, 0.4, 1.6), new THREE.TetrahedronGeometry(0.8), new THREE.BoxGeometry(0.5, 0.5, 2.5)];
  private readonly debrisMat = new THREE.MeshStandardMaterial({ color: 0x55585f, metalness: 0.7, roughness: 0.5, emissive: 0x401000, emissiveIntensity: 0.6 });

  /** Point light reused for the biggest explosions. */
  readonly flashLight = new THREE.PointLight(0xffa060, 0, 400 * KM, 1.5);
  private flashLightLife = 0;

  constructor() {
    this.beamGeometry.rotateX(Math.PI/2);
    const tracerGeo = new THREE.BoxGeometry(0.1, 0.1, 1);
    const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tracerMesh = new THREE.InstancedMesh(tracerGeo, tracerMat, this.tracerCapacity);
    this.tracerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.tracerMesh.frustumCulled = false;
    this.tracerMesh.count = 0;
    this.group.add(this.tracerMesh);

    this.pdGeometry.setAttribute('position', new THREE.BufferAttribute(this.pdPositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.pdGeometry.setAttribute('color', new THREE.BufferAttribute(this.pdColors, 3).setUsage(THREE.DynamicDrawUsage));
    this.pdLines = new THREE.LineSegments(this.pdGeometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.pdLines.frustumCulled = false;
    this.pdGeometry.setDrawRange(0, 0);
    this.group.add(this.pdLines);

    const mGeo = new THREE.SphereGeometry(0.12, 6, 4);
    const mMat = new THREE.MeshBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    this.missileMesh = new THREE.InstancedMesh(mGeo, mMat, 4096);
    this.missileMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.missileMesh.frustumCulled = false;
    this.missileMesh.count = 0;
    this.group.add(this.missileMesh);

    this.group.add(this.flashLight, this.barriers.group);
  }

  /** Quality budgets affect visual sampling only, never projectile simulation. */
  configure(quality: 'low'|'medium'|'high'|'ultra'): void {
    const budgets={
      low:[768,384,96,256],medium:[2048,1024,160,768],
      high:[4096,2048,256,2048],ultra:[8192,4096,512,4096]
    } as const;
    [this.tracerMax,this.missileMax,this.beamMax,this.pdMax]=budgets[quality];
  }

  // ------------------------------------------------------------ primitives

  private getSprite(tex: THREE.Texture, color: number): THREE.Sprite {
    let s = this.spritePool.pop();
    if (!s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      this.group.add(s);
    }
    const m = s.material as THREE.SpriteMaterial;
    m.map = tex;
    m.depthTest = true;
    m.color.setHex(color);
    m.opacity = 1;
    m.needsUpdate = true;
    s.visible = true;
    return s;
  }

  private releaseSprite(s: THREE.Sprite): void {
    s.visible = false;
    this.spritePool.push(s);
  }

  private spark(pos: THREE.Vector3, vel: THREE.Vector3, life: number, startScale: number, endScale: number, tex: THREE.Texture, color: number): void {
    if (this.sparks.length >= 1200) return;
    const sprite = this.getSprite(tex, color);
    sprite.position.copy(pos);
    sprite.scale.setScalar(startScale);
    this.sparks.push({ sprite, vel, life, maxLife: life, startScale, endScale, color: new THREE.Color(color) });
  }

  // ------------------------------------------------------------ event hooks

  /** Muzzle flash for a mass accelerator shot. */
  muzzleFlash(pos: THREE.Vector3, dir: THREE.Vector3, size: number, reaper = false): void {
    this.spark(pos, dir.clone().multiplyScalar(size * 2), 0.1, size * 0.5, size * 1.3, reaper ? this.redTex : this.flashTex, 0xffffff);
  }

  /** Impact: barrier hit shimmer or hull hit sparks. */
  impact(pos: THREE.Vector3, barrierDamage: number, hullDamage: number, targetRadiusUnits: number, targetPos: () => THREE.Vector3 | undefined, damageType: string, glancing = false): void {
    const total = barrierDamage + hullDamage;
    if(glancing){
      // Glancing rounds leave a short grazing flare. Avoid using the same
      // large impact cloud as a direct HADES/NOVA penetration.
      const size=Math.min(1.6,.24+Math.sqrt(total)*.016);
      this.spark(pos,new THREE.Vector3(),.13,size*.4,size*1.1,
        barrierDamage>hullDamage?this.blueTex:this.fireTex,
        barrierDamage>hullDamage?0x86c7ff:0xe8a876);
      return;
    }
    const size = Math.min(8, 0.4 + Math.sqrt(total) * 0.09);
    if (barrierDamage > hullDamage && barrierDamage > 3) {
      this.spark(pos, new THREE.Vector3(), 0.2, size * 0.6, size * 1.4, this.blueTex, 0x9fd0ff);
    } else if (total > 0) {
      const tex = damageType === 'reaper_beam' ? this.redTex : this.fireTex;
      this.spark(pos, new THREE.Vector3(), 0.25, size * 0.7, size * 1.6, tex, 0xffffff);
      const n = Math.min(10, 2 + Math.floor(hullDamage / 120));
      for (let i = 0; i < n; i++) {
        const v = new THREE.Vector3(this.rng.gaussian(0, 1), this.rng.gaussian(0, 1), this.rng.gaussian(0, 1)).multiplyScalar(size * 2.5);
        this.spark(pos, v, 0.5 + this.rng.next() * 0.5, size * 0.25, size * 0.04, this.fireTex, 0xffb060);
      }
      if (hullDamage > 400) this.spark(pos, new THREE.Vector3(0, 0.5, 0), 2.5, size * 0.8, size * 2.6, this.smokeTex, 0x888888);
    }
  }

  /** Confirmed internal HADES burst: white flash, expanding shock ring and
   * incandescent vent jets. Render work is capped during mass battery salvos. */
  hadesBurst(position: THREE.Vector3, length: number, payloadDamage: number, heading: THREE.Vector3, velocity = new THREE.Vector3()): void {
    if (this.sparks.length >= 1200) return;
    const yieldScale = Math.min(1.5, Math.sqrt(Math.max(0, payloadDamage) / 1000));
    const size = Math.max(0.3, Math.min(6, length * 0.22) * yieldScale);
    const core = this.getSprite(this.blueTex, 0xffffff);
    core.position.copy(position); core.scale.setScalar(size);
    (core.material as THREE.SpriteMaterial).depthTest = false;
    this.sparks.push({ sprite: core, vel: velocity.clone(), life: 0.14, maxLife: 0.14, startScale: size * 0.5, endScale: size * 2.5, color: new THREE.Color(0xffffff) });
    if (payloadDamage >= 200 && this.nuclearRings.length < 12) {
      const mesh = this.ringPool.pop() ?? new THREE.Mesh(this.nuclearRingGeometry, new THREE.MeshBasicMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      mesh.visible = true; mesh.position.copy(position); mesh.scale.setScalar(size * 0.4);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), heading.clone().normalize());
      this.group.add(mesh); this.nuclearRings.push({ mesh, life: 0.85, size });
      this.flashLight.position.copy(position); this.flashLight.intensity = Math.max(this.flashLight.intensity, size * 6); this.flashLightLife = 0.2;
    }
    for (let i = 0; i < (payloadDamage >= 200 ? 10 : 3); i++) {
      const jet = new THREE.Vector3(this.rng.gaussian(), this.rng.gaussian(), this.rng.gaussian()).normalize();
      const origin = position.clone().addScaledVector(jet, Math.min(size * 0.5, length * 0.08));
      this.spark(origin, jet.multiplyScalar(size * 1.8).add(velocity), 1.0 + this.rng.next() * 1.4, size * 0.22, size * 0.04, this.fireTex, 0xffd6a0);
      if (i < 3) this.spark(origin, velocity.clone().add(new THREE.Vector3(0, size * 0.18, 0)), 2.0 + this.rng.next(), size * 0.4, size * 1.6, this.smokeTex, 0x8f99a6);
    }
  }

  /** Explosion scaled to the ship. Returns duration in seconds. */
  explosion(pos: THREE.Vector3, lengthUnits: number, reaper: boolean, pieces: THREE.Object3D[] = [], velocity = new THREE.Vector3()): number {
    const size = Math.max(1.5, lengthUnits * 0.6);
    const big = size > 4;
    const n = big ? 30 : size > 1.5 ? 14 : 6;
    for (let i = 0; i < n; i++) {
      const off = new THREE.Vector3(this.rng.gaussian(0, 1), this.rng.gaussian(0, 1), this.rng.gaussian(0, 1)).multiplyScalar(size * 0.45);
      const delay = this.rng.next() * (big ? 1.4 : 0.4);
      const life = 0.7 + this.rng.next() * 0.7 + delay;
      const s = size * (0.2 + this.rng.next() * 0.35);
      this.spark(pos.clone().add(off), velocity.clone().multiplyScalar(0.8), life, s * 0.3, s * 1.8, reaper && this.rng.chance(0.5) ? this.redTex : this.fireTex, 0xffffff);
    }
    // Core flash.
    this.spark(pos, velocity.clone(), 0.35, size * 0.8, size * 2.2, this.flashTex, 0xffffff);
    // Smoke / debris cloud.
    for (let i = 0; i < (big ? 10 : 4); i++) {
      const v = new THREE.Vector3(this.rng.gaussian(0, 1), this.rng.gaussian(0, 1), this.rng.gaussian(0, 1)).multiplyScalar(size * 0.5).add(velocity);
      this.spark(pos, v, 4 + this.rng.next() * 4, size * 0.4, size * 2.2, this.smokeTex, 0x9a9a9a);
    }
    // Debris: fling the ship's own mesh pieces plus generic fragments.
    const fragments = Math.min(40, Math.floor(size * 3));
    for (let i = 0; i < fragments && this.debris.length < 800; i++) {
      const g = this.debrisGeo[i % this.debrisGeo.length];
      const m = new THREE.Mesh(g, this.debrisMat);
      const s = size * (0.04 + this.rng.next() * 0.1);
      m.scale.setScalar(s);
      m.position.copy(pos).add(new THREE.Vector3(this.rng.gaussian(0, 1), this.rng.gaussian(0, 1), this.rng.gaussian(0, 1)).multiplyScalar(size * 0.3));
      this.group.add(m);
      this.debris.push({
        mesh: m,
        vel: new THREE.Vector3(this.rng.gaussian(0, 1), this.rng.gaussian(0, 1), this.rng.gaussian(0, 1)).multiplyScalar(size * 0.35).add(velocity),
        spin: new THREE.Vector3(this.rng.gaussian(0, 2), this.rng.gaussian(0, 2), this.rng.gaussian(0, 2)),
        life: 12 + this.rng.next() * 10,
        maxLife: 22,
      });
    }
    for (const piece of pieces) {
      this.group.attach(piece);
      this.debris.push({
        mesh: piece,
        vel: new THREE.Vector3(this.rng.gaussian(0, 1), this.rng.gaussian(0, 1), this.rng.gaussian(0, 1)).multiplyScalar(size * 0.12).add(velocity),
        spin: new THREE.Vector3(this.rng.gaussian(0, 0.6), this.rng.gaussian(0, 0.6), this.rng.gaussian(0, 0.6)),
        life: 10 + this.rng.next() * 6,
        maxLife: 16,
      });
    }
    if (big) {
      this.flashLight.position.copy(pos);
      this.flashLight.color.setHex(reaper ? 0xff6040 : 0xffb070);
      this.flashLight.intensity = 60 * size;
      this.flashLightLife = 1.2;
    }
    return big ? 2.6 : 1.2;
  }

  /** Secondary explosion along a dying capital ship (pre-destruction sequence). */
  secondary(pos: THREE.Vector3, size: number): void {
    this.spark(pos, new THREE.Vector3(), 0.5, size * 0.3, size * 1.1, this.fireTex, 0xffffff);
    for (let i = 0; i < 4; i++) {
      const v = new THREE.Vector3(this.rng.gaussian(0, 1), this.rng.gaussian(0, 1), this.rng.gaussian(0, 1)).multiplyScalar(size * 0.5);
      this.spark(pos, v, 0.8, size * 0.15, size * 0.03, this.fireTex, 0xffc080);
    }
  }

  // --------------------------------------------------------- per-frame sync

  /** Update tracers from simulation projectiles (positions in km). */
  setTracers(items: readonly { pos: { x: number; y: number; z: number }; vel: { x: number; y: number; z: number }; big?: boolean; weapon?: { damage: number } }[], alpha: number, dt: number): void {
    let n = 0;
    const dir = new THREE.Vector3();
    // Uniform subsampling retains fire from both sides of a huge battle.
    const stride=Math.max(1,Math.ceil(items.length/this.tracerMax));
    for (let i=0;i<items.length;i+=stride) {
      const it=items[i];
      const calibre=it.weapon?.damage??(it.big?900:50);
      const big=calibre>=600;
      if (n >= this.tracerMax) break;
      const px = (it.pos.x + it.vel.x * alpha * dt) * KM;
      const py = (it.pos.y + it.vel.y * alpha * dt) * KM;
      const pz = (it.pos.z + it.vel.z * alpha * dt) * KM;
      dir.set(it.vel.x, it.vel.y, it.vel.z);
      const speed = dir.length() * KM;
      dir.normalize();
      this.tracerDummy.position.set(px, py, pz);
      this.tracerDummy.lookAt(px + dir.x, py + dir.y, pz + dir.z);
      // Subtle calibre-dependent visual thickness: large HADES/NOVA
      // projectiles read as heavy axial slugs, not a global bloom flash.
      // Projectile origin, timing, trajectory and impact remain sim-owned.
      const superHeavy=calibre>=10000?
        Math.min(2.7,1.6+Math.log10(calibre/10000)*0.55):1;
      const len = Math.max(1.5, speed * 0.06) * (big ? 1.3 : 0.7) * Math.sqrt(superHeavy);
      const w = (big ? 1.1 : 0.45)*superHeavy;
      this.tracerDummy.scale.set(w, w, len);
      this.tracerDummy.updateMatrix();
      this.tracerMesh.setMatrixAt(n++, this.tracerDummy.matrix);
    }
    this.tracerMesh.count = n;
    this.tracerMesh.instanceMatrix.needsUpdate = true;
  }

  setMissiles(items: readonly { pos: { x: number; y: number; z: number }; vel: { x: number; y: number; z: number }; alive?: boolean }[], alpha: number, dt: number): void {
    let n = 0;
    const stride=Math.max(1,Math.ceil(items.length/this.missileMax));
    for (let i=0;i<items.length;i+=stride) {
      const it=items[i];
      if(it.alive===false)continue;
      if (n >= this.missileMax) break;
      this.tracerDummy.position.set((it.pos.x + it.vel.x * alpha * dt) * KM, (it.pos.y + it.vel.y * alpha * dt) * KM, (it.pos.z + it.vel.z * alpha * dt) * KM);
      this.tracerDummy.rotation.set(0, 0, 0);
      this.tracerDummy.scale.setScalar(2.2);
      this.tracerDummy.updateMatrix();
      this.missileMesh.setMatrixAt(n++, this.tracerDummy.matrix);
    }
    this.missileMesh.count = n;
    this.missileMesh.instanceMatrix.needsUpdate = true;
  }

  /** Active beams: start/end in render units. */
  /** Beam segments and contact sprites are allocated only once per visible
   * beam, then reused. No per-frame spark spawning, mesh geometry creation
   * or large white impact blooms when hundreds of Reapers fire together.
   */
  setBeams(beams: { start: THREE.Vector3; end: THREE.Vector3; kind: 'thanix' | 'reaper_beam'; intensity: number }[]): void {
    const visible=Math.min(beams.length,this.beamMax);
    for(let i=0;i<visible;i++){
      const beam=beams[i];
      let slot=this.beamPool[i];
      if(!slot){
        const core=new THREE.Mesh(this.beamGeometry,this.beamCoreMatReaper);
        const glow=new THREE.Mesh(this.beamGeometry,this.beamGlowMatReaper);
        const impact=new THREE.Sprite(new THREE.SpriteMaterial({
          map:this.redTex,color:0xffffff,transparent:true,opacity:.55,
          blending:THREE.AdditiveBlending,depthWrite:false,
        }));
        core.frustumCulled=false;glow.frustumCulled=false;
        this.group.add(core,glow,impact);
        slot={core,glow,impact};this.beamPool.push(slot);
      }
      const reaper=beam.kind==='reaper_beam';
      slot.core.material=reaper?this.beamCoreMatReaper:this.beamCoreMatThanix;
      slot.glow.material=reaper?this.beamGlowMatReaper:this.beamGlowMatThanix;
      const len=beam.start.distanceTo(beam.end);
      const mid=this.beamMid.copy(beam.start).add(beam.end).multiplyScalar(.5);
      const coreR=(reaper?.09:.05)*beam.intensity;
      slot.core.visible=true;
      slot.core.position.copy(mid);
      slot.core.lookAt(beam.end);
      slot.core.scale.set(coreR,coreR,len);
      slot.glow.visible=true;
      slot.glow.position.copy(mid);
      slot.glow.lookAt(beam.end);
      slot.glow.scale.set(coreR*2.6,coreR*2.6,len);
      slot.impact.visible=true;
      slot.impact.position.copy(beam.end);
      slot.impact.scale.setScalar(coreR*6);
      (slot.impact.material as THREE.SpriteMaterial).map=reaper?this.redTex:this.blueTex;
    }
    for(let i=visible;i<this.beamPool.length;i++){
      const slot=this.beamPool[i];slot.core.visible=false;slot.glow.visible=false;slot.impact.visible=false;
    }
  }

  /** Read fixed-tick GARDIAN/Reaper PD vectors directly; no GPU-frame
   * THREE.Vector3 allocations or array mapping per shot. Optional scale
   * converts km into render units. Uniform sampling retains all battle wings.
   */
  setPointDefence(lines: readonly { from: {x:number;y:number;z:number}; to: {x:number;y:number;z:number}; kind?: 'gardian'|'reaper_pd'; reaper?:boolean }[], positionScale = 1): void {
    let n=0;
    const capacity=this.pdMax;
    const stride=Math.max(1,Math.ceil(lines.length/capacity));
    for(let index=0;index<lines.length&&n<capacity;index+=stride){
      const l=lines[index];
      const i=n++*6;
      this.pdPositions[i]=l.from.x*positionScale;
      this.pdPositions[i+1]=l.from.y*positionScale;
      this.pdPositions[i+2]=l.from.z*positionScale;
      this.pdPositions[i+3]=l.to.x*positionScale;
      this.pdPositions[i+4]=l.to.y*positionScale;
      this.pdPositions[i+5]=l.to.z*positionScale;
      const reaper=l.reaper??(l.kind==='reaper_pd');
      const r=reaper?1:.5, g=reaper?.25:.95, b=reaper?.15:1;
      this.pdColors[i]=r;this.pdColors[i+1]=g;this.pdColors[i+2]=b;
      this.pdColors[i+3]=r;this.pdColors[i+4]=g;this.pdColors[i+5]=b;
    }
    this.pdGeometry.setDrawRange(0,n*2);
    (this.pdGeometry.attributes.position as THREE.BufferAttribute).needsUpdate=true;
    (this.pdGeometry.attributes.color as THREE.BufferAttribute).needsUpdate=true;
  }

  update(dt: number): void {
    const rings = [];
    for (const ring of this.nuclearRings) {
      ring.life -= dt;
      if (ring.life <= 0) { this.group.remove(ring.mesh); ring.mesh.visible = false; this.ringPool.push(ring.mesh); continue; }
      ring.mesh.scale.setScalar(ring.size * (0.4 + (1 - ring.life / 0.85) * 4.5));
      ring.mesh.material.opacity = 0.7 * ring.life / 0.85;
      rings.push(ring);
    }
    this.nuclearRings = rings;
    // Sparks.
    const keep: Spark[] = [];
    for (const s of this.sparks) {
      s.life -= dt;
      if (s.life <= 0) {
        this.releaseSprite(s.sprite);
        continue;
      }
      const t = 1 - s.life / s.maxLife;
      s.sprite.position.addScaledVector(s.vel, dt);
      s.sprite.scale.setScalar(s.startScale + (s.endScale - s.startScale) * t);
      (s.sprite.material as THREE.SpriteMaterial).opacity = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
      keep.push(s);
    }
    this.sparks = keep;
    // Debris.
    const keepD: Debris[] = [];
    for (const d of this.debris) {
      d.life -= dt;
      if (d.life <= 0) {
        this.removeDebris(d.mesh);
        continue;
      }
      d.mesh.position.addScaledVector(d.vel, dt);
      d.mesh.rotation.x += d.spin.x * dt;
      d.mesh.rotation.y += d.spin.y * dt;
      d.mesh.rotation.z += d.spin.z * dt;
      if (d.life < 2) {
        const f = d.life / 2;
        d.mesh.scale.multiplyScalar(Math.max(0.6, 1 - dt * 0.3));
        d.mesh.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.Material | undefined;
          if (m && m !== this.debrisMat && 'opacity' in m) {
            (m as THREE.Material).transparent = true;
            (m as THREE.Material).opacity = f;
          }
        });
      }
      keepD.push(d);
    }
    this.debris = keepD;
    this.barriers.update(dt);
    if (this.flashLightLife > 0) {
      this.flashLightLife -= dt;
      this.flashLight.intensity *= Math.max(0, 1 - dt * 3);
      if (this.flashLightLife <= 0) this.flashLight.intensity = 0;
    }
  }

  private removeDebris(object: THREE.Object3D): void {
    this.group.remove(object);
    object.traverse(child => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if (m !== this.debrisMat) m.dispose();
      // Debris pieces share ship-template or pooled geometry: never dispose it here.
    });
  }

  dispose(): void {
    this.clear();
    this.barriers.dispose();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.group.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
      if (mesh.material) for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(m);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of [this.flashTex, this.fireTex, this.smokeTex, this.blueTex, this.redTex]) texture.dispose();
    for (const geometry of this.debrisGeo) geometry.dispose();
    this.debrisMat.dispose();
    this.nuclearRingGeometry.dispose();
    for (const ring of this.ringPool) ring.material.dispose();
  }

  clear(): void {
    for (const s of this.sparks) this.releaseSprite(s.sprite);
    this.sparks = [];
    for (const d of this.debris) this.removeDebris(d.mesh);
    this.debris = [];
    this.barriers.clear();
    for (const ring of this.nuclearRings) { this.group.remove(ring.mesh); ring.mesh.visible = false; this.ringPool.push(ring.mesh); }
    this.nuclearRings = [];
    this.setBeams([]);
    this.setPointDefence([]);
    this.tracerMesh.count = 0;
    this.missileMesh.count = 0;
    this.flashLight.intensity = 0;
  }
}
