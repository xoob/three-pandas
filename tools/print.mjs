// tools/print.mjs — turns the posed characters into multi-colour print files.
//
//   npm run print                         (builds first, then this into print-out/)
//   node tools/print.mjs <out-dir> [id ...]  only these figures, whole, in their
//                                           signature pose on a white base (the PR preview)
//
// The QR links carry the edition number from the EDITION file (baked in by
// build.sh); it changes only by hand, when a new edition starts.
//
// For each figure on the PLATES below (each with its own QR code under its
// round base, from its recipe's `codes`) it:
//   1. builds the model in print mode in headless Chromium (src/print.js)
//   2. makes every part a solid, turns painted areas into inlays and the fur
//      markings into a black region of the body
//   3. resolves overlaps by priority (details win over the base they sit on)
//      and merges everything into one solid per filament
//   4. scales to the shared scale (a plain standing panda is PRINT.height tall;
//      a taller figure is shrunk to fit), puts the base Z-up on the plate
//   5. writes one STL per filament, preview images, and projects.json, from
//      which tools/bambu.py builds the Bambu Studio projects (one per
//      figure, and one per plate)

import { chromium } from 'playwright-core';
import Module from 'manifold-3d';
import fs from 'node:fs';
import path from 'node:path';

const [OUT = 'print-out', ...ONLY] = process.argv.slice(2);
const EDITION = +fs.readFileSync('EDITION', 'utf8').trim();
fs.rmSync(OUT, { recursive: true, force: true }); // no stale files from figures that were dropped
fs.mkdirSync(OUT, { recursive: true });
const wasm = await Module();
wasm.setup();
const { Manifold, Mesh, CrossSection } = wasm;

// The AMS has 4 slots: a figure, and a plate of figures, uses at most 4
// filaments (white and black included); each part's filament comes from its
// role (ROLES in src/passes.js, the recipe's colours).
const SLOTS = 4;
// Plates list printed figures [character, pose, base, cut]: each with the QR
// code of that pose (its recipe's `codes`), its base colour (black, white or
// blue) and optionally a cut: only the slice between two heights `z` (mm above
// the plate), standing on its cut face, and optionally only `halfWidth` mm left
// and right of the head's centre. The plates of an edition are set here by hand.
const WHOLE = { z: [0, 1000] };
const PLATES = {
  // the gang, each in its own accent, on plates of two accents: blue and
  // grey, yellow and red, green
  gang_a: [['analyst', 'hooray'], ['guardian', 'guard']].map(([id, pose]) => [id, pose, 'white', WHOLE]),
  gang_b: [['detective', 'dance'], ['photographer', 'run']].map(([id, pose]) => [id, pose, 'white', WHOLE]),
  gang_c: [['listener', 'point', 'white', WHOLE]],
  // quick validation of the fixes after test print 1, split by accent like the
  // gang. All slices stand on the plate side by side, so the plate is only as
  // tall as the tallest one (≈ 13 mm), which keeps the colour changes down.
  gang_test_a: [
    ['analyst', 'hooray', 'white', { z: [13, 23], halfWidth: 12 }], // belly cloud
    ['analyst', 'hooray', 'white', { z: [25, 38], halfWidth: 12.5 }], // whole glasses frames, eye patches, crescents, mouth
    ['listener', 'point', 'white', { z: [24, 34] }], // pupils, cushions, mouth
  ],
  gang_test_b: [
    ['photographer', 'run', 'white', { z: [0, 1.2] }], // QR first layer
    ['photographer', 'run', 'white', { z: [3, 14] }], // lifted foot on its supports
  ],
};
const figureKey = (id, pose, base, cut) => (cut === WHOLE ? `${id}-${pose}-${base}`
  : `${id}-${pose}-${base}-z${cut.z[0]}-${cut.z[1]}${cut.halfWidth ? `-w${cut.halfWidth}` : ''}`);

// ---------- geometry helpers ----------

function solidFromMesh(positions, index, name) {
  const mesh = new Mesh({ numProp: 3, vertProperties: new Float32Array(positions), triVerts: new Uint32Array(index) });
  mesh.merge();
  try {
    const m = new Manifold(mesh);
    if (m.isEmpty()) throw new Error('empty');
    return m;
  } catch (e) {
    throw new Error(`part "${name}" is not a closed solid (${e.message})`);
  }
}

