// outfit.js — clothes as sculpted pieces over the body, like a toy figure's
// moulded clothing. An outfit is a loft around the body's vertical axis
// (squashed front to back like the body) whose closed profile may change with
// the angle: down to `skirt` it hugs the body (the pear-shaped ellipsoid) at
// `thickness`, below that it flares out to the hem as a bell with pleat
// grooves and a rounded lip. The neckline dips at the front (a V) and at the
// back (a scoop). The inside lies just under the body surface, so the piece
// is closed and prints as one solid that the body colour can't show through.
// A belt sits proud of the outfit at the waist, with a small buckle or a cloth
// knot with short hanging ends in front; a sash may run across the chest from
// one shoulder to the other hip. Everything is parented to the pelvis, so it
// follows the body through every pose. An outfit with `sleeves` also covers
// the arms down to the wrists (tubes re-swept with the arms in every pose),
// one with a `hood` carries it rolled up on the upper back, and a `pocket`
// is a raised patch on the belly.
//
// Positions on the body are unit-sphere heights t (−1 bottom … 1 top); angles
// around the body are azimuths a (0 = front, + toward its left).

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { v3, Y, sweep } from './shapes.js';
import { SIDES } from './rig.js';

export const OUTFITS = {
  // sleeveless dress: straps up at the shoulders (the arms come out of it),
  // a V-neck in front, hugging the body down to a belt at the waist, then a
  // pleated bell skirt to a hem just above the knee
  dress: {
    top: 0.68, skirt: -0.36, // body heights of the straps and of where the skirt leaves the body
    neck: { front: 0.25, width: 1.15, back: 0.08, backWidth: 1.5 }, // how deep the neckline dips (body heights) and over what half-angle
    belt: { t: -0.3, height: 0.09, proud: 0.025, buckle: [0.11, 0.09, 0.07] }, // waist height, band height, how far it stands off the dress; buckle size
    hem: { y: -0.15, flare: 0.13, belly: 0.03, lip: 0.02 }, // hem height (pelvis space), how far it stands out from the body, bell curve, rounded edge
    pleats: { count: 12, depth: 0.04 }, // grooves down the skirt, deepest at the hem
    thickness: 0.03,
  },
  // ninja gi: a wrapped robe open in a deep V over the chest (the white bib
  // shows), hugging the body to the hips and ending in a short straight hem;
  // a cloth belt knotted in front, its two ends hanging over the hem, and a
  // cord slung from the left shoulder to the right hip for a sword on the back
  gi: {
    top: 0.8, skirt: -0.5,
    neck: { front: 0.52, width: 0.95, back: 0.12, backWidth: 1.4 },
    belt: { t: -0.28, height: 0.12, proud: 0.03, knot: { size: [0.2, 0.13, 0.08], ends: { width: 0.09, length: 0.24, spread: 0.07 } } },
    hem: { y: -0.22, flare: 0.07, belly: 0.0, lip: 0.02 },
    pleats: { count: 0, depth: 0 },
    sash: { high: 0.74, low: -0.16, radius: 0.05 }, // body heights at the left shoulder and at the right hip
    collar: { height: 0.11, proud: 0.025 }, // a dark band along the neckline: the robe's lapels
    thickness: 0.03,
  },
  // hoodie: a sweatshirt hugging the body from a round neck to a ribbed hem
  // at the hips, sleeves down to the wrists (the paws stay out), the hood
  // lying rolled up on the upper back under the head, and a pouch pocket on
  // the belly. No belt.
  hoodie: {
    top: 0.82, skirt: -0.56,
    neck: { front: 0.1, width: 0.9, back: 0, backWidth: 1.4 },
    hem: { y: -0.07, flare: 0.015, belly: 0.012, lip: 0.03 }, // a short, thick-lipped drop: the rib band
    pleats: { count: 0, depth: 0 },
    // sleeves: over the arm tubes from the shoulder to `to` (share of the arm's
    // joint chain; 0.75 = the wrist), `cuff` thicker over the last `band` of it
    sleeves: { to: 0.72, cuff: 0.018, band: 0.1 },
    // hood: a roll around the back of the neck at body height `t`, reaching
    // `span` radians to each side of the back, thin at its ends and `radius[1]`
    // thick in the middle, flattened to `flatten` of its height
    hood: { t: 0.5, span: 1.45, radius: [0.05, 0.15], flatten: 0.8 },
    // pouch pocket: raised by `proud` between body heights `t`, `halfAngle`
    // wide at its bottom and top (a trapezoid), edges `soft` radians wide
    pocket: { t: [-0.5, -0.1], halfAngle: [0.66, 0.44], proud: 0.028, soft: 0.07 },
    thickness: 0.03,
  },
};

