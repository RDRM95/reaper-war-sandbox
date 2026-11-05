/**
 * Minimal mutable 3D vector used by the simulation. Kept independent from
 * Three.js so the simulation can run headless in tests and workers.
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const clone = (a: Vec3): Vec3 => ({ x: a.x, y: a.y, z: a.z });
export const set = (out: Vec3, x: number, y: number, z: number): Vec3 => {
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
};
export const copy = (out: Vec3, a: Vec3): Vec3 => set(out, a.x, a.y, a.z);
export const add = (a: Vec3, b: Vec3): Vec3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3): Vec3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: Vec3, s: number): Vec3 => v3(a.x * s, a.y * s, a.z * s);
export const addScaled = (a: Vec3, b: Vec3, s: number): Vec3 =>
  v3(a.x + b.x * s, a.y + b.y * s, a.z + b.z * s);
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 =>
  v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const lengthSq = (a: Vec3): number => a.x * a.x + a.y * a.y + a.z * a.z;
export const length = (a: Vec3): number => Math.sqrt(lengthSq(a));
export const distance = (a: Vec3, b: Vec3): number => length(sub(a, b));
export const distanceSq = (a: Vec3, b: Vec3): number => lengthSq(sub(a, b));
export const normalize = (a: Vec3): Vec3 => {
  const l = length(a);
  return l > 1e-9 ? scale(a, 1 / l) : v3(0, 0, 1);
};
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 =>
  v3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
export const clampLength = (a: Vec3, max: number): Vec3 => {
  const l = length(a);
  return l > max ? scale(a, max / l) : a;
};
export const equalsApprox = (a: Vec3, b: Vec3, eps = 1e-6): boolean =>
  Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps && Math.abs(a.z - b.z) < eps;

/** Rotate vector around Y axis by angle (radians). */
export const rotateY = (a: Vec3, angle: number): Vec3 => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return v3(a.x * c + a.z * s, a.y, -a.x * s + a.z * c);
};

/**
 * Compute a lead-intercept point for a projectile of given speed fired from
 * `shooter` at a target moving with constant velocity. Falls back to the
 * target position when no real solution exists.
 */
export function interceptPoint(
  shooter: Vec3,
  target: Vec3,
  targetVel: Vec3,
  projectileSpeed: number,
): Vec3 {
  const rel = sub(target, shooter);
  const a = dot(targetVel, targetVel) - projectileSpeed * projectileSpeed;
  const b = 2 * dot(rel, targetVel);
  const c = dot(rel, rel);
  let t: number;
  if (Math.abs(a) < 1e-6) {
    t = Math.abs(b) < 1e-9 ? 0 : -c / b;
  } else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) return clone(target);
    const sq = Math.sqrt(disc);
    const t1 = (-b - sq) / (2 * a);
    const t2 = (-b + sq) / (2 * a);
    t = Math.min(t1, t2) > 0 ? Math.min(t1, t2) : Math.max(t1, t2);
  }
  if (!(t > 0) || !Number.isFinite(t)) return clone(target);
  return addScaled(target, targetVel, t);
}
