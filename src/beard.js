// beard.js — facial hair as a thin sculpted piece on the snout (facepatch.js),
// like the painted-and-raised beards of toy figures. A beard grows around the
// mouth: outside its own outline, as radius by angle around the mouth centre
// in the face's front view (angle 0 toward its left, π/2 up); inside, an open
// mouth keeps its outline free (the beard is a ring), a closed one is grown
// over (a filled patch; the moustache then marks where the mouth is).

import * as THREE from 'three';
import { facePatch, polygonRadius } from './facepatch.js';

/** Outline points [angle, radius] for −π/2 (chin) … π/2 (under the nose), mirrored to the other side. */
const mirror = (pts) => [...pts, ...pts.slice(0, -1).reverse().map(([a, r]) => [Math.PI - a, r])];

export const BEARDS = {
  // moustache joined to a chin beard around the mouth; widest at the chin
  goatee: {
    centre: 0, // the body's outline is measured from the mouth centre
    jaw: [-Infinity, 0], // jaw line y = jaw[0] + jaw[1]·x² (face view): the beard is full thickness from here down
    outer: mirror([[-Math.PI / 2, 0.19], [-Math.PI / 4, 0.175], [0, 0.18], [Math.PI / 4, 0.1], [Math.PI / 2, 0.062]]),
    thickness: { top: 0.026, jaw: 0.026 }, inlay: 0.04, edge: 0.3, // thickness at the mouth and at the jaw; edge: share of the band over which each lip rises
  },
  // long full beard: one bold mass that swells from under the moustache to a
  // strong bearded chin, then hangs below it onto the chest, rounded at the
  // bottom, with a few broad sculpted grooves down the hanging part; cheek
  // wings rising gently toward the ears, and a domed moustache over the mouth,
  // a little under the nose
  full: {
    centre: -0.08, // the body's outline is measured from below the mouth, so its top edge can sit under the moustache
    outer: mirror([[-Math.PI / 2, 0.4], [-1.15, 0.38], [-0.61, 0.35], [-0.19, 0.38], [0.2, 0.41], [0.38, 0.357], [0.52, 0.13], [Math.PI / 4, 0.092], [1.05, 0.072], [Math.PI / 2, 0.065]]),
    thickness: { top: 0.03, jaw: 0.16 }, inlay: 0.04, edge: 0.5,
    jaw: [-0.44, 0.5],
    // below the jaw the beard leaves the face and hangs: straight down, leaning
    // back by `back`, swelling to a rounded mass (`bulk`: extra thickness at the
    // middle, half-width it fades over) with broad grooves down it (`grooves`:
    // spacing across, depth)
    hang: { back: 0.12, bulk: [0.04, 0.38], grooves: { spacing: 0.21, depth: 0.02 } },
    moustache: { halfWidth: 0.21, height: 0.06, drop: 0.105, droop: 0.03, thickness: 0.05, edge: 1 }, // fully domed
  },
  // ninja beard: grows out of the face as part of the head's shape — one wide
  // chevron along the jaw from the sides of the head (level with the eye
  // patches) down to a deep, squared chin, thin at the sides and thick at the
  // chin, so the lower head reads as an angular wedge from the front and the
  // side. Its straight upper edges rise from under the moustache toward the
  // ears; above them the muzzle stays white: nose, a domed moustache and the
  // mouth on white, the chin beard below
  ninja: {
    centre: -0.175, // below the mouth, so the straight edges run radially
    jaw: [-0.56, 0.45],
    outer: mirror([[-Math.PI / 2, 0.056], [-1.1, 0.063], [-0.7, 0.087], [-0.4, 0.143], [-0.15, 0.27], [0.1, 0.415], [0.3, 0.556], [0.4, 0.68], [0.44, 0.172], [0.6, 0.124], [0.8, 0.098], [1.1, 0.079], [Math.PI / 2, 0.07]]),
    thickness: { top: 0.025, jaw: 0.15 }, inlay: 0.04, edge: 0.3,
    moustache: { halfWidth: 0.2, height: 0.056, drop: 0.081, droop: 0.03, thickness: 0.05, edge: 1 },
  },
  // short boxed beard along the jaw and up the cheeks, with a full moustache
  // standing a little proud of it that droops toward the corners of the mouth
  boxed: {
    centre: 0,
    jaw: [-Infinity, 0],
    outer: mirror([[-Math.PI / 2, 0.22], [-Math.PI / 4, 0.23], [0, 0.27], [Math.PI / 8, 0.26], [Math.PI / 4, 0.19], [3 * Math.PI / 8, 0.14], [Math.PI / 2, 0.085]]),
    thickness: { top: 0.03, jaw: 0.03 }, inlay: 0.04, edge: 0.2,
    moustache: { halfWidth: 0.17, height: 0.042, drop: 0, droop: 0.075, thickness: 0.045, edge: 0.3 },
  },
  // short full beard as one moulded piece clipped over the jaw, like a
  // Playmobil beard: from sideburns that meet the hair in front of the ears,
  // along a clean cheek line under the eye patches to the moustache, and down
  // around the chin and under the jaw; fuller at the chin, with wavy strands
  // engraved down it. It is a shell on the head like the hair (`wrap`, see
  // shellGeometry), so it follows the head round to the sides; the mouth
  // shows through an opening with a soft lip: an open mouth through its
  // outline, a closed one through a slot of bare lips around its line.
  jaw: {
    inlay: 0.04,
    wrap: {
      span: 1.8, // half-width in azimuth: from the middle of the face to the back of a sideburn, under the hair beside the ear
      // cheek line and jaw line: elevation by azimuth, [azimuth, elevation] from the middle outward;
      // behind the sideburn the jaw line rises to the cheek line, closing the piece under the hair
      top: [[0, -0.31], [0.45, -0.31], [0.8, -0.38], [1.0, -0.3], [1.15, 0], [1.3, 0.3], [1.8, 0.3]],
      bottom: [[0, -1.2], [0.6, -1.15], [1.0, -0.95], [1.25, -0.6], [1.5, -0.3], [1.8, 0.1]],
      thickness: { cheek: 0.04, chin: 0.075 }, // at the cheeks and sideburns; at the chin
      edge: 0.09, sideEdge: 0.1, // widths over which the lips rise: cheek and jaw lines (elevation), sideburn backs (azimuth)
      mouth: { grow: 0.014, edge: 0.05 }, // the opening is the mouth's outline grown by this much (its painted outline stays clear); width of its lip (head units)
      // engraved strands: `count` around a full turn, `depth` deep, narrow
      // valleys between broad ridges, swaying by `wave` radians `waves` times per radian of height
      strands: { count: 21, depth: 0.022, wave: 0.7, waves: 5 },
    },
    moustache: { halfWidth: 0.16, height: 0.04, drop: -0.012, droop: 0.012, thickness: 0.05, edge: 0.4 }, // nearly straight, clear of the corners of a smile
  },
};

