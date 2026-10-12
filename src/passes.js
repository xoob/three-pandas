// passes.js — the panda is built in five passes, simplest first. Each pass works
// on the model the previous passes left behind: it adds parts, replaces parts,
// or changes the style the parts are drawn with.
//
//   1 Rig       joints and bones, posed from POSES (rig.js)
//   2 Blockout  primitives; one capsule per bone
//   3 Tubes     capsules replaced by one tube per limb, swept through the joints
//   4 Details   fur markings, face, glasses, tablet, chest badge
//   5 Look      panda colours, shadows, reflections
//
// Geometry is always derived from the joints, so a new pose only needs new
// numbers in rig.js. The model API used here lives in panda.js.

import * as THREE from 'three';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RIG, SIDES, buildSkeleton, attachment, applyPose, resolvePose } from './rig.js';
import qrcode from 'qrcode-generator';
import { addHair, hairClearance } from './hair.js';
import { addBeard } from './beard.js';
import { addOutfit } from './outfit.js';
import { facePatch, polygonRadius } from './facepatch.js';
import {
  v3, X, Z, Y, ellipsoid, sweep, capsule, boneGizmo, orientZ, onEllipsoid, yawPitch, octagon, lathe, arc,
} from './shapes.js';

// ---------------------------------------------------------------------------
// Proportions
// ---------------------------------------------------------------------------

export const BODY = { offset: v3(0, 0.25, 0), radii: v3(0.5, 0.44, 0.45), detail: 14 }; // relative to the pelvis joint
export const HEAD = v3(0.66, 0.57, 0.6); // head radii, centred on the head joint

// 3D print settings (print.js). At 40 mm tall one model unit is about 17 mm,
// so `minLine` 0.05 ≈ 0.85 mm: two lines of a 0.4 mm nozzle.
// `height` is a plain panda standing in the Rest pose, without the base: all
// figures share that scale, and one that would be taller is shrunk to fit.
export const PRINT = { height: 40, minLine: 0.05, inlay: 0.05 };
// extra inlay depth for decals on the curved head and body, so they reach the
// surface right to their edges (print.js `reach`)
const CURVED = 0.1;

// Round base every figure stands on (Blockout pass), black, with a QR code on
// the underside (Details pass) that opens the figure on the website. The
// panda is lifted onto it; its soles sink `sink` into the top so they fuse.
// At print size: about 37 mm across and 3 mm high.
export const BASE = {
  radius: 1.1, height: 0.18, sink: 0.01, fillet: { top: 0.06, bottom: 0.02 },
  // underside: a QR code as large as the flat face allows, printed as a single
  // white first layer (0.2 mm), so it costs no extra filament changes. Modules
  // ≈ 0.93 mm: 0.72 mm dots were knocked off on the first test print, and the
  // lettering that used to curve around it came out garbled, so it's gone.
  // links to <url><code>/<edition>: the edition number (EDITION file),
  // matched by a wildcard redirect, so a new edition needs no website change
  qr: { url: 'HTTPS://PANDAS.XOOB.DE/', version: 2, ecc: 'M', quiet: 1, margin: 0.04 },
  depthMm: 0.2,
};
const LIFT = BASE.height - BASE.sink; // panda floor above the plate
// base colour → role (the QR code is black on white on every base)
export const BASE_COLOURS = { black: 'black', white: 'fur', blue: 'baseBlue' };

// The global palette: every filament a figure may use (name and colour for the
// 3MF and previews). Figures pick their accents from it; a figure, and a plate
// of figures, may use at most 4 of them (the AMS), white and black included.
export const FILAMENTS = {
  white: { name: 'White', colour: '#F2F2F2' },
  black: { name: 'Black', colour: '#1E1F25' },
  blue: { name: 'Blue', colour: '#2F6BDC' },
  green: { name: 'Green', colour: '#37B24D' },
  yellow: { name: 'Yellow', colour: '#F5C518' },
  red: { name: 'Red', colour: '#E03131' },
  grey: { name: 'Grey', colour: '#8E9089' },
  brown: { name: 'Brown', colour: '#7A4128' },
  purple: { name: 'Purple', colour: '#6A3FB8' },
};

// Limb chains: joint names (without side suffix) and the tube radius at each.
export const ARM = { joints: ['clavicle', 'shoulder', 'elbow', 'wrist', 'paw'], radii: [0.17, 0.2, 0.165, 0.14, 0.165] };
export const LEG = { joints: ['hipRoot', 'hip', 'knee', 'ankle'], radii: [0.24, 0.26, 0.245, 0.21] };
// foot: centred under the ankle so its flat sole sits on y = 0 (ankle height − radius·0.5)
const FOOT = { radii: [0.26, 0.15, 0.34], offset: v3(0, -0.135, 0.07) };

const PEAR = 0.13; // body taper; the markings shader undoes it, so keep them in sync via ROLES.marked
const pear = (v) => { // wider belly, narrower chest, flatter seat
  const f = 1 - PEAR * v.y;
  v.x *= f; v.z *= f;
  if (v.y < -0.8) v.y = -0.8 + (v.y + 0.8) * 0.4;
};
const cheeks = (v) => { if (v.y < 0) v.x *= 1 + 0.07 * -v.y; };
const flatSole = (v) => { if (v.y < -0.5) v.y = -0.5; };

const EAR = (s) => v3(0.78 * s, 0.6, -0.1); // direction from the head centre to an ear base
// the head ellipsoid as the hair grows from it (hair.js)
const HEAD_SHELL = { radii: HEAD, deform: cheeks };

const boneLength = (joint) => v3(...RIG[joint].at).length();

// ---------------------------------------------------------------------------
// Material roles: every part names a role, the style decides the material.
// Clay is used until the Look pass switches to colour.
// ---------------------------------------------------------------------------

// black shoulder band above `shoulders`, black hips below `hips`, and a white
// oval bib cut out of the front
export const MARKINGS = { shoulders: 0.38, hips: -0.4, bib: { width: 0.62, height: 0.78, centre: -0.05 } };

// Colours a figure recipe can pick for its slot parts (hair, glasses), and that
// props use for their coloured pieces. Each prints in one filament.
export const COLOURS = {
  blue: { clay: 0xaaa39a, look: 0x3a4be4, roughness: 0.55, wire: 0xb7c0ff, filament: 'blue' },
  green: { clay: 0xaaa39a, look: 0x37b24d, roughness: 0.45, wire: 0xb7ffc4, filament: 'green' },
  yellow: { clay: 0xaaa39a, look: 0xf5c518, roughness: 0.4, wire: 0xfff1a8, filament: 'yellow' },
  red: { clay: 0xaaa39a, look: 0xe03131, roughness: 0.42, wire: 0xffb3b3, filament: 'red' },
  grey: { clay: 0xa39c94, look: 0x8e9089, roughness: 0.6, wire: 0xd0d4dc, filament: 'grey' }, // Bambu PLA Basic Gray
  brown: { clay: 0x9c958d, look: 0x7a4128, roughness: 0.6, wire: 0xe0b8a0, filament: 'brown' }, // warm chestnut
  purple: { clay: 0xa69f97, look: 0x6a3fb8, roughness: 0.55, wire: 0xd2bcff, filament: 'purple' },
  dark: { clay: 0x77716b, look: 0x2b2d33, roughness: 0.5, wire: 0x9aa0b0, filament: 'black' },
  black: { clay: 0x8d8780, look: 0x24252c, roughness: 0.6, wire: 0x3dff6e, filament: 'black' }, // a touch lighter than the fur
};

// `print: [filament, priority]`: where printed regions overlap, the higher
// priority keeps the volume (details win over the base they sit on). Roles
// without `print` must not end up in a printed figure.
export const ROLES = {
  // prop and slot colours; dark details (lens barrels, screens) sit above the accent colours.
  // First, so the fixed roles below win over a colour of the same name (black fur).
  ...Object.fromEntries(Object.entries(COLOURS).map(([name, { filament, ...c }]) =>
    [name, { ...c, print: [filament, name === 'dark' ? 5 : 4] }])),
  marked: { // body: fur + black markings, see MARKINGS
    clay: [0xe6e1d9, 0x8d8780], look: [0xf2f2f4, 0x1e1f25], roughness: [0.5, 0.72], wire: 0xc35cf2,
    markings: { ...MARKINGS, radii: BODY.radii, pear: PEAR }, print: ['white', 1],
  },
  fur: { clay: 0xe6e1d9, look: 0xf2f2f4, roughness: 0.5, wire: 0xc35cf2, print: ['white', 1] },
  black: { clay: 0x8d8780, look: 0x1e1f25, roughness: 0.72, wire: 0x3dff6e, print: ['black', 2] },
  tablet: { clay: 0xaaa39a, look: 0x2f6bdc, roughness: 0.38, wire: 0xb7c0ff, print: ['blue', 4] },
  // a blue base stays blue whatever the accent (not an accessory role)
  baseBlue: { clay: 0xaaa39a, look: 0x2f6bdc, roughness: 0.45, wire: 0xb7c0ff, print: ['blue', 1] },
  eyes: { clay: 0xf6f4f0, look: 0xf7f6f3, roughness: 0.45, print: ['white', 6] },
  // hair: above the head it grows from, below the ears and glasses that sit on it
  ...Object.fromEntries(Object.entries(COLOURS).map(([name, { filament, ...c }]) =>
    [`hair-${name}`, { ...c, roughness: 0.7, print: [filament, 1.5] }])),
  screen: { clay: 0xc9c3bb, look: 0xd7f5dd, roughness: 0.3, print: ['white', 6] },
  glass: { clay: 0xe8ecef, look: 0xcfe6f5, roughness: 0.05, opacity: 0.35 },
  tint: { clay: 0xb8b2aa, look: 0xe2e8ef, roughness: 0.03, metalness: 1, opacity: 0.94 }, // mirrored sunglass lenses (not printed)
  trim: { clay: 0xe6e1d9, look: 0xf2f2f4, roughness: 0.45, print: ['white', 6] }, // white details on clothes (buckle); above the belt they sit on
  pupil: { clay: 0x5a554f, look: 0x14151a, roughness: 0.95, print: ['black', 7] }, // pupils sit on the white of the eye
  lens: { clay: 0xb8b2aa, look: 0x9fb0bf, roughness: 0.06, metalness: 0.3, opacity: 0.45, print: ['black', 5] },
  tongue: { clay: 0xb9b2aa, look: 0xef6f6c, roughness: 0.5 },
  patch: { decal: 'patch', roughness: 0.72, print: ['black', 3] },
  badge: { decal: 'badge', roughness: 0.5 },
  icon: { decal: 'icon', roughness: 0.38 },
  grin: { decal: 'grin', roughness: 0.5 },
  glareL: { decal: 'glareL', roughness: 0.9 }, // painted fierce eyes (brow, white, pupil), one per side
  glareR: { decal: 'glareR', roughness: 0.9 },
  // painted mouth lines and eyes (decals; printed as inlays through their layers)
  smile: { decal: 'smile', roughness: 0.5 },
  frown: { decal: 'frown', roughness: 0.5 },
  calm: { decal: 'calm', roughness: 0.5 },
  firm: { decal: 'firm', roughness: 0.5 },
  openEye: { decal: 'openEye', roughness: 0.45 },
  crescent: { decal: 'crescent', roughness: 0.45 },
  underside: { decal: 'underside', roughness: 0.6 },
};
// A figure with an accent (its recipe's `accent`, or createPanda `accent` on
// the stage) has every accessory role in that colour, in the viewer and in
// print. Accent name → the role whose colour it takes. Figures without an
// accent keep each part's own colour.
export const ACCENTS = { blue: 'tablet', green: 'green', yellow: 'yellow', red: 'red', grey: 'grey' };
export const ACCESSORY_ROLES = new Set(['tablet', 'blue', 'green', 'yellow', 'red']);

// ---------------------------------------------------------------------------
// 1 · Rig
// ---------------------------------------------------------------------------

function rigPass(m) {
  m.joints = buildSkeleton(m.root);
  m.root.position.y = LIFT; // stands where the base (Blockout) will put it, so the passes line up
  const boneMat = new THREE.MeshBasicMaterial({ color: 0x4f5dff, transparent: true, opacity: 0.9, depthTest: false });
  const helperMat = new THREE.MeshBasicMaterial({ color: 0x9aa3b8, transparent: true, opacity: 0.8, depthTest: false });
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xff8a3d, depthTest: false });
  const dot = new THREE.SphereGeometry(0.022, 10, 8);
  for (const [name, j] of Object.entries(RIG)) {
    m.overlay(new THREE.Mesh(dot, dotMat), name);
    if (!j.parent) continue;
    const offset = v3(...j.at);
    // tube roots (clavicle, hipRoot) are helper joints, drawn grey
    const helper = /clavicle|hipRoot/.test(name);
    const bone = new THREE.Mesh(boneGizmo(offset.length()), helper ? helperMat : boneMat);
    bone.quaternion.setFromUnitVectors(Y, offset.clone().normalize());
    m.overlay(bone, j.parent);
  }
}

// ---------------------------------------------------------------------------
// 2 · Blockout: big shapes, limbs as one capsule per bone
// ---------------------------------------------------------------------------

