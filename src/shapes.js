// shapes.js — geometry generators shared by every build pass.

import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const X = v3(1, 0, 0);
export const Y = v3(0, 1, 0);
export const Z = v3(0, 0, 1);
export const deg = THREE.MathUtils.degToRad;

/** Quaternion whose local +Z points along `zAxis`, local +Y as close to `upHint` as possible. */
export function orientZ(zAxis, upHint = Y) {
  const z = zAxis.clone().normalize();
  const up = Math.abs(upHint.dot(z)) > 0.999 ? X : upHint;
  const x = new THREE.Vector3().crossVectors(up, z).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** Point + outward normal on an origin-centred ellipsoid along a direction, lifted off the surface. */
export function onEllipsoid(radii, dir, lift = 0) {
  const d = dir.clone().normalize();
  const t = 1 / Math.sqrt((d.x / radii.x) ** 2 + (d.y / radii.y) ** 2 + (d.z / radii.z) ** 2);
  const p = d.multiplyScalar(t);
  const n = v3(p.x / radii.x ** 2, p.y / radii.y ** 2, p.z / radii.z ** 2).normalize();
  return { p: p.addScaledVector(n, lift), n };
}

/** Direction from yaw (0 = +Z, positive toward +X) and pitch (positive up), in radians. */
export const yawPitch = (yaw, pitch) =>
  v3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));

// ---------------------------------------------------------------------------
// Ellipsoid: subdivided icosphere (even triangles, no pole pinching),
// optional deform on the unit sphere, then scaled to its radii.
// ---------------------------------------------------------------------------

export function ellipsoid(radii, { detail = 6, deform } = {}) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-4); // shared vertices give smooth normals
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    if (deform) deform(v);
    p.setXYZ(i, v.x * radii[0], v.y * radii[1], v.z * radii[2]);
  }
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// Swept tube: a variable-radius tube through a chain of points.
//
//   path     centripetal Catmull-Rom spline through the points (no loops or
//            overshoot at sharp joints such as a bent elbow)
//   radius   smoothstep interpolation between the per-point radii, by arc length
//   frames   parallel transport from `up`, so cross-sections never twist or
//            flip as the pose changes
//   caps     hemispherical ends ('start', 'end', 'both' or 'none')
//
// Vertex count depends only on `rings`, so a posed limb can be re-swept every
// frame into the same geometry (pass it as `target`).
// ---------------------------------------------------------------------------

const RINGS_PER_UNIT = 56;
const _q = new THREE.Quaternion();

export function sweep(points, radii, opts = {}, target = null) {
  const { radial = 20, rings = 0, capRings = 6, caps = 'both', up = Z, phase = 0 } = opts;

  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  curve.arcLengthDivisions = Math.max(48, points.length * 32);
  const lengths = curve.getLengths();
  const total = lengths[lengths.length - 1];
  const last = lengths.length - 1;
  const ctrlU = points.map((_, i) => lengths[Math.round((i / (points.length - 1)) * last)] / total);

  const radiusAt = (u) => {
    let k = 0;
    while (k < ctrlU.length - 2 && u > ctrlU[k + 1]) k++;
    const span = ctrlU[k + 1] - ctrlU[k] || 1;
    const f = THREE.MathUtils.clamp((u - ctrlU[k]) / span, 0, 1);
    return radii[k] + (radii[k + 1] - radii[k]) * f * f * (3 - 2 * f);
  };

  const n = rings || Math.max(2, Math.round(total * RINGS_PER_UNIT));
  const capS = caps === 'start' || caps === 'both' ? capRings : 0;
  const capE = caps === 'end' || caps === 'both' ? capRings : 0;

  // 1. centre line samples with parallel-transported frames
  const frames = [];
  let prevT = null;
  let normal = null;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const P = curve.getPointAt(u);
    const T = curve.getTangentAt(u).normalize();
    if (!normal) {
      normal = up.clone().addScaledVector(T, -up.dot(T));
      if (normal.lengthSq() < 1e-6) normal = X.clone().addScaledVector(T, -X.dot(T));
      normal.normalize();
    } else {
      normal.applyQuaternion(_q.setFromUnitVectors(prevT, T));
      normal.addScaledVector(T, -normal.dot(T)).normalize();
    }
    frames.push({ P, T, N: normal.clone(), B: new THREE.Vector3().crossVectors(T, normal), r: radiusAt(u) });
    prevT = T;
  }

  // 2. ring list: start cap (apex → full radius), body, end cap (full → apex)
  const ringList = [];
  const capRing = (f, k, count, dir) => {
    const a = (Math.PI / 2) * (k / (count + 1)); // 0 = full radius, π/2 = apex
    return { ...f, P: f.P.clone().addScaledVector(f.T, dir * f.r * Math.sin(a)), r: f.r * Math.cos(a) };
  };
  for (let k = capS; k >= 1; k--) ringList.push(capRing(frames[0], k, capS, -1));
  ringList.push(...frames);
  for (let k = 1; k <= capE; k++) ringList.push(capRing(frames[n], k, capE, 1));

  const vertCount = ringList.length * radial + (capS ? 1 : 0) + (capE ? 1 : 0);
  const reuse = target && target.attributes.position.count === vertCount;
  const pos = reuse ? target.attributes.position.array : new Float32Array(vertCount * 3);

  let w = 0;
  const put = (v) => { pos[w++] = v.x; pos[w++] = v.y; pos[w++] = v.z; };
  const tmp = new THREE.Vector3();
  if (capS) put(frames[0].P.clone().addScaledVector(frames[0].T, -frames[0].r));
  for (const f of ringList) {
    for (let j = 0; j < radial; j++) {
      const a = phase + (j / radial) * Math.PI * 2;
      tmp.copy(f.P).addScaledVector(f.N, Math.cos(a) * f.r).addScaledVector(f.B, Math.sin(a) * f.r);
      put(tmp);
    }
  }
  if (capE) put(frames[n].P.clone().addScaledVector(frames[n].T, frames[n].r));

  if (reuse) {
    target.attributes.position.needsUpdate = true;
    target.computeVertexNormals();
    target.computeBoundingSphere();
    return target;
  }

  // 3. faces (outward winding)
  const idx = [];
  const base = capS ? 1 : 0;
  const at = (ring, j) => base + ring * radial + (j % radial);
  if (capS) for (let j = 0; j < radial; j++) idx.push(0, at(0, j + 1), at(0, j));
  for (let i = 0; i < ringList.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a0 = at(i, j), a1 = at(i, j + 1), b0 = at(i + 1, j), b1 = at(i + 1, j + 1);
      idx.push(a0, a1, b0, a1, b1, b0);
    }
  }
  if (capE) {
    const apex = vertCount - 1, lastRing = ringList.length - 1;
    for (let j = 0; j < radial; j++) idx.push(at(lastRing, j), at(lastRing, j + 1), apex);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  g.userData.rings = n; // pass back as `rings` to keep the vertex count fixed while posing
  return g;
}