const SINK = 0.02; // the inside, under the body surface
const STEPS = 24;
const SEGMENTS = 96;

/**
 * Add the outfit for a recipe's `outfit` slot ({ style, colour }).
 * `body`: { offset, radii, pear } — the body ellipsoid (pelvis space) and its taper.
 */
export function addOutfit(m, slot, body) {
  const style = OUTFITS[slot.style];
  const thickness = (st) => (st.print ? Math.max(style.thickness, 0.05) : style.thickness);
  m.remove((p) => p.name === 'tail'); // the dress covers the seat; the tail would poke through the belt
  m.add({
    name: 'outfit', role: slot.colour, parent: 'pelvis', position: body.offset,
    make: (st) => dressGeometry(style, body, thickness(st)),
  });
  if (style.belt) {
    m.add({
      name: 'belt', role: 'dark', parent: 'pelvis', position: body.offset,
      make: (st) => beltGeometry(style, body, thickness(st)),
    });
  }
  if (style.collar) {
    m.add({
      name: 'collar', role: 'dark', parent: 'pelvis', position: body.offset,
      make: (st) => collarGeometry(style, body, thickness(st)),
    });
  }
  const R = body.radii;
  const S = style.sleeves;
  if (S) {
    for (const side of Object.keys(SIDES)) {
      m.add({
        name: `sleeve${side}`, role: slot.colour, dynamic: true, // re-swept with the arm after every pose change
        make: (st, prev) => sleeveGeometry(S, body.arm, body.arm.joints.map((j) => m.jointPosition(j + side)), thickness(st), prev),
      });
    }
  }
  const H = style.hood;
  if (H) {
    const pts = [], radii = [];
    for (let i = 0; i <= 16; i++) {
      const a = Math.PI - H.span + 2 * H.span * (i / 16), f = 1 - Math.abs(i / 8 - 1);
      const rad = H.radius[0] + (H.radius[1] - H.radius[0]) * f * f * (3 - 2 * f);
      const r = bodyRadius(body, H.t) + style.thickness + rad * 0.35; // lying on the outfit, sunk into it
      pts.push(v3(r * Math.sin(a), R.y * H.t / H.flatten, r * Math.cos(a) * R.z / R.x));
      radii.push(rad);
    }
    m.add({ name: 'hood', role: slot.colour, parent: 'pelvis', position: body.offset,
      make: () => sweep(pts, radii, { radial: 16, up: Y }).scale(1, H.flatten, 1) });
  }
  if (!style.belt) return;
  const front = bodyRadius(body, style.belt.t) + style.thickness + style.belt.proud; // the belt's face at the front
  const onBelt = (d) => body.offset.clone().add(v3(0, R.y * style.belt.t, front * R.z / R.x + d / 2 - 0.03));
  // printed, the belt stands further out, so what sits on it grows forward by the difference
  const grown = (w, h, d, st) => {
    const extra = thickness(st) - style.thickness;
    return new RoundedBoxGeometry(w, h, d + extra, 3, 0.02).translate(0, 0, extra / 2);
  };
  if (style.belt.buckle) {
    // buckle: sunk a little into the belt's face so the two fuse
    const [w, h, d] = style.belt.buckle;
    m.add({ name: 'buckle', role: 'trim', parent: 'pelvis', position: onBelt(d), make: (st) => grown(w, h, d, st) });
  }
  const K = style.belt.knot;
  if (K) {
    // cloth knot on the belt, its two ends hanging down over the outfit, lying on it
    const [w, h, d] = K.size;
    m.add({ name: 'knot', role: 'dark', parent: 'pelvis', position: onBelt(d), make: (st) => grown(w, h, d, st) });
    // the ends hang flat in front of the skirt, from under the knot (sunk into it)
    const E = K.ends;
    const y = R.y * style.belt.t - h / 2 - E.length / 2 + 0.03;
    const z = (bodyRadius(body, style.skirt) + style.thickness + style.hem.flare * 0.5) * R.z / R.x;
    for (const [side, s] of [['L', 1], ['R', -1]]) {
      m.add({ name: `beltEnd${side}`, role: 'dark', parent: 'pelvis', position: body.offset.clone().add(v3(s * E.spread, y, z)),
        make: (st) => new RoundedBoxGeometry(E.width, E.length, 0.04 + thickness(st), 2, 0.012) });
    }
  }
  const C = style.sash;
  if (C) {
    // a cord around the body on a tilted plane: highest over the left shoulder,
    // lowest at the right hip; two capped halves that overlap at the sides
    const point = (a) => {
      const t = (C.high + C.low) / 2 + ((C.high - C.low) / 2) * Math.sin(a);
      const r = bodyRadius(body, t) + style.thickness + C.radius * 0.6;
      return v3(r * Math.sin(a), R.y * t, r * Math.cos(a) * R.z / R.x);
    };
    for (const [name, a0] of [['sashFront', -Math.PI / 2], ['sashBack', Math.PI / 2]]) {
      const pts = Array.from({ length: 25 }, (_, i) => point(a0 - 0.2 + (Math.PI + 0.4) * (i / 24)));
      m.add({ name, role: 'dark', parent: 'pelvis', position: body.offset,
        make: () => sweep(pts, pts.map(() => C.radius), { radial: 12, up: Y }) });
    }
  }
}