function blockoutPass(m) {
  addBase(m);
  m.add({
    name: 'body', role: 'fur', parent: 'pelvis', position: BODY.offset,
    make: () => ellipsoid(BODY.radii.toArray(), { detail: BODY.detail, deform: pear }),
  });
  m.add({
    name: 'head', role: 'fur', parent: 'head',
    make: () => ellipsoid(HEAD.toArray(), { detail: 24, deform: cheeks }), // fine enough for the snout's curves
  });
  m.add({
    name: 'tail', role: 'fur', parent: 'pelvis', position: v3(0, 0.04, -0.42),
    make: () => ellipsoid([0.12, 0.11, 0.1], { detail: 5 }),
  });

  for (const [side, s] of Object.entries(SIDES)) {
    // ears sit on the head, facing mostly forward
    const at = onEllipsoid(HEAD, EAR(s));
    m.add({
      name: `ear${side}`, role: 'black', parent: 'head',
      position: at.p.addScaledVector(at.n, 0.03),
      quaternion: orientZ(v3(0.35 * s, 0.2, 1), at.n),
      make: () => ellipsoid([0.24, 0.22, 0.14]),
    });
    m.add({
      name: `foot${side}`, role: 'black', parent: `ankle${side}`, position: FOOT.offset,
      make: () => ellipsoid(FOOT.radii, { detail: 7, deform: flatSole }),
    });

    // one primitive per bone: simple, but kinks and bulges at every joint
    const capsules = [
      [`shoulder${side}`, 0.2, 0, 'ball'],
      [`shoulder${side}`, 0.18, boneLength(`elbow${side}`)],
      [`elbow${side}`, 0.15, boneLength(`wrist${side}`) + boneLength(`paw${side}`)],
      [`paw${side}`, 0.165, 0, 'ball'],
      [`hip${side}`, 0.25, boneLength(`knee${side}`)],
      [`knee${side}`, 0.23, boneLength(`ankle${side}`)],
    ];
    capsules.forEach(([joint, r, len, kind], i) => m.add({
      name: `bone-${joint}-${i}`, role: 'black', parent: joint, tags: ['bone-capsule'],
      make: () => (kind === 'ball' ? ellipsoid([r, r, r]) : capsule(r, len)),
    }));
  }
}

// round base under the feet; the whole panda stands on it (lifted in the Rig pass)
function addBase(m) {
  const { radius: R, fillet: { top: ft, bottom: fb } } = BASE;
  const y0 = -LIFT, y1 = BASE.sink; // bottom and top in panda space (floor at 0)
  const profile = [
    [0, y0], [R - fb, y0], ...arc([R - fb, y0 + fb], [R - fb, y0], [R, y0 + fb], 4),
    [R, y1 - ft], ...arc([R - ft, y1 - ft], [R, y1 - ft], [R - ft, y1], 8), [0, y1],
  ];
  m.add({ name: 'base', role: BASE_COLOURS[m.base], make: () => lathe(profile, 128) });
}

// Underside of the base: a QR code with the figure's short code (the recipe's
// `codes`, one per printed pose, redirected by the website, see build.sh). Viewer: a
// texture on the bottom face. Print: the light modules and the quiet zone
// become a white inlay, the dark modules a black one. Laid out as seen
// from below (local +Z points down), so it reads the right way round on the
// printed base.
function qrModules(code, edition) {
  const q = BASE.qr;
  const qr = qrcode(q.version, q.ecc);
  qr.addData(`${q.url}${code}/${edition}`, 'Alphanumeric'); // upper-case hex keeps it in the compact alphanumeric mode
  qr.make();
  const n = qr.getModuleCount();
  return { n, dark: (r, c) => qr.isDark(r, c) };
}

function addUnderside(m) {
  const code = m.variant.codes[m.qrPose];
  if (!code) throw new Error(`figure "${m.variant.id}" has no QR code for pose "${m.qrPose}" (codes in figures/${m.variant.id}.json)`);
  const q = BASE.qr, { n, dark } = qrModules(code, m.edition);
  const face = BASE.radius - BASE.fillet.bottom; // flat bottom face
  const side = Math.SQRT2 * (face - q.margin); // the square's corners stay inside the face
  const module = side / (n + 2 * q.quiet);
  const at = (k) => (k + q.quiet) * module - side / 2; // module index → offset of its near edge
  const modules = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (dark(r, c)) modules.push([at(c), -at(r) - module]);

  m.texture('underside', (ctx, size, look) => {
    const k = size / (2 * face), px = ([x, y]) => [(x + face) * k, (face - y) * k];
    ctx.fillStyle = look ? '#f2f2f4' : '#e6e1d9';
    ctx.beginPath();
    ctx.roundRect(...px([-side / 2, side / 2]), side * k, side * k, module * k);
    ctx.fill();
    ctx.fillStyle = look ? '#1e1f25' : '#8d8780';
    for (const [x, y] of modules) ctx.fillRect(...px([x, y + module]), module * k + 0.5, module * k + 0.5);
  }, 1024);

  // white square with the dark modules cut out, and the dark modules in black,
  // so the code reads the same on any base colour
  const light = [{ add: { roundRect: [-side / 2, -side / 2, side, side, module] } }];
  const darkOps = [];
  for (const [x, y] of modules) {
    light.push({ sub: { roundRect: [x, y, module, module, 0] } });
    darkOps.push({ add: { roundRect: [x, y, module, module, 0] } });
  }
  const down = new THREE.Quaternion().setFromAxisAngle(X, Math.PI / 2); // local +Z → −Y
  m.add({
    name: 'underside', role: 'underside', shadow: false, position: v3(0, -LIFT, 0), quaternion: down,
    make: () => new THREE.CircleGeometry(face, 128),
    print: { clip: 'base', local: new THREE.Matrix4(), layers: [
      { role: 'eyes', ops: light, depthMm: BASE.depthMm }, { role: 'dark', ops: darkOps, depthMm: BASE.depthMm }] },
  });
}

// ---------------------------------------------------------------------------
// 3 · Tubes: one continuous tube per limb, interpolated through its joints
// ---------------------------------------------------------------------------

function tubesPass(m) {
  m.remove((p) => p.tags.includes('bone-capsule'));
  for (const side of Object.keys(SIDES)) {
    for (const [limb, chain, up] of [['arm', ARM, Y], ['leg', LEG, Z]]) {
      m.add({
        name: `${limb}${side}`, role: 'black', dynamic: true, // re-swept after every pose change
        make: (style, prev) => sweep(
          chain.joints.map((j) => m.jointPosition(j + side)),
          chain.radii,
          { caps: 'both', up, rings: prev?.userData.rings },
          prev,
        ),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 4 · Details
// ---------------------------------------------------------------------------

// Glasses, measured from the front reference. Each frame is an irregular
// octagon: the lens opening below is offset outward by the frame thickness, so
// the band is even all round (slightly heavier on top). The biggest chamfer is
// at the bottom inner corner (toward the nose), the outer ones are small.
// Units are head-space; local +X points away from the nose.
const GLASSES = {
  opening: {
    halfWidth: 0.19, top: 0.14, bottom: -0.15,
    chamfer: { topInner: [0.055, 0.07], topOuter: [0.03, 0.05], bottomOuter: [0.065, 0.07], bottomInner: [0.105, 0.12] },
  },
  frame: { top: 0.072, side: 0.066, bottom: 0.06 },
  depth: 0.062, bevel: 0.009, lip: 0.016, // lip = recessed ledge inside the opening
  bridge: { y: 0.105, height: 0.085 }, // thick straight block near the top
  // The whole front (both frames + bridge) is one flat plane facing +Z;
  // the temples are flat plates running straight back from the outer corners.
  front: { z: 0.63, y: 0.045, gap: 0.1 }, // plane depth, lens-centre height, space between frames
  endPiece: { height: 0.11, back: 0.1 }, // corner block joining the front to the temple, flush with the front
  // temple: flat plate along the outside of the head, from the end piece to behind the ears,
  // sloping down slightly so it passes under the ear
  temple: { inner: 0.65, thickness: 0.048, height: 0.088, backTo: -0.34, drop: 0.07 },
  print: { depth: 0.11 }, // printed front ≈ 1.9 mm deep (front to back), same band width
};
GLASSES.halfWidth = GLASSES.opening.halfWidth + GLASSES.frame.side;
GLASSES.halfHeight = (GLASSES.opening.top - GLASSES.opening.bottom) / 2 + (GLASSES.frame.top + GLASSES.frame.bottom) / 2;

// Eye patches are painted on the head (a decal), sized to overfill the lens
// opening and drooping toward the outer corner. The closed eye is a crescent
// that is thick in the middle and tapers to points.
const EYE = {
  patch: { rx: 0.25, ry: 0.2, droop: 0.3, squareness: 2.6, decal: 0.66 }, // behind glasses: fills the lens
  plain: { x: 0.27, y: 0.0, patch: { rx: 0.165, ry: 0.145, droop: 0.22, squareness: 2.8, decal: 0.42 } }, // no glasses
  pupil: { rx: 0.036, ry: 0.052 }, // open eyes: a white upright oval in the middle of the patch
  crescent: { halfWidth: 0.1, rise: 0.075, thickness: 0.027, drop: 0.012 },
  // serene closed eye: an even lid line sagging gently in the middle, a short lash flicking down at the outer corner
  lid: { halfWidth: 0.1, sag: 0.03, radius: 0.014, tip: 0.003, lash: [0.03, -0.03], flatten: 0.5, drop: -0.01 },
  // fierce face (the `alert` eyes): resolved, not furious. The patch is a
  // superellipse with its top cut flat (`cut`: chord height as a share of ry)
  // and spun so the chord slopes gently down toward the nose (negative droop);
  // on the chord lies a brow wedge, a little heavier at the inner end; below
  // it, with a clear gap, a large open eye white whose top is only slightly
  // flattened by the lid, and a dark pupil high in its middle, looking straight
  // ahead. All parts are given in the unspun patch frame (x toward the outer
  // side) and spun together.
  fierce: {
    patch: { rx: 0.175, ry: 0.155, droop: -0.12, squareness: 2.4, cut: 0.32, decal: 0.44 },
    brow: { inner: [-0.16, 0.058], outer: [0.17, 0.074], width: [0.03, 0.026] }, // centre line ends; half-width at each end
    white: { rx: 0.078, ry: 0.072, at: [0.0, -0.06], lid: 0.014 }, // ellipse centre; the lid cuts it flat at this y
    pupil: { rx: 0.036, ry: 0.038, at: [-0.006, -0.054] }, // centred in the white, a touch high and inward
    decal: 0.44, // painted brow, white and pupil: the decal spans this many head units
  },
};
const TABLET = {
  size: [0.44, 0.58, 0.08],
  icon: { size: 0.26, at: [-0.05, 0.09] },
  heldBy: 'pawL',
  // Grip in readable terms: in the Wave pose the tablet faces front-right and
  // `contact` (a point near its lower right edge) sits at the paw centre.
  // Other poses follow the paw; the pose is named here, so renaming it means updating this.
  grip: { pose: 'wave', rotation: [-4.6, 25.8, -3.4], contact: [0.22, -0.12, 0.01] },
};

// Figures (recipes.js, figures/*.json) share everything up to here; they pick
// poses, eyes, mouth, slot parts (hair, glasses: a style and a colour) and props.
// Slot parts and props are each one group, so a recipe's `only` / `hide`
// can show them in some poses only.

/** Is this group (prop, slot part, 'mouth:<style>' or 'eyes:<style>') shown in this pose? */
export function visibleIn(v, group, pose) {
  if (group.startsWith('mouth:')) return group === `mouth:${v.faces?.[pose]?.mouth ?? v.mouth}`;
  if (group.startsWith('eyes:')) return group === `eyes:${v.faces?.[pose]?.eyes ?? v.eyes}`;
  if (v.only?.[group] && !v.only[group].includes(pose)) return false;
  return !v.hide?.[group]?.includes(pose);
}

function detailsPass(m) {
  const v = m.variant;
  m.snout = SNOUTS[v.snout];
  addMarkings(m);
  addSnout(m, v); // reshapes the head, so it runs before anything is projected onto the face
  if (v.outfit) m.group('outfit', () => addOutfit(m, v.outfit, { offset: BODY.offset, radii: BODY.radii, pear: PEAR, arm: ARM }));
  if (v.hair) m.group('hair', () => addHair(m, v.hair, HEAD_SHELL));
  if (v.beard) {
    const cy = mouthY(m.snout);
    m.group('beard', () => addBeard(m, v.beard, {
      z: (x, y) => faceZ(m.snout, x, y), mouth: [0, cy], lip: cy + GRIN.height * 0.45,
      opening: OPEN_MOUTHS.includes(v.mouth) ? grinShape(0).map(([x, y]) => [x, y + cy]) : null,
    }));
  }
  addFace(m, v);
  if (v.glasses) m.group('glasses', () => GLASSES_STYLES[v.glasses.style](m, v.glasses.colour, v));
  for (const name of v.props) m.group(name, () => PROPS[name](m, v));
  addUnderside(m);
  m.showFor(v.pose);
}


// Black fur on the torso is painted per pixel, not modelled: the Details pass
// switches the body to the `marked` role, whose material evaluates the
// MARKINGS field (see panda.js) on the body surface. Edges come out exact and
// anti-aliased at any zoom. Values are on the unit body sphere (y = −1 … 1).
function addMarkings(m) {
  m.setRole('body', 'marked');
  // printed, the markings become a black region of the body (print.js evaluates the same field)
  m.get('body').print = { field: { ...MARKINGS, radii: BODY.radii.toArray(), pear: PEAR, role: 'black' } };
}

// Snout: the lower face pushed forward toward a gently domed front, inside a
// rounded-trapezoid outline (narrow between the lenses, wide toward the cheeks)
// that fades smoothly into the cheeks. It reshapes the head mesh itself, so
// there is no seam; nose, mouth and beard sit on the same surface. A figure
// picks one with its recipe's `snout` (default `panda`). Head-space units.
export const SNOUTS = {
  panda: {
    centre: -0.2, halfHeight: 0.14, // vertical extent on the face
    halfWidth: { top: 0.11, bottom: 0.3 }, // outline is narrower at the top
    front: 0.7, dome: 1.0, // z of the front at the centre; how fast it falls back toward the edges
    plateau: 0.55, squareness: 3, // fraction of the outline at full height; corner shape
  },
  // a fuller muzzle that stands further out and reaches lower, with a broad,
  // squarer jaw and a defined chin underneath
  strong: {
    centre: -0.25, halfHeight: 0.21,
    halfWidth: { top: 0.13, bottom: 0.37 },
    front: 0.8, dome: 1.25,
    plateau: 0.15, squareness: 2.6, // a low plateau: the muzzle rounds off softly into the cheeks and under the chin
  },
};

const headZ = (x, y) => { // front surface of the (cheek-deformed) head ellipsoid
  const vy = y / HEAD.y;
  const vx = x / (HEAD.x * (1 + 0.07 * Math.max(0, -vy)));
  return HEAD.z * Math.sqrt(Math.max(0, 1 - vx * vx - vy * vy));
};

function snoutMask(S, x, y) {
  const w = (y - S.centre) / S.halfHeight; // −1 bottom … 1 top
  const hw = S.halfWidth.bottom + (S.halfWidth.top - S.halfWidth.bottom) * (w + 1) / 2;
  const r = (Math.abs(x / hw) ** S.squareness + Math.abs(w) ** S.squareness) ** (1 / S.squareness);
  const t = THREE.MathUtils.clamp((r - S.plateau) / (1 - S.plateau), 0, 1);
  return 1 - t * t * (3 - 2 * t);
}

/** Front surface z of the head with snout `S`, at head-space (x, y). */
function faceZ(S, x, y, z = headZ(x, y)) {
  const target = S.front - S.dome * (x * x + (y - S.centre) ** 2);
  return z + snoutMask(S, x, y) * Math.max(0, target - z);
}

/** Centre of the mouth on snout `S`: the grin is centred here, beards ring around it. */
const mouthY = (S) => S.centre - 0.005 - GRIN.height * 0.45;

function addSnout(m, v) {
  const S = m.snout;
  const head = m.get('head');
  const base = head.make;
  head.make = (style, prev) => {
    const g = base(style, prev);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i);
      if (z > 0) p.setZ(i, faceZ(S, p.getX(i), p.getY(i), z));
    }
    g.computeVertexNormals();
    return g;
  };
  m.swapGeometry(head, head.make(m.style, null));

  // nose: rounded triangle on the upper front of the snout
  const noseY = S.centre + 0.065;
  m.add({
    name: 'nose', role: 'black', parent: 'head', position: v3(0, noseY, faceZ(S, 0, noseY) + 0.022),
    quaternion: new THREE.Quaternion().setFromAxisAngle(X, 0.15),
    make: () => ellipsoid([0.085, 0.055, 0.05], {
      detail: 5, deform: (v) => { if (v.y < 0) v.x *= 1 + v.y * 0.6; },
    }),
  });
  // every mouth any pose of this character needs; showFor() picks one
  const styles = new Set([v.mouth, ...Object.values(v.faces ?? {}).map((f) => f.mouth).filter(Boolean)]);
  for (const style of styles) m.group(`mouth:${style}`, () => MOUTHS[style](m));
}

// mouth curve on the front of snout S: y(t) for t in −1…1, x = width·t + shift
function snoutCurve(S, width, y, shift = 0) {
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const t = -1 + i / 5;
    const x = width * t + shift, yy = y(t);
    pts.push(v3(x, yy, faceZ(S, x, yy) + 0.004));
  }
  return pts;
}

export const MOUTHS = {
  smile: (m) => addMouthLine(m, 'smile', snoutCurve(m.snout, 0.12, (t) => m.snout.centre - 0.035 - 0.035 * (1 - t * t))),
  // small worried mouth, slightly off-centre, corners down
  frown: (m) => addMouthLine(m, 'frown', snoutCurve(m.snout, 0.06, (t) => m.snout.centre - 0.07 + 0.018 * (1 - t * t) - 0.006 * t, 0.015)),
  // calm closed mouth: a short, even line with the corners lifted a touch
  calm: (m) => addMouthLine(m, 'calm', snoutCurve(m.snout, 0.085, (t) => m.snout.centre - 0.055 - 0.012 * (1 - t * t))),
  // firm mouth: a short flat line low on the muzzle, its corners a touch down (sits between a moustache and a chin beard)
  firm: (m) => addMouthLine(m, 'firm', snoutCurve(m.snout, 0.08, (t) => m.snout.centre - 0.105 + 0.007 * (1 - t * t))),
  grin: (m) => addGrin(m),
  beam: (m) => addBeam(m),
};
// mouths that open the face: a beard rings around their opening (the grin's
// "D"); the others are closed, so a beard grows over them
const OPEN_MOUTHS = ['grin', 'beam'];

// Mouth line painted flush onto the snout, like the grin: a decal on the head
// mesh in the viewer, a black inlay in print (nothing stands off the face).
// The curve is drawn in a decal frame facing forward and slightly up.
const MOUTH_LINE = { width: 0.024, decal: 0.34 };

function addMouthLine(m, style, curve) {
  const mid = curve[Math.floor(curve.length / 2)];
  const at = { p: v3(0, mid.y, faceZ(m.snout, 0, mid.y)), n: v3(0, 0.25, 1).normalize() };
  const frame = decalFrame(at, 0);
  const inv = frame.clone().invert();
  const local = curve.map((p) => p.clone().applyMatrix4(inv));
  const line = local.map((q) => [q.x, q.y]);
  // project only as deep as the snout curves under the line, so the decal
  // doesn't also land on the chin below
  const depth = 2 * (Math.max(...local.map((q) => Math.abs(q.z))) + 0.02);
  const outline = strokeOutline(line, (m.style.print ? PRINT.minLine : MOUTH_LINE.width) / 2);
  m.texture(style, (ctx, n, look) => {
    const u = n / MOUTH_LINE.decal;
    ctx.fillStyle = look ? '#1e1f25' : '#8d8780';
    ctx.beginPath();
    outline.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](n / 2 + x * u, n / 2 - y * u));
    ctx.fill();
  });
  m.add({ name: `mouth-${style}`, role: style, parent: 'head', shadow: false,
    make: () => headDecal(m, at, 0, MOUTH_LINE.decal, depth),
    print: { clip: 'head', reach: CURVED, local: frame, layers: [{ role: 'dark', ops: [{ add: { poly: outline } }] }] } });
}