const smooth = (t) => t * t * (3 - 2 * t);
const FLAT = { back: 0, bulk: [0, 1], grooves: { spacing: 1, depth: 0 } }; // a beard that stays on the face

/** Radius of a closed outline (points over −π/2 … 3π/2) at angle `a` (in −π/2 … 3π/2). */
function outlineAt(pts, a) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [a0, r0] = pts[i], [a1, r1] = pts[i + 1];
    if (a <= a1) return r0 + (r1 - r0) * smooth((a - a0) / (a1 - a0));
  }
  return pts[pts.length - 1][1];
}

/** Value of a line given as [azimuth, value] points from the middle outward, at azimuth `a` (mirrored). */
function lineAt(pts, a) {
  const x = Math.abs(a);
  for (let i = 0; i < pts.length - 1; i++) {
    const [a0, v0] = pts[i], [a1, v1] = pts[i + 1];
    if (x <= a1) return v0 + (v1 - v0) * smooth((x - a0) / (a1 - a0));
  }
  return pts[pts.length - 1][1];
}

/** Distance from (x, y) to a closed polygon's outline, negative inside it. */
function polygonDistance(pts, x, y) {
  let best = Infinity, inside = false;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
    const ex = x1 - x0, ey = y1 - y0;
    const t = Math.min(1, Math.max(0, ((x - x0) * ex + (y - y0) * ey) / (ex * ex + ey * ey || 1)));
    best = Math.min(best, Math.hypot(x - x0 - t * ex, y - y0 - t * ey));
    if ((y0 > y) !== (y1 > y) && x < x0 + ((y - y0) / (y1 - y0)) * ex) inside = !inside;
  }
  return inside ? -best : best;
}

