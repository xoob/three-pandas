// beard.js — facial hair as a thin sculpted piece on the snout (facepatch.js),
// like the painted-and-raised beards of toy figures. A beard grows around the
// mouth: outside its own outline, as radius by angle around the mouth centre
// in the face's front view (angle 0 toward its left, π/2 up); inside, an open
// mouth keeps its outline free (the beard is a ring), a closed one is grown
// over (a filled patch; the moustache then marks where the mouth is).

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
  // chin beard: short around the mouth and up the cheeks like `boxed`, but the
  // chin carries the weight: the beard thickens from the mouth down to a
  // strong, rounded chin, and the moustache over it is a slim line
  chin: {
    centre: 0,
    jaw: [-0.42, 0.5],
    outer: mirror([[-Math.PI / 2, 0.25], [-1.1, 0.25], [-Math.PI / 4, 0.24], [0, 0.26], [Math.PI / 8, 0.25], [Math.PI / 4, 0.18], [3 * Math.PI / 8, 0.13], [Math.PI / 2, 0.085]]),
    thickness: { top: 0.022, jaw: 0.07 }, inlay: 0.04, edge: 0.2,
    moustache: { halfWidth: 0.15, height: 0.03, drop: 0, droop: 0.06, thickness: 0.03, edge: 0.6 },
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

/** Whether point `p` lies inside the closed polygon `pts` ([x, y] points). */
function inside(pts, [x, y]) {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < xi + ((xj - xi) * (y - yi)) / (yj - yi)) hit = !hit;
  }
  return hit;
}

/**
 * Add the beard for a recipe's `beard` slot ({ style, colour }).
 * `face`: { z(x, y) — the face surface's depth, mouth: [x, y] — the mouth centre,
 * lip — y of the top of the mouth, opening — the mouth outline as [x, y]
 * points for an open mouth, null for a closed one }.
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
  const centre = [face.mouth[0], face.mouth[1] + style.centre];
  // an open mouth is cut out of a beard that surrounds it; a beard whose
  // centre lies outside the opening (a chin beard below the mouth) leaves it alone
  const around = face.opening && inside(face.opening, centre);
  m.add({
    name: 'beard', role: `hair-${slot.colour}`, parent: 'head',
    make: () => facePatch(base, {
      centre,
      inner: around && ((a) => polygonRadius(face.opening, centre, a)),
      outer: (a) => outlineAt(style.outer, a),
      thickness, inlay: style.inlay, edge: style.edge,
    }),
  });
}
