// hair.js — hair as one sculpted piece, like a Playmobil or Lego hair part.
//
// The piece is a shell over the head, meshed as a grid: columns run from the
// crown down to the hairline, rows are packed densely across the lip at the
// end. Down to `leave` the shell follows the head; long styles carry on below
// it and hang, flaring out toward the ends (the swing). The outer surface
// stands off the head by the style's thickness and rises across the hairline
// along a quarter circle (the rounded lip that reads as a separate piece); the
// inner surface lies just below the head, and both meet at the hairline, so
// the piece is closed. It is parented to the head, so it follows every pose;
// printed, only what lies outside the head is hair. The ears grow through it.
//
// Directions are on the unit head sphere (the head's own space divided by its
// radii): x toward its left, y up, z forward. Azimuth 0 = middle of the face,
// + toward its left; elevation = asin(y). Angles in radians.

import * as THREE from 'three';
import { v3, ellipsoid, lathe, orientZ } from './shapes.js';

/** Hairline points [azimuth, elevation] for 0 … π, mirrored to the right side. */
const mirror = (pts) => [...pts.slice(1).reverse().map(([a, e]) => [-a, e]), ...pts];

// hairline: where the hair ends in each column, as points [azimuth, elevation]
// from −π to π joined by smooth curves. Below `leave` the hair hangs: every
// radian of hairline below `leave` is DROP head units of hanging length.
export const HAIR = {
  // short crop: tight at the sides, upright lift at the front of the crown,
  // hairline receding a little at the temples
  crop: {
    hairline: mirror([[0, 0.6], [0.4, 0.62], [0.75, 0.72], [1.15, 0.42], [1.6, 0.22], [2.2, -0.02], [2.75, -0.26], [Math.PI, -0.3]]),
    thickness: 0.05,
    volume: { at: [0, 0.75, 0.66], radius: 0.85, height: 0.1 }, // lift: centre direction, angular radius, extra height
    edge: 0.07, // angle over which the lip rises from the head to full thickness
  },
  // crew cut: a short flat top with a square forehead line, faded to almost
  // nothing at the sides and the back (`fade`: below elevation `from` the
  // hair is `to` × its thickness, full again `over` radians higher)
  crew: {
    hairline: mirror([[0, 0.64], [0.42, 0.66], [0.7, 0.72], [1.0, 0.56], [1.5, 0.3], [2.2, 0.0], [2.75, -0.24], [Math.PI, -0.28]]),
    thickness: 0.08,
    volume: { at: [0, 0.8, 0.6], radius: 0.7, height: 0.03 }, // a little lift at the front of the top
    edge: 0.07,
    fade: { from: 0.5, over: 0.22, to: 0.25 },
  },
  // short and natural: even hairline, short at the sides, fuller and higher on top
  short: {
    hairline: mirror([[0, 0.5], [0.45, 0.52], [0.8, 0.5], [1.15, 0.34], [1.6, 0.14], [2.2, -0.08], [2.75, -0.26], [Math.PI, -0.3]]),
    thickness: 0.06,
    volume: { at: [0.1, 0.7, 0.7], radius: 0.95, height: 0.16 }, // lift at the front, a little to its left
    edge: 0.07,
    fringe: { count: 7, depth: 0.09, width: 0.95, shift: 0.15 }, // a few short tufts along the forehead
  },
  // dense and textured: tight at the sides, tall on top with soft sculpted
  // ridges running front to back
  textured: {
    hairline: mirror([[0, 0.5], [0.45, 0.52], [0.8, 0.48], [1.1, 0.3], [1.3, 0.18], [1.6, 0.14], [2.2, -0.06], [2.75, -0.26], [Math.PI, -0.3]]),
    thickness: 0.06,
    volume: { at: [0, 0.55, 0.85], radius: 0.95, height: 0.2 },
    edge: 0.07,
    fringe: { count: 9, depth: 0.1, width: 1.0, shift: 0.1 },
    ridges: { count: 5, depth: 0.02, from: 0.35 }, // across the top, fading out toward the hairline
  },
  // long hair combed straight back from a high forehead (a widow's peak between
  // deep temples) in bold comb grooves, and tied high at the back of the crown
  // into a samurai-style topknot with a coloured tie
  topknot: {
    hairline: mirror([[0, 0.56], [0.3, 0.6], [0.55, 0.76], [0.85, 0.66], [1.1, 0.3], [1.5, -0.08], [2.2, -0.3], [2.75, -0.42], [Math.PI, -0.45]]),
    thickness: 0.07,
    volume: { at: [0, 0.55, -1], radius: 1.1, height: 0.05 }, // fuller toward the knot
    edge: 0.08,
    comb: { count: 6, depth: 0.025, from: 0.25 }, // comb grooves straight back from the forehead over the crown
    // the knot: direction from the head centre, its size, how far it stands off the
    // hair, and the tie around its base (radius, height; a plate colour)
    bun: { at: [0, 0.9, -1], radii: [0.19, 0.19, 0.2], lift: 0.22, tie: { colour: 'red', radius: 0.145, height: 0.1 } },
    // headband (hachimaki): a cloth band around the head at `elevation` (on the
    // forehead below the hairline, over the hair at the sides and back), `height`
    // tall and standing `proud` of what is under it; two short tails hang from
    // its knot behind the left ear, lying on the hair
    band: { colour: 'red', elevation: 0.43, height: 0.2, proud: 0.03, tails: { at: 2.05, gap: 0.06, width: 0.15, length: 0.5 } },
  },
  // long and full, parted on its left; the right side falls longer and both
  // ends swing out, the back reaches the upper back
  long: {
    leave: -0.2,
    hairline: [
      [-Math.PI, -1.55], [-2.3, -1.5], [-1.6, -1.45], [-1.2, -1.3], [-0.9, 0.12], [-0.5, 0.42], [0, 0.55],
      [0.5, 0.46], [0.88, 0.14], [1.18, -0.8], [1.6, -1.05], [2.3, -1.45], [Math.PI, -1.55],
    ],
    thickness: 0.085,
    volume: { at: [-0.35, 0.85, 0.4], radius: 1.1, height: 0.06 }, // fuller on the long side
    edge: 0.07,
    part: { at: 0.32, width: 0.06, depth: 0.035, from: 0.35 }, // a soft groove from the forehead back over the top
    // below the head: thicker by `bulk`, bulging out by `bulge` on the way down,
    // ends flipping out by `swing` (per side), bottom edge rounded over `edge`
    hang: { bulk: 0.8, bulge: 0.05, swing: { right: 0.15, left: 0.08 }, edge: 0.2 },
    grooves: { count: 13, depth: 0.02 }, // broad sculpted strands down the hanging part
  },
};

