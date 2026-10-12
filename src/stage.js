// stage.js — "Friends of BigPanda": the printed gang on a stage.
//
// Each figure is its own WebGL canvas inside a button, so the layout,
// selection, dimming and the phone composition are plain CSS (stage.html).
// The figures idle in their printed pose and now and then try another one,
// each on its own clock. Selecting one opens Customize; the layers button
// shows how the model is built, pass by pass.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createPanda, ACCENTS, BASE_COLOURS, PASSES, POSES, VARIANTS, PoseDriver, resolvePose } from './panda.js';
import { ROLES } from './passes.js';
import CLAUDE_PROMPT from '../dist/claude-prompt.json' with { type: 'json' };
// left to right, centre spot in the middle; `pose` and `base` as printed (tools/print.mjs PLATES)
import CAST from './cast.json';

const $ = (s) => document.querySelector(s);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const deg = THREE.MathUtils.degToRad;
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

const SHARED_POSES = ['rest', 'hooray'];
const phone = matchMedia('(max-width: 600px)'); // the hero layout in stage.html
const HERO = 'analyst'; // centre stage (middle of src/cast.json) and the subject when nobody is selected
const WIDTHS = [18, 21, 26, 21, 18]; // % of the row per spot, as .p1–.p5 in stage.html
const OVERLAP = 1.8; // negative margin between spots, % of the row
const GITHUB = 'https://github.com/xoob/three-panda';
// a new Code session in the Claude desktop app, the README's prompt prefilled
const CLAUDE = 'claude://code/new?q=' + encodeURIComponent(CLAUDE_PROMPT);

const SWATCH_INK = (n) => { const c = new THREE.Color(n); return c.r * 0.3 + c.g * 0.59 + c.b * 0.11 > 0.6 ? '#1a1614' : '#ffffff'; };
const ACCENT_SWATCHES = Object.entries(ACCENTS).map(([id, role]) => ({ id, label: cap(id), colour: ROLES[role].look }));
const BASE_SWATCHES = Object.entries(BASE_COLOURS).map(([id, role]) => ({ id, label: cap(id), colour: ROLES[role].look }));

const INTRO = 'Every panda is generated in code, no Blender involved. <code>three.js</code> builds it in five passes: '
  + 'a skeletal rig posed from hard-coded angles, rough shapes on the bones, one smooth tube per arm and leg, '
  + 'a painted-on face, then materials and light. For print, the same model becomes a multi-colour 3D printer project. '
  + 'The code is open source, add your own hair, poses, and props!';
// one terse engineering line per pass, and where it lives in the repo
const TECH = [
  { file: 'src/rig.js', line: 'Joint hierarchy (RIG table) posed from a pose table in degrees.', chips: ['PoseDriver eases between poses', 'per-pose motion loop layered on top', 'knees', 'lowest foot re-grounded after every pose'] },
  { file: 'src/passes.js', line: 'Primitives only: ellipsoid body and head, one capsule per bone.', chips: ['subdivided icospheres', 'capsule per bone'] },
  { file: 'src/shapes.js · sweep()', line: 'One tube per limb through its joints.', chips: ['centripetal Catmull-Rom path', 'smoothstep radius by arc length', 'parallel-transport frames', 're-swept on every pose change'] },
  { file: 'src/passes.js', line: 'Snout sculpted into the head mesh; face and badge sit on the surface.', chips: ['snout: vertex deform, no seam', 'eyes · pupils · mouth · badge: DecalGeometry', 'fur markings: per-pixel field in the shader', 'props anchored to joints'] },
  { file: 'src/stage.js', line: 'PBR materials under a warm key light and two rim lights.', chips: ['MeshStandardMaterial', 'RoomEnvironment via PMREM', 'soft shadow maps', 'neutral tone mapping'] },
];

// ----- state -----
const state = {
  edition: 'gang', // or 'next': the ADR Team, the figures not printed yet (EDITIONS)
  sel: null, // selected figure id
  sheet: null, // 'pipeline' | 'customize'
  pass: 3, // pass shown while the pipeline sheet is open
  menu: false,
  playing: !reduceMotion,
};

// ----- one figure: canvas, renderer, scene, model per pass -----
const CAMERA = { fov: 20, el: deg(7), target: new THREE.Vector3(0, 1.32, 0), halfHeight: 1.62 };