/** Outline of a polyline stroked `half` to each side, with round ends. */
function strokeOutline(pts, half) {
  const side = pts.map((p, i) => {
    const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, pts.length - 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
    return [-dy / l, dx / l];
  });
  const cap = (p, n, from) => Array.from({ length: 7 }, (_, k) => {
    const t = from + (k / 6) * Math.PI, c = Math.cos(t), s = Math.sin(t);
    return [p[0] + half * (n[0] * c - n[1] * s), p[1] + half * (n[0] * s + n[1] * c)];
  });
  const last = pts.length - 1;
  return [
    ...pts.map((p, i) => [p[0] + side[i][0] * half, p[1] + side[i][1] * half]),
    ...cap(pts[last], side[last], 0).slice(1, -1),
    ...pts.map((p, i) => [p[0] - side[i][0] * half, p[1] - side[i][1] * half]).reverse(),
    ...cap(pts[0], side[0], Math.PI).slice(1, -1),
  ];
}

const PUPIL_DECAL = 0.16; // decal square around one pupil, head units
const CRESCENT_DECAL = 0.3; // decal square around one closed eye, head units

/** Closed eye: an arc, `thickness` wide in the middle, tapering to `tip` at both ends ([x, y] in the eye frame). */
function crescentOutline(c) {
  const n = 24, top = [], bottom = [];
  for (let i = 0; i <= n; i++) {
    const a = Math.PI * (0.06 + (0.88 * i) / n);
    const cx = c.halfWidth * Math.cos(a), cy = -c.drop - c.rise * 0.45 + c.rise * Math.sin(a);
    // normal of the arc (an ellipse) at this point, outward
    const nx = Math.cos(a) / c.halfWidth, ny = Math.sin(a) / c.rise, l = Math.hypot(nx, ny);
    const r = c.tip + c.thickness * Math.sin(a) ** 1.4;
    top.push([cx + (nx / l) * r, cy + (ny / l) * r]);
    bottom.push([cx - (nx / l) * r, cy - (ny / l) * r]);
  }
  return [...top, ...bottom.reverse()];
}

function addFace(m, v) {
  const glasses = !!v.glasses;
  const patch = EYE_STYLES[v.eyes].patch ?? (glasses ? EYE.patch : EYE.plain.patch); // an eye style may shape the patches
  m.texture('patch', (ctx, n, look) => drawPatch(ctx, n, look ? '#1e1f25' : '#8d8780', patch));
  for (const [side, s] of Object.entries(SIDES)) {
    // patch centre: behind the lens with glasses, otherwise at the plain eye position
    const dir = glasses ? lensFrame(s).center : v3(s * EYE.plain.x, EYE.plain.y, HEAD.z);
    const at = onEllipsoid(HEAD, dir);
    const droop = -s * patch.droop; // outer end lower
    m.add({
      name: `eyePatch${side}`, role: 'patch', parent: 'head', shadow: false,
      make: () => headDecal(m, at, droop, patch.decal),
      print: { clip: 'head', reach: CURVED, local: decalFrame(at, droop), layers: [{ role: 'patch', ops: [{ add: { poly: patchOutline(patch, 64) } }] }] },
    });
    m.anchor(`eyeFrame${side}`, 'head', at.p, orientZ(at.n));
  }
  // every eye style any pose of this character needs; showFor() picks one
  const styles = new Set([v.eyes, ...Object.values(v.faces ?? {}).map((f) => f.eyes).filter(Boolean)]);
  for (const style of styles) {
    const tag = style[0].toUpperCase() + style.slice(1); // part names: eyeOpenR, pupilBigL, browAlertR …
    m.group(`eyes:${style}`, () => {
      for (const [side, s] of Object.entries(SIDES)) EYE_STYLES[style](m, `eyeFrame${side}`, side, s, tag);
    });
  }
}

// Eye styles, drawn in the eye patch's frame `frame` (an anchor at the patch
// centre, +Z out of the face); each adds the eye of one side, naming its parts
// after `tag` (the style). Open pupils are registered so poses can shift them.

/** The patch centre on the head and its normal, from the eye frame anchor. */
const patchCentre = (m, frame) => {
  const a = m.anchors[frame];
  return { p: a.position.clone(), n: Z.clone().applyQuaternion(a.quaternion) };
};

// open eye: a white upright oval in the patch, painted on (a decal on the head
// in the viewer, a flush white inlay in print; a raised bump needed support).
// The pose's `look` slides it along the surface, and the print inlay with it.
const openEye = (m, frame, side, s, tag) => {
  const at = patchCentre(m, frame);
  const e = m.style.print ? { rx: 0.05, ry: 0.065 } : EYE.pupil; // ≥ 1.7 mm across when printed
  const centre = { p: v3(s * 0.008, 0.004, 0).applyMatrix4(new THREE.Matrix4().compose(at.p, orientZ(at.n), v3(1, 1, 1))), n: at.n };
  m.texture('openEye', (ctx, n, look) => {
    ctx.fillStyle = look ? '#f7f6f3' : '#f6f4f0';
    ctx.beginPath();
    ctx.ellipse(n / 2, n / 2, (e.rx / PUPIL_DECAL) * n, (e.ry / PUPIL_DECAL) * n, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  const oval = Array.from({ length: 32 }, (_, i) => [e.rx * Math.cos((i / 32) * Math.PI * 2), e.ry * Math.sin((i / 32) * Math.PI * 2)]);
  const eye = m.add({
    name: `eye${tag}${side}`, role: 'openEye', parent: 'head', shadow: false,
    make: () => headDecal(m, centre, 0, PUPIL_DECAL, 0.2),
    print: { clip: 'head', reach: CURVED, local: decalFrame(centre, 0), layers: [{ role: 'eyes', ops: [{ add: { poly: oval } }] }] },
  });
  eye.mesh.renderOrder = 1; // after the eye patch decal it sits on
  eye.mesh.userData.normal = centre.n.clone(); // look slides it along the surface (panda.js showFor)
  m.pupils.push(eye.mesh);
};

// closed eye: a crescent, thick in the middle, pointed at both ends, painted
// on like the open eye; `spin` π turns the happy arch into a content sag
const crescentEye = (spin) => (m, frame, side, s, tag) => {
  const at = patchCentre(m, frame);
  const c = m.style.print ? { ...EYE.crescent, thickness: 0.032, tip: PRINT.minLine * 0.35 } : { ...EYE.crescent, tip: 0.003 };
  const outline = crescentOutline(c);
  m.texture('crescent', (ctx, n, look) => {
    const u = n / CRESCENT_DECAL;
    ctx.fillStyle = look ? '#f7f6f3' : '#f6f4f0';
    ctx.beginPath();
    outline.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](n / 2 + x * u, n / 2 - y * u));
    ctx.fill();
  });
  const eye = m.add({
    name: `eye${tag}${side}`, role: 'crescent', parent: 'head', shadow: false,
    make: () => headDecal(m, at, spin, CRESCENT_DECAL, 0.2),
    print: { clip: 'head', reach: CURVED, local: decalFrame(at, spin), layers: [{ role: 'eyes', ops: [{ add: { poly: outline } }] }] },
  });
  eye.mesh.renderOrder = 1; // after the eye patch decal it sits on
};

// a calm closed eye: a thin lid line, lowest in the middle by `sag` (u_u), running
// on into a lash that flicks down and out at the outer corner; `s` = outer side
const lidEye = (sag) => (m, frame, side, s, tag) => {
  const L = { ...(m.style.print ? { ...EYE.lid, radius: PRINT.minLine * 0.6, tip: PRINT.minLine * 0.35, flatten: 0.8 } : EYE.lid), sag };
  const pts = [], radii = [];
  for (let i = 0; i <= 10; i++) {
    const t = -1 + i / 5;
    pts.push(v3(s * L.halfWidth * t, -L.drop - L.sag * (1 - t * t), 0));
    radii.push(L.tip + (L.radius - L.tip) * (1 - Math.max(0, -t) ** 4)); // pointed at the inner corner, full into the lash
  }
  pts.push(v3(s * (L.halfWidth + L.lash[0]), -L.drop + L.lash[1], 0));
  radii.push(L.tip);
  m.add({
    name: `eye${tag}${side}`, role: 'eyes', parent: frame,
    make: () => sweep(pts, radii, { radial: 14, up: Z }).scale(1, 1, L.flatten).translate(0, 0, 0.008),
  });
};

// The fierce eye is painted, like the patch it sits on: brow, eye white and
// pupil are one decal per side in the viewer and flush inlays in print, so they
// follow the head's curve exactly. Shapes are [x, y] in the unspun patch frame
// of side `s` (x toward the outer side); `print` grows them to printable size.
function glareShapes(s, print) {
  const { brow: B, white: W, pupil: P0 } = EYE.fierce;
  const P = print ? { ...P0, rx: P0.rx + 0.004, ry: P0.ry + 0.004 } : P0;
  // brow: a wedge along the patch's flat top, heavy toward the nose, tapering out
  const top = [], bottom = [];
  for (let i = 0; i <= 12; i++) {
    const f = i / 12, x = B.inner[0] + (B.outer[0] - B.inner[0]) * f;
    const y = B.inner[1] + (B.outer[1] - B.inner[1]) * f + 0.008 * Math.sin(Math.PI * f);
    const w = B.width[0] + (B.width[1] - B.width[0]) * f * f;
    top.push([s * x, y + w]);
    bottom.unshift([s * x, y - w]);
  }
  // white: an ellipse cut flat by the lid
  const white = Array.from({ length: 64 }, (_, i) => {
    const t = (i / 64) * Math.PI * 2;
    return [s * (W.at[0] + W.rx * Math.cos(t)), W.at[1] + Math.min(W.lid, W.ry * Math.sin(t))];
  });
  const pupil = Array.from({ length: 40 }, (_, i) => {
    const t = (i / 40) * Math.PI * 2;
    return [s * (P.at[0] + P.rx * Math.cos(t)), P.at[1] + P.ry * Math.sin(t)];
  });
  return { brow: [...top, ...bottom], white, pupil };
}

function drawGlare(ctx, n, s, look) {
  const k = n / EYE.fierce.decal; // pixels per head unit
  const fill = (pts, colour) => {
    ctx.fillStyle = colour;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(n / 2 + k * x, n / 2 - k * y) : ctx.moveTo(n / 2 + k * x, n / 2 - k * y)));
    ctx.closePath();
    ctx.fill();
  };
  const { brow, white, pupil } = glareShapes(s, false);
  fill(brow, look ? '#1e1f25' : '#8d8780');
  fill(white, look ? '#f7f6f3' : '#f6f4f0');
  fill(pupil, look ? '#14151a' : '#5a554f');
}

