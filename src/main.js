import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createPanda, PASSES, POSES, VARIANTS, PoseDriver } from './panda.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const stage = $('#stage');
const canvas = $('#gl');
const hud = $('.hud');
const dock = $('.dock');
const viewLabel = $('#view-label');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const deg = THREE.MathUtils.degToRad;

// ----- renderer, lights, ground -----
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  room.dispose?.();
  pmrem.dispose();
}
scene.add(new THREE.HemisphereLight(0xffffff, 0xd6dae6, 0.7));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(2.5, 5, 3.5);
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 15 });
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
key.shadow.radius = 3;
scene.add(key);
const fill = new THREE.DirectionalLight(0xdfe6ff, 0.6);
fill.position.set(-4, 2.5, 2);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffffff, 0.9);
rim.position.set(-1, 3, -4);
scene.add(rim);
const ground = new THREE.Mesh(new THREE.CircleGeometry(3, 48), new THREE.ShadowMaterial({ opacity: 0.16 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ----- state -----
const state = {
  pass: PASSES.length,
  variant: 'analyst',
  pose: VARIANTS.analyst.signature, // each character starts in its signature pose
  spin: false,
  motion: false,
  wire: false,
  bones: false,
};
const driver = new PoseDriver(state.pose);
let panda = null;
let needsRender = true;

function rebuild() {
  panda?.dispose();
  panda = createPanda({ passes: state.pass, pose: driver.current(), variant: state.variant, edition: __EDITION__ });
  scene.add(panda.root);
  panda.showFor(state.pose);
  const r = panda.render;
  key.castShadow = r.shadows;
  scene.environmentIntensity = r.environment;
  panda.setWireframe(state.wire);
  panda.setBones(state.bones || state.pass === 1);
  const { triangles, parts, joints } = panda.stats();
  $('#stats').textContent = parts
    ? `${triangles.toLocaleString('en-US')} tris · ${parts} parts`
    : `${joints} joints`;
  const pass = PASSES[state.pass - 1];
  $('#pass-summary').textContent = `Pass ${state.pass} of ${PASSES.length}: ${pass.summary}`;
  $$('[data-pass]').forEach((b) => {
    const n = +b.dataset.pass;
    b.setAttribute('aria-pressed', String(n === state.pass));
    b.classList.toggle('done', n < state.pass);
  });
  needsRender = true;
}

// ----- camera + framing -----
const TARGET = new THREE.Vector3(0, 1.25, 0); // panda on its base
const HALF_H = 1.3, HALF_W = 1.2, DEPTH = 0.6; // character extents for framing
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
const controls = new OrbitControls(camera, canvas);
controls.target.copy(TARGET);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.autoRotateSpeed = 1.4;
controls.minPolarAngle = 0.01;
controls.maxPolarAngle = Math.PI - 0.01;
controls.addEventListener('change', () => { needsRender = true; });

const VIEWS = {
  angle: { short: 'Angle', label: 'Angled View', az: deg(16), el: deg(6) }, // front, turned slightly
  front: { short: 'Front', label: 'Front View', az: 0, el: deg(4) },
  side: { short: 'Side', label: 'Side View', az: deg(-90), el: deg(4) },
  top: { short: 'Top', label: 'Top View', az: 0, el: deg(89.4) },
  bottom: { short: 'Bottom', label: 'Bottom View', az: 0, el: deg(-89.4) },
};

// Fit the character into the area between the HUD and the dock, not the whole canvas.
let freeFraction = 1;
function layout() {
  const W = stage.clientWidth, H = stage.clientHeight;
  if (!W || !H) return;
  renderer.setSize(W, H, false);
  const s = stage.getBoundingClientRect();
  const top = Math.min(hud.getBoundingClientRect().bottom - s.top, H * 0.25);
  const bottom = Math.max(dock.getBoundingClientRect().top - s.top, H * 0.55);
  freeFraction = (bottom - top) / H;
  camera.aspect = W / H;
  camera.setViewOffset(W, H, 0, H / 2 - (top + bottom) / 2, W, H);
  camera.updateProjectionMatrix();
  controls.minDistance = fitDistance() * 0.45;
  controls.maxDistance = fitDistance() * 2.2;
  needsRender = true;
}
function fitDistance() {
  const t = Math.tan(deg(camera.fov) / 2);
  return Math.max(HALF_H / (t * freeFraction), HALF_W / (t * camera.aspect)) * 1.04 + DEPTH;
}

let tween = null;
let currentView = 'angle';
const sphericalFor = (view, dist) => new THREE.Spherical(dist, Math.PI / 2 - view.el, view.az);
function placeCamera(sph) {
  camera.position.setFromSpherical(sph).add(controls.target);
  camera.lookAt(controls.target);
  needsRender = true;
}
function markView(name) {
  currentView = name;
  viewLabel.textContent = name ? VIEWS[name].label : state.spin ? 'Turntable' : 'Free Orbit';
  $$('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === name)));
}
function setView(name, animate = !reduceMotion) {
  const view = VIEWS[name];
  if (!view) return;
  markView(name);
  const goal = sphericalFor(view, fitDistance());
  if (!animate) { tween = null; placeCamera(goal); controls.update(); return; }
  const start = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  const dTheta = Math.atan2(Math.sin(goal.theta - start.theta), Math.cos(goal.theta - start.theta)); // shortest way round
  tween = { start, goal, dTheta, t0: performance.now(), dur: 850 };
}
function stepTween(now) {
  if (!tween) return;
  const k = Math.min(1, (now - tween.t0) / tween.dur);
  const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
  const { start, goal, dTheta } = tween;
  placeCamera(new THREE.Spherical(
    start.radius + (goal.radius - start.radius) * e,
    start.phi + (goal.phi - start.phi) * e,
    start.theta + dTheta * e,
  ));
  if (k >= 1) tween = null;
}
controls.addEventListener('start', () => { tween = null; if (currentView) markView(null); });

// arrow keys orbit, for keyboard users
canvas.tabIndex = 0;
canvas.addEventListener('keydown', (e) => {
  const step = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, 8], ArrowDown: [0, -8] }[e.key];
  if (!step) return;
  e.preventDefault();
  tween = null;
  const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  sph.theta += deg(step[0]);
  sph.phi = THREE.MathUtils.clamp(sph.phi - deg(step[1]), 0.01, Math.PI - 0.01);
  placeCamera(sph);
  if (currentView) markView(null);
});

// ----- controls -----
// Buttons are generated from PASSES, POSES and VIEWS, so a new pose or pass
// only needs an entry in its table.
function addButton(container, id, data, html) {
  const b = document.createElement('button');
  b.type = 'button';
  b.id = id;
  Object.assign(b.dataset, data);
  b.setAttribute('aria-pressed', 'false');
  b.innerHTML = html;
  $(container).append(b);
}
PASSES.forEach((p, i) => addButton('#passes', `pass-${p.id}`, { pass: i + 1 }, `<small>${i + 1}</small>${p.label}`));
Object.entries(VARIANTS).forEach(([id, v]) => addButton('#variants', `variant-${id}`, { variant: id }, v.label));
// pose buttons: the character's signature and standing pose first, then the shared ones
const SHARED_POSES = ['rest', 'hooray'];
function renderPoseButtons() {
  $('#poses').replaceChildren();
  const own = [...new Set([VARIANTS[state.variant].signature, VARIANTS[state.variant].pose])];
  const names = [...own, ...SHARED_POSES.filter((n) => !own.includes(n))];
  names.forEach((name) => addButton('#poses', `pose-${name}`, { pose: name }, POSES[name].label ?? name));
  $$('[data-pose]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.pose === state.pose));
    b.addEventListener('click', () => setPose(b.dataset.pose));
  });
}
Object.entries(VIEWS).forEach(([name, v]) => addButton('#views', `view-${name}`, { view: name }, v.short));

function syncToggles() {
  $$('[data-toggle]').forEach((b) => b.setAttribute('aria-pressed', String(state[b.dataset.toggle])));
  controls.autoRotate = state.spin;
  panda.setWireframe(state.wire);
  panda.setBones(state.bones || state.pass === 1);
  if (state.spin) markView(null);
  needsRender = true;
}
$$('[data-toggle]').forEach((b) => b.addEventListener('click', () => {
  state[b.dataset.toggle] = !state[b.dataset.toggle];
  syncToggles();
}));
$$('[data-view]').forEach((b) => b.addEventListener('click', () => {
  if (state.spin) { state.spin = false; syncToggles(); }
  setView(b.dataset.view);
}));
$$('[data-pass]').forEach((b) => b.addEventListener('click', () => {
  state.pass = +b.dataset.pass;
  rebuild();
}));
function setPose(name, seconds = reduceMotion ? 0 : 0.7) {
  state.pose = name;
  driver.set(name, seconds);
  panda?.showFor(name);
  $$('[data-pose]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pose === name)));
}
function setVariant(id) {
  if (!VARIANTS[id]) return;
  state.variant = id;
  $$('[data-variant]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.variant === id)));
  setPose(VARIANTS[id].signature);
  renderPoseButtons();
  rebuild();
}
$$('[data-variant]').forEach((b) => b.addEventListener('click', () => setVariant(b.dataset.variant)));

// ----- start -----
new ResizeObserver(layout).observe(stage);
new ResizeObserver(layout).observe(dock);
rebuild();
layout();

// deep link: #front, #tubes, #hooray, #analyst/wave … (any of character, pose,
// pass and view, joined by "/"), or a path such as /PHOTOGRAPHER
const tokens = (location.hash.slice(1) || location.pathname.slice(1)).toLowerCase().split('/');
const pick = (has) => tokens.find(has);
const passIndex = PASSES.findIndex((p) => p.id === pick((t) => PASSES.some((q) => q.id === t)));
if (passIndex >= 0) { state.pass = passIndex + 1; rebuild(); }
const variant = pick((t) => VARIANTS[t]);
if (variant) { state.variant = variant; state.pose = VARIANTS[variant].signature; driver.set(state.pose, 0); rebuild(); }
const pose = pick((t) => POSES[t]);
if (pose) setPose(pose, 0);
const view = pick((t) => VIEWS[t]);
setView(view ?? 'angle', false);
syncToggles();
$$('[data-variant]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.variant === state.variant)));
renderPoseButtons();
setPose(state.pose, 0);

let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (driver.active) {
    panda.applyPose(driver.sample(dt, now / 1000, state.motion));
    needsRender = true;
  } else {
    driver.sample(dt, now / 1000, state.motion); // lets motion fade back in when switched on
  }
  stepTween(now);
  if (!tween && controls.update()) needsRender = true;
  if (!needsRender) return; // nothing moved: skip the frame
  // the floor shadow fades out as the camera rises toward the top view
  const el = Math.PI / 2 - new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target)).phi;
  ground.visible = panda.render.groundShadow > 0;
  ground.material.opacity = panda.render.groundShadow * THREE.MathUtils.clamp((deg(75) - el) / deg(20), 0, 1);
  renderer.render(scene, camera);
  needsRender = false;
});

// hook for scripted screenshots
window.pandaViewer = {
  setView: (n) => setView(n, false),
  setPass: (n) => { state.pass = n; rebuild(); },
  setVariant: (id) => { setVariant(id); driver.k = 1; panda.applyPose(driver.sample(0, 0, false)); needsRender = true; },
  setPose: (n) => { setPose(n, 0); panda.applyPose(driver.sample(0, 0, state.motion)); needsRender = true; },
  still: () => { state.motion = false; driver.motionWeight = 0; syncToggles(); panda.applyPose(driver.sample(0, 0, false)); },
  set: (k, v) => { state[k] = v; syncToggles(); },
  model: () => panda,
  // try recipe values on the current figure without editing its file (tools/palette.mjs)
  override: (fields) => { Object.assign(VARIANTS[state.variant], fields); rebuild(); },
  // close-up: orbit around a joint at a fraction of the fitted distance (tools/shots.mjs `focus=` flag)
  focus: (joint, k = 0.3) => {
    const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    controls.target.copy(panda.joints[joint].getWorldPosition(new THREE.Vector3()));
    sph.radius = fitDistance() * k;
    placeCamera(sph);
  },
};