const ccw = (pts) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; a += x1 * y2 - x2 * y1; }
  return a >= 0 ? pts : pts.slice().reverse();
};

function shape2d(s) {
  if (s.poly) return new CrossSection([ccw(s.poly)]);
  if (s.circle) { const [x, y, r] = s.circle; return CrossSection.circle(r, 64).translate([x, y]); }
  if (s.roundRect) {
    const [x, y, w, h, r] = s.roundRect;
    const rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4);
    const sq = CrossSection.square([w, h]).translate([x, y]);
    return rr > 1e-4 ? sq.offset(-rr, 'Miter').offset(rr, 'Round', 2, 32) : sq;
  }
  throw new Error('unknown 2D shape ' + JSON.stringify(s));
}

// `depthMm`, when given, is the inlay's printed depth (e.g. exactly the first layer)
function flatRegion(r, clip, scale) {
  // each step frees the previous intermediate (QR codes have hundreds of ops)
  const step = (old, next) => (old.delete(), next);
  let cs = shape2d(r.ops[0].add);
  for (const op of r.ops.slice(1)) {
    const piece = shape2d(op.add ?? op.sub);
    cs = step(cs, op.add ? cs.add(piece) : cs.subtract(piece));
    piece.delete();
  }
  const [units, outward] = r.depth;
  const inward = r.depthMm === undefined ? units : r.depthMm / scale;
  let m = cs.extrude(inward + outward);
  cs.delete();
  m = step(m, m.translate([0, 0, -inward]));
  m = step(m, m.transform(r.matrix));
  return step(m, m.intersect(clip));
}

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// fur markings: the black part of the body (same field as the viewer's shader)
function markingsRegion(r) {
  const f = r.field, [rx, ry, rz] = f.radii;
  const sdf = ([x, y, z]) => {
    const ux = x / rx, uy = y / ry, uz = z / rz, k = 1 - f.pear * uy;
    let vx = ux / k, vy = uy, vz = uz / k;
    const L = Math.hypot(vx, vy, vz) || 1e-9;
    vx /= L; vy /= L; vz /= L;
    const band = Math.max(vy - f.shoulders, f.hips - vy);
    const bib = (1 - Math.hypot(vx / f.bib.width, (vy - f.bib.centre) / f.bib.height)) * smoothstep(0.05, 0.45, vz);
    const field = band - 1.5 * Math.max(bib, 0);
    return Math.min(field * 0.35, (1.2 - Math.hypot(ux, uy, uz)) * 0.4);
  };
  const b = 1.4;
  const zone = Manifold.levelSet(sdf, { min: [-rx * b, -ry * b, -rz * b], max: [rx * b, ry * b, rz * b] }, 0.01);
  const placed = zone.transform(r.matrix);
  zone.delete();
  return placed; // buildFigure clips it to the body
}

// ---------- one character ----------