const SINK = 0.012; // the inner surface, below the head surface
const DROP = 0.6; // head units of hanging length per radian of hairline below `leave`
const GRID = { columns: 240, lip: 10, cap: 40 }; // around; rows across the lip; rows from the lip to the crown

const smooth = (t) => t * t * (3 - 2 * t);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Elevation of the hairline at azimuth `a` (radians, any value). */
function hairlineAt(style, a) {
  const pts = style.hairline;
  const x = wrap(a);
  let e = pts[pts.length - 1][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a0, e0] = pts[i], [a1, e1] = pts[i + 1];
    if (x <= a1) { e = e0 + (e1 - e0) * smooth((x - a0) / (a1 - a0)); break; }
  }
  const F = style.fringe; // tufts: the front hairline dips into points, fading out toward the temples
  if (F) e -= F.depth * Math.max(0, Math.sin(F.count * (x - F.shift))) ** 2 * smooth(Math.max(0, 1 - Math.abs(x) / F.width));
  return e;
}

const direction = (azimuth, elevation) =>
  v3(Math.cos(elevation) * Math.sin(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.cos(azimuth));

/** Point on the head surface and its outward normal, for a unit direction. */
function onHead(head, d) {
  const u = d.clone();
  head.deform(u);
  const r = head.radii;
  const p = v3(u.x * r.x, u.y * r.y, u.z * r.z);
  return { p, n: v3(p.x / (r.x * r.x), p.y / (r.y * r.y), p.z / (r.z * r.z)).normalize() };
}

/**
 * Where the hair's base surface is at column `a`, profile elevation `e`: on
 * the head above `leave`, hanging below it (straight down, flaring out toward
 * the end at elevation `end`). Returns the point and its outward normal.
 */
function profile(style, head, a, e, end) {
  const leave = style.leave ?? -Math.PI / 2;
  if (e >= leave) return onHead(head, direction(a, e));
  const top = onHead(head, direction(a, leave));
  const t = (leave - e) * DROP, u = t / ((leave - end) * DROP); // dropped so far, fraction of the length
  const away = v3(Math.sin(a), 0, Math.cos(a));
  const H = style.hang;
  const swing = (a < 0 ? H.swing.right : H.swing.left) * Math.abs(Math.sin(a)) ** 0.5;
  const p = top.p.clone().add(v3(0, -t, 0)).addScaledVector(away, H.bulge * Math.sin(Math.PI * u) + swing * u ** 3);
  const n = top.n.clone().lerp(away, Math.min(1, t / 0.15)).normalize();
  return { p, n };
}

/** Height of the hair's outer surface above its base at column `a`, profile elevation `e`. */
const edgeOf = (style, end) => (end < (style.leave ?? -Math.PI / 2) ? style.hang.edge : style.edge);

function thicknessAt(style, a, e, end) {
  const inside = e - end;
  if (inside <= 0) return 0;
  const k = Math.min(1, inside / edgeOf(style, end));
  const rise = Math.sqrt(1 - (1 - k) * (1 - k)); // quarter circle: steep at the hairline, flat further in
  const V = style.volume;
  const d = direction(a, Math.max(e, style.leave ?? -Math.PI / 2));
  let t = style.thickness + V.height * smooth(Math.max(0, 1 - d.angleTo(v3(...V.at).normalize()) / V.radius));
  const P = style.part;
  if (P) t -= P.depth * Math.exp(-((wrap(a - P.at) / P.width) ** 2)) * smooth(THREE.MathUtils.clamp((e - P.from) / 0.3, 0, 1));
  const G = style.grooves;
  const R = style.ridges;
  if (R) t += R.depth * (0.5 + 0.5 * Math.cos(Math.sin(a) * R.count * 1.6)) * smooth(THREE.MathUtils.clamp((e - R.from) / 0.25, 0, 1));
  const C = style.comb; // `count` parallel grooves across the head's width, running front to back (they meet smoothly at
  // the crown); they start just behind the lip, so the hairline stays a clean edge
  if (C) t += C.depth * (0.5 + 0.5 * Math.cos(d.x * C.count * Math.PI)) * smooth(THREE.MathUtils.clamp((e - C.from) / 0.2, 0, 1))
    * smooth(THREE.MathUtils.clamp((inside - edgeOf(style, end)) / 0.1, 0, 1));
  if (G && e < style.leave) t += G.depth * Math.cos(a * G.count) * smooth(Math.min(1, (style.leave - e) / 0.4));
  if (e < style.leave) t *= 1 + style.hang.bulk * smooth(Math.min(1, ((style.leave - e) * DROP) / 0.25));
  const F = style.fade; // thin at the sides and back, full on top
  if (F) t *= F.to + (1 - F.to) * smooth(THREE.MathUtils.clamp((e - F.from) / F.over, 0, 1));
  return t * rise;
}

/** Height of the hair surface above the head (head units) at unit direction `d`; 0 outside the hair. */
export function hairThickness(style, d) {
  const a = Math.atan2(d.x, d.z);
  return thicknessAt(style, a, Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)), hairlineAt(style, a));
}