export const EYE_STYLES = {
  open: openEye,
  closed: crescentEye(0), // laughing
  relaxed: crescentEye(Math.PI), // content, lids down
  serene: lidEye(EYE.lid.sag), // meditating: lids closed and calm
  // alert: the fierce face — angled patches with a brow wedge on their flat
  // top, a glaring D-shaped eye white under the slanted lid, a big dark pupil
  // painted (glareShapes): the pupils are fixed, they do not follow `look`
  alert: Object.assign((m, frame, side, s, tag) => {
    const F = EYE.fierce;
    const anchor = m.anchors[frame]; // the patch centre on the head, facing out
    const at = { p: anchor.position.clone(), n: Z.clone().applyQuaternion(anchor.quaternion) };
    const spin = -s * F.patch.droop; // the same spin as the patch decal
    const { brow, white, pupil } = glareShapes(s, true);
    m.texture(`glare${side}`, (ctx, n, look) => drawGlare(ctx, n, s, look));
    const eye = m.add({
      name: `eye${tag}${side}`, role: `glare${side}`, parent: 'head', shadow: false,
      make: () => headDecal(m, at, spin, F.decal),
      print: { clip: 'head', local: decalFrame(at, spin), layers: [
        { role: 'patch', ops: [{ add: { poly: brow } }] },
        { role: 'eyes', ops: [{ add: { poly: white } }] },
        { role: 'pupil', ops: [{ add: { poly: pupil } }] },
      ] },
    });
    eye.mesh.renderOrder = 1; // drawn over the patch decal it lies on
  }, { patch: EYE.fierce.patch }),
  wink: (m, frame, side, s, tag) => (s > 0 ? crescentEye(0) : openEye)(m, frame, side, s, tag),
  // cartoon eye: a big white oval with a black pupil looking slightly inward
  big: (m, frame, side, s, tag) => {
    const w = m.style.print ? { rx: 0.07, ry: 0.085 } : { rx: 0.065, ry: 0.08 };
    const p = m.style.print ? { rx: 0.035, ry: 0.042 } : { rx: 0.03, ry: 0.038 };
    m.add({ name: `eye${tag}${side}`, role: 'eyes', parent: frame, position: v3(0, 0.004, 0.004),
      make: () => ellipsoid([w.rx, w.ry, 0.014], { detail: 5 }) });
    const pupil = m.add({ name: `pupil${tag}${side}`, role: 'pupil', parent: frame, position: v3(-s * 0.018, -0.008, 0.014),
      make: () => ellipsoid([p.rx, p.ry, 0.01], { detail: 5 }) });
    pupil.mesh.userData.normal = Z.clone(); // look moves it in the eye frame's plane (panda.js showFor)
    m.pupils.push(pupil.mesh);
  },
  // determined: narrow white ovals, inner corners lower
  focused: (m, frame, side, s, tag) => {
    const e = m.style.print ? { rx: 0.065, ry: 0.035 } : { rx: 0.06, ry: 0.028 };
    m.add({ name: `eye${tag}${side}`, role: 'eyes', parent: frame, position: v3(s * 0.006, 0, 0.004),
      quaternion: new THREE.Quaternion().setFromAxisAngle(Z, s * 0.32),
      make: () => ellipsoid([e.rx, e.ry, 0.012], { detail: 5 }) });
  },
};

// Lens frame for one side: both frames share one flat front plane, facing +Z.
function lensFrame(s) {
  const F = GLASSES.front;
  const center = v3(s * (F.gap / 2 + GLASSES.halfWidth), F.y, F.z);
  const quaternion = new THREE.Quaternion();
  const local = (lx, ly, lz = 0) => center.clone().add(v3(lx, ly, lz));
  return { center, quaternion, local };
}

// Lens opening as a CCW polygon with outer = +X (mirrored for the right side).
function openingOutline(s, grow = 0) {
  const { halfWidth: w, top: t, bottom: b, chamfer: c } = GLASSES.opening;
  const pts = [
    [-w + c.bottomInner[0], b], [w - c.bottomOuter[0], b], [w, b + c.bottomOuter[1]], [w, t - c.topOuter[1]],
    [w - c.topOuter[0], t], [-w + c.topInner[0], t], [-w, t - c.topInner[1]], [-w, b + c.bottomInner[1]],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const out = grow ? offsetPolygon(pts, () => grow) : pts;
  return s > 0 ? out : out.map((p) => new THREE.Vector2(-p.x, p.y)).reverse();
}

// Outer contour: the opening pushed out by the frame thickness for each edge.
function frameOutline(s) {
  const { frame } = GLASSES;
  const thickness = (a, b) => {
    const d = b.clone().sub(a).normalize();
    if (Math.abs(d.x) > 0.9) return (a.y + b.y) / 2 > 0 ? frame.top : frame.bottom;
    return frame.side;
  };
  const pts = offsetPolygon(openingOutline(1), thickness);
  return s > 0 ? pts : pts.map((p) => new THREE.Vector2(-p.x, p.y)).reverse();
}

// Offset a convex CCW polygon outward; dist(a, b) gives each edge's distance.
function offsetPolygon(pts, dist) {
  const n = pts.length;
  const lines = pts.map((a, i) => {
    const b = pts[(i + 1) % n];
    const d = b.clone().sub(a).normalize();
    const normal = new THREE.Vector2(d.y, -d.x); // outward for CCW
    return { p: a.clone().addScaledVector(normal, dist(a, b)), d };
  });
  return lines.map((L1, i) => {
    const L0 = lines[(i - 1 + n) % n];
    const den = L0.d.x * L1.d.y - L0.d.y * L1.d.x;
    const t = ((L1.p.x - L0.p.x) * L1.d.y - (L1.p.y - L0.p.y) * L1.d.x) / den;
    return L0.p.clone().addScaledVector(L0.d, t);
  });
}

function addGlasses(m, colour, v) {
  const G = GLASSES;
  const ring = (outerPts, innerPts, depth, bevel, z) => () => {
    const shape = new THREE.Shape(outerPts);
    shape.holes.push(new THREE.Path(innerPts));
    return new THREE.ExtrudeGeometry(shape, {
      depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 1,
    }).translate(0, 0, z - depth / 2);
  };

  const ends = {};
  for (const [side, s] of Object.entries(SIDES)) {
    const lens = lensFrame(s);
    const frame = m.anchor(`lens${side}`, 'head', lens.center, lens.quaternion);
    // printed, the front is deeper (growing backward, the front face stays put),
    // so it survives removing the supports under it
    const depth = m.style.print ? G.print.depth : G.depth;
    m.add({ name: `rim${side}`, role: colour, parent: frame,
      make: ring(frameOutline(s), openingOutline(s), depth - 2 * G.bevel, G.bevel, (G.depth - depth) / 2) });
    // recessed ledge inside the opening
    if (!m.style.print) m.add({ // too thin to print at 40 mm
      name: `rimLip${side}`, role: colour, parent: frame,
      make: ring(openingOutline(s, 0.004), openingOutline(s, -G.lip), G.depth * 0.5, 0, -G.depth * 0.12),
    });
  }

  const F = G.front;
  addTemples(m, colour, v, {
    lensOuter: F.gap / 2 + 2 * G.halfWidth, topY: F.y + G.opening.top + G.frame.top, zFront: F.z + G.depth / 2,
    endPiece: G.endPiece, temple: G.temple,
  });

  // bridge: thick straight block between the frames, near the top, in the same front plane
  m.add({
    name: 'bridge', role: colour, parent: 'head', position: v3(0, F.y + G.bridge.y, F.z),
    make: () => new THREE.BoxGeometry(F.gap + 0.03, G.bridge.height, G.depth),
  });
}

// End pieces and temples, in head space: an end piece from the frame's outer
// edge (`lensOuter`, top at `topY`, front face at `zFront`) out to the temple,
// and a straight flat temple from there back past the ear. Over hair the
// temples move out by the hair's height along their path, so they rest on it.
function addTemples(m, colour, v, { lensOuter, topY, zFront, endPiece: E, temple }) {
  // printed, the temple moves in to fuse with the side of the head and stops where the head turns away
  const T0 = m.style.print ? { ...temple, inner: 0.6, backTo: -0.12 } : temple;
  const y = topY - E.height / 2;
  const path = [0, 0.25, 0.5, 0.75, 1].map((f) => v3(T0.inner, y - T0.drop * f, zFront - E.back + (T0.backTo - zFront + E.back) * f));
  const T = v.hair ? { ...T0, inner: T0.inner + hairClearance(v.hair, HEAD_SHELL, path) } : T0;
  const templeOuter = T.inner + T.thickness;
  for (const [side, s] of Object.entries(SIDES)) {
    // end piece: from the frame's outer edge out to the temple, front face in the front plane
    const width = templeOuter - lensOuter + 0.01;
    m.add({
      name: `endPiece${side}`, role: colour, parent: 'head',
      position: v3(s * (lensOuter - 0.01 + width / 2), y, zFront - E.back / 2),
      make: () => new THREE.BoxGeometry(width, E.height, E.back),
    });
    // temple: straight flat plate from the back of the end piece to behind the ear
    const start = v3(s * (T.inner + T.thickness / 2), y, zFront - E.back + 0.01);
    const end = v3(start.x, y - T.drop, T.backTo);
    const length = start.distanceTo(end);
    const dir = end.clone().sub(start).normalize();
    m.add({
      name: `temple${side}`, role: colour, parent: 'head',
      position: start.clone().lerp(end, 0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(Z, dir.clone().negate()),
      make: () => new THREE.BoxGeometry(T.thickness, T.height, length),
    });
  }
}

// Half-rim glasses: narrow, softly rounded rectangular lenses with a firm bar
// along the top that wraps a short way down the sides; no frame underneath.
// Lenses are centred where the octagon frames are, so the eye patches behind
// them sit the same. Head units; the bar's band is `bar.width` wide.
const HALF_RIM = {
  lens: { halfWidth: 0.19, top: 0.09, bottom: -0.1, corner: 0.06 }, // opening around the lens centre
  hinge: 0.012, // the bar's outer top corner is nearly square, so the end piece joins it along its full height
  bar: { width: 0.045, depth: 0.05, down: 0.45 }, // wraps down the sides to this fraction of the lens height
  bridge: { height: 0.032, depth: 0.035 }, // thin straight bar between the lenses, at the top
  endPiece: { height: 0.07, back: 0.08 },
  temple: { inner: 0.65, thickness: 0.036, height: 0.05, backTo: -0.34, drop: 0.07 },
};

/**
 * Rounded rectangle (half width w, top t, bottom b) as CCW points starting at
 * the right middle; `r` = corner radii [top right, top left, bottom left, bottom right].
 */
function roundedRect(w, t, b, r, steps = 8) {
  const pts = [];
  const corner = (cx, cy, r, a0) => {
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (i / steps) * (Math.PI / 2);
      pts.push(new THREE.Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a)));
    }
  };
  corner(w - r[0], t - r[0], r[0], 0);
  corner(-w + r[1], t - r[1], r[1], Math.PI / 2);
  corner(-w + r[2], b + r[2], r[2], Math.PI);
  corner(w - r[3], b + r[3], r[3], Math.PI * 1.5);
  return pts;
}