class Figure {
  constructor(cast, spot, index) {
    this.id = cast.id;
    this.spot = spot; // 1–5, left to right
    this.variant = VARIANTS[cast.id];
    this.home = cast.pose;
    this.poses = [...new Set([cast.pose, ...this.variant.poses, ...SHARED_POSES])];
    this.look = { accent: this.variant.accent, base: cast.base, eyes: this.variant.eyes };
    this.pose = cast.pose;
    this.auto = true; // tries other poses by itself until someone picks one
    this.phase = index * 1.7; // motion loops out of step
    this.driver = new PoseDriver(cast.pose);
    this.models = new Map(); // pass → model for the current look
    this.model = null;
    this.pass = 0;
    this.dirty = true;
    this.scheduleChange(performance.now(), true);

    this.el = document.createElement('button');
    this.el.type = 'button';
    this.el.className = 'fig';
    this.el.dataset.act = 'pick';
    this.el.dataset.id = this.id;
    this.el.dataset.key = `fig-${this.id}`;
    this.el.style.order = spot; // the row is a flex row: figures and empty spots by spot, not DOM order
    this.el.innerHTML = `<div class="fbeam" aria-hidden="true"><div class="cone"></div></div><div class="fpool" aria-hidden="true"></div>
      <canvas class="main"></canvas><canvas class="refl" aria-hidden="true"></canvas>
      <div class="tag" aria-hidden="true"><span class="nm serif">${this.variant.label}</span><span class="ps"></span></div>`;
    this.canvas = this.el.querySelector('canvas.main');
    this.refl = this.el.querySelector('canvas.refl').getContext('2d');

    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    r.toneMapping = THREE.NeutralToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.environment();
    // phones drop WebGL contexts in the background: rebuild what lived on the GPU
    this.canvas.addEventListener('webglcontextrestored', () => { this.environment(); this.restyle({}); kick(); });
    const hemi = new THREE.HemisphereLight(0xfff4e8, 0x2a2420, 0.35);
    this.scene.add(hemi);
    this.key = new THREE.DirectionalLight(0xffeedd, 2.6); // the spotlight from above the stage
    this.key.position.set(1.2, 6, 3.2);
    this.key.shadow.mapSize.set(1024, 1024);
    Object.assign(this.key.shadow.camera, { left: -2, right: 2, top: 3.2, bottom: -1, near: 1, far: 12 });
    this.key.shadow.radius = 4;
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.02;
    this.scene.add(this.key);
    const rim = (colour, intensity, x) => { const l = new THREE.DirectionalLight(colour, intensity); l.position.set(x, 3, -2.6); this.scene.add(l); return l; };
    const fill = new THREE.DirectionalLight(0xfff0e0, 0.35);
    fill.position.set(0, 1.5, 5);
    this.scene.add(fill);
    // every light at full strength; `light` scales them all (dimmed when another figure is selected)
    this.lights = [hemi, this.key, rim(0x9fb4ff, 1.4, -3.5), rim(0xffc89a, 1.0, 3.5), fill].map((l) => [l, l.intensity]);
    this.light = 1;
    this.depth = 1; // place on the phone carousel, see placeRing()
    this.lightTarget = 1;
    this.hover = false;
    this.el.addEventListener('pointerenter', (e) => { this.hover = e.pointerType === 'mouse'; });
    this.el.addEventListener('pointerleave', () => { this.hover = false; });
    this.catcher = new THREE.Mesh(new THREE.CircleGeometry(2.4, 48), new THREE.ShadowMaterial({ opacity: 0.35 }));
    this.catcher.rotation.x = -Math.PI / 2;
    this.catcher.receiveShadow = true;
    this.scene.add(this.catcher);
    // Two fingers turn the front figure (phone), the lights stay put: the model
    // stands on a turntable (spin, about the vertical axis) inside a pivot at
    // the figure's middle that tilts it toward or away from the camera.
    this.pivot = new THREE.Group();
    this.pivot.position.y = CAMERA.target.y;
    this.scene.add(this.pivot);
    this.turntable = new THREE.Group();
    this.turntable.position.y = -CAMERA.target.y;
    this.pivot.add(this.turntable);
    this.right = new THREE.Vector3(1, 0, 0); // the camera's right, the tilt axis (aim())
    this.homeSpin = deg(this.variant.spin ?? 0); // the recipe's turn on the stage, radians
    this.spin = this.spinTarget = this.homeSpin;
    this.tilt = this.tiltTarget = 0;
    this.turn();
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 480 / 560, 0.1, 50);
    new ResizeObserver(() => this.resize()).observe(this.canvas);
  }

  environment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  }

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(devicePixelRatio, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.refl.canvas.width = Math.round(w * dpr);
    this.refl.canvas.height = Math.round(h * dpr);
    this.camera.aspect = w / h;
    this.aim();
    this.dirty = true;
    kick(); // resizing cleared the canvas
  }

  // Seen from the audience: figures left of centre turn a little toward it.
  aim() {
    const az = deg(8 + (3 - this.spot) * 9);
    this.right.set(Math.cos(az), 0, -Math.sin(az));
    const dist = CAMERA.halfHeight / Math.tan(deg(CAMERA.fov) / 2);
    this.camera.position.setFromSpherical(new THREE.Spherical(dist, Math.PI / 2 - CAMERA.el, az)).add(CAMERA.target);
    this.camera.lookAt(CAMERA.target);
    this.camera.updateProjectionMatrix();
  }

  modelFor(pass) {
    let m = this.models.get(pass);
    if (!m) {
      m = createPanda({
        passes: pass, pose: resolvePose(this.pose), variant: this.id, qrPose: this.home,
        base: this.look.base, accent: this.look.accent, eyes: this.look.eyes, edition: __EDITION__,
      });
      m.setBones(pass === 1);
      this.models.set(pass, m);
    }
    return m;
  }

  usePass(pass) {
    if (this.pass === pass) return;
    if (this.model) this.turntable.remove(this.model.root);
    const m = this.model = this.modelFor(pass);
    this.pass = pass;
    if (pass === 1) this.nextChange = Math.min(this.nextChange, performance.now() + 800);
    this.turntable.add(m.root);
    m.showFor(this.pose);
    m.applyPose(this.driver.current());
    this.key.castShadow = m.render.shadows;
    this.catcher.visible = m.render.groundShadow > 0;
    this.applyLight();
  }

  turn() {
    this.turntable.rotation.y = this.spin;
    this.pivot.quaternion.setFromAxisAngle(this.right, this.tilt);
    this.dirty = true;
  }

  applyLight() {
    for (const [l, full] of this.lights) l.intensity = full * this.light;
    this.scene.environmentIntensity = this.model.render.environment * this.light;
    this.dirty = true;
  }

  restyle(patch) {
    Object.assign(this.look, patch);
    for (const m of this.models.values()) m.dispose();
    this.models.clear();
    const pass = this.pass;
    this.model = null;
    this.pass = 0;
    this.usePass(pass);
    thumbs.delete(this.id);
  }

  setPose(name, seconds) {
    this.pose = name;
    this.driver.set(name, reduceMotion ? 0 : seconds);
    for (const m of this.models.values()) m.showFor(name);
    this.dirty = true;
  }

  scheduleChange(now, first = false) {
    this.nextChange = now + (first ? 4000 + Math.random() * 16000 : 9000 + Math.random() * 12000);
  }

  // home pose → a random other one for a few seconds → back home, with jitter.
  // The bare rig shows off: it moves on to the next pose every few seconds.
  autoStep(now) {
    if (this.pass === 1) {
      this.setPose(this.poses[(this.poses.indexOf(this.pose) + 1) % this.poses.length], 1.1);
      this.nextChange = now + 2200 + Math.random() * 900;
    } else if (this.pose === this.home) {
      const others = this.poses.filter((p) => p !== this.home);
      this.setPose(others[Math.floor(Math.random() * others.length)], 1.1);
      this.nextChange = now + 4500 + Math.random() * 4500;
    } else {
      this.setPose(this.home, 1.1);
      this.scheduleChange(now);
    }
  }

  /** One frame; returns whether anything still moves (the loop sleeps once nothing does). */
  tick(dt, t, now) {
    if (lively() && this.auto && now > this.nextChange) this.autoStep(now);
    // ease the lights toward their level; hovering a dimmed figure brings some light back
    const target = this.lightTarget < 1 && this.hover ? (this.lightTarget + 1) / 2 : this.lightTarget;
    if (Math.abs(target - this.light) > 0.002) {
      this.light += (target - this.light) * (reduceMotion ? 1 : 1 - Math.exp(-6 * dt));
      this.applyLight();
    }
    // a figure that leaves the front of the carousel turns back to its angle on the stage
    if (this !== ring.front && !twist) { this.spinTarget = this.homeSpin; this.tiltTarget = 0; }
    if (Math.abs(this.spinTarget - this.spin) > 0.001 || Math.abs(this.tiltTarget - this.tilt) > 0.001) {
      const k = reduceMotion ? 1 : 1 - Math.exp(-10 * dt);
      this.spin += (this.spinTarget - this.spin) * k;
      this.tilt += (this.tiltTarget - this.tilt) * k;
      this.turn();
    }
    const moving = this.driver.active;
    const params = this.driver.sample(dt, t + this.phase, lively());
    if (!moving && !this.dirty) return false;
    this.model.applyPose(params);
    this.render();
    return true;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
    const c = this.refl.canvas;
    this.refl.clearRect(0, 0, c.width, c.height);
    this.refl.drawImage(this.canvas, 0, 0, c.width, c.height);
    this.dirty = false;
  }

  // a still of this figure at a pass, for the pipeline sheet
  snapshot(pass, ctx) {
    const was = this.pass;
    this.usePass(pass);
    this.model.applyPose(this.driver.current());
    this.renderer.render(this.scene, this.camera);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.drawImage(this.canvas, 0, 0, ctx.canvas.width, ctx.canvas.height);
    this.usePass(was);
    this.dirty = true;
    return ctx.canvas.toDataURL('image/webp', 0.9);
  }

  poseLabel() { return POSES[this.pose].label; }
}