/**
 * Add the hair piece for a recipe's `hair` slot ({ style, colour }).
 * `head`: { radii, deform } — the head ellipsoid it grows from (same radii and
 * deform as the head mesh, applied to unit directions).
 */
export function addHair(m, slot, head) {
  const style = HAIR[slot.style];
  m.add({
    name: 'hair', role: `hair-${slot.colour}`, parent: 'head',
    print: { minus: 'head' }, // printed: only what stands out of the head
    make: () => hairGeometry(style, head),
  });
  const B = style.bun;
  if (B) {
    // the knot stands off the hair along the head normal there, a tie (a short
    // cylinder in its own colour) around its base where it meets the hair
    const s = onHead(head, v3(...B.at).normalize());
    const base = s.p.clone().addScaledVector(s.n, style.thickness);
    const up = orientZ(s.n);
    const T = B.tie;
    m.add({
      name: 'hairBun', role: `hair-${slot.colour}`, parent: 'head',
      position: base.clone().addScaledVector(s.n, B.lift), quaternion: up,
      make: () => ellipsoid(B.radii, { detail: 5 }),
    });
    m.add({
      name: 'hairTie', role: T.colour, parent: 'head', position: base, quaternion: up,
      make: () => lathe([[0, -0.04], [T.radius, -0.04], [T.radius, T.height], [0, T.height]], 48).rotateX(Math.PI / 2),
    });
  }
  const H = style.band;
  if (H) {
    const e0 = H.elevation - H.height / 2, e1 = H.elevation + H.height / 2;
    // the band stands off the hair's full height along its whole width and over
    // the grooves around it (a smooth cloth slab, no kinks at the hairline or
    // across the comb grooves), and off the skin where there is no hair
    const over = (a) => H.proud + Math.max(...[e0, (e0 + e1) / 2, e1].flatMap((e) =>
      [-0.3, -0.15, 0, 0.15, 0.3].map((da) => thicknessAt(style, a + da, e, hairlineAt(style, a + da)))));
    m.add({
      name: 'hairBand', role: H.colour, parent: 'head',
      make: () => slabGeometry(head, (i) => (i / 96) * Math.PI * 2, 96, true, e0, e1, over),
    });
    const T = H.tails;
    for (const [side, s] of [['L', 1], ['R', -1]]) {
      const a0 = T.at + s * T.gap / 2, a1 = a0 + s * T.width;
      m.add({
        name: `hairBandTail${side}`, role: H.colour, parent: 'head',
        make: () => slabGeometry(head, (i) => a0 + (a1 - a0) * (i / 6), 7, false, e0 - T.length, e0 + H.height * 0.3, over),
      });
    }
  }
}