function buildFigure(data, cut) {
  const filamentOf = (r) => {
    const e = data.roles[r.role];
    if (!e) throw new Error(`${data.label}: part "${r.name}" has role "${r.role}", which has no print colour`);
    return e;
  };

  // every temporary solid goes into the pool and is freed at the end
  const pool = new Set();
  const keep = (m) => { for (const x of Array.isArray(m) ? m : [m]) pool.add(x); return m; };

  const solids = {};
  for (const r of data.regions) if (r.kind === 'mesh') solids[r.name] = keep(solidFromMesh(r.positions, r.index, r.name));
  for (const r of data.regions) if (r.minus) solids[r.name] = keep(solids[r.name].subtract(solids[r.minus])); // hair: only what stands out of the head

  // model units (Y up) → millimetres (Z up, front toward −Y), base on Z = 0.
  // One scale for all figures (the standing reference panda is PRINT.height
  // tall, without the base); a figure that would be taller is shrunk to fit.
  // Painted regions are clipped to the parts, so the parts alone give the extent.
  const box = keep(Manifold.union(Object.values(solids))).boundingBox();
  const s = Math.min(data.print.height / data.reference, data.print.height / (box.max[1] - box.min[1] - (data.base.height - data.base.sink)));
  const cx = (box.min[0] + box.max[0]) / 2, cz = (box.min[2] + box.max[2]) / 2;
  const toPlate = [s, 0, 0, 0, 0, 0, s, 0, 0, -s, 0, 0, -cx * s, cz * s, -box.min[1] * s, 1];

  // What a painted region takes away from the part under it (its cutter) is
  // clipped to a copy of that part grown by 0.01 %: subtracting a region bounded
  // by the very surface it was clipped to left zero-thickness skins of the part
  // along every colour boundary (coincident faces in the boolean), which showed
  // as spikes in the previews (they don't print)
  const grown = {};
  const grownClip = (name) => grown[name] ??= (() => {
    const bb = solids[name].boundingBox(), c = bb.min.map((v, i) => (v + bb.max[i]) / 2);
    return keep(keep(keep(solids[name].translate(c.map((v) => -v))).scale([1 + 1e-4, 1 + 1e-4, 1 + 1e-4])).translate(c));
  })();
  // priority → filament → { solids, cutters }
  const byPriority = new Map();
  for (const r of data.regions) {
    const [filament, prio] = filamentOf(r);
    let solid, cutter;
    if (r.kind === 'mesh') solid = cutter = solids[r.name];
    else if (r.kind === 'flat') { solid = keep(flatRegion(r, solids[r.clip], s)); cutter = keep(flatRegion(r, grownClip(r.clip), s)); }
    else if (r.kind === 'field') { const zone = keep(markingsRegion(r)); solid = keep(zone.intersect(solids[r.clip])); cutter = keep(zone.intersect(grownClip(r.clip))); }
    if (!byPriority.has(prio)) byPriority.set(prio, new Map());
    const level = byPriority.get(prio);
    if (!level.has(filament)) level.set(filament, { solids: [], cutters: [] });
    level.get(filament).solids.push(solid);
    level.get(filament).cutters.push(cutter);
  }

  // highest priority first; each level only keeps what nothing above it claimed
  // (within a level, filaments claim in FILAMENT order)
  let claimed = null;
  const pieces = {};
  const order = Object.keys(FILAMENT);
  for (const prio of [...byPriority.keys()].sort((a, b) => b - a)) {
    const level = byPriority.get(prio);
    for (const filament of [...level.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b))) {
      const { solids: list, cutters } = level.get(filament);
      const solid = keep(Manifold.union(list));
      (pieces[filament] ??= []).push(claimed ? keep(solid.subtract(claimed)) : solid);
      const taken = keep(Manifold.union(cutters));
      claimed = claimed ? keep(Manifold.union(claimed, taken)) : taken;
    }
  }

  const report = { id: data.variant, figure: data.label, pose: data.pose, mm_per_unit: +s.toFixed(2), filaments: {} };
  report.before_colour_split = keep(claimed.decompose()).filter((c) => c.volume() > 1e-4).length;
  // per filament: to the plate, slivers from the booleans dropped, then only
  // the slice between cut.z heights (mm; the whole figure by default), within
  // cut.halfWidth of the head's centre, standing on its cut face; split into its shells
  const head = solids.head.boundingBox(), headX = ((head.min[0] + head.max[0]) / 2 - cx) * s;
  const [x0, x1] = cut.halfWidth ? [headX - cut.halfWidth, headX + cut.halfWidth] : [-500, 500];
  const slab = keep(Manifold.cube([x1 - x0, 1000, cut.z[1] - cut.z[0]]).translate([x0, -500, cut.z[0]]));
  const shells = []; // { filament, solid }
  for (const [filament, list] of Object.entries(pieces)) {
    const chunks = keep(keep(keep(keep(Manifold.union(list)).transform(toPlate)).simplify(0.004)).decompose());
    const kept = chunks.filter((c) => c.volume() >= 0.02);
    report.filaments[filament] = { pieces: kept.length, slivers_dropped: chunks.length - kept.length };
    const sliced = keep(keep(keep(Manifold.union(kept)).intersect(slab)).translate([0, 0, -cut.z[0]]));
    for (const s of keep(sliced.decompose())) if (s.volume() >= 0.02) shells.push({ filament, solid: s });
  }
  // bodies: shells that touch (a colour region enclosed by others) belong together
  const group = shells.map((_, i) => i);
  const root = (i) => (group[i] === i ? i : (group[i] = root(group[i])));
  for (let i = 0; i < shells.length; i++) {
    for (let j = i + 1; j < shells.length; j++) if (shells[i].solid.minGap(shells[j].solid, 0.05) < 0.01) group[root(i)] = root(j);
  }
  const bodies = Object.values(Object.groupBy(shells.map((sh, i) => ({ ...sh, body: root(i) })), (sh) => sh.body));
  const volume = (body) => body.reduce((v, sh) => v + sh.solid.volume(), 0);
  // a whole figure must be one body; a cut can leave pieces hanging in the air
  // (attached above the cut): those go down onto the plate, in a row in front
  bodies.sort((a, b) => volume(b) - volume(a));
  const boxOf = (body) => {
    const bb = body.map((sh) => sh.solid.boundingBox());
    return { min: [0, 1, 2].map((k) => Math.min(...bb.map((b) => b.min[k]))), max: [0, 1, 2].map((k) => Math.max(...bb.map((b) => b.max[k]))) };
  };
  const main = boxOf(bodies[0]);
  let x = main.min[0];
  const placed = bodies.map((body, i) => {
    const b = boxOf(body);
    const move = i === 0 ? [0, 0, -b.min[2]] : [x - b.min[0], main.min[1] - 3 - b.max[1], -b.min[2]];
    if (i > 0) x += b.max[0] - b.min[0] + 3;
    return body.map((sh) => ({ filament: sh.filament, solid: keep(sh.solid.translate(move)) }));
  }).flat();
  const parts = {};
  for (const filament of Object.keys(pieces)) {
    const mine = placed.filter((sh) => sh.filament === filament).map((sh) => sh.solid);
    if (!mine.length) continue;
    parts[filament] = Manifold.union(mine);
    Object.assign(report.filaments[filament], { volume_mm3: +parts[filament].volume().toFixed(1), triangles: parts[filament].numTri() });
  }
  const all = keep(Manifold.union(Object.values(parts)));
  const bb = all.boundingBox();
  report.size_mm = bb.max.map((v, i) => +(v - bb.min[i]).toFixed(1));
  report.connected_bodies = bodies.filter((body) => volume(body) >= 0.5).length;
  report.contact_area_mm2 = +footprint(all).toFixed(1);
  for (const m of pool) m.delete(); // temporaries: the WebAssembly heap runs out across many figures otherwise
  return { parts, report, box: bb };
}