// ----- the cast -----
// The gang (src/cast.json) and the next edition: every other figure that is
// not a placeholder, in its signature pose on a white base, filling the spots
// from the centre outwards; the spots left over wait for a panda.
const CENTRE_OUT = [3, 2, 4, 1, 5];
const TEAM = Object.keys(VARIANTS).filter((id) => !CAST.some((c) => c.id === id) && !VARIANTS[id].hologram);
if (TEAM.length > CENTRE_OUT.length) throw new Error(`the next edition has ${TEAM.length} figures (${TEAM.join(', ')}); the stage has ${CENTRE_OUT.length} spots`);
const EDITIONS = {
  gang: CAST.map((c, i) => new Figure(c, i + 1, i)),
  next: TEAM.map((id, i) => new Figure({ id, pose: VARIANTS[id].signature, base: 'white' }, CENTRE_OUT[i], i)).sort((a, b) => a.spot - b.spot),
};
const HEROES = { gang: HERO, next: TEAM[0] }; // centre stage, and the subject when nobody is selected
const ALL = Object.values(EDITIONS).flat();
const byId = Object.fromEntries(ALL.map((f) => [f.id, f]));
const editionOf = (id) => (EDITIONS.gang.includes(byId[id]) ? 'gang' : 'next');
const taken = new Set(EDITIONS.next.map((f) => f.spot));
let figures = EDITIONS[state.edition]; // the edition on stage
const row = $('#row');
for (const f of ALL) row.append(f.el);
const slots = CENTRE_OUT.map((c, i) => {
  const el = document.createElement('div');
  el.className = `slot p${i + 1}`;
  el.style.order = i + 1;
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', `Empty spot ${i + 1} of 5, waiting for a panda`);
  el.innerHTML = '<div class="ph"><div class="glow"></div><div class="sil"></div><div class="ring"></div></div>';
  el.hidden = true;
  row.append(el);
  return el;
});