/**
 * A closed slab lying on the head: columns at azimuths `azimuth(i)` for
 * i < columns (`wrap` joins the last to the first), rows from elevation `e0`
 * to `e1`; its outer surface stands `over(a, e)` above the head with a rounded
 * lip along the row edges, its inner surface lies just below the head.
 */
function slabGeometry(head, azimuth, columns, wrap, e0, e1, over) {
  const rows = 9;
  const pos = [];
  const index = [];
  const vertex = (a, e, offset) => {
    const s = onHead(head, direction(a, e));
    s.p.addScaledVector(s.n, offset);
    pos.push(s.p.x, s.p.y, s.p.z);
    return pos.length / 3 - 1;
  };
  const outer = [], inner = [];
  for (let i = 0; i < columns; i++) {
    const a = azimuth(i);
    const o = [], n = [];
    for (let j = 0; j < rows; j++) {
      const e = e0 + (e1 - e0) * (j / (rows - 1));
      const lip = Math.sqrt(1 - (1 - Math.min(1, 2 * Math.min(j, rows - 1 - j) / (rows - 1) + 0.25)) ** 2); // rounded along the edges
      o.push(vertex(a, e, over(a, e) * lip - SINK));
      n.push(vertex(a, e, -SINK * 2));
    }
    outer.push(o);
    inner.push(n);
  }
  const span = wrap ? columns : columns - 1;
  for (let i = 0; i < span; i++) {
    const i2 = (i + 1) % columns;
    for (let j = 0; j < rows - 1; j++) {
      index.push(outer[i][j], outer[i2][j], outer[i2][j + 1], outer[i][j], outer[i2][j + 1], outer[i][j + 1]);
      index.push(inner[i][j], inner[i2][j + 1], inner[i2][j], inner[i][j], inner[i][j + 1], inner[i2][j + 1]);
    }
    // the slab's bottom and top edges
    index.push(outer[i][0], inner[i][0], inner[i2][0], outer[i][0], inner[i2][0], outer[i2][0]);
    index.push(outer[i][rows - 1], inner[i2][rows - 1], inner[i][rows - 1], outer[i][rows - 1], outer[i2][rows - 1], inner[i2][rows - 1]);
  }
  if (!wrap) {
    // the open ends of a sector
    for (const [i, flip] of [[0, false], [columns - 1, true]]) {
      for (let j = 0; j < rows - 1; j++) {
        const tri = [outer[i][j], outer[i][j + 1], inner[i][j + 1], outer[i][j], inner[i][j + 1], inner[i][j]];
        index.push(...(flip ? [tri[0], tri[2], tri[1], tri[3], tri[5], tri[4]] : tri));
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

function hairGeometry(style, head) {
  const { columns, lip, cap } = GRID;
  const rows = lip + cap; // row 0 = hairline, then up to the crown (one vertex)
  const top = Math.PI / 2;
  const pos = [];
  const index = [];
  // elevation of row j in a column ending at e0: the first `lip` rows span
  // the lip, packed toward the hairline where it rises steeply; the rest run to the crown
  const rowAngle = (e0, j) => {
    const lipEnd = Math.min(edgeOf(style, e0), (top - e0) * 0.5);
    if (j <= lip) return e0 + lipEnd * (j / lip) ** 2;
    return e0 + lipEnd + (top - e0 - lipEnd) * ((j - lip) / cap);
  };
  const vertex = (a, e, end, offset) => {
    const s = profile(style, head, a, e, end);
    s.p.addScaledVector(s.n, offset);
    pos.push(s.p.x, s.p.y, s.p.z);
    return pos.length / 3 - 1;
  };
  // outer[i][j], inner[i][j]; row 0 is shared (the closed rim at the hairline)
  const outer = [], inner = [];
  for (let i = 0; i < columns; i++) {
    const a = (i / columns) * Math.PI * 2;
    const end = hairlineAt(style, a);
    const o = [], n = [];
    for (let j = 0; j < rows; j++) {
      const e = rowAngle(end, j);
      if (j === 0) { o.push(vertex(a, e, end, -SINK)); n.push(o[0]); continue; }
      o.push(vertex(a, e, end, thicknessAt(style, a, e, end) - SINK));
      n.push(vertex(a, e, end, -SINK * 2));
    }
    outer.push(o);
    inner.push(n);
  }
  const crownOuter = vertex(0, top, 0, thicknessAt(style, 0, top, hairlineAt(style, 0)) - SINK);
  const crownInner = vertex(0, top, 0, -SINK * 2);
  for (let i = 0; i < columns; i++) {
    const i2 = (i + 1) % columns;
    for (let j = 0; j < rows - 1; j++) {
      // outer faces outward (counter-clockwise seen from outside), inner faces inward
      index.push(outer[i][j], outer[i2][j], outer[i2][j + 1], outer[i][j], outer[i2][j + 1], outer[i][j + 1]);
      index.push(inner[i][j], inner[i2][j + 1], inner[i2][j], inner[i][j], inner[i][j + 1], inner[i2][j + 1]);
    }
    index.push(outer[i][rows - 1], outer[i2][rows - 1], crownOuter);
    index.push(inner[i][rows - 1], crownInner, inner[i2][rows - 1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/**
 * How far points beside the head (`pts`, head space, x > 0) must move out
 * along x to clear the hair surface: glasses temples move out by this much so
 * they rest on the hair instead of cutting into it.
 */
export function hairClearance(slot, head, pts) {
  const style = HAIR[slot.style];
  const r = head.radii;
  return Math.max(0, ...pts.map((p) => {
    const yz = 1 - (p.y / r.y) ** 2 - (p.z / r.z) ** 2;
    if (yz <= 0) return 0; // beyond the head's outline
    const surface = v3(r.x * Math.sqrt(yz), p.y, p.z); // head surface straight inward from p
    const hairX = surface.x + hairThickness(style, v3(surface.x / r.x, p.y / r.y, p.z / r.z).normalize());
    return hairX + 0.004 - p.x;
  }));
}
