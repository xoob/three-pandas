// rig.js — skeleton layout, pose parameters and pose blending.
//
// To pose the character, edit POSES below (angles in degrees). Each pose only
// needs the values that differ from NEUTRAL. Everything that has geometry
// follows the joints: blobs are parented to a joint, tubes are re-swept
// through the joint positions after every pose change.

import * as THREE from 'three';
import { X, Y, Z, deg } from './shapes.js';

// ---------------------------------------------------------------------------
// Joint layout in the rest pose: character faces +Z, arms and legs hang
// straight down. `at` is the offset from the parent joint. Sided joints are
// written for the left side (+X) and mirrored for the right side (−X).
// ---------------------------------------------------------------------------

const CENTER = {
  pelvis: { parent: null, at: [0, 0.55, 0] },
  chest: { parent: 'pelvis', at: [0, 0.49, -0.02] },
  neck: { parent: 'chest', at: [0, 0.12, 0.02] },
  head: { parent: 'neck', at: [0, 0.44, 0.02] }, // centre of the head
};

const SIDED = {
  clavicle: { parent: 'chest', at: [0.22, 0.08, 0] }, // inside the torso: arm tube starts here
  shoulder: { parent: 'chest', at: [0.38, 0.05, 0] },
  elbow: { parent: 'shoulder', at: [0, -0.34, 0] },
  wrist: { parent: 'elbow', at: [0, -0.3, 0] },
  paw: { parent: 'wrist', at: [0, -0.08, 0] }, // centre of the paw
  hipRoot: { parent: 'pelvis', at: [0.2, 0.15, 0.02] }, // inside the belly: leg tube starts here
  hip: { parent: 'pelvis', at: [0.27, -0.02, 0.02] },
  knee: { parent: 'hip', at: [0, -0.17, 0.01] },
  ankle: { parent: 'knee', at: [0, -0.15, -0.01] },
};

export const SIDES = { R: -1, L: 1 };

export const RIG = (() => {
  const rig = { ...CENTER };
  for (const [side, s] of Object.entries(SIDES)) {
    for (const [name, j] of Object.entries(SIDED)) {
      rig[name + side] = {
        parent: SIDED[j.parent] ? j.parent + side : j.parent,
        at: [j.at[0] * s, j.at[1], j.at[2]],
      };
    }
  }
  return rig;
})();

/** Build the joint hierarchy (plain Object3Ds) under `root`. Returns { name: Object3D }. */
export function buildSkeleton(root) {
  const joints = {};
  for (const [name, j] of Object.entries(RIG)) {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.fromArray(j.at);
    joints[name] = o;
  }
  for (const [name, j] of Object.entries(RIG)) (j.parent ? joints[j.parent] : root).add(joints[name]);
  return joints;
}

// ---------------------------------------------------------------------------
// Pose parameters (degrees)
//
// head   nod    + looks down          turn  + looks to its left (+X)
//        tilt   + leans toward its right shoulder (−X)
// arm    raise  0 hanging, 90 straight out to the side, 180 straight up
//        forward swings the arm toward the front (+Z)
//        twist  spins the arm about its own axis and so picks the plane the
//               elbow bends in: 0 = forearm bends forward, 90 = bends upward
//               when the arm is raised sideways
//        bend   elbow flexion        wrist  wrist flexion
//        turn   spins the paw about the forearm (turns a held prop)
// leg    swing  + forward             spread + outward      toe   toe-out
//        knee   + bends the shin back  foot   + tips the toes up
//        twist  spins the thigh about its own axis, turning the plane the
//               knee bends in (90 with the thigh forward: shin folds inward)
//        roll   + rolls the sole outward, about the toes (a tucked foot shows its sole)
//        stretch  leg bone lengths ×: a seated figure gets longer legs, as a
//               sculptor would, so they show beside and in front of the belly
//        (feet stay level unless `foot` says otherwise)
// body   lean   + leans forward        tilt   + leans to its left (+X)
//        turn   + turns to its left    hop    lifts off the ground
//        The lowest foot is put back on the ground after every pose, so a
//        raised leg lifts its own foot instead of pushing the other one down.
//
// Sides are mirrored: the same numbers give a symmetric pose.
// ---------------------------------------------------------------------------