// The phone carousel: of n figures, figure i stands at i·360°/n + angle on an
// ellipse, the one at 0° in front. Selecting turns the ring the short way
// round; it stays put on deselect.
const step = () => 360 / figures.length;
const ring = { front: undefined, angle: 0, target: 0, vel: 0 }; // vel: degrees per second
// The ring settles on a slightly springy (underdamped) spring: a touch of overshoot, then rest.
const SPRING = { stiffness: 70, damping: 11 };
// puts an edition on stage, its hero in front of the carousel (none for an empty edition)
function showEdition(edition) {
  state.edition = edition;
  figures = EDITIONS[edition];
  ring.front = byId[HEROES[edition]];
  ring.angle = ring.target = ring.front ? -figures.indexOf(ring.front) * step() : 0;
  ring.vel = 0;
}
showEdition(state.edition);
function turnRing(f) {
  ring.front = f;
  const d = (((-figures.indexOf(f) * step() - ring.target) % 360) + 540) % 360 - 180;
  ring.target += d;
}
function placeRing() {
  for (const [i, f] of figures.entries()) {
    const s = f.el.style;
    f.depth = 1; // 1 in front, 0 at the back of the ring
    if (!phone.matches) { s.left = s.bottom = s.zIndex = ''; s.removeProperty('--ring'); continue; }
    const a = deg(i * step() + ring.angle), k = f.depth = (Math.cos(a) + 1) / 2;
    s.left = `${50 + 39 * Math.sin(a)}%`;
    s.bottom = `${(1 - k) * 38}%`;
    s.zIndex = Math.round(k * 10);
    s.setProperty('--ring', (0.47 + 0.53 * k * k).toFixed(4));
  }
  setLights();
}

// Light, not transparency: the others step out of the light when one is
// selected, and on the phone the carousel gets darker toward the back.
function setLights() {
  const sel = state.sel ? byId[state.sel] : null;
  for (const f of figures) {
    const out = sel && sel !== f;
    f.lightTarget = phone.matches ? (0.06 + 0.94 * f.depth ** 4) * (out ? 0.7 : 1) : out ? 0.2 : 1;
  }
}

// Swipe the carousel like a wheel on a ball bearing: it follows the finger
// (0.42° per pixel), a flick carries on a little with the finger's speed,
// 40% of a step tips it over to the next figure, and a flick turns at most
// one figure further than the finger dragged. The figure that lands in front
// becomes the selection if one was selected. A swipe is not a tap.
const SWIPE = { degPerPx: 0.42, carry: 0.12, tip: 0.4 }; // carry: seconds of flick speed added on release
let drag = null;
let dragEnded = 0;
const gangEl = $('.gang');
gangEl.addEventListener('pointerdown', (e) => {
  if (phone.matches && figures.length > 1) {
    drag = { id: e.pointerId, x: e.clientX, angle: ring.angle, from: ring.target, moved: false, v: 0, t: e.timeStamp, last: ring.angle };
  }
});
gangEl.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x;
  if (!drag.moved && Math.abs(dx) < 8) return;
  if (!drag.moved) { drag.moved = true; ring.vel = 0; gangEl.setPointerCapture(e.pointerId); }
  ring.angle = ring.target = drag.angle + dx * SWIPE.degPerPx;
  const dt = Math.max(e.timeStamp - drag.t, 1) / 1000;
  drag.v = 0.7 * ((ring.angle - drag.last) / dt) + 0.3 * drag.v; // smoothed degrees per second
  drag.t = e.timeStamp;
  drag.last = ring.angle;
  placeRing();
});
const endDrag = () => {
  const d = drag;
  drag = null;
  if (!d?.moved) return;
  dragEnded = performance.now();
  const STEP = step();
  const home = Math.round(d.from / STEP) * STEP;
  const dragged = Math.abs(ring.angle - home) / STEP;
  const steps = (ring.angle + d.v * SWIPE.carry - home) / STEP;
  const turn = Math.sign(steps) * Math.min(Math.floor(Math.abs(steps) + 1 - SWIPE.tip), Math.round(dragged) + 1);
  ring.target = (Math.round(d.from / STEP) + turn) * STEP;
  ring.vel = THREE.MathUtils.clamp(d.v, -400, 400); // the flick carries into the spring, a little
  const n = figures.length;
  ring.front = figures[((Math.round(-ring.target / STEP) % n) + n) % n];
  if (state.sel) set({ sel: ring.front.id, menu: false });
  else render();
};
gangEl.addEventListener('pointerup', endDrag);
gangEl.addEventListener('pointercancel', endDrag);