const SHELL = { columns: 240, rows: 96, sink: 0.012 }; // grid across azimuth and elevation; the inside lies this far under the head
const lip = (k) => (k <= 0 ? 0 : Math.sqrt(1 - (1 - Math.min(1, k)) ** 2)); // quarter circle: steep at the edge, flat further in

/**
 * A beard as a shell on the head, like the hair (hair.js): a grid of columns
 * across the azimuth (−span … span, 0 = the middle of the face) and rows from
 * the jaw line up to the cheek line. The outer surface stands off the head
 * (snout included) by the style's thickness, with a rounded lip along every
 * edge and around an open mouth, inside which it drops under the head's
 * surface, so the mouth shows; the inner surface lies under the head, and
 * the two are joined along the border, so the piece is closed.
 */
function shellGeometry(W, face) {
  const { columns, rows, sink } = SHELL;
  const r = face.head.radii, S = W.strands;
  const mouthElevation = Math.asin(face.mouth[1] / r.y);
  // an open mouth shows through its outline, a closed one through the bare lips around its line
  const opening = face.opening ?? face.lips, grow = face.opening ? W.mouth.grow : 0;
  const pos = [];
  const vertex = (a, e, offset) => {
    const u = new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a));
    face.head.deform(u);
    const p = new THREE.Vector3(u.x * r.x, u.y * r.y, u.z * r.z);
    const n = new THREE.Vector3(p.x / (r.x * r.x), p.y / (r.y * r.y), p.z / (r.z * r.z)).normalize();
    if (p.z > 0) p.z = face.z(p.x, p.y); // the snout
    p.addScaledVector(n, offset);
    pos.push(p.x, p.y, p.z);
    return { index: pos.length / 3 - 1, x: p.x, y: p.y, front: p.z > 0 };
  };
  const height = (a, e, top, bottom, at) => {
    const edge = lip(Math.min((top - e) / W.edge, (e - bottom) / W.edge, (W.span - Math.abs(a)) / W.sideEdge));
    if (edge === 0) return 0;
    // fuller toward the chin: below the mouth, in the middle of the face
    const chin = smooth(Math.min(1, Math.max(0, (mouthElevation - e) / 0.35))) * smooth(Math.max(0, 1 - Math.abs(a) / 1.0));
    let t = W.thickness.cheek + (W.thickness.chin - W.thickness.cheek) * chin;
    const valley = (0.5 - 0.5 * Math.cos(S.count * a + S.wave * Math.sin(S.waves * e))) ** 3;
    t -= S.depth * valley * edge;
    if (!opening || !at.front) return t * edge;
    // a soft lip (no vertical wall: the grid would show as steps along it)
    const d = polygonDistance(opening, at.x, at.y) - grow;
    return d <= 0 ? -sink : -sink + (t * edge + sink) * smooth(Math.min(1, d / W.mouth.edge));
  };
  const outer = [], inner = [];
  for (let i = 0; i <= columns; i++) {
    const a = -W.span + 2 * W.span * (i / columns);
    const top = lineAt(W.top, a), bottom = lineAt(W.bottom, a);
    const o = [], n = [];
    for (let j = 0; j <= rows; j++) {
      const e = bottom + (top - bottom) * (j / rows);
      const base = vertex(a, e, -sink * 2);
      n.push(base.index);
      // the outer vertex: where the base one is, moved out by the height there
      const h = height(a, e, top, bottom, base);
      o.push(vertex(a, e, h - sink).index);
    }
    outer.push(o);
    inner.push(n);
  }
  const index = [];
  for (let i = 0; i < columns; i++) {
    for (let j = 0; j < rows; j++) {
      // azimuth runs toward the figure's left, rows upward: the outer surface faces out
      index.push(outer[i][j], outer[i + 1][j], outer[i + 1][j + 1], outer[i][j], outer[i + 1][j + 1], outer[i][j + 1]);
      index.push(inner[i][j], inner[i + 1][j + 1], inner[i + 1][j], inner[i][j], inner[i][j + 1], inner[i + 1][j + 1]);
    }
    // the bottom and top borders
    index.push(outer[i][0], inner[i][0], inner[i + 1][0], outer[i][0], inner[i + 1][0], outer[i + 1][0]);
    index.push(outer[i][rows], inner[i + 1][rows], inner[i][rows], outer[i][rows], outer[i + 1][rows], inner[i + 1][rows]);
  }
  for (let j = 0; j < rows; j++) {
    // the side borders (the backs of the sideburns)
    index.push(outer[0][j], outer[0][j + 1], inner[0][j + 1], outer[0][j], inner[0][j + 1], inner[0][j]);
    index.push(outer[columns][j], inner[columns][j + 1], outer[columns][j + 1], outer[columns][j], inner[columns][j], inner[columns][j + 1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/**
 * Add the beard for a recipe's `beard` slot ({ style, colour }).
 * `face`: { z(x, y) — the face surface's depth, mouth: [x, y] — the mouth centre,
 * lip — y of the top of the mouth, opening — the mouth outline as [x, y]
 * points for an open mouth, null for a closed one, head: { radii, deform } —
 * the head ellipsoid a `wrap` beard grows from (as for the hair) }.
 */
export function addBeard(m, slot, face) {
  const style = BEARDS[slot.style];
  const H = style.hang ?? FLAT;
  const jawAt = (x) => style.jaw[0] + style.jaw[1] * x * x;
  const below = (x, y) => Math.max(0, jawAt(x) - y); // how far below the jaw line
  // the surface the beard lies on: the face, continued below the jaw as a plane leaning back
  const base = { z: (x, y) => { const b = below(x, y); return face.z(x, y + b) - H.back * b; } };
  // on the face the beard thickens from the mouth down to the jaw line, then the hang swells
  const thickness = (x, y) => {
    const b = below(x, y), G = H.grooves, T = style.thickness, cy = face.mouth[1];
    const toJaw = smooth(Math.min(1, Math.max(0, (cy - y) / (cy - jawAt(x)))));
    const swell = H.bulk[0] * Math.max(0, 1 - (x / H.bulk[1]) ** 2) + G.depth * Math.cos((2 * Math.PI * x) / G.spacing);
    return T.top + (T.jaw - T.top) * toJaw + swell * smooth(Math.min(1, b / 0.25));
  };
  const M = style.moustache;
  if (M) {
    // a band over the top lip (`drop` lower), drooping toward the corners of the mouth, above the beard
    const top = face.lip - M.drop;
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const t = -1 + i / 8, x = t * M.halfWidth, sag = M.droop * t * t;
      pts.push([x, top + M.height - sag]);
    }
    for (let i = 16; i >= 0; i--) {
      const t = -1 + i / 8, x = t * M.halfWidth * 0.96, sag = M.droop * t * t;
      pts.push([x, top + 0.006 - sag * 0.6]);
    }
    const centre = [0, top + M.height * 0.4];
    m.add({
      name: 'moustache', role: `hair-${slot.colour}`, parent: 'head',
      make: () => facePatch(face, { centre, outer: (a) => polygonRadius(pts, centre, a), thickness: M.thickness, inlay: style.inlay * 0.8, edge: M.edge }),
    });
  }
  if (style.wrap) {
    m.add({
      name: 'beard', role: `hair-${slot.colour}`, parent: 'head',
      print: { minus: 'head' }, // printed: only what stands out of the head (the mouth opening is sunk into it)
      make: () => shellGeometry(style.wrap, face),
    });
    return;
  }
  const centre = [face.mouth[0], face.mouth[1] + style.centre];
  m.add({
    name: 'beard', role: `hair-${slot.colour}`, parent: 'head',
    make: () => facePatch(base, {
      centre,
      inner: face.opening && ((a) => polygonRadius(face.opening, centre, a)),
      outer: (a) => outlineAt(style.outer, a),
      thickness, inlay: style.inlay, edge: style.edge,
    }),
  });
}