function addHalfRim(m, colour, v) {
  const H = HALF_RIM, L = H.lens, F = GLASSES.front;
  const minLine = (x) => (m.style.print ? Math.max(x, PRINT.minLine) : x);
  const barWidth = minLine(H.bar.width);
  const cut = L.top - (L.top - L.bottom) * H.bar.down; // the bar stops at this height
  // the bar: the band between the opening and the opening grown by the bar width, above `cut`;
  // built for the left lens (outer side +X) and mirrored for the right
  const inner = roundedRect(L.halfWidth, L.top, L.bottom, Array(4).fill(L.corner));
  const R = L.corner + barWidth;
  const outer = roundedRect(L.halfWidth + barWidth, L.top + barWidth, L.bottom - barWidth, [H.hinge, R, R, R]);
  const upper = (pts) => { // the points above the cut, from the right end over the top to the left end
    const start = pts.findIndex((p, i) => p.y >= cut && pts[(i - 1 + pts.length) % pts.length].y < cut);
    const out = [];
    for (let k = 0; k < pts.length; k++) {
      const p = pts[(start + k) % pts.length];
      if (p.y < cut) break;
      out.push(p);
    }
    return out;
  };
  // outer edge from the right end over the top to the left end, then the inner edge back
  const top = upper(outer), under = upper(inner).reverse();
  const band = [new THREE.Vector2(top[0].x, cut), ...top, new THREE.Vector2(top[top.length - 1].x, cut),
    new THREE.Vector2(under[0].x, cut), ...under, new THREE.Vector2(under[under.length - 1].x, cut)];
  for (const [side, s] of Object.entries(SIDES)) {
    const lens = lensFrame(s);
    const frame = m.anchor(`lens${side}`, 'head', lens.center, lens.quaternion);
    const outline = s > 0 ? band : band.map((p) => new THREE.Vector2(-p.x, p.y)).reverse();
    m.add({ name: `rim${side}`, role: colour, parent: frame,
      make: () => new THREE.ExtrudeGeometry(new THREE.Shape(outline), {
        depth: H.bar.depth - 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 1,
      }).translate(0, 0, -H.bar.depth / 2 + 0.006) });
    m.add({ name: `glass${side}`, role: 'glass', parent: frame, print: false, shadow: false,
      make: () => new THREE.ShapeGeometry(new THREE.Shape(inner)).translate(0, 0, -0.005) });
  }

  const centre = F.gap / 2 + GLASSES.halfWidth;
  addTemples(m, colour, v, {
    lensOuter: centre + L.halfWidth + barWidth, topY: F.y + L.top + barWidth, zFront: F.z + H.bar.depth / 2,
    endPiece: { ...H.endPiece, height: minLine(H.endPiece.height) },
    temple: { ...H.temple, thickness: minLine(H.temple.thickness), height: minLine(H.temple.height) },
  });

  // bridge: thin straight bar joining the tops of the two bars
  const bridgeWidth = 2 * (centre - L.halfWidth) + 0.04;
  const bridgeHeight = minLine(H.bridge.height);
  m.add({
    name: 'bridge', role: colour, parent: 'head', position: v3(0, F.y + L.top + barWidth - bridgeHeight / 2 - 0.006, F.z),
    make: () => new THREE.BoxGeometry(bridgeWidth, bridgeHeight, minLine(H.bridge.depth)),
  });
}

// Shades: square, thick full frames with tinted lenses (not printed, so the eyes show).
// Lenses centred like the other styles, so the eye patches sit the same.
const SHADES = {
  lens: { halfWidth: 0.2, top: 0.11, bottom: -0.12, corner: 0.035 }, // opening around the lens centre
  rim: { width: 0.05, depth: 0.055 },
  bridge: { height: 0.045, depth: 0.045 },
  endPiece: { height: 0.08, back: 0.08 },
  temple: { inner: 0.65, thickness: 0.045, height: 0.06, backTo: -0.34, drop: 0.07 },
};

function addShades(m, colour, v) {
  const H = SHADES, L = H.lens, F = GLASSES.front;
  const minLine = (x) => (m.style.print ? Math.max(x, PRINT.minLine) : x);
  const w = minLine(H.rim.width);
  const inner = roundedRect(L.halfWidth, L.top, L.bottom, Array(4).fill(L.corner));
  const outer = roundedRect(L.halfWidth + w, L.top + w, L.bottom - w, [0.012, L.corner + w, L.corner + w, L.corner + w]); // square outer top corner meets the end piece
  for (const [side, s] of Object.entries(SIDES)) {
    const lens = lensFrame(s);
    const frame = m.anchor(`lens${side}`, 'head', lens.center, lens.quaternion);
    const flip = (pts) => (s > 0 ? pts : pts.map((p) => new THREE.Vector2(-p.x, p.y)).reverse());
    const ring = new THREE.Shape(flip(outer));
    ring.holes.push(new THREE.Path(flip(inner)));
    m.add({ name: `rim${side}`, role: colour, parent: frame,
      make: () => new THREE.ExtrudeGeometry(ring, {
        depth: H.rim.depth - 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 1,
      }).translate(0, 0, -H.rim.depth / 2 + 0.006) });
    // tinted lens filling the opening, a little behind the rim's front; printed, the frame stays open
    m.add({ name: `lens${side}Tint`, role: 'tint', parent: frame, print: false, shadow: false,
      make: () => new THREE.ExtrudeGeometry(new THREE.Shape(flip(roundedRect(L.halfWidth + 0.01, L.top + 0.01, L.bottom - 0.01, Array(4).fill(L.corner + 0.01)))), {
        depth: 0.02, bevelEnabled: false, curveSegments: 1,
      }).translate(0, 0, -0.012) });
  }
  const centre = F.gap / 2 + GLASSES.halfWidth;
  addTemples(m, colour, v, {
    lensOuter: centre + L.halfWidth + w, topY: F.y + L.top + w, zFront: F.z + H.rim.depth / 2,
    endPiece: { ...H.endPiece, height: minLine(H.endPiece.height) },
    temple: { ...H.temple, thickness: minLine(H.temple.thickness), height: minLine(H.temple.height) },
  });
  const bridgeHeight = minLine(H.bridge.height);
  m.add({
    name: 'bridge', role: colour, parent: 'head', position: v3(0, F.y + L.top + w - bridgeHeight / 2 - 0.01, F.z),
    make: () => new THREE.BoxGeometry(2 * (centre - L.halfWidth) + 0.04, bridgeHeight, minLine(H.bridge.depth)),
  });
}

// Round wire glasses: thin circular rims with clear lenses, a slim arched
// bridge high between them and slim temples. Lenses centred like the other
// styles, so the eye patches sit the same; the rims lie inside the patches,
// a bright ring on black. Printed, the wire is PRINT.minLine wide and the
// front grows backward like the octagon frames, so it survives its supports.
const ROUND = {
  lens: { radius: 0.165 }, // opening around the lens centre
  rim: { width: 0.026, depth: 0.04 },
  bridge: { y: 0.07, rise: 0.035, height: 0.026, depth: 0.03 }, // ends at this height on the rims, arching up by `rise`
  endPiece: { height: 0.045, back: 0.07 },
  temple: { inner: 0.65, thickness: 0.03, height: 0.035, backTo: -0.34, drop: 0.07 },
  print: { depth: 0.11 },
};

function addRound(m, colour, v) {
  const H = ROUND, F = GLASSES.front;
  const minLine = (x) => (m.style.print ? Math.max(x, PRINT.minLine) : x);
  const w = minLine(H.rim.width), r = H.lens.radius;
  const depth = m.style.print ? H.print.depth : H.rim.depth;
  const circle = (radius, n = 48) => Array.from({ length: n }, (_, i) => new THREE.Vector2(radius * Math.cos((i / n) * Math.PI * 2), radius * Math.sin((i / n) * Math.PI * 2)));
  for (const [side, s] of Object.entries(SIDES)) {
    const lens = lensFrame(s);
    const frame = m.anchor(`lens${side}`, 'head', lens.center, lens.quaternion);
    const ring = new THREE.Shape(circle(r + w));
    ring.holes.push(new THREE.Path(circle(r).reverse()));
    // the front face stays put; a deeper (printed) rim grows backward
    m.add({ name: `rim${side}`, role: colour, parent: frame,
      make: () => new THREE.ExtrudeGeometry(ring, {
        depth: depth - 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 1,
      }).translate(0, 0, H.rim.depth / 2 - depth + 0.006) });
    m.add({ name: `glass${side}`, role: 'glass', parent: frame, print: false, shadow: false,
      make: () => new THREE.ShapeGeometry(new THREE.Shape(circle(r + w / 2))).translate(0, 0, -0.005) });
  }
  const centre = F.gap / 2 + GLASSES.halfWidth;
  // the end pieces leave the rims at the height of the lens centres, where a circle reaches furthest out
  const E = { ...H.endPiece, height: minLine(H.endPiece.height) };
  addTemples(m, colour, v, {
    lensOuter: centre + r + w, topY: F.y + E.height / 2, zFront: F.z + H.rim.depth / 2,
    endPiece: E,
    temple: { ...H.temple, thickness: minLine(H.temple.thickness), height: minLine(H.temple.height) },
  });
  // bridge: a slim arch between the rims, its ends sunk into them
  const B = H.bridge, bh = minLine(B.height), bd = minLine(B.depth);
  const x0 = centre - Math.sqrt(Math.max(0, (r + w / 2) ** 2 - B.y ** 2)) + 0.01; // where the rim is at height B.y
  const arch = Array.from({ length: 9 }, (_, i) => { const t = -1 + i / 4; return v3(x0 * t, F.y + B.y + B.rise * (1 - t * t), F.z); });
  m.add({
    name: 'bridge', role: colour, parent: 'head',
    make: () => sweep(arch, arch.map(() => bh / 2), { radial: 12, up: Z }).scale(1, 1, bd / bh).translate(0, 0, F.z * (1 - bd / bh)),
  });
}

// A decal projected onto the head's actual surface, kept in head space.
/** Frame of a decal on the head surface: origin at `at.p`, +Z along `at.n`, spun about Z. */
function decalFrame(at, spin) {
  const q = orientZ(at.n).multiply(new THREE.Quaternion().setFromAxisAngle(Z, spin));
  return new THREE.Matrix4().compose(at.p.clone(), q, v3(1, 1, 1));
}

/** Eye-patch outline as [x, y] points (same superellipse as drawPatch). */
/** Outline of an eye patch: a superellipse, its top cut flat at `cut`·ry when the spec says so. */
function patchOutline({ rx, ry, squareness, cut = Infinity }, n) {
  const e = 2 / squareness;
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    return [rx * Math.sign(c) * Math.abs(c) ** e, Math.min(cut * ry, ry * Math.sign(s) * Math.abs(s) ** e)];
  });
}

function headDecal(m, at, spin, size, depth = 0.3) {
  const head = m.get('head').mesh;
  const joint = m.joints.head;
  m.root.updateMatrixWorld(true);
  const p = joint.localToWorld(at.p.clone());
  const q = new THREE.Quaternion().setFromRotationMatrix(joint.matrixWorld).multiply(orientZ(at.n))
    .multiply(new THREE.Quaternion().setFromAxisAngle(Z, spin));
  const g = new DecalGeometry(head, p, new THREE.Euler().setFromQuaternion(q), v3(size, size, depth));
  return g.applyMatrix4(joint.matrixWorld.clone().invert());
}

function addTablet(m) {
  const grip = attachment(TABLET.heldBy, TABLET.grip.pose, TABLET.grip);
  const frame = m.anchor('tablet', TABLET.heldBy, grip.position, grip.quaternion);
  m.add({ name: 'tabletSlab', role: 'tablet', parent: frame, make: () => new RoundedBoxGeometry(...TABLET.size, 6, 0.035) });
  m.texture('icon', (ctx, n, look) => drawTabletIcon(ctx, n, look ? '#ffffff' : '#7f7972'));
  m.add({
    name: 'tabletIcon', role: 'icon', parent: frame, print: false, // line art is below printable size position: v3(...TABLET.icon.at, TABLET.size[2] / 2 + 0.0006), shadow: false,
    make: () => new THREE.PlaneGeometry(TABLET.icon.size, TABLET.icon.size),
  });
}

// cloud with three rising bars; canvas art is 256 px across BADGE.size units
const BADGE = { size: 0.56 };

function addBadge(m) {
  m.texture('badge', (ctx, n, look) => drawBadge(ctx, n, look ? '#2f6bdc' : '#8d8780', look ? '#ffffff' : '#d9d3cb'));
  // where the badge sits: straight in front of the chest centre, on the body surface
  const body = m.get('body').mesh;
  const pelvis = m.joints.pelvis;
  m.root.updateMatrixWorld(true);
  const origin = pelvis.localToWorld(v3(0, BODY.offset.y + 0.09, 2));
  const dir = v3(0, 0, -1).transformDirection(pelvis.matrixWorld);
  const hit = new THREE.Raycaster(origin, dir).intersectObject(body, false)[0];
  if (!hit) return;
  const local = pelvis.worldToLocal(hit.point.clone());
  const u = local.clone().sub(BODY.offset);
  const R = BODY.radii;
  const n = v3(u.x / R.x ** 2, u.y / R.y ** 2, u.z / R.z ** 2).normalize();
  m.add({
    name: 'badge', role: 'badge', parent: 'pelvis', shadow: false,
    make: () => {
      const wn = n.clone().transformDirection(pelvis.matrixWorld);
      const g = new DecalGeometry(body, hit.point, new THREE.Euler().setFromQuaternion(orientZ(wn)), v3(BADGE.size, BADGE.size, 0.5));
      return g.applyMatrix4(pelvis.matrixWorld.clone().invert());
    },
    print: { clip: 'body', reach: CURVED, local: new THREE.Matrix4().compose(local, orientZ(n), v3(1, 1, 1)), layers: badgeLayers() },
  });
}

