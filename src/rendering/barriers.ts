import * as THREE from 'three';
import { merge } from './geometry';
import { getShipTemplate, type BuiltShip } from './ships';

/** Copy opaque hull geometry only. Template geometry is shared by every ship
 * and must never be inflated, disposed or otherwise mutated by an effect. */
export function buildBarrierGeometry(built: BuiltShip): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  built.group.updateWorldMatrix(true, true);
  const inverse = built.group.matrixWorld.clone().invert();
  built.group.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !['hull', 'hullDark', 'plates', 'arms', 'accent'].includes(mesh.name)) return;
    parts.push(mesh.geometry.clone().applyMatrix4(inverse.clone().multiply(mesh.matrixWorld)));
  });
  const geometry = merge(parts);
  for (const part of parts) part.dispose();
  geometry.computeBoundingBox();
  const centre = geometry.boundingBox!.getCenter(new THREE.Vector3());
  geometry.translate(-centre.x, -centre.y, -centre.z).scale(1.065, 1.065, 1.065).translate(centre.x, centre.y, centre.z);
  geometry.computeBoundingSphere();
  return geometry;
}

function shieldMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { colour: { value: new THREE.Color(0x79bbff) }, opacity: { value: 0 }, impact: { value: new THREE.Vector3() }, age: { value: 0 }, extent: { value: 1 }, collapse: { value: 0 } },
    vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main(){ vP=position; vN=normalize(normalMatrix*normal);
        vec4 mv=modelViewMatrix*vec4(position,1.0); vV=-mv.xyz; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 colour; uniform float opacity; uniform vec3 impact;
      uniform float age; uniform float extent; uniform float collapse;
      varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main(){
        float rim=pow(1.0-abs(dot(normalize(vN),normalize(vV))),2.0);
        float d=length(vP-impact)/max(extent,0.01);
        float wave=exp(-pow((d-age*1.5)/0.035,2.0));
        vec2 q=abs(mod(vP.xz/max(extent,0.01)*28.0,vec2(1.0,1.732))-vec2(0.5,0.866));
        float hex=smoothstep(0.38,0.47,max(dot(q,vec2(0.866,0.5)),q.y));
        float alpha=opacity*(0.12+rim*0.65+wave*(0.35+hex*0.45)+collapse*0.25);
        gl_FragColor=vec4(mix(colour,vec3(0.85,0.95,1.0),wave*0.65+collapse*0.25),min(0.8,alpha));
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide,
  });
}

interface Shell {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  source: THREE.Object3D;
  life: number;
  duration: number;
  strength: number;
}

/** One shell per affected ship, at most forty active shells, cached geometry
 * per hull class. Only actual damage/collapse events make shields visible. */
export class HullBarriers {
  readonly group = new THREE.Group();
  private cache = new Map<string, THREE.BufferGeometry>();
  private active = new Map<string, Shell>();
  private pool: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>[] = [];
  get activeCount(): number { return this.active.size; }
  get cachedClasses(): number { return this.cache.size; }

  hit(id: string, classId: string, source: THREE.Object3D, position: THREE.Vector3, damage: number, collapse = false): void {
    if (!(damage > 0) && !collapse) return;
    let shell = this.active.get(id);
    if (!shell && this.active.size >= 40) return;
    let geometry = this.cache.get(classId);
    if (!geometry) { geometry = buildBarrierGeometry(getShipTemplate(classId)); this.cache.set(classId, geometry); }
    source.updateWorldMatrix(true, false);
    if (!shell) {
      const mesh = this.pool.pop() ?? new THREE.Mesh(geometry, shieldMaterial());
      mesh.geometry = geometry; mesh.matrixAutoUpdate = false; mesh.visible = true;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      shell = { mesh, source, life: 0, duration: 0, strength: 0 };
      this.active.set(id, shell);
    }
    shell.source = source;
    shell.duration = collapse ? 0.85 : 0.5;
    shell.life = shell.duration;
    shell.strength = Math.min(0.9, 0.35 + Math.sqrt(Math.max(0, damage)) / 100);
    const u = shell.mesh.material.uniforms;
    u.impact.value.copy(source.worldToLocal(position.clone()));
    u.extent.value = Math.max(0.1, geometry.boundingSphere!.radius * 2);
    u.collapse.value = collapse ? 1 : 0;
    shell.mesh.matrix.copy(source.matrixWorld);
  }

  update(dt: number): void {
    for (const [id, shell] of this.active) {
      shell.life -= Math.max(0, dt);
      if (shell.life <= 0 || !shell.source.parent) {
        shell.mesh.visible = false; this.group.remove(shell.mesh); this.pool.push(shell.mesh); this.active.delete(id);
        continue;
      }
      shell.source.updateWorldMatrix(true, false);
      shell.mesh.matrix.copy(shell.source.matrixWorld);
      const u = shell.mesh.material.uniforms;
      u.age.value = shell.duration - shell.life;
      u.opacity.value = shell.strength * Math.pow(shell.life / shell.duration, 0.8);
    }
  }

  clear(): void {
    for (const shell of this.active.values()) { shell.mesh.visible = false; this.group.remove(shell.mesh); this.pool.push(shell.mesh); }
    this.active.clear();
  }

  dispose(): void {
    this.clear();
    for (const mesh of this.pool) mesh.material.dispose();
    this.pool = [];
    for (const geometry of this.cache.values()) geometry.dispose();
    this.cache.clear();
  }
}