export const NEUTRAL = {
  head: { nod: 0, turn: 0, tilt: 0 },
  armR: { raise: 28, forward: 10, twist: 0, bend: 20, wrist: 0, turn: 0 },
  armL: { raise: 28, forward: 10, twist: 0, bend: 20, wrist: 0, turn: 0 },
  legR: { swing: 0, spread: 2, twist: 0, knee: 0, foot: 0, toe: 16, roll: 0, stretch: 1 },
  legL: { swing: 0, spread: 2, twist: 0, knee: 0, foot: 0, toe: 16, roll: 0, stretch: 1 },
  body: { lean: 0, tilt: 0, turn: 0, hop: 0 },
};

// Run cycle: legs swing in opposite phase; the back leg folds at the knee and
// its toes point down along the shin, the front foot stays flat.
function runFrame(phase) {
  // the back foot's toes point down along the shin, but not steeply: a sharp
  // downward toe tip printed messy on its support
  const leg = (ph) => ({ swing: 40 * Math.sin(ph), knee: 45 - 35 * Math.sin(ph), foot: -35 * Math.max(0, -Math.sin(ph)) });
  return {
    legR: leg(phase), legL: leg(phase + Math.PI),
    body: { lean: 12 + 3 * Math.cos(2 * phase), turn: 40, hop: 0.05 * Math.abs(Math.cos(phase)) },
  };
}
function diffFrames(a, b) {
  const out = {};
  for (const g in a) { out[g] = {}; for (const k in a[g]) out[g][k] = a[g][k] - b[g][k]; }
  return out;
}