/**
 * Closed solid of revolution about Y. `profile` is a list of [radius, y] from
 * the bottom centre to the top centre (first and last radius 0); vertices are
 * shared, so keep the profile tangent-continuous for smooth shading.
 */
export function lathe(profile, segments = 96) {
  const rings = profile.slice(1, -1);
  const pos = [0, profile[0][1], 0];
  for (const [r, y] of rings) {
    for (let j = 0; j < segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      pos.push(r * Math.sin(a), y, r * Math.cos(a));
    }
  }
  const top = pos.length / 3;
  pos.push(0, profile[profile.length - 1][1], 0);
  const at = (i, j) => 1 + i * segments + (j % segments);
  const idx = [];
  for (let j = 0; j < segments; j++) {
    idx.push(0, at(0, j + 1), at(0, j));
    for (let i = 0; i < rings.length - 1; i++) idx.push(at(i, j), at(i, j + 1), at(i + 1, j + 1), at(i, j), at(i + 1, j + 1), at(i + 1, j));
    idx.push(top, at(rings.length - 1, j), at(rings.length - 1, j + 1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Quarter-circle points from `from` to `to` around `centre` ([r, y] pairs, end included). */
export function arc(centre, from, to, steps = 6) {
  const [cx, cy] = centre;
  const a0 = Math.atan2(from[1] - cy, from[0] - cx), a1 = Math.atan2(to[1] - cy, to[0] - cx);
  const rad = Math.hypot(from[0] - cx, from[1] - cy);
  return Array.from({ length: steps }, (_, i) => {
    const a = a0 + ((a1 - a0) * (i + 1)) / steps;
    return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  });
}

/** Capsule hanging from its joint along −Y (blockout limbs). */
export function capsule(radius, length) {
  return new THREE.CapsuleGeometry(radius, length, 8, 24).translate(0, -length / 2, 0);
}

/** Elongated bone gizmo (rig overlay): widest near the parent joint, pointed at the child. */
export function boneGizmo(length) {
  const w = Math.min(0.045, length * 0.12);
  const h = length * 0.15;
  const verts = [0, 0, 0, w, h, 0, 0, h, w, -w, h, 0, 0, h, -w, 0, length, 0];
  const idx = [0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 1, 4, 5, 1, 2, 5, 2, 3, 5, 3, 4, 5, 4, 1];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Regular octagon (flat top) as Vector2 points; sx stretches it horizontally. */
export const octagon = (R, sx = 1) => Array.from({ length: 8 }, (_, k) => {
  const a = Math.PI / 8 + (k * Math.PI) / 4;
  return new THREE.Vector2(Math.cos(a) * R * sx, Math.sin(a) * R);
});

/** Canvas-drawn texture (sRGB). */
export function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