// The badge as 2D shapes in badge units (y up). Printed, the bars are as wide
// as the gaps between them, both at least PRINT.minLine.
function badgeLayers() {
  const k = BADGE.size / 256, X0 = 128, Y0 = 128;
  const P = (x, y) => [(x - X0) * k, (Y0 - y) * k];
  const circle = (x, y, r) => ({ add: { circle: [...P(x, y), r * k] } });
  const cloud = [circle(86, 146, 46), circle(138, 108, 62), circle(188, 142, 42),
    { add: { roundRect: [...P(52, 190), 172 * k, 60 * k, 30 * k] } }];
  const w = PRINT.minLine, base = P(0, 174)[1];
  const bars = [30, 46, 64].map((h, i) => ({ add: { roundRect: [P(138, 0)[0] + (i - 1) * 2 * w - w / 2, base, w, Math.max(h * k, 1.3 * w), w * 0.2] } }));
  return [{ role: 'tablet', ops: cloud }, { role: 'eyes', ops: bars }];
}

// ---------------------------------------------------------------------------
// Props for the variants
// ---------------------------------------------------------------------------

/** World matrices of every joint in a named pose (a throwaway skeleton). */
function posedJoints(pose) {
  const root = new THREE.Object3D();
  const joints = buildSkeleton(root);
  applyPose(joints, resolvePose(pose));
  root.updateMatrixWorld(true);
  return joints;
}

/**
 * Anchor a prop to `joint` so that, in `pose`, its local origin sits at the
 * joint and its +Y axis aims at `target` (world), with +Z as close to `facing`
 * as possible. Other poses simply carry it along.
 */
function aimAnchor(m, name, joint, pose, target, facing = Z) {
  const j = posedJoints(pose)[joint];
  const from = j.getWorldPosition(new THREE.Vector3());
  const y = target.clone().sub(from).normalize();
  const x = new THREE.Vector3().crossVectors(y, facing).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  return worldAnchor(m, name, joint, pose, from, new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)));
}

/** Anchor a prop to `joint` with a given world position/rotation in `pose`. */
function worldAnchor(m, name, joint, pose, position, quaternion = new THREE.Quaternion()) {
  const j = posedJoints(pose)[joint];
  const local = j.matrixWorld.clone().invert().multiply(new THREE.Matrix4().compose(position, quaternion, new THREE.Vector3(1, 1, 1)));
  const p = new THREE.Vector3(), q = new THREE.Quaternion();
  local.decompose(p, q, new THREE.Vector3());
  return m.anchor(name, joint, p, q);
}

// Pointing hand on the paw ball (ARM radius at the paw): index finger straight
// out along `dir` from the thumb side of the fist, the other three fingers
// curled into knuckle bumps on the front of the fist, the thumb tucked across
// them on the palm side. Without the offset and the knuckles a lone finger out
// of the middle of a round fist reads as the wrong finger.
// Local frame: +Y along the finger, +X toward the thumb side, palm on ±Z.
const HAND = {
  index: { offset: 0.08, length: 0.24, radii: [0.058, 0.056, 0.052] }, // starts inside the fist
  knuckles: { at: [0.01, -0.05, -0.105], radii: [0.046, 0.06, 0.1], proud: 0.016, palm: 0.02 },
  thumb: { from: [0.1, -0.03, 0.08], to: [0.035, 0.1, 0.13], radius: 0.044 }, // [thumb side, along, palm]
};

function pointingHand(m, name, side, pose, dir, thumbSide) {
  const paw = posedJoints(pose)[`paw${side}`].getWorldPosition(new THREE.Vector3());
  const y = dir.clone().normalize();
  const x = thumbSide.clone().addScaledVector(y, -thumbSide.dot(y)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  const frame = worldAnchor(m, name, `paw${side}`, pose, paw, new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)));
  const palm = side === 'R' ? 1 : -1; // palm direction along local Z (mirrored)
  const R = ARM.radii[ARM.radii.length - 1];
  const { index: ix, knuckles: k, thumb: t } = HAND;
  m.add({ name: `${name}Index`, role: 'black', parent: frame,
    make: () => sweep([0, 0.5, 1].map((f) => v3(ix.offset, 0.03 + f * ix.length, 0)), ix.radii, { caps: 'both' }) });
  k.at.forEach((u, i) => m.add({ name: `${name}Knuckle${i}`, role: 'black', parent: frame,
    position: v3(u, Math.sqrt(R * R - u * u) - k.radii[1] + k.proud, palm * k.palm),
    make: () => ellipsoid([k.radii[0], k.radii[1], k.radii[2]], { detail: 4 }) }));
  m.add({ name: `${name}Thumb`, role: 'black', parent: frame,
    make: () => sweep([t.from, t.to].map(([a, b, c]) => v3(a, b, palm * c)), [t.radius, t.radius * 0.9], { caps: 'both' }) });
}

// notepad: upright in the right paw, facing front-left, tilted back a little to write on
// tablet: upright at the right side, facing front-left, top leaning in toward the head
const NOTEPAD_GRIP = { rotation: [-6, -22, -12], contact: [-0.21, -0.17, 0.01] };

// Shield, all one blue (a second colour at this height would add filament
// changes): a heater outline whose top corners flare up either side of the
// paw, pointed tip; faceted front creased down the centre like a kite shield,
// a raised rim around the edge and a faceted lozenge boss on the crease.
const SHIELD = {
  width: 0.74, thickness: 0.08, bulge: 0.1,
  // right half of the outline, top centre to tip (× width, × height); the top
  // centre at +0.5 and the tip at -0.5 are what PROPS.shield's height relies on
  half: [[0, 0.5], [0.13, 0.5], [0.5, 0.56], [0.5, 0.2], [0.43, -0.08], [0.26, -0.31], [0, -0.5]],
  crease: [0.25, -0.2], // the centre crease is at full `bulge` between these (× height), running out to the top and tip
  rim: { width: 0.07, height: 0.07 }, // band around the edge, standing `height` above the plate's front edge
  boss: { y: 0.02, size: [0.26, 0.4], top: 0.6, sunk: 0.06, height: 0.05 }, // lozenge centred at y (× height), from `sunk` below the crease to a flat top `height` above it, `top` the size of the base
  // Guard pose: facing front-left, top leaning back; the paw sits `lift` above
  // the top edge and `back` behind the centre plane
  grip: { pose: 'guard', rotation: [-8, 22, 0], lift: 0.06, back: 0.06 },
};

/** Polygon moved inward by `d` (mitred corners); `pts` wound clockwise. */
function insetPolygon(pts, d) {
  const n = pts.length;
  const inward = ([ax, ay], [bx, by]) => { const l = Math.hypot(bx - ax, by - ay); return [(by - ay) / l, -(bx - ax) / l]; };
  return pts.map((p, i) => {
    const [ux, uy] = inward(pts[(i + n - 1) % n], p), [vx, vy] = inward(p, pts[(i + 1) % n]);
    const k = d / (1 + ux * vx + uy * vy);
    return [p[0] + (ux + vx) * k, p[1] + (uy + vy) * k];
  });
}

/** Shield outline (clockwise from the top centre, right side first), optionally moved inward. */
function shieldOutline(w, h, inset = 0) {
  const half = SHIELD.half.map(([x, y]) => [x * w, y * h]);
  const pts = [...half, ...half.slice(1, -1).reverse().map(([x, y]) => [-x, y])];
  return inset ? insetPolygon(pts, inset) : pts;
}

/** Non-indexed geometry from flat triangle vertex lists, one flat normal per facet. */
function facetGeometry(pos) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * The blue plate: flat back, faceted front rising to a crease down the
 * centre line. Its outline sits a hair inside the rim's, so the rim owns
 * the edge. Each half of the front is a strip between the outline chain
 * and the crease, triangulated top-down.
 */
function shieldPlateGeometry(w, h) {
  const { thickness: t, bulge, crease } = SHIELD;
  const outline = shieldOutline(w, h, 0.004);
  const pos = [];
  const tri = (a, b, c) => pos.push(...a, ...b, ...c);
  const centre = [0, 0.08 * h, -t / 2]; // the outline is star-shaped from here
  outline.forEach(([x, y], i) => {
    const [x2, y2] = outline[(i + 1) % outline.length];
    tri(centre, [x, y, -t / 2], [x2, y2, -t / 2]); // back
    tri([x, y, t / 2], [x2, y2, t / 2], [x2, y2, -t / 2]); // side
    tri([x, y, t / 2], [x2, y2, -t / 2], [x, y, -t / 2]);
  });
  const right = outline.slice(0, SHIELD.half.length).map(([x, y]) => [x, y, t / 2]);
  const spine = [right[0], [0, crease[0] * h, t / 2 + bulge], [0, crease[1] * h, t / 2 + bulge], right[right.length - 1]];
  for (const mirror of [false, true]) {
    const emit = (a, b, c) => { // counter-clockwise seen from the front; skip the degenerate ones at the shared ends
      if (a === b || b === c || a === c) return;
      if (mirror) tri([-a[0], a[1], a[2]], [-c[0], c[1], c[2]], [-b[0], b[1], b[2]]); else tri(a, b, c);
    };
    emit(right[0], spine[1], right[1]);
    let i = 1, j = 1;
    while (i < right.length - 1 || j < spine.length - 1) {
      const takeOutline = j === spine.length - 1 || (i < right.length - 1 && right[i + 1][1] >= spine[j + 1][1]);
      if (takeOutline) { emit(right[i], spine[j], right[i + 1]); i++; } else { emit(right[i], spine[j], spine[j + 1]); j++; }
    }
  }
  return facetGeometry(pos);
}

/** The rim: the outline band, from just behind the plate's back to `rim.height` above its front edge. */
function shieldRimGeometry(w, h) {
  const { thickness: t, rim } = SHIELD;
  // without the top-centre vertex: it lies on the straight top edge, and the
  // cap triangulation drops exactly collinear points while the walls keep them.
  // The hole runs counter-clockwise: ExtrudeGeometry only fixes a hole's
  // winding when it also has to reverse a counter-clockwise contour.
  const loop = (inset) => shieldOutline(w, h, inset).slice(1).map(([x, y]) => new THREE.Vector2(x, y));
  const ring = new THREE.Shape(loop(0));
  ring.holes.push(new THREE.Path(loop(rim.width).reverse()));
  const g = new THREE.ExtrudeGeometry(ring, { depth: t + 0.005 + rim.height, bevelEnabled: false });
  g.translate(0, 0, -t / 2 - 0.005);
  g.computeVertexNormals();
  return g;
}

/** Boss: a flat-topped lozenge with bevelled sides, its base sunk into the field so it stays attached off the crease. */
function bossGeometry({ size: [bw, bh], top, sunk, height }) {
  const lozenge = (k, z) => [[0, k * bh / 2, z], [k * bw / 2, 0, z], [0, -k * bh / 2, z], [-k * bw / 2, 0, z]];
  const B = lozenge(1, -sunk), T = lozenge(top, height);
  const pos = [...B[0], ...B[1], ...B[2], ...B[0], ...B[2], ...B[3], ...T[0], ...T[2], ...T[1], ...T[0], ...T[3], ...T[2]]; // base facing -Z, top +Z
  B.forEach((b, i) => { const j = (i + 1) % 4; pos.push(...T[i], ...B[j], ...b, ...T[i], ...T[j], ...B[j]); }); // bevels
  return facetGeometry(pos);
}

// glasses styles for the `glasses` slot: (model, colour, figure) => adds the parts
export const GLASSES_STYLES = { octagon: addGlasses, halfRim: addHalfRim, shades: addShades, round: addRound };