export const POSES = {
  wave: {
    label: 'Wave',
    head: { tilt: 3, turn: -4 },
    armR: { raise: 102, forward: 10, twist: 90, bend: 40, wrist: -10 },
    armL: { raise: 42, forward: 4, bend: 62 },
    legR: { swing: -4 },
    legL: { swing: 6 },
    // wave: the forearm swings outward from the elbow and back (never toward the head)
    motion: (t) => ({ armR: { bend: -9 * (1 - Math.cos(t * 5.2)) } }),
  },
  rest: {
    label: 'Rest',
    head: { nod: 4 },
    armR: { raise: 36, forward: 14, bend: 28 },
    armL: { raise: 42, forward: 4, bend: 62 },
    motion: (t) => ({ head: { nod: 2.5 * Math.sin(t * 1.6) }, armR: { raise: 2 * Math.sin(t * 1.6) } }), // breathing
  },
  notes: {
    label: 'Notes',
    // notepad held in the right paw, writing on it with a pencil in the left
    head: { nod: 8, turn: -6, tilt: -3 },
    armR: { raise: 40, forward: 6, bend: 62 }, // tablet upright at the right side
    armL: { raise: 18, forward: 66, twist: -75, bend: 56 },
    motion: (t) => ({ armL: { bend: 4 * Math.sin(t * 7) }, head: { nod: 1.5 * Math.sin(t * 1.2) } }), // scribbling
  },
  inspect: {
    label: 'Inspect',
    // magnifier up to the left eye, right paw pointing out
    head: { tilt: -6, turn: 8 },
    armL: { raise: 84, forward: 36, twist: 45, bend: 74 },
    armR: { raise: 18, forward: 66, twist: -60, bend: 64 },
    contact: ['armL'],
    motion: (t) => ({ head: { turn: 3 * Math.sin(t * 0.9) }, armL: { forward: 2 * Math.sin(t * 0.9) } }),
  },
  photo: {
    label: 'Photo',
    // camera held in front of the chest with both paws
    head: { nod: 4 },
    armR: { raise: 48, forward: 66, twist: -45, bend: 64 },
    armL: { raise: 48, forward: 66, twist: -45, bend: 64 },
    motion: (t) => ({ head: { tilt: 2 * Math.sin(t * 1.4) } }),
  },
  handsOnHips: {
    label: 'Hands on Hips',
    // hands on hips, elbows out, chest up, chin up: the confident stance
    head: { nod: -6 },
    armR: { raise: 84, forward: 6, twist: -90, bend: 108 },
    armL: { raise: 84, forward: 6, twist: -90, bend: 108 },
    legR: { spread: 7 },
    legL: { spread: 7 },
    body: { lean: -4 },
    motion: (t) => ({ body: { lean: -1.5 * Math.sin(t * 1.3) }, head: { nod: -1.5 * Math.sin(t * 1.3) } }), // slow, proud breathing
  },
  hipWave: {
    label: 'Hi!',
    // left paw on the hip, right paw up in a friendly wave, head tilted toward it
    head: { tilt: 5, turn: -6 },
    armR: { raise: 102, forward: 10, twist: 90, bend: 40, wrist: -10 },
    armL: { raise: 84, forward: 6, twist: -90, bend: 108 },
    legR: { swing: -3 },
    legL: { swing: 5, spread: 5 },
    body: { tilt: 2 },
    motion: (t) => ({ armR: { bend: -9 * (1 - Math.cos(t * 5.2)) } }), // same wave as Wave
  },
  ready: {
    label: 'Ready',
    // grounded fighting stance: feet wide, knees soft, weight low; right fist
    // up before the chest, left paw low and open to the side; chin level, still
    head: { nod: -2, turn: 4 },
    armR: { raise: 52, forward: 74, twist: -30, bend: 62 },
    armL: { raise: 42, forward: 18, twist: -20, bend: 36 },
    legR: { spread: 22, swing: -4, knee: 18, toe: 20 },
    legL: { spread: 22, swing: 6, knee: 18, toe: 20 },
    body: { lean: 5, turn: -8 },
    motion: (t) => ({ body: { lean: 1.2 * Math.sin(t * 1.1) }, armR: { bend: 3 * Math.sin(t * 1.1) } }), // slow breath, fist settling
  },
  meditate: {
    label: 'Meditate',
    // sitting cross-legged on the base, paws resting on the knees, chin up, slow breath
    head: { nod: -8 },
    armR: { raise: 44, forward: 0, twist: -15, bend: 90 }, // forearms down and forward, paws on the knees
    armL: { raise: 44, forward: 0, twist: -15, bend: 90 },
    // tailor sit: long legs, knees wide and forward, shins folded in across the
    // front (the right one in front), feet meeting at the middle with their soles forward
    legR: { swing: 55, spread: 85, twist: 180, knee: 115, toe: -75, roll: 75, stretch: 2 },
    legL: { swing: 45, spread: 85, twist: 180, knee: 115, toe: -75, roll: 75, stretch: 2 },
    body: { hop: 0 }, // the shins rest on the base (the lowest ankle sits at standing height, one shin radius up)
    motion: (t) => ({ head: { nod: 2 * Math.sin(t * 0.8) }, armR: { raise: 1.5 * Math.sin(t * 0.8) }, armL: { raise: 1.5 * Math.sin(t * 0.8) } }),
  },
  welcome: {
    label: 'Welcome',
    // arms open wide, paws up: "come on in"
    head: { nod: -4, tilt: 3 },
    armR: { raise: 58, forward: 30, twist: 90, bend: 55, wrist: -25 },
    armL: { raise: 58, forward: 30, twist: 90, bend: 55, wrist: -25 },
    legR: { spread: 5 },
    legL: { spread: 5 },
    motion: (t) => ({ armR: { raise: 3 * Math.sin(t * 1.5) }, armL: { raise: 3 * Math.sin(t * 1.5) }, head: { tilt: 2 * Math.sin(t * 0.8) } }),
  },
  onTime: {
    label: 'On Time',
    // stopwatch held up against the chest, left fist pumped at the shoulder,
    // wide stride, chin up
    head: { nod: -6, turn: -8, tilt: -4 },
    armR: { raise: 30, forward: 66, twist: -60, bend: 72 },
    armL: { raise: 38, forward: -12, twist: 10, bend: 118 },
    legL: { swing: 16, spread: 6 },
    legR: { swing: -12, spread: 6 },
    body: { lean: 3, turn: 8, tilt: -4 },
    motion: (t) => ({ armL: { bend: 8 * Math.sin(t * 6) }, head: { tilt: 2 * Math.sin(t * 3) } }), // fist pumping
  },
  liftoff: {
    label: 'Liftoff',
    // presenting the rocket taking off at his right with an open paw, left fist
    // pumped at the shoulder, looking up at it
    head: { nod: -12, turn: -24, tilt: -4 },
    armR: { raise: 100, forward: 24, twist: 90, bend: 22, wrist: -12 },
    armL: { raise: 38, forward: -12, twist: 10, bend: 118 },
    legL: { swing: 10, spread: 6 },
    legR: { swing: -8, spread: 6 },
    body: { lean: -3, turn: -8, tilt: 3 },
    motion: (t) => ({ armL: { bend: 8 * Math.sin(t * 6) }, head: { nod: -2 * Math.sin(t * 1.5) } }), // fist pumping
  },
  // ----- action poses (second pose of each character) -----
  puzzled: {
    label: 'Puzzled',
    // paw to the chin, looking down at the gadget on the floor, tablet still in the left paw
    head: { nod: 16, turn: 12, tilt: -6 },
    armR: { raise: 40, forward: 50, twist: 15, bend: 80, wrist: 4 },
    armL: { raise: 42, forward: 4, bend: 62 },
    body: { lean: 4 },
    contact: ['armR'],
    motion: (t) => ({ head: { tilt: 3 * Math.sin(t * 0.9) }, armR: { wrist: -4 - 4 * Math.sin(t * 2.4) } }),
  },
  point: {
    label: 'Point',
    // left arm straight out to the side, pointing; tablet in the right paw
    head: { turn: 26, nod: 2, tilt: -3 },
    armL: { raise: 86, forward: 28, twist: 0, bend: 6 },
    armR: { raise: 40, forward: 6, bend: 62 },
    body: { turn: -6 },
    legL: { swing: 6 }, legR: { swing: -4 },
    motion: (t) => ({ armL: { forward: 4 * Math.sin(t * 3), bend: 4 + 4 * Math.sin(t * 3) } }),
  },
  dance: {
    label: 'Dance',
    // magnifier still up at the eye, other arm thrown up, left leg kicked out
    head: { tilt: -6, turn: 6 },
    armL: { raise: 84, forward: 36, twist: 45, bend: 74 },
    armR: { raise: 120, forward: 10, twist: 90, bend: 20, wrist: -10 },
    legL: { spread: 34, swing: -6, knee: 95, foot: -60 }, // toes point down along the kicked-up shin
    legR: { spread: 4 },
    body: { tilt: -8 }, // stands on its base; the hop is in the motion
    contact: ['armL'],
    motion: (t) => {
      const b = Math.sin(t * 5);
      return { body: { tilt: 3 * b, hop: 0.02 * Math.abs(b) }, armR: { bend: 10 * b }, legL: { knee: 10 * b }, head: { tilt: -3 * b } };
    },
  },
  run: {
    label: 'Run',
    // mid-stride, leaning in, camera held out in front
    head: { nod: -4, turn: -6 },
    armR: { raise: 48, forward: 66, twist: -45, bend: 64 },
    armL: { raise: 48, forward: 66, twist: -45, bend: 64 },
    ...runFrame(Math.PI / 2),
    motion: (t) => diffFrames(runFrame(Math.PI / 2 + t * 9), runFrame(Math.PI / 2)),
  },
  guard: {
    label: 'Guard',
    // shield planted on the ground at the front left, paw on its top edge;
    // right paw up beside the head, index finger raised: "not on my watch"
    head: { tilt: -5, turn: 8 }, // toward the shield and the viewer: both pupils stay in sight
    armL: { raise: 84, forward: 36, twist: -15, bend: 72 },
    armR: { raise: 78, forward: 12, twist: 45, bend: 88 },
    legL: { spread: 6 },
    legR: { spread: 6 },
    motion: (t) => ({ armR: { wrist: 12 * Math.sin(t * 7) }, head: { tilt: 2 * Math.sin(t * 1.4) } }), // finger wag
  },
  hooray: {
    label: 'Hooray',
    head: { nod: -8 },
    armR: { raise: 105, forward: 12, twist: 90, bend: 40, wrist: -10 },
    // shows the tablet off, upright and facing out, a long edge level at the
    // bottom (hanging by a corner it printed as spaghetti from a single point)
    armL: { raise: 105, forward: 12, twist: 90, bend: 40, wrist: -60, turn: 70 },
    legR: { spread: 6 },
    legL: { spread: 6 },
    motion: (t) => {
      const b = -9 * (1 - Math.cos(t * 6)); // pump both forearms outward
      return { armR: { bend: b }, armL: { bend: b }, head: { tilt: 3 * Math.sin(t * 3) } };
    },
  },
  cellar: {
    label: 'Cellar',
    // at ease beside the barrel: left paw resting on its lid, weight toward
    // it, the glass held up before the chest in the right paw
    head: { tilt: -5, turn: -6, nod: -2 },
    armL: { raise: 28, forward: 12, twist: 0, bend: 78 }, // forearm level, out over the barrel at the front left
    armR: { raise: 74, forward: 24, twist: -15, bend: 90 },
    legR: { spread: 4, swing: 4 },
    legL: { spread: 6, swing: -2 },
    body: { tilt: -5 },
    motion: (t) => ({ armR: { bend: 4 * Math.sin(t * 1.8) }, head: { tilt: 2 * Math.sin(t * 0.9) } }), // swirling the glass
  },
  ride: {
    label: 'Ride',
    // astride a barrel lying on the base like a racer: long legs down both
    // sides to the base, left paw gripping the barrel in front, the glass
    // thrown up in the right paw, leaning back
    head: { nod: -6, tilt: 5, turn: -6 },
    armR: { raise: 104, forward: 30, twist: 90, bend: 24, wrist: -8 },
    armL: { raise: 12, forward: 48, twist: -75, bend: 56 },
    legR: { spread: 48, swing: 8, knee: 10, toe: 30, stretch: 1.6 },
    legL: { spread: 48, swing: 8, knee: 10, toe: 30, stretch: 1.6 },
    body: { lean: -6 },
    motion: (t) => ({ body: { lean: 3 * Math.sin(t * 4) }, armR: { bend: 8 * Math.sin(t * 4) } }), // bucking
  },
};