// Two fingers turn the panda in front of the carousel in any direction, by
// where they move together: sideways spins it on its turntable, up and down
// tilts it toward or away from you (at most 60°), 0.6° per pixel. One finger
// keeps swiping the carousel; a second finger takes over from a swipe.
const TWIST_DEG_PER_PX = 0.6;
const TILT_MAX = deg(60);
const fingers = new Map(); // pointerId → [clientX, clientY], for fingers that started on the gang
let twist = null; // { x, y, spin, tilt } while two fingers are down
const fingersAt = () => {
  const all = [...fingers.values()];
  return all.reduce(([x, y], [fx, fy]) => [x + fx / all.length, y + fy / all.length], [0, 0]);
};
gangEl.addEventListener('pointerdown', (e) => {
  fingers.set(e.pointerId, [e.clientX, e.clientY]);
  if (!phone.matches || fingers.size !== 2 || !ring.front) return;
  if (drag) { ring.target = drag.from; drag = null; } // the swipe gives way: the ring springs back
  for (const id of fingers.keys()) gangEl.setPointerCapture(id);
  const [x, y] = fingersAt();
  twist = { x, y, spin: ring.front.spin, tilt: ring.front.tilt };
  dragEnded = performance.now();
});
gangEl.addEventListener('pointermove', (e) => {
  if (!fingers.has(e.pointerId)) return;
  fingers.set(e.pointerId, [e.clientX, e.clientY]);
  if (!twist) return;
  const f = ring.front;
  const [x, y] = fingersAt();
  f.spin = f.spinTarget = twist.spin + deg((x - twist.x) * TWIST_DEG_PER_PX);
  f.tilt = f.tiltTarget = THREE.MathUtils.clamp(twist.tilt + deg((y - twist.y) * TWIST_DEG_PER_PX), -TILT_MAX, TILT_MAX);
  f.turn();
});
const liftFinger = (e) => {
  fingers.delete(e.pointerId);
  if (twist && fingers.size < 2) { twist = null; dragEnded = performance.now(); }
};
gangEl.addEventListener('pointerup', liftFinger);
gangEl.addEventListener('pointercancel', liftFinger);

// pass thumbnails, per figure: id → [dataURL × 5], filled in the background
const thumbs = new Map();
const thumbCtx = Object.assign(document.createElement('canvas'), { width: 192, height: 224 }).getContext('2d');
let thumbJob = 0;
function fillThumbs(f) {
  if (thumbs.has(f.id)) return;
  const list = [];
  thumbs.set(f.id, list);
  const job = ++thumbJob;
  const next = (pass) => {
    if (job !== thumbJob || thumbs.get(f.id) !== list || pass > PASSES.length) return;
    list[pass - 1] = f.snapshot(pass, thumbCtx);
    render();
    setTimeout(() => next(pass + 1), 30);
  };
  setTimeout(() => next(1), 30);
}

// ----- rendering the chrome -----
const icon = {
  play: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
  pause: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>',
  back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  sliders: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  layers: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/><path d="M3 17.5l9 5 9-5" opacity=".55"/></svg>',
  more: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  close: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  check: (ink) => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
};
const sep = '<div class="sep" aria-hidden="true"></div>';
const on = (b) => (b ? 'on' : '');

function dockHtml(sel, isGang, pipelineOn, customizeOn) {
  const cast = figures.length > 0; // an edition with pandas on stage (the next one may have none yet)
  const layers = cast ? `<button type="button" class="ib ${on(pipelineOn)}" data-act="pipeline" data-key="pipeline" aria-label="How it's built" aria-pressed="${pipelineOn}">${icon.layers}</button>` : '';
  const more = `<button type="button" class="ib ${on(state.menu)}" id="more" data-act="menu" data-key="menu" aria-label="More" aria-haspopup="menu" aria-expanded="${state.menu}">${icon.more}</button>`;
  if (sel) {
    return `<button type="button" class="ib" data-act="back" data-key="back" aria-label="Back to the gang">${icon.back}</button>
      <div class="txt dock-name"><b>${sel.variant.label}</b><span class="sub">${sel.poseLabel()} · ${sel.look.eyes} eyes</span></div>
      ${phone.matches ? '' : `<button type="button" class="pill ${on(customizeOn)}" data-act="customize" data-key="customize" aria-pressed="${customizeOn}">${icon.sliders} Customize</button>`}
      ${sep}${layers}${more}`;
  }
  const play = cast
    ? `<button type="button" class="ib" data-act="play" data-key="play" aria-label="${state.playing ? 'Pause the pandas' : 'Play the pandas'}">${state.playing ? icon.pause : icon.play}</button>${sep}`
    : '';
  // phone: the call to action customizes the panda in front of the carousel
  if (cast && phone.matches) {
    return `${play}<button type="button" class="pill primary" data-act="customize-front" data-key="customize-front">${icon.sliders} Customize</button>${sep}${layers}${more}`;
  }
  const [title, sub] = isGang ? ['The Gang', 'Tap a panda'] : ['The ADR Team', 'Next Edition · not printed yet'];
  return `${play}<div class="txt"><b>${title}</b><span>${sub}</span></div>${sep}${layers}${more}`;
}