// area of the flat bottom face (what sticks to the plate)
function footprint(solid) {
  const slab = solid.intersect(Manifold.cube([1000, 1000, 0.05], true).translate([0, 0, 0.025]));
  return slab.volume() / 0.05;
}

// ---------- files ----------

function meshArrays(solid) {
  const m = solid.getMesh();
  const v = m.vertProperties, n = m.numProp;
  const pos = new Float32Array((v.length / n) * 3);
  for (let i = 0, j = 0; i < v.length; i += n, j += 3) { pos[j] = v[i]; pos[j + 1] = v[i + 1]; pos[j + 2] = v[i + 2]; }
  return { positions: pos, index: m.triVerts };
}

function writeSTL(file, solid) {
  const { positions: p, index: t } = meshArrays(solid);
  const n = t.length / 3, buf = Buffer.alloc(84 + n * 50);
  buf.write('panda print part', 0);
  buf.writeUInt32LE(n, 80);
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50, a = t[i * 3] * 3, b = t[i * 3 + 1] * 3, c = t[i * 3 + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    [nx / l, ny / l, nz / l, p[a], p[a + 1], p[a + 2], p[b], p[b + 1], p[b + 2], p[c], p[c + 1], p[c + 2]]
      .forEach((x, k) => buf.writeFloatLE(x, o + k * 4));
  }
  fs.writeFileSync(file, buf);
}