/**
 * A sleeve: a tube along the arm's own curve (through `joints`, the arm's
 * joint positions) from the shoulder to `S.to`, standing `thickness` off the
 * arm tube (radii `arm.radii`), with a thicker cuff and a rounded end.
 */
function sleeveGeometry(S, arm, joints, thickness, prev) {
  const curve = new THREE.CatmullRomCurve3(joints, false, 'centripetal');
  const spans = joints.length - 1, N = 20;
  const pts = [], radii = [];
  for (let i = 0; i <= N; i++) {
    const t = S.to * (i / N);
    const k = Math.min(Math.floor(t * spans), spans - 1), f = t * spans - k;
    const r = arm.radii[k] + (arm.radii[k + 1] - arm.radii[k]) * f * f * (3 - 2 * f);
    pts.push(curve.getPoint(t));
    radii.push(r + thickness + (t > S.to - S.band ? S.cuff : 0));
  }
  // the end: closed over a short taper, like a rolled cuff
  pts.push(pts[N].clone().addScaledVector(curve.getTangent(S.to), 0.03));
  radii.push(radii[N] * 0.45);
  return sweep(pts, radii, { caps: 'both', up: Y, rings: prev?.userData.rings }, prev);
}

// body silhouette (x) at height t
const bodyRadius = (body, t) => body.radii.x * Math.sqrt(Math.max(0, 1 - t * t)) * (1 - body.pear * t);