export const PROPS = {
  tablet: addTablet,
  badge: addBadge,

  // headband: a wide flat elliptical arc over the head; big cushion cups on the
  // sides at eye level, the band meeting the top of each cup
  headphones(m) {
    // printed, the band rests on the head instead of floating 0.6 mm above it
    const H = { z: 0.06, width: 0.14, gap: m.style.print ? -0.015 : 0.035, thickness: 0.07, cup: [0.17, 0.38, 0.31], cupY: -0.04 };
    const rx = HEAD.x + H.gap, ry = HEAD.y + H.gap;
    const cupX = HEAD.x * 0.97 + H.cup[0] / 2;
    const bandEndY = H.cupY + H.cup[1] / 2 - 0.03;
    const a0 = Math.asin(THREE.MathUtils.clamp(bandEndY / ry, -1, 1));
    const band = new THREE.Shape();
    band.absellipse(0, 0, rx + H.thickness, ry + H.thickness, a0, Math.PI - a0, false);
    band.absellipse(0, 0, rx, ry, Math.PI - a0, a0, true);
    m.add({
      name: 'headband', role: 'green', parent: 'head', position: v3(0, 0, H.z - H.width / 2),
      make: () => new THREE.ExtrudeGeometry(band, { depth: H.width, curveSegments: 48, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2 }),
    });
    for (const [side, s] of Object.entries(SIDES)) {
      // cup: taller than wide, rounded like a cushion; a cushion in the same colour against the head
      m.add({ name: `cup${side}`, role: 'green', parent: 'head', position: v3(s * cupX, H.cupY, H.z),
        make: () => new RoundedBoxGeometry(...H.cup, 5, 0.06) });
      m.add({ name: `cushion${side}`, role: 'green', parent: 'head', position: v3(s * (cupX - H.cup[0] / 2), H.cupY, H.z),
        make: () => new RoundedBoxGeometry(0.05, H.cup[1] * 0.86, H.cup[2] * 0.84, 3, 0.02) });
      // yoke joining band and cup
      m.add({ name: `yoke${side}`, role: 'green', parent: 'head', position: v3(s * (rx + H.thickness * 0.5), bandEndY, H.z),
        make: () => new RoundedBoxGeometry(0.075, 0.08, H.width * 0.9, 3, 0.02) });
    }
  },

  // notepad in the right paw, tilted back to write on
  notepad(m) {
    const size = [0.4, 0.56, 0.045];
    const grip = attachment('pawR', 'notes', NOTEPAD_GRIP);
    const frame = m.anchor('notepad', 'pawR', grip.position, grip.quaternion);
    m.add({ name: 'notepadSlab', role: 'green', parent: frame, make: () => new RoundedBoxGeometry(...size, 5, 0.04) });
    // camera dot in the top corner, like the back of a tablet
    m.add({ name: 'notepadCamera', role: 'dark', parent: frame, print: false, position: v3(-size[0] / 2 + 0.06, size[1] / 2 - 0.06, size[2] / 2 + 0.002),
      shadow: false, make: () => new THREE.CircleGeometry(0.018, 20) });
  },

  // pencil in the left paw, pointing at the notepad
  pencil(m) {
    const pad = posedJoints('notes').pawR.localToWorld(attachment('pawR', 'notes', NOTEPAD_GRIP).position.clone());
    // through the paw, sharpened end pointing down toward the tablet
    const paw = posedJoints('notes').pawL.getWorldPosition(new THREE.Vector3());
    const frame = aimAnchor(m, 'pencil', 'pawL', 'notes', paw.clone().add(v3(-0.25, -0.24, -0.08)), Z);
    const r = m.style.print ? 0.04 : 0.026;
    m.add({ name: 'pencilBody', role: 'green', parent: frame, position: v3(0, 0.02, 0), make: () => new THREE.CylinderGeometry(r, r, 0.5, 6) });
    m.add({ name: 'pencilTip', role: 'eyes', parent: frame, position: v3(0, 0.27 + (r - 0.026), 0), make: () => new THREE.ConeGeometry(r, 0.06 + (r - 0.026) * 2, 6) });
    m.add({ name: 'pencilLead', role: 'dark', parent: frame, position: v3(0, 0.307, 0), print: false, make: () => new THREE.ConeGeometry(0.009, 0.02, 6) });
    m.add({ name: 'pencilEnd', role: 'eyes', parent: frame, position: v3(0, -0.24, 0), make: () => new THREE.CylinderGeometry(r + 0.001, r + 0.001, 0.03, 6) });
  },

  // magnifier: octagonal yellow ring, glass, handle into the left paw; lens in front of the left eye
  magnifier(m) {
    const M = { ring: 0.2, wall: 0.05, depth: 0.055 };
    const eye = posedJoints('inspect').head.localToWorld(v3(0.27, 0.02, HEAD.z + 0.12));
    const frame = aimAnchor(m, 'magnifier', 'pawL', 'inspect', eye);
    const lensY = eye.distanceTo(posedJoints('inspect').pawL.getWorldPosition(new THREE.Vector3()));
    const ring = new THREE.Shape(octagon(M.ring));
    ring.holes.push(new THREE.Path(octagon(M.ring - M.wall)));
    m.add({ name: 'magnifierRing', role: 'yellow', parent: frame, position: v3(0, lensY, -M.depth / 2),
      make: () => new THREE.ExtrudeGeometry(ring, { depth: M.depth, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 1 }) });
    m.add({ name: 'magnifierGlass', role: 'lens', parent: frame, position: v3(0, lensY, 0), shadow: false, print: false,
      make: () => new THREE.CylinderGeometry(M.ring - M.wall, M.ring - M.wall, 0.012, 8).rotateX(Math.PI / 2).rotateZ(Math.PI / 8) });
    const len = lensY - M.ring;
    // handle widens toward the end held in the paw; printed, handle and neck
    // are ≥ 2 mm across (the 1–1.2 mm stem broke when removing supports)
    m.add({ name: 'magnifierHandle', role: 'yellow', parent: frame, position: v3(0, len / 2 - 0.05, 0),
      make: (st) => new THREE.CylinderGeometry(st.print ? 0.06 : 0.026, st.print ? 0.065 : 0.042, len + 0.1, 8) });
    m.add({ name: 'magnifierNeck', role: 'yellow', parent: frame, position: v3(0, len + 0.005, 0),
      make: (st) => (st.print ? new THREE.CylinderGeometry(0.065, 0.06, 0.04, 8) : new THREE.CylinderGeometry(0.04, 0.03, 0.04, 8)) });
  },

  // smartwatch on the right wrist, face turned toward the front in the standing pose
  watch(m) {
    const wrist = posedJoints('inspect').wristR;
    const toFront = v3(0, 0.3, 1).transformDirection(wrist.matrixWorld.clone().invert());
    toFront.y = 0; toFront.normalize();
    const r = ARM.radii[3] + 0.018, along = 0.04; // a little up the forearm from the wrist
    m.add({ name: 'watchBand', role: 'yellow', parent: 'wristR', position: v3(0, along, 0),
      quaternion: new THREE.Quaternion().setFromAxisAngle(X, Math.PI / 2),
      make: () => new THREE.TorusGeometry(r, 0.032, 12, 40) });
    const face = m.anchor('watchFace', 'wristR', toFront.clone().multiplyScalar(r + 0.03).add(v3(0, along, 0)), orientZ(toFront, Y));
    m.add({ name: 'watchCase', role: 'yellow', parent: face, make: () => new RoundedBoxGeometry(0.14, 0.16, 0.06, 3, 0.025) });
    m.add({ name: 'watchScreen', role: 'dark', parent: face, position: v3(0, 0, m.style.print ? 0.024 : 0.031), shadow: false,
      make: (st) => (st.print ? new THREE.BoxGeometry(0.1, 0.12, 0.02) : new THREE.PlaneGeometry(0.1, 0.12)) });
  },

  // pointing hand on the right paw, aimed across the body, thumb side up (palm toward the belly)
  pointer(m) {
    pointingHand(m, 'pointer', 'R', 'inspect', v3(1, 0.05, 0.35), Y);
  },

  // pointing hand on the left paw, continuing the forearm, thumb side up and forward
  pointerL(m) {
    const j = posedJoints('point');
    const dir = j.pawL.getWorldPosition(new THREE.Vector3()).sub(j.elbowL.getWorldPosition(new THREE.Vector3()));
    pointingHand(m, 'pointerL', 'L', 'point', dir, v3(0, 0.8, 0.6));
  },

  // big stopwatch held up against the chest in the right paw (On Time pose),
  // face to the front: green case sunk into paw and chest so it prints
  // supported, white dial, black hands, grey crown button and loop on top
  stopwatch(m) {
    const paw = posedJoints('onTime').pawR.getWorldPosition(new THREE.Vector3());
    const frame = worldAnchor(m, 'stopwatch', 'pawR', 'onTime', paw.clone().add(v3(0.04, 0.12, 0.05)),
      new THREE.Quaternion().setFromAxisAngle(X, -0.15));
    const R = 0.17, depth = 0.14, line = m.style.print ? PRINT.minLine : 0.03;
    m.add({ name: 'stopwatchCase', role: 'green', parent: frame,
      make: () => new THREE.CylinderGeometry(R, R, depth, 48).rotateX(Math.PI / 2) });
    m.add({ name: 'stopwatchDial', role: 'eyes', parent: frame, position: v3(0, 0, depth / 2 - 0.01),
      make: () => new THREE.CylinderGeometry(R - 0.03, R - 0.03, 0.03, 48).rotateX(Math.PI / 2) });
    // hands at ten past ten, a dot in the middle
    for (const [name, len, angle] of [['Minute', 0.11, 0.35], ['Hour', 0.075, -1.0]]) {
      m.add({ name: `stopwatch${name}`, role: 'black', parent: frame, position: v3(0, 0, depth / 2 + 0.008),
        quaternion: new THREE.Quaternion().setFromAxisAngle(Z, angle),
        make: () => new THREE.BoxGeometry(line, len, 0.02).translate(0, len / 2, 0) });
    }
    m.add({ name: 'stopwatchHub', role: 'black', parent: frame, position: v3(0, 0, depth / 2 + 0.01),
      make: () => new THREE.CylinderGeometry(0.022, 0.022, 0.024, 20).rotateX(Math.PI / 2) });
    m.add({ name: 'stopwatchCrown', role: 'grey', parent: frame, position: v3(0, R + 0.03, 0),
      make: () => new THREE.CylinderGeometry(0.035, 0.035, 0.06, 20) });
    m.add({ name: 'stopwatchLoop', role: 'grey', parent: frame, position: v3(0, R + 0.09, 0),
      make: () => new THREE.TorusGeometry(0.04, line / 2 + 0.008, 10, 24) });
    m.add({ name: 'stopwatchButton', role: 'grey', parent: frame, position: v3(0.12, 0.13, 0),
      quaternion: new THREE.Quaternion().setFromAxisAngle(Z, -0.75),
      make: () => new THREE.CylinderGeometry(0.025, 0.025, 0.05, 16) });
  },

  // toy rocket lifting off beside the figure (his right), standing on a column
  // of puffy white smoke that rises from the base, so it prints supported.
  // Green body, sharp white nose and swept fins, black porthole, grey nozzle;
  // tilted a little out and forward as it climbs.
  rocket(m) {
    const at = v3(-0.8, BASE.sink, 0.12);
    const puffs = [[0, 0.1, 0, 0.2], [0.13, 0.08, 0.09, 0.14], [-0.11, 0.09, -0.06, 0.15], [0.05, 0.08, -0.12, 0.12],
      [0.02, 0.27, 0.02, 0.15], [-0.05, 0.41, 0.01, 0.12], [0.02, 0.52, 0.02, 0.1]];
    const ground = m.anchor('rocketSmoke', null, at);
    puffs.forEach(([x, y, z, r], i) => m.add({ name: `rocketPuff${i}`, role: 'fur', parent: ground, position: v3(x, y, z),
      make: () => ellipsoid([r, r * 0.85, r], { detail: 4 }) }));
    const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, 0, 0.16)); // nose out (−X) and forward
    const frame = m.anchor('rocket', ground, v3(0.02, 0.55, 0.02), tilt);
    frame.scale.setScalar(1.15);
    const fin = m.style.print ? PRINT.minLine / 1.15 : 0.035;
    m.add({ name: 'rocketNozzle', role: 'grey', parent: frame, position: v3(0, 0.04, 0),
      make: () => new THREE.CylinderGeometry(0.075, 0.06, 0.08, 32) });
    m.add({ name: 'rocketBody', role: 'green', parent: frame,
      make: () => lathe([[0, 0.07], [0.1, 0.07], [0.118, 0.2], [0.118, 0.46], [0.108, 0.54], [0, 0.55]]) });
    m.add({ name: 'rocketNose', role: 'fur', parent: frame,
      make: () => lathe([[0, 0.52], [0.11, 0.52], [0.085, 0.64], [0.04, 0.76], [0, 0.84]]) });
    m.add({ name: 'rocketWindow', role: 'dark', parent: frame, position: v3(0, 0.37, 0.105),
      make: () => new THREE.CylinderGeometry(0.045, 0.045, 0.04, 32).rotateX(Math.PI / 2) });
    const finShape = new THREE.Shape([[0, 0], [0.14, -0.05], [0.15, 0.04], [0, 0.24]].map(([x, y]) => new THREE.Vector2(x, y)));
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + Math.PI / 2; // one fin toward each side, one to the back
      m.add({ name: `rocketFin${k}`, role: 'fur', parent: frame, position: v3(0, 0.08, 0),
        quaternion: new THREE.Quaternion().setFromAxisAngle(Y, a),
        make: () => new THREE.ExtrudeGeometry(finShape, { depth: fin, bevelEnabled: false }).translate(0.09, 0, -fin / 2) });
    }
  },

  // big low-poly shield: creased plate in a raised rim with a lozenge boss,
  // all blue. In the Guard pose its tip stands on the base and the left paw
  // rests in the dip of its top edge; other poses carry it along.
  shield(m) {
    const S = SHIELD, j = posedJoints(S.grip.pose);
    const paw = j.pawL.getWorldPosition(new THREE.Vector3());
    // height so that the tip just touches the floor (panda space, y = 0) under the tilted grip
    const tilt = THREE.MathUtils.degToRad(S.grip.rotation[0]);
    const height = (paw.y - S.grip.back * Math.sin(tilt)) / Math.cos(tilt) - S.grip.lift;
    const grip = attachment('pawL', S.grip.pose, { rotation: S.grip.rotation, contact: [0, height / 2 + S.grip.lift, -S.grip.back] });
    const frame = m.anchor('shield', 'pawL', grip.position, grip.quaternion);
    m.add({ name: 'shieldPlate', role: 'tablet', parent: frame, make: () => shieldPlateGeometry(S.width, height) });
    m.add({ name: 'shieldRim', role: 'tablet', parent: frame, make: () => shieldRimGeometry(S.width, height) });
    m.add({ name: 'shieldBoss', role: 'tablet', parent: frame, position: v3(0, S.boss.y * height, S.thickness / 2 + S.bulge), make: () => bossGeometry(S.boss) });
  },

  // right paw raised beside the head, index finger up (Guard)
  warnFinger(m) {
    pointingHand(m, 'warnFinger', 'R', 'guard', v3(0.1, 1, 0.12), v3(1, 0, 0));
  },

  // little gadget on the floor in front: a solid black stand (black is in
  // those low layers anyway, white would add filament changes) with a row of
  // blocks with blue tops. Nothing overhangs, so it prints without supports;
  // the stand is sunk into the base like the soles.
  gadget(m) {
    const at = v3(0.22, 0, 0.66), yaw = -0.35, top = 0.13, sunk = 0.03;
    const frame = m.anchor('gadget', null, at, new THREE.Quaternion().setFromAxisAngle(Y, yaw));
    m.add({ name: 'gadgetStand', role: 'black', parent: frame, position: v3(0, (top - sunk) / 2, 0),
      make: () => new RoundedBoxGeometry(0.62, top + sunk, 0.3, 2, 0.012) });
    [0.07, 0.12, 0.09, 0.15, 0.11].forEach((h, i) => {
      const x = -0.22 + i * 0.11, z = -0.03 + (i % 2) * 0.05;
      m.add({ name: `gadgetBlock${i}`, role: 'fur', parent: frame, position: v3(x, top + h / 2, z), make: () => new THREE.BoxGeometry(0.07, h, 0.1) });
      m.add({ name: `gadgetCap${i}`, role: 'tablet', parent: frame, position: v3(x, top + h + 0.01, z), make: () => new THREE.BoxGeometry(0.07, 0.02, 0.1) });
    });
  },

  // camera held in front of the chest by both paws (anchored to the right paw)
  camera(m) {
    const j = posedJoints('photo');
    const mid = j.pawR.getWorldPosition(new THREE.Vector3()).lerp(j.pawL.getWorldPosition(new THREE.Vector3()), 0.5).add(v3(0, 0.03, 0.09));
    const frame = worldAnchor(m, 'camera', 'pawR', 'photo', mid);
    // DSLR: body, hand grip on the right, prism hump, shutter button, big lens with a red ring
    m.add({ name: 'cameraBody', role: 'red', parent: frame, make: () => new RoundedBoxGeometry(0.52, 0.31, 0.19, 4, 0.04) });
    m.add({ name: 'cameraGrip', role: 'red', parent: frame, position: v3(0.2, -0.01, 0.04), make: () => new RoundedBoxGeometry(0.13, 0.3, 0.26, 4, 0.05) });
    m.add({ name: 'cameraPrism', role: 'red', parent: frame, position: v3(-0.03, 0.19, -0.01), make: () => new RoundedBoxGeometry(0.19, 0.1, 0.15, 3, 0.03) });
    m.add({ name: 'cameraButton', role: 'red', parent: frame, position: v3(0.19, 0.17, 0.05), make: () => new THREE.CylinderGeometry(0.03, 0.03, 0.035, 16) });
    m.add({ name: 'cameraLens', role: 'dark', parent: frame, position: v3(-0.04, -0.01, 0.17),
      make: () => new THREE.CylinderGeometry(0.13, 0.14, 0.17, 48).rotateX(Math.PI / 2) });
    m.add({ name: 'cameraLensRing', role: 'red', parent: frame, position: v3(-0.04, -0.01, 0.2),
      make: () => new THREE.TorusGeometry(0.135, 0.018, 12, 48) });
    m.add({ name: 'cameraGlass', role: 'lens', parent: frame, position: v3(-0.04, -0.01, 0.256), shadow: false, print: false,
      make: () => new THREE.CircleGeometry(0.1, 48) });
  },

  // katana slung across the back: the scabbard runs from the right hip up over
  // the left shoulder, where the wrapped handle and the guard show beside the
  // head; it lies against the back (sunk a little into the body so it fuses)
  katana(m) {
    const K = { tilt: 0.95, scabbard: { length: 1.0, size: [0.1, 0.08] }, guard: { radius: 0.09, height: 0.04 }, handle: { length: 0.32, size: [0.085, 0.07] } };
    const centre = v3(0.1, -0.12, -0.38); // chest space: on the back, toward the left shoulder
    const q = new THREE.Quaternion().setFromAxisAngle(Z, -K.tilt); // local +Y runs up toward the left shoulder
    const along = (d) => centre.clone().add(v3(0, d, 0).applyQuaternion(q));
    const [w, d] = K.scabbard.size, L = K.scabbard.length;
    m.add({ name: 'scabbard', role: 'dark', parent: 'chest', position: along(0), quaternion: q,
      make: () => new RoundedBoxGeometry(w, L, d, 3, 0.03) });
    m.add({ name: 'katanaGuard', role: 'dark', parent: 'chest', position: along(L / 2 + K.guard.height / 2), quaternion: q,
      make: () => new THREE.CylinderGeometry(K.guard.radius, K.guard.radius, K.guard.height, 32) });
    const [hw, hd] = K.handle.size;
    m.add({ name: 'katanaHandle', role: 'red', parent: 'chest', position: along(L / 2 + K.guard.height + K.handle.length / 2), quaternion: q,
      make: () => new RoundedBoxGeometry(hw, K.handle.length, hd, 3, 0.025) });
  },

  // backpack on the back, straps showing on the front of the shoulders; it
  // replaces the tail, which would poke out below it
  backpack(m) {
    m.remove((p) => p.name === 'tail');
    // wider than the body, so it shows at both sides from the front
    m.add({ name: 'backpack', role: 'red', parent: 'pelvis', position: v3(0, BODY.offset.y + 0.08, -0.42),
      make: () => new RoundedBoxGeometry(1.08, 0.74, 0.32, 5, 0.1) });
    m.add({ name: 'backpackPocket', role: 'red', parent: 'pelvis', position: v3(0, BODY.offset.y - 0.04, -0.6),
      make: () => new RoundedBoxGeometry(0.56, 0.34, 0.1, 3, 0.04) });
    for (const [side, s] of Object.entries(SIDES)) {
      m.add({ name: `backpackSide${side}`, role: 'red', parent: 'pelvis', position: v3(s * 0.56, BODY.offset.y + 0.02, -0.34),
        make: () => new RoundedBoxGeometry(0.14, 0.44, 0.26, 3, 0.05) });
      // flat strap lying on the upper chest
      const local = v3(s * 0.34, BODY.offset.y + 0.2, 0);
      const u = local.clone().sub(BODY.offset);
      const R = BODY.radii;
      const dir = v3(u.x / R.x, u.y / R.y, 0.7);
      const at = onEllipsoid(R, dir, 0.012);
      m.add({ name: `strap${side}`, role: 'red', parent: 'pelvis', position: at.p.add(BODY.offset), quaternion: orientZ(at.n, Y),
        make: () => new RoundedBoxGeometry(0.1, 0.36, 0.035, 2, 0.012) });
    }
  },
};