// ---------- run ----------

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined, // otherwise Playwright's default Chromium
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('file://' + path.resolve('dist/print.html'));
await page.waitForFunction(() => window.exportPrint);
const FILAMENT = await page.evaluate(() => window.filaments); // FILAMENTS in src/passes.js
// the figures given by id (whole, signature pose, white base), else every figure on the plates
const signatures = await page.evaluate(() => window.signatures);
for (const id of ONLY) if (!signatures[id]) throw new Error(`no figure "${id}" (have ${Object.keys(signatures).join(', ')})`);
const plates = ONLY.length ? {} : PLATES;
const FIGURES = [...new Map((ONLY.length ? ONLY.map((id) => [id, signatures[id], 'white', WHOLE]) : Object.values(PLATES).flat())
  .map(([id, pose, base, cut]) => [figureKey(id, pose, base, cut), { id, pose, base, cut }])).entries()];

/** AMS slot order for a set of figures: white, black, then the rest in FILAMENT order. */
function slotsFor(what, figs) {
  const used = new Set(['white', 'black', ...figs.flatMap((f) => Object.keys(f.parts))]);
  const slots = Object.keys(FILAMENT).filter((f) => used.has(f));
  if (slots.length > SLOTS) throw new Error(`${what} needs ${slots.length} filaments (${slots.join(', ')}); the AMS has ${SLOTS} slots`);
  return slots;
}

const figures = {};
for (const [key, { id: variant, pose, base, cut }] of FIGURES) {
  const data = await page.evaluate(([v, p, b]) => window.exportPrint(v, p, b), [variant, pose, base]);
  const t0 = Date.now();
  const fig = buildFigure(data, cut);
  fig.report.seconds = +((Date.now() - t0) / 1000).toFixed(1);
  const slice = cut === WHOLE ? '' : `, ${cut.z[0]}–${cut.z[1]} mm${cut.halfWidth ? `, ±${cut.halfWidth} mm` : ''}`;
  fig.report.figure += slice;
  figures[key] = { ...fig, name: `${data.label} (${base} base${slice})` };
  const slots = slotsFor(figures[key].name, [fig]);
  fig.report.slots = slots;
  figures[key].stls = Object.keys(fig.parts).map((filament) => ({ stl: `${key}-${slots.indexOf(filament) + 1}-${filament}.stl`, filament }));
  for (const { stl, filament } of figures[key].stls) writeSTL(path.join(OUT, stl), fig.parts[filament]);
  console.log(JSON.stringify(fig.report));
}

// Bambu Studio projects (tools/bambu.py): one per figure, plus one per plate
const colours = Object.fromEntries(Object.entries(FILAMENT).map(([k, f]) => [k, f.colour]));
const project = (file, title, keys) => ({ file, title, slots: slotsFor(title, keys.map((key) => figures[key])), colours,
  figures: keys.map((key) => ({ name: figures[key].name, parts: figures[key].stls })) });
fs.writeFileSync(path.join(OUT, 'projects.json'), JSON.stringify([
  ...FIGURES.map(([key]) => project(`${key}.3mf`, `Panda ${figures[key].name}, edition ${EDITION}`, [key])),
  ...Object.entries(plates).map(([plate, list]) => project(`${plate}.3mf`, `Panda ${plate}, edition ${EDITION}`, list.map(([id, pose, base, cut]) => figureKey(id, pose, base, cut)))),
], null, 2));

// previews
const prev = await browser.newPage({ viewport: { width: 520, height: 620 } });
await prev.goto('file://' + path.resolve('dist/preview.html'));
await prev.waitForFunction(() => window.previewReady);
for (const [id, f] of Object.entries(figures)) {
  const parts = Object.entries(f.parts).map(([fil, solid]) => {
    const { positions, index } = meshArrays(solid);
    return { colour: FILAMENT[fil].colour, positions: Array.from(positions), index: Array.from(index) };
  });
  for (const view of ['front', 'iso', 'back', 'bottom', 'detail']) {
    await prev.evaluate(({ parts, view }) => window.showPrint([{ parts }], view), { parts, view });
    await prev.screenshot({ path: path.join(OUT, `preview-${id}-${view}.png`) });
  }
}
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(Object.values(figures).map((f) => f.report), null, 2));
if (errs.length) console.log('page errors:', errs);
await browser.close();