export const DEFAULT_POSE = 'wave';

// ---------------------------------------------------------------------------
// Pose → joint rotations
// ---------------------------------------------------------------------------

const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _d = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _e = new THREE.Euler();

// raise in the frontal plane, then swing forward, after twisting about the bone.
function limbRotation(s, raise, forward, twist, out) {
  _qa.setFromAxisAngle(Z, s * deg(raise));
  _d.set(0, -1, 0).applyQuaternion(_qa);
  _axis.crossVectors(_d, Z).normalize(); // rotating about d × Z moves the limb toward +Z
  out.setFromAxisAngle(_axis, deg(forward)).multiply(_qa);
  return out.multiply(_qb.setFromAxisAngle(Y, s * deg(twist)));
}

/** Apply a full parameter set (see NEUTRAL) to the joints from buildSkeleton(). */
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _qp = new THREE.Quaternion();
const _qf = new THREE.Quaternion();
const PELVIS_REST = RIG.pelvis.at;
// ankle height when standing (pelvis-parent space): pelvis + hip + knee + ankle offsets
const ANKLE_REST = RIG.pelvis.at[1] + RIG.hipL.at[1] + RIG.kneeL.at[1] + RIG.ankleL.at[1];

export function applyPose(joints, p) {
  const b = p.body;
  joints.pelvis.quaternion.setFromEuler(_e.set(deg(b.lean), deg(b.turn), -deg(b.tilt), 'YXZ'));
  joints.neck.quaternion.setFromEuler(_e.set(deg(p.head.nod), deg(p.head.turn), deg(p.head.tilt), 'YXZ'));
  for (const [side, s] of Object.entries(SIDES)) {
    const a = p['arm' + side];
    limbRotation(s, a.raise, a.forward, a.twist, joints['shoulder' + side].quaternion);
    joints['elbow' + side].quaternion.setFromAxisAngle(X, -deg(a.bend));
    joints['wrist' + side].quaternion.setFromAxisAngle(Y, s * deg(a.turn)).multiply(_qa.setFromAxisAngle(X, -deg(a.wrist)));

    const l = p['leg' + side];
    const hip = joints['hip' + side].quaternion;
    limbRotation(s, l.spread, l.swing, l.twist, hip);
    joints['knee' + side].position.fromArray(RIG['knee' + side].at).multiplyScalar(l.stretch);
    joints['knee' + side].quaternion.setFromAxisAngle(X, deg(l.knee));
    joints['ankle' + side].position.fromArray(RIG['ankle' + side].at).multiplyScalar(l.stretch);
    // undo pelvis, hip and knee so the foot is level, then turn the toes out with the body, tip and roll it
    _qp.copy(joints.pelvis.quaternion).multiply(hip).multiply(joints['knee' + side].quaternion).invert();
    _qf.setFromAxisAngle(Y, deg(b.turn) + s * deg(l.toe)).multiply(_qa.setFromAxisAngle(X, -deg(l.foot)))
      .multiply(_qb.setFromAxisAngle(Z, s * deg(l.roll)));
    joints['ankle' + side].quaternion.copy(_qp).multiply(_qf);
  }

  // put the lowest ankle back at standing height
  joints.pelvis.position.fromArray(PELVIS_REST);
  let low = Infinity;
  for (const side of Object.keys(SIDES)) {
    _m.identity();
    for (const n of ['pelvis', 'hip' + side, 'knee' + side, 'ankle' + side]) {
      joints[n].updateMatrix();
      _m.multiply(joints[n].matrix);
    }
    low = Math.min(low, _v.setFromMatrixPosition(_m).y);
  }
  joints.pelvis.position.y += ANKLE_REST - low + b.hop;
}

