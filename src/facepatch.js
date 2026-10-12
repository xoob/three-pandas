// facepatch.js — a thin sculpted piece lying on the face (beards, mouths).
//
// The piece covers a region of the face's front view (x toward its left,
// y up) given as radius by angle around a centre: an outer outline and,
// for rings, an inner one (0 for a filled patch). It follows the face surface
// (head plus snout, given as depth z(x, y)), stands off it by `thickness` with
// a rounded lip at its edges, and reaches `inlay` into the head, so printed
// it is a solid colour region rather than a thin skin. Seen from any angle it
// wraps the snout like a painted-and-raised detail on a toy figure.

import * as THREE from 'three';
import { v3 } from './shapes.js';

const GRID = { columns: 160, rows: 18 };

/** Distance from `centre` to a closed polygon ([x, y] points) along angle `a`. */
export function polygonRadius(pts, [cx, cy], a) {
  const dx = Math.cos(a), dy = Math.sin(a);
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
    const ex = x1 - x0, ey = y1 - y0, den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((x0 - cx) * ey - (y0 - cy) * ex) / den; // along the ray
    const u = ((x0 - cx) * dy - (y0 - cy) * dx) / den; // along the edge
    if (t > 0 && u >= 0 && u <= 1) best = Math.min(best, t);
  }
  if (best === Infinity) throw new Error('polygonRadius: centre is outside the outline');
  return best;
}

/**
 * Geometry of a face patch. `face.z(x, y)`: depth of the face surface.
 * `outer(a)`, `inner(a)`: outline radii around `centre` at angle a (inner
 * omitted = filled). `thickness` (a number, or (x, y) → number for sculpted
 * relief), `inlay`: above and below the surface; `edge`: share of the band
 * over which a lip rises.
 */
export function facePatch(face, { centre, outer, inner, thickness, inlay, edge }) {
  const { columns, rows } = GRID;
  const [cx, cy] = centre;
  const thicknessAt = typeof thickness === 'number' ? () => thickness : thickness;
  const pos = [];
  const surface = (x, y) => { // point on the face and its normal (from the depth gradient)
    const h = 0.002;
    const n = v3(-(face.z(x + h, y) - face.z(x - h, y)) / (2 * h), -(face.z(x, y + h) - face.z(x, y - h)) / (2 * h), 1).normalize();
    return { p: v3(x, y, face.z(x, y)), n };
  };
  const vertex = (x, y, offset) => {
    const s = surface(x, y);
    s.p.addScaledVector(s.n, offset);
    pos.push(s.p.x, s.p.y, s.p.z);
    return pos.length / 3 - 1;
  };
  const lip = (k) => Math.sqrt(1 - (1 - Math.min(1, k)) ** 2);
  const rise = (f) => (inner ? Math.min(lip(f / edge), lip((1 - f) / edge)) : lip((1 - f) / edge));
  const top = [], bottom = [];
  const centreVertex = inner ? null : vertex(cx, cy, thicknessAt(cx, cy)); // a filled patch closes at its centre
  const centreBottom = inner ? null : vertex(cx, cy, -inlay);
  for (let i = 0; i < columns; i++) {
    const a = (i / columns) * Math.PI * 2 - Math.PI / 2;
    const c = Math.cos(a), s = Math.sin(a);
    const r0 = inner ? inner(a) : 0, r1 = outer(a);
    if (r1 <= r0 + 0.005) throw new Error(`facePatch: outer outline (${r1.toFixed(3)}) does not clear the inner one (${r0.toFixed(3)}) at angle ${a.toFixed(2)}`);
    const o = [], n = [];
    for (let j = inner ? 0 : 1; j <= rows; j++) {
      const f = j / rows;
      const x = cx + c * (r0 + (r1 - r0) * f), y = cy + s * (r0 + (r1 - r0) * f);
      if ((inner && j === 0) || j === rows) { const k = vertex(x, y, -inlay); o.push(k); n.push(k); continue; }
      o.push(vertex(x, y, -inlay + (thicknessAt(x, y) + inlay) * rise(f)));
      n.push(vertex(x, y, -inlay));
    }
    top.push(o);
    bottom.push(n);
  }
  const index = [];
  const last = top[0].length - 1;
  for (let i = 0; i < columns; i++) {
    const i2 = (i + 1) % columns;
    for (let j = 0; j < last; j++) {
      // angle runs counter-clockwise seen from the front, rows outward: the top faces the viewer
      index.push(top[i][j], top[i2][j + 1], top[i2][j], top[i][j], top[i][j + 1], top[i2][j + 1]);
      index.push(bottom[i][j], bottom[i2][j], bottom[i2][j + 1], bottom[i][j], bottom[i2][j + 1], bottom[i][j + 1]);
    }
    if (!inner) {
      index.push(centreVertex, top[i][0], top[i2][0]);
      index.push(centreBottom, bottom[i2][0], bottom[i][0]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}
