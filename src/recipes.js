// recipes.js — a figure is a recipe: plain JSON in figures/<id>.json, bundled
// into dist/figures.json by build.sh (viewer order: by label, holograms last).
//
//   {
//     "id": "leon", "label": "Leon",
//     "codes": { "handsOnHips": "41E7" },
//                                          QR short code per printed pose (4 upper-case hex
//                                          digits, unique; the signature pose needs one).
//                                          Codes once printed stay, so old figures keep working.
//     "poses": ["handsOnHips"],            standing pose (props placed for it), then optional
//                                          signature action pose (viewer start, print); else the standing one
//     "eyes": "open", "mouth": "grin",
//     "snout": "strong",                   optional face shape (SNOUTS in passes.js), default "panda"
//     "hologram": true,                    placeholder: drawn as a hologram in the viewer, never printed
//     "accent": "green",                   optional: every accessory in this one colour (ACCENTS in
//                                          passes.js; the gang's look, and the stage's accent picker)
//     "spin": 30,                          optional: degrees the figure stands turned on the stage
//                                          (+ = toward its left), so its best side shows first
//     "hair":   { "style": "crop", "colour": "grey" },      optional slot (HAIR in hair.js)
//     "beard":   { "style": "goatee", "colour": "black" },   optional slot (BEARDS in beard.js)
//     "glasses": { "style": "halfRim", "colour": "dark" },  optional slot (GLASSES_STYLES)
//     "outfit":  { "style": "dress", "colour": "blue" },    optional slot (OUTFITS in outfit.js)
//     "props": [],                                           PROPS, built in list order
//     "only": { "<part>": [poses] }, "hide": { "<part>": [poses] },   per-pose visibility
//     "faces": { "<pose>": { "eyes": "alert", "mouth": "frown", "look": [x, y] } }   per-pose face
//   }
//
// checkRecipe() checks a recipe against the part library and throws on
// anything it does not know, naming the figure and the value.

import { POSES } from './rig.js';
import { ACCENTS, MOUTHS, PROPS, GLASSES_STYLES, COLOURS, SNOUTS, EYE_STYLES } from './passes.js';
import { HAIR } from './hair.js';
import { BEARDS } from './beard.js';
import { OUTFITS } from './outfit.js';

const SLOTS = { hair: HAIR, beard: BEARDS, glasses: GLASSES_STYLES, outfit: OUTFITS };
const FIELDS = ['id', 'label', 'codes', 'poses', 'eyes', 'mouth', 'snout', 'hologram', 'accent', 'spin', 'props', 'only', 'hide', 'faces', ...Object.keys(SLOTS)];
const names = (o) => Object.keys(o).join(', ');

export function checkRecipe(r) {
  const fail = (msg) => { throw new Error(`figure "${r.id}": ${msg}`); };
  for (const k of Object.keys(r)) if (!FIELDS.includes(k)) fail(`unknown field "${k}"`);
  if (!/^[a-z][a-z0-9-]*$/.test(r.id ?? '')) fail('id must be lowercase letters, digits and dashes');
  if (typeof r.label !== 'string' || !r.label) fail('label is missing');
  const pose = (p, where) => { if (!POSES[p]) fail(`${where}: unknown pose "${p}" (have ${names(POSES)})`); };
  if (!Array.isArray(r.poses) || r.poses.length < 1 || r.poses.length > 2) fail('poses: standing pose, then an optional signature pose');
  r.poses.forEach((p) => pose(p, 'poses'));
  if (!EYE_STYLES[r.eyes]) fail(`unknown eyes "${r.eyes}" (have ${names(EYE_STYLES)})`);
  if (!MOUTHS[r.mouth]) fail(`unknown mouth "${r.mouth}" (have ${names(MOUTHS)})`);
  if (r.snout !== undefined && !SNOUTS[r.snout]) fail(`unknown snout "${r.snout}" (have ${names(SNOUTS)})`);
  if (r.hologram !== undefined && r.hologram !== true) fail('hologram must be true or left out');
  if (r.accent !== undefined && !ACCENTS[r.accent]) fail(`unknown accent "${r.accent}" (have ${names(ACCENTS)})`);
  if (r.spin !== undefined && !(Number.isFinite(r.spin) && Math.abs(r.spin) <= 180)) fail('spin must be degrees between -180 and 180');
  for (const [p, code] of Object.entries(r.codes ?? {})) {
    pose(p, 'codes');
    if (!/^[0-9A-F]{4}$/.test(code)) fail(`codes.${p}: "${code}" is not 4 upper-case hex digits`);
  }
  const signature = r.poses?.[1] ?? r.poses?.[0];
  if (!r.codes?.[signature]) fail(`codes: the signature pose "${signature}" needs a QR code`);
  for (const [slot, library] of Object.entries(SLOTS)) {
    const s = r[slot];
    if (s === undefined) continue;
    for (const k of Object.keys(s)) if (k !== 'style' && k !== 'colour') fail(`${slot}: unknown field "${k}"`);
    if (!library[s.style]) fail(`${slot}: unknown style "${s.style}" (have ${names(library)})`);
    if (!COLOURS[s.colour]) fail(`${slot}: unknown colour "${s.colour}" (have ${names(COLOURS)})`);
  }
  if (!Array.isArray(r.props)) fail('props must be a list');
  r.props.forEach((p) => { if (!PROPS[p]) fail(`unknown prop "${p}" (have ${names(PROPS)})`); });
  const parts = [...r.props, ...Object.keys(SLOTS).filter((slot) => r[slot])];
  for (const key of ['only', 'hide']) {
    for (const [part, poses] of Object.entries(r[key] ?? {})) {
      if (!parts.includes(part)) fail(`${key}: "${part}" is not one of this figure's parts (${parts.join(', ')})`);
      poses.forEach((p) => pose(p, key));
    }
  }
  for (const [p, face] of Object.entries(r.faces ?? {})) {
    pose(p, 'faces');
    for (const k of Object.keys(face)) if (!['eyes', 'mouth', 'look'].includes(k)) fail(`faces.${p}: unknown field "${k}"`);
    if (face.eyes !== undefined && !EYE_STYLES[face.eyes]) fail(`faces.${p}: unknown eyes "${face.eyes}"`);
    if (face.mouth !== undefined && !MOUTHS[face.mouth]) fail(`faces.${p}: unknown mouth "${face.mouth}"`);
    if (face.look !== undefined && !(face.look.length === 2 && face.look.every(Number.isFinite))) fail(`faces.${p}: look must be [x, y]`);
  }
  return r;
}

/** Checked recipes by id, with `snout` defaulted and `pose` (standing) and `signature` (viewer start pose) filled in. */
export function loadRecipes(list) {
  return Object.fromEntries(list.map((r) => {
    checkRecipe(r);
    const [pose, signature = pose] = r.poses;
    return [r.id, { snout: 'panda', ...r, pose, signature }];
  }));
}