function pipelineHtml(subject) {
  const list = thumbs.get(subject.id) ?? [];
  const { triangles, parts } = subject.modelFor(PASSES.length).stats();
  return `<div class="pipe-head">
      <div class="who"><span class="lbl">How it's built</span><span>${subject.variant.label} · pass ${state.pass} of ${PASSES.length}</span></div>
      <span class="mono">${triangles.toLocaleString('en-US')} tris · ${parts} parts</span>
    </div>
    <p class="intro" tabindex="0">${INTRO}</p>
    <div class="thumbs">${PASSES.map((p, i) => `
      <button type="button" class="thumb ${on(state.pass === i + 1)}" data-act="pass" data-pass="${i + 1}" data-key="pass-${i + 1}" aria-label="Pass ${i + 1}, ${p.label}" aria-pressed="${state.pass === i + 1}">
        <div class="fr">${list[i] ? `<img src="${list[i]}" alt="">` : ''}</div>
        <span class="tl"><span class="tn">0${i + 1}</span><span>${p.label}</span></span>
      </button>`).join('')}
    </div>
    <div class="tech-stack">${TECH.map((tech, i) => `
      <div class="tech${i === state.pass - 1 ? '' : ' off'}">
        <div class="tech-head"><span class="mono path">${esc(tech.file)}</span><span class="tech-line">${esc(tech.line)}</span></div>
        <div class="chips">${tech.chips.map((c) => `<span class="mono spec">${esc(c)}</span>`).join('')}</div>
      </div>`).join('')}
    </div>`;
}

function customizeHtml(f) {
  const swatches = (list, current, act) => list.map((s) => {
    const ink = SWATCH_INK(s.colour);
    return `<button type="button" class="sw ${on(current === s.id)}" data-act="${act}" data-value="${s.id}" data-key="${act}-${s.id}" aria-label="${s.label}" aria-pressed="${current === s.id}" style="background: ${hex(s.colour)}">${current === s.id ? icon.check(ink) : ''}</button>`;
  }).join('');
  return `<div class="cz-head">
      <div><span class="lbl">Customize</span><span class="serif">${f.variant.label}</span></div>
      ${phone.matches
    ? `<button type="button" class="ib" data-act="back" data-key="close-sheet" aria-label="Back to the gang">${icon.close}</button>`
    : `<button type="button" class="ib" data-act="close-sheet" data-key="close-sheet" aria-label="Close customize">${icon.close}</button>`}
    </div>
    <div class="field"><span class="lbl">Pose</span><div class="options">${f.poses.map((p) => `
      <button type="button" class="chip ${on(f.pose === p)}" data-act="pose" data-value="${p}" data-key="pose-${p}" aria-pressed="${f.pose === p}">${POSES[p].label}</button>`).join('')}
    </div></div>
    <div class="cz-colours">
      ${f.look.accent ? `<div class="field"><span class="lbl">Accent · ${cap(f.look.accent)}</span><div class="options">${swatches(ACCENT_SWATCHES, f.look.accent, 'accent')}</div></div>` : ''}
      <div class="field"><span class="lbl">Base · ${cap(f.look.base)}</span><div class="options">${swatches(BASE_SWATCHES, f.look.base, 'base')}</div></div>
    </div>
    <div class="field"><span class="lbl">Eyes</span><div class="seg">${['open', 'closed'].map((e) => `
      <button type="button" class="chip ${on(f.look.eyes === e)}" data-act="eyes" data-value="${e}" data-key="eyes-${e}" aria-pressed="${f.look.eyes === e}">${cap(e)}</button>`).join('')}
    </div></div>`;
}

// The Bambu Studio projects are files of a GitHub release (npm run release).
// Bambu Studio registers bambustudioopen:// on macOS and bambustudio://open?file= elsewhere.
const RELEASE = 'https://github.com/xoob/three-panda/releases/download/edition-1/';
function bambuLink(file) {
  const url = encodeURIComponent(RELEASE + file);
  return /Mac OS X/.test(navigator.userAgent) && !/iPhone|iPad/.test(navigator.userAgent)
    ? `bambustudioopen://${url}` : `bambustudio://open?file=${url}`;
}

