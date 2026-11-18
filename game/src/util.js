// SOLMAR HEAT — small shared helpers (seeded RNG, math, collisions).
// Everything in this file is written fresh for this game.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Circle (x,z,r) vs AABB {minX,maxX,minZ,maxZ}: push the circle out, return corrected pos.
export function collideCircleAABB(x, z, r, box) {
  const cx = clamp(x, box.minX, box.maxX);
  const cz = clamp(z, box.minZ, box.maxZ);
  const dx = x - cx, dz = z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2);
    return { x: cx + (dx / d) * r, z: cz + (dz / d) * r, nx: dx / d, nz: dz / d };
  }
  // Center inside the box: push out along the smallest penetration axis.
  const px = Math.min(x - box.minX, box.maxX - x);
  const pz = Math.min(z - box.minZ, box.maxZ - z);
  if (px < pz) return { x: x < (box.minX + box.maxX) / 2 ? box.minX - r : box.maxX + r, z, nx: x < (box.minX + box.maxX) / 2 ? -1 : 1, nz: 0 };
  return { x, z: z < (box.minZ + box.maxZ) / 2 ? box.minZ - r : box.maxZ + r, nx: 0, nz: z < (box.minZ + box.maxZ) / 2 ? -1 : 1 };
}

export function dist2(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
}