/** Closed solid lofted around Y from a closed profile ([r, y] pairs) that may depend on the azimuth. */
function loft(profileAt, squash) {
  const N = profileAt(0).length;
  const pos = [];
  for (let j = 0; j < SEGMENTS; j++) {
    const a = (j / SEGMENTS) * Math.PI * 2;
    for (const [r, y] of profileAt(a)) pos.push(r * Math.sin(a), y, r * Math.cos(a) * squash);
  }
  const at = (j, k) => (j % SEGMENTS) * N + (k % N);
  const idx = [];
  for (let j = 0; j < SEGMENTS; j++) {
    for (let k = 0; k < N; k++) idx.push(at(j, k), at(j + 1, k), at(j + 1, k + 1), at(j, k), at(j + 1, k + 1), at(j, k + 1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a)); // azimuth to −π … π
const vee = (a, width) => Math.max(0, 1 - Math.abs(wrap(a)) / width); // 1 at a = 0, straight down to 0 at ±width
const scoop = (a, width) => Math.max(0, Math.cos((Math.PI / 2) * Math.abs(wrap(a)) / width));

function dressGeometry(style, body, thickness) {
  const R = body.radii;
  const radius = (t) => bodyRadius(body, t);
  const y = (t) => R.y * t;
  const hemY = style.hem.y - body.offset.y;
  const hemR = radius(style.skirt) + style.hem.flare;
  return loft((a) => {
    const top = style.top - style.neck.front * vee(a, style.neck.width) - style.neck.back * scoop(a - Math.PI, style.neck.backWidth);
    const outer = [], inner = [];
    const P = style.pocket;
    const pocket = (t) => { // how far the pouch pocket stands off the outfit here
      if (!P) return 0;
      const f = (t - P.t[0]) / (P.t[1] - P.t[0]);
      const half = P.halfAngle[0] + (P.halfAngle[1] - P.halfAngle[0]) * f;
      const edge = (d) => { const k = Math.min(1, Math.max(0, d / P.soft)); return k * k * (3 - 2 * k); };
      return P.proud * edge(half - Math.abs(wrap(a))) * edge((Math.min(t - P.t[0], P.t[1] - t)) * 2);
    };
    for (let i = 0; i <= STEPS; i++) {
      const t = top + (style.skirt - top) * (i / STEPS);
      outer.push([radius(t) + thickness + pocket(t), y(t)]);
      inner.push([radius(t) - SINK, y(t)]);
    }
    // skirt: from where it leaves the body out and down to the hem as a bell,
    // with pleat grooves that deepen toward the hem
    const [startR, startY] = outer[outer.length - 1];
    const groove = style.pleats.depth * Math.abs(Math.sin((style.pleats.count / 2) * a));
    for (let i = 1; i <= STEPS; i++) {
      const f = i / STEPS;
      const r = startR + (hemR - startR) * f + style.hem.belly * Math.sin(Math.PI * f) - groove * f;
      outer.push([r, startY + (hemY - startY) * f]);
      inner.push([r - thickness, startY + (hemY - startY) * f]);
    }
    // rounded lip around the hem: a half circle from the outside to the inside
    const [edgeR, edgeY] = outer[outer.length - 1];
    const lipR = (thickness + style.hem.lip) / 2, lipX = edgeR + style.hem.lip - lipR;
    const lip = Array.from({ length: 7 }, (_, i) => {
      const b = (Math.PI * i) / 6;
      return [lipX + lipR * Math.cos(b), edgeY - lipR * Math.sin(b)];
    });
    // closed profile, wound so the loft faces outward: inside top → hem, lip, outside hem → top
    return [...inner.slice(0, -1), ...lip.reverse(), ...outer.slice(0, -1).reverse()];
  }, R.z / R.x);
}

// collar: a band along the neckline, standing a little proud of the outfit,
// closed over the outfit's top edge so the two fuse
function collarGeometry(style, body, thickness) {
  const R = body.radii;
  const radius = (t) => bodyRadius(body, t);
  const y = (t) => R.y * t;
  const C = style.collar;
  const h = C.height / R.y;
  return loft((a) => {
    const top = style.top - style.neck.front * vee(a, style.neck.width) - style.neck.back * scoop(a - Math.PI, style.neck.backWidth);
    const outer = [], inner = [];
    for (let i = 0; i <= 8; i++) {
      const t = top + 0.01 - h * (i / 8);
      const lip = Math.sqrt(1 - (1 - Math.min(1, (2 * Math.min(i, 8 - i)) / 8 + 0.3)) ** 2); // rounded along both edges
      outer.push([radius(t) + thickness + C.proud * lip, y(t)]);
      inner.push([radius(t) - SINK, y(t)]);
    }
    return [...inner, ...outer.reverse()];
  }, R.z / R.x);
}

// belt: a band that follows the body around the waist, standing off the dress,
// with rounded outer edges; its inside lies under the body so it fuses with the dress
function beltGeometry(style, body, thickness) {
  const R = body.radii;
  const { t, height, proud } = style.belt;
  const half = height / 2 / R.y;
  const out = (tt) => bodyRadius(body, tt) + thickness + proud;
  const round = 0.015;
  const corner = (cy, sign) => Array.from({ length: 4 }, (_, i) => {
    const b = (Math.PI / 2) * (i / 3);
    const tt = t + sign * (half - round / R.y);
    return [out(tt) - round + round * Math.cos(b), cy + sign * round * Math.sin(b)];
  });
  const profile = [
    [bodyRadius(body, t - half) - SINK, R.y * (t - half)],
    ...corner(R.y * (t - half), -1).reverse(),
    ...corner(R.y * (t + half), 1),
    [bodyRadius(body, t + half) - SINK, R.y * (t + half)],
  ];
  return loft(() => profile, R.z / R.x);
}