function render() {
  const focusKey = document.activeElement?.dataset?.key;
  const isGang = state.edition === 'gang';
  const sel = state.sel ? byId[state.sel] : null;
  const subject = sel ?? ring.front;
  const pipelineOn = !!subject && state.sheet === 'pipeline';
  // phone: tapping a panda is already the second step, so its Customize sheet opens with it
  const customizeOn = !!sel && (state.sheet === 'customize' || (phone.matches && state.sheet !== 'pipeline'));

  // is-team: the next edition without a panda yet, a lower row of empty spots
  $('#stage').className = ['stage', sel && 'has-sel', pipelineOn && 'pipe-open', customizeOn && 'cz-open', !isGang && !figures.length && 'is-team'].filter(Boolean).join(' ');
  for (const b of document.querySelectorAll('[data-act="edition"]')) {
    const active = b.dataset.edition === state.edition;
    b.classList.toggle('on', active);
    b.setAttribute('aria-pressed', active);
  }
  $('#invite').hidden = isGang || !!sel; // a selected panda takes the stage

  // the row dollies the selected figure to centre stage (desktop)
  const total = WIDTHS.reduce((s, w) => s + w - 2 * OVERLAP, 0);
  let x = (100 - total) / 2;
  const centre = WIDTHS.map((w) => { const c = x - OVERLAP + w / 2 - 50; x += w - 2 * OVERLAP; return c; });
  const shift = sel ? -centre[sel.spot - 1] - (customizeOn ? 12 : 0) : 0;
  row.style.transform = `translateX(${shift.toFixed(2)}%)`;

  // phone: a carousel, the selected figure turns to the front
  if (sel) turnRing(sel);
  const heroId = ring.front?.id;
  for (const f of ALL) f.el.hidden = !figures.includes(f);
  for (const f of figures) {
    const isSel = sel === f;
    const m = f.id === heroId ? 'm-hero' : 'm-back';
    f.el.className = ['fig', `p${f.spot}`, m, isSel && 'is-sel', sel && !isSel && 'is-dim'].filter(Boolean).join(' ');
    f.el.setAttribute('aria-pressed', isSel);
    f.el.setAttribute('aria-label', `${f.variant.label}, ${f.poseLabel()}`);
    f.el.querySelector('.ps').textContent = f.poseLabel();
    f.usePass(pipelineOn && (!sel || isSel) ? state.pass : PASSES.length);
  }
  setLights();
  const SLOT_M = ['m-back m-b1', 'm-back m-b2', 'm-hero', 'm-back m-b3', 'm-back m-b4'];
  // empty spots: the next edition's free ones; on the phone only while the carousel is empty
  slots.forEach((el, i) => {
    el.hidden = isGang || taken.has(i + 1) || (phone.matches && figures.length > 0);
    el.className = `slot p${i + 1} ${SLOT_M[i]}`;
  });

  $('#dock').innerHTML = dockHtml(sel, isGang, pipelineOn, customizeOn);

  const pipe = $('#pipeline');
  pipe.hidden = !pipelineOn;
  if (pipelineOn) {
    fillThumbs(subject);
    const scrolled = pipe.querySelector('.intro')?.scrollTop ?? 0;
    pipe.innerHTML = pipelineHtml(subject);
    // phone: the intro scrolls inside three lines; the fade goes once the end is in view
    const intro = pipe.querySelector('.intro');
    const atEnd = () => intro.classList.toggle('end', intro.scrollTop + intro.clientHeight >= intro.scrollHeight - 2);
    intro.scrollTop = scrolled;
    intro.addEventListener('scroll', atEnd, { passive: true });
    atEnd();
  }
  const cz = $('#customize');
  cz.hidden = !customizeOn;
  if (customizeOn) cz.innerHTML = customizeHtml(sel);

  $('#menu').hidden = !state.menu;
  $('#bambu').hidden = !isGang; // the next edition is not printed yet
  const file = `${sel ? sel.variant.label : 'Gang'}.3mf`;
  $('#bambu').href = bambuLink(file);
  $('#bambu-file').textContent = file;
  $('#claude').href = CLAUDE;

  history.replaceState(null, '', sel ? `/#${sel.id}/${sel.pose}` : isGang ? '/' : '/#next');
  if (focusKey) document.querySelector(`[data-key="${focusKey}"]`)?.focus({ preventScroll: true });
}

// ----- interaction -----
function set(patch) { Object.assign(state, patch); render(); }