/**
 * Local transform for a prop held by `joint`, described the readable way:
 * in `poseName` the prop has world rotation `rotation` (Euler, degrees, YXZ)
 * and its local point `contact` sits exactly at the joint. In every other
 * pose the prop simply follows the joint.
 */
export function attachment(joint, poseName, { rotation, contact }) {
  const root = new THREE.Object3D();
  const joints = buildSkeleton(root);
  applyPose(joints, resolvePose(poseName));
  root.updateMatrixWorld(true);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation.map(deg), 'YXZ'));
  const at = joints[joint].getWorldPosition(new THREE.Vector3());
  const p = at.sub(new THREE.Vector3(...contact).applyQuaternion(q));
  const local = joints[joint].matrixWorld.clone().invert().multiply(new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1)));
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  local.decompose(position, quaternion, new THREE.Vector3());
  return { position, quaternion };
}

// ---------------------------------------------------------------------------
// Blending: PoseDriver eases between poses and layers each pose's motion on top.
// ---------------------------------------------------------------------------

const clone = (o) => JSON.parse(JSON.stringify(o));
const groups = Object.keys(NEUTRAL);

/** Full parameter set for a named pose (NEUTRAL filled in). */
export function resolvePose(name) {
  const pose = POSES[name] || {};
  const out = clone(NEUTRAL);
  for (const g of groups) Object.assign(out[g], pose[g]);
  return out;
}

