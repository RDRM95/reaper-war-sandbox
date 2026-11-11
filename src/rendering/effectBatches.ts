import * as THREE from 'three';

/**
 * Batched effect primitives. A battle keeps several hundred sparks and debris fragments alive at once; as
 * individual sprites and meshes each one was its own draw call (measured in the Codex build: about 700 sparks and
 * 200 fragments in 1,100 calls a frame at every fleet size). These draw each kind in one instanced call.
 */

const SPARK_VERTEX = /* glsl */`
attribute vec4 centre;
attribute vec4 tint;
varying vec2 vUv;
varying vec4 vTint;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vUv = uv;
  vTint = tint;
  // A camera-facing quad, as THREE.Sprite places it: offset in view space by the sprite's world size.
  vec4 mvPosition = modelViewMatrix * vec4(centre.xyz, 1.0);
  mvPosition.xy += position.xy * centre.w;
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
}
`;

const SPARK_FRAGMENT = /* glsl */`
uniform sampler2D map;
varying vec2 vUv;
varying vec4 vTint;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  gl_FragColor = vTint * texture2D(map, vUv);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Floats per spark in each instanced attribute. */
const STRIDE = 4;

/**
 * Additive camera-facing sprites that share one texture, drawn in one call. The shader follows three's own sprite
 * shader (view-space billboard, logarithmic depth, tone mapping and output colour space), so a batched spark is the
 * same picture as the `THREE.Sprite` it replaces. Fill it each frame: `begin`, `push` per spark, `commit`.
 */
export class SparkBatch {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly centres: Float32Array;
  private readonly tints: Float32Array;
  private readonly centreAttribute: THREE.InstancedBufferAttribute;
  private readonly tintAttribute: THREE.InstancedBufferAttribute;
  private used = 0;

  constructor(map: THREE.Texture, depthTest = true, readonly capacity = 1024) {
    this.centres = new Float32Array(capacity * STRIDE);
    this.tints = new Float32Array(capacity * STRIDE);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    this.centreAttribute = new THREE.InstancedBufferAttribute(this.centres, STRIDE).setUsage(THREE.DynamicDrawUsage);
    this.tintAttribute = new THREE.InstancedBufferAttribute(this.tints, STRIDE).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('centre', this.centreAttribute);
    geometry.setAttribute('tint', this.tintAttribute);
    geometry.instanceCount = 0;
    const material = new THREE.ShaderMaterial({
      uniforms: { map: { value: map } }, vertexShader: SPARK_VERTEX, fragmentShader: SPARK_FRAGMENT,
      transparent: true, depthWrite: false, depthTest, blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    // Sparks are spread across the whole battle: one bounding volume would be meaningless.
    this.mesh.frustumCulled = false;
    // Additive layers commute with each other; drawing after the other transparent layers keeps the result
    // independent of where the batch's origin happens to sort.
    this.mesh.renderOrder = 5;
  }

  get count(): number { return this.used; }

  begin(): void { this.used = 0; }

  /** Add one spark: world position, world size, linear colour and opacity. Returns false when the batch is full. */
  push(x: number, y: number, z: number, scale: number, r: number, g: number, b: number, opacity: number): boolean {
    if (this.used >= this.capacity) return false;
    const o = this.used * STRIDE;
    this.centres[o] = x; this.centres[o + 1] = y; this.centres[o + 2] = z; this.centres[o + 3] = scale;
    this.tints[o] = r; this.tints[o + 1] = g; this.tints[o + 2] = b; this.tints[o + 3] = opacity;
    this.used++;
    return true;
  }

  commit(): void {
    this.mesh.geometry.instanceCount = this.used;
    this.centreAttribute.needsUpdate = true;
    this.tintAttribute.needsUpdate = true;
  }

  /** Geometry and material only: the texture belongs to whoever made it. */
  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

/**
 * Debris fragments of one shape, drawn in one instanced call. Capacity doubles when it runs out, so a large battle
 * loses no fragments. Fill it each frame: `begin`, `push` per fragment, `commit`.
 */
export class FragmentBatch {
  mesh: THREE.InstancedMesh;
  private used = 0;

  constructor(private readonly geometry: THREE.BufferGeometry, private readonly material: THREE.Material, private readonly parent: THREE.Object3D, capacity = 128) {
    this.mesh = this.build(capacity);
  }

  private build(capacity: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    this.parent.add(mesh);
    return mesh;
  }

  get count(): number { return this.used; }
  get capacity(): number { return this.mesh.instanceMatrix.count; }

  begin(): void { this.used = 0; }

  push(matrix: THREE.Matrix4): void {
    if (this.used >= this.capacity) {
      const old = this.mesh;
      const next = this.build(this.capacity * 2);
      (next.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array as Float32Array);
      this.parent.remove(old);
      old.dispose();
      this.mesh = next;
    }
    this.mesh.setMatrixAt(this.used++, matrix);
  }

  commit(): void {
    this.mesh.count = this.used;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** The instance buffers only: geometry and material are shared and belong to the owner. */
  dispose(): void {
    this.parent.remove(this.mesh);
    this.mesh.dispose();
  }
}