// Laughing mouth: a black "D" with a white inside, painted onto the snout
// (a decal on the head mesh, so it follows the surface exactly).
const GRIN = { width: 0.26, height: 0.11, outline: 0.017, decal: 0.34 };

function addGrin(m) {
  m.texture('grin', (ctx, n, look) => drawGrin(ctx, n, look ? '#1e1f25' : '#8d8780', look ? '#ffffff' : '#ece7df'));
  const S = m.snout;
  const y = mouthY(S); // just under the nose, on the snout front
  const n = v3(0, 0.25, 1).normalize(); // the snout front faces forward and slightly up
  const at = { p: v3(0, y, faceZ(S, 0, y)), n };
  const outline = m.style.print ? PRINT.minLine * 0.9 : GRIN.outline;
  m.add({ name: 'mouthGrin', role: 'grin', parent: 'head', shadow: false,
    make: () => headDecal(m, at, 0, GRIN.decal, 0.8),
    print: { clip: 'head', reach: CURVED, local: decalFrame(at, 0), layers: [
      { role: 'dark', ops: [{ add: { poly: grinShape(0) } }, { sub: { poly: grinShape(outline) } }] },
      { role: 'eyes', ops: [{ add: { poly: grinShape(outline) } }] },
    ] } });
}

// Beaming open smile: the grin's "D" as sculpted pieces on the snout (dark
// mouth, a band of white top teeth), so it wraps the snout and reads from any
// angle, not just from the front.
function addBeam(m) {
  const S = m.snout, face = { z: (x, y) => faceZ(S, x, y) };
  const cy = mouthY(S), w = GRIN.width / 2, top = cy + GRIN.height * 0.45;
  const mouth = grinShape(0).map(([x, y]) => [x, y + cy]);
  const inset = m.style.print ? PRINT.minLine : 0.022, teeth = GRIN.height * 0.36;
  const band = [[-w + inset, top - inset], [-w + inset, top - inset - teeth], [w - inset, top - inset - teeth], [w - inset, top - inset]];
  const bandCentre = [0, top - inset - teeth / 2];
  // the dark piece reaches a little under the beard's inner edge and stands
  // almost as proud as a beard, so no sliver of head shows between them
  m.add({ name: 'mouthBeam', role: 'dark', parent: 'head',
    make: () => facePatch(face, { centre: [0, cy], outer: (a) => polygonRadius(mouth, [0, cy], a) + 0.02, thickness: 0.018, inlay: 0.03, edge: 0.08 }) });
  m.add({ name: 'mouthTeeth', role: 'eyes', parent: 'head',
    make: () => facePatch(face, { centre: bandCentre, outer: (a) => polygonRadius(band, bandCentre, a), thickness: 0.026, inlay: 0.02, edge: 0.3 }) });
}

// the grin's "D" in head units around its centre, inset by `inset`
function grinShape(inset) {
  const w = GRIN.width / 2, h = GRIN.height, top = h * 0.45;
  const pts = [[-w + inset, top - inset], [w - inset, top - inset]];
  // cubic from the right corner down and back to the left corner (same curve as drawGrin)
  const p0 = [w - inset, top - inset], p1 = [w - inset, top - h * 1.3 + inset * 1.6], p2 = [-w + inset, top - h * 1.3 + inset * 1.6], p3 = [-w + inset, top - inset];
  for (let i = 1; i < 24; i++) {
    const t = i / 24, a = (1 - t) ** 3, b = 3 * t * (1 - t) ** 2, c = 3 * t * t * (1 - t), d = t ** 3;
    pts.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]);
  }
  return pts;
}

function drawGrin(ctx, n, ink, fill) {
  const u = n / GRIN.decal; // pixels per head unit
  const w = (GRIN.width / 2) * u, h = GRIN.height * u, o = GRIN.outline * u;
  const top = n / 2 - h * 0.45;
  const d = (inset) => {
    ctx.beginPath();
    ctx.moveTo(n / 2 - w + inset, top + inset);
    ctx.lineTo(n / 2 + w - inset, top + inset);
    ctx.bezierCurveTo(n / 2 + w - inset, top + h * 1.3 - inset * 1.6, n / 2 - w + inset, top + h * 1.3 - inset * 1.6, n / 2 - w + inset, top + inset);
    ctx.closePath();
  };
  ctx.lineJoin = 'round';
  ctx.fillStyle = ink; d(0); ctx.fill();
  ctx.fillStyle = fill; d(o); ctx.fill();
}

// ---------------------------------------------------------------------------
// 5 · Look
// ---------------------------------------------------------------------------

function lookPass(m) {
  m.style.look = true;
  m.restyle({ geometry: false });
  // a hologram is light: it casts no shadow
  Object.assign(m.render, { shadows: !m.style.hologram, environment: 0.5, groundShadow: m.style.hologram ? 0 : 0.16 });
}

export const PASSES = [
  { id: 'rig', label: 'Rig', summary: 'Joints and bones, posed from the pose table', apply: rigPass },
  { id: 'blockout', label: 'Blockout', summary: 'Primitives, one capsule per bone', apply: blockoutPass },
  { id: 'tubes', label: 'Smoothing', summary: 'One smooth tube per arm and leg, through its joints', apply: tubesPass },
  { id: 'details', label: 'Details', summary: 'Face, glasses, tablet and chest badge', apply: detailsPass },
  { id: 'look', label: 'Shading', summary: 'Panda colours, soft shadows and reflections', apply: lookPass },
];

// ---------------------------------------------------------------------------
// Canvas art for the two decals
// ---------------------------------------------------------------------------

function drawBadge(ctx, n, cloud, bars) {
  const u = n / 256;
  ctx.fillStyle = cloud;
  const circ = (x, y, r) => { ctx.beginPath(); ctx.arc(x * u, y * u, r * u, 0, Math.PI * 2); ctx.fill(); };
  circ(86, 146, 46); circ(138, 108, 62); circ(188, 142, 42);
  ctx.beginPath(); ctx.roundRect(52 * u, 130 * u, 172 * u, 60 * u, 30 * u); ctx.fill();
  ctx.fillStyle = bars;
  [[98, 30], [126, 46], [154, 64]].forEach(([x, h]) => {
    ctx.beginPath(); ctx.roundRect(x * u, (174 - h) * u, 18 * u, h * u, 3 * u); ctx.fill();
  });
}

function drawPatch(ctx, n, ink, spec) {
  // the patch outline; texture spans spec.decal world units
  const k = n / spec.decal;
  ctx.fillStyle = ink;
  ctx.beginPath();
  patchOutline(spec, 96).forEach(([x, y], i) => (i ? ctx.lineTo(n / 2 + k * x, n / 2 - k * y) : ctx.moveTo(n / 2 + k * x, n / 2 - k * y)));
  ctx.closePath();
  ctx.fill();
}

function drawTabletIcon(ctx, n, ink) {
  ctx.strokeStyle = ink;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const cx = n / 2, cy = n * 0.55, r = n * 0.25;
  ctx.lineWidth = n * 0.045; // ears, trimmed where they overlap the head outline
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + s * r * 0.78, cy - r * 0.86, r * 0.36, 0, Math.PI * 2); ctx.stroke(); }
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = n * 0.032; // octagon glasses
  for (const s of [-1, 1]) {
    ctx.beginPath();
    for (let k = 0; k <= 8; k++) {
      const a = Math.PI / 8 + (k * Math.PI) / 4;
      const x = cx + s * r * 0.44 + Math.cos(a) * r * 0.36, y = cy - r * 0.08 + Math.sin(a) * r * 0.36;
      k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(cx - r * 0.1, cy - r * 0.12); ctx.lineTo(cx + r * 0.1, cy - r * 0.12); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy + r * 0.38, r * 0.2, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
}