function mix(a, b, k, out) {
  for (const g of groups) for (const key in a[g]) out[g][key] = a[g][key] + (b[g][key] - a[g][key]) * k;
  return out;
}
function addScaled(out, delta, k) {
  if (!delta) return out;
  for (const g in delta) for (const key in delta[g]) out[g][key] += delta[g][key] * k;
  return out;
}
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

export class PoseDriver {
  constructor(name = DEFAULT_POSE) {
    this.name = name;
    this.from = resolvePose(name);
    this.to = this.from;
    this.fromName = name;
    this.k = 1;
    this.duration = 0.7;
    this.motionWeight = 0;
    this.out = clone(NEUTRAL);
  }

  /** Start blending to a named pose. */
  set(name, seconds = 0.7) {
    if (!POSES[name] || name === this.name) return;
    this.from = clone(this.current());
    this.fromName = this.name;
    this.to = resolvePose(name);
    this.name = name;
    this.k = seconds > 0 ? 0 : 1;
    this.duration = seconds;
  }

  current() { return mix(this.from, this.to, ease(this.k), this.out); }

  /** Advance by dt seconds; t = elapsed time for motion. Returns the parameter set to apply. */
  sample(dt, t, motionOn) {
    this.k = Math.min(1, this.k + dt / Math.max(this.duration, 1e-3));
    this.motionWeight += ((motionOn ? 1 : 0) - this.motionWeight) * (1 - Math.exp(-6 * dt));
    const e = ease(this.k);
    const out = this.current();
    const w = this.motionWeight;
    addScaled(out, POSES[this.fromName]?.motion?.(t), w * (1 - e));
    addScaled(out, POSES[this.name]?.motion?.(t), w * e);
    return out;
  }

  /** True while something is still changing (blend in progress or motion fading in/out/running). */
  get active() { return this.k < 1 || this.motionWeight > 0.002; }
}