const ACTIONS = {
  pick: (el) => set({ sel: state.sel === el.dataset.id ? null : el.dataset.id, sheet: state.sheet === 'customize' ? null : state.sheet, menu: false }),
  back: () => set({ sel: null, sheet: state.sheet === 'customize' ? null : state.sheet }),
  edition: (el) => { showEdition(el.dataset.edition); set({ sel: null, sheet: null, menu: false }); placeRing(); },
  play: () => {
    state.playing = !state.playing;
    for (const f of figures) f.scheduleChange(performance.now(), true);
    render();
  },
  pipeline: () => set({ sheet: state.sheet === 'pipeline' ? null : 'pipeline', menu: false }),
  customize: () => set({ sheet: state.sheet === 'customize' ? null : 'customize', menu: false }),
  'customize-front': () => set({ sel: ring.front.id, sheet: null, menu: false }),
  'close-sheet': () => set({ sheet: null }),
  pass: (el) => set({ pass: +el.dataset.pass }),
  menu: () => set({ menu: !state.menu }),
  'close-menu': () => set({ menu: false }),
  pose: (el) => { const f = byId[state.sel]; f.auto = false; f.setPose(el.dataset.value, 0.8); render(); },
  accent: (el) => { byId[state.sel].restyle({ accent: el.dataset.value }); render(); },
  base: (el) => { byId[state.sel].restyle({ base: el.dataset.value }); render(); },
  eyes: (el) => { byId[state.sel].restyle({ eyes: el.dataset.value }); render(); },
};

document.addEventListener('click', (e) => {
  if (performance.now() - dragEnded < 400) return; // the click that ends a swipe
  const el = e.target.closest('[data-act]');
  if (state.menu && !e.target.closest('#menu, #more')) { set({ menu: false }); if (!el) return; }
  if (el) ACTIONS[el.dataset.act](el);
  // a click on the empty stage steps the selected figure back into the gang
  else if (state.sel && !e.target.closest('.glass, .brand, .invite')) ACTIONS.back();
});
// iOS Safari ignores user-scalable=no: block its pinch-zoom gesture instead
for (const type of ['gesturestart', 'gesturechange']) document.addEventListener(type, (e) => e.preventDefault());

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (state.menu) set({ menu: false });
  else if (state.sheet) set({ sheet: null });
  else if (state.sel) set({ sel: null });
});

// deep link: #guardian/guard (the QR codes under the bases), #next, or a
// path such as /PHOTOGRAPHER (the first test prints)
{
  const [id, pose] = (location.hash.slice(1) || location.pathname.slice(1)).toLowerCase().split('/');
  // branch previews (<branch>-three-panda.xoob.workers.dev) are where new pandas show up first
  const preview = location.hostname.endsWith('.workers.dev');
  if (id === 'next' || (!id && preview)) showEdition('next');
  if (byId[id]) {
    showEdition(editionOf(id));
    // desktop highlights the scanned panda; the phone only turns it to the front (no Customize sheet)
    if (phone.matches) turnRing(byId[id]);
    else state.sel = id;
    if (byId[id].poses.includes(pose)) { byId[id].auto = false; byId[id].setPose(pose, 0); }
  }
}
render();
ring.angle = ring.target; // a deep link opens with its figure already in front
placeRing();
phone.addEventListener('change', () => { render(); placeRing(); });

// Battery: phones render the figures at 30 fps (the carousel itself keeps
// the display's rate). After 30 s without input the gang comes to rest:
// motion fades out, no more pose changes, and once nothing moves the loop
// stops until the next touch, click, key or scroll.
const REST_AFTER = 30000;
const PHONE_FRAME = 1000 / 30;
let lastInput = performance.now();
let resting = false;
let looping = false;
let last = performance.now();
let lastFigures = last;

function lively() { return state.playing && !resting; }

// runs the loop again if it was asleep (something needs drawing, e.g. after a resize)
function kick() {
  if (looping) return;
  looping = true;
  last = lastFigures = performance.now();
  requestAnimationFrame(frame);
}
function wake() {
  lastInput = performance.now();
  if (resting) {
    resting = false;
    for (const f of figures) f.scheduleChange(lastInput, true);
  }
  kick();
}
for (const type of ['pointerdown', 'pointermove', 'keydown', 'wheel']) addEventListener(type, wake, { capture: true, passive: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  let busy = false;
  if (phone.matches && !drag?.moved && (Math.abs(ring.target - ring.angle) > 0.05 || Math.abs(ring.vel) > 0.5)) {
    if (reduceMotion) { ring.angle = ring.target; ring.vel = 0; }
    for (let left = dt; left > 0; left -= 1 / 240) { // small steps keep the spring stable on slow frames
      const h = Math.min(left, 1 / 240);
      ring.vel += (SPRING.stiffness * (ring.target - ring.angle) - SPRING.damping * ring.vel) * h;
      ring.angle += ring.vel * h;
    }
    placeRing();
    busy = true;
  }
  if (figures.length && now - lastFigures >= (phone.matches ? PHONE_FRAME - 2 : 0)) {
    const fdt = Math.min(0.1, (now - lastFigures) / 1000);
    lastFigures = now;
    for (const f of figures) busy = f.tick(fdt, now / 1000, now) || busy;
  } else if (figures.length) busy = true; // skipped this frame for the 30 fps cap
  if (!resting && now - lastInput > REST_AFTER) resting = true;
  looping = busy || !resting || !!drag;
  if (looping) requestAnimationFrame(frame);
}
wake();

// hook for scripted screenshots
window.friends = { state, get figures() { return figures; }, set, sleeping: () => !looping };
