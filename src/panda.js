// panda.js — runs the build passes (passes.js) and holds the resulting model.
//
//   const panda = createPanda();                  // all passes
//   const blockout = createPanda({ passes: 2 });  // stop after Blockout
//   const detective = createPanda({ variant: 'detective' }); // figures/detective.json
//   scene.add(panda.root);
//   panda.applyPose(resolvePose('hooray'));       // or PoseDriver.sample() every frame
//   panda.dispose();
//
// Passes talk to the model only through the methods below: add / remove /
// get parts, anchor frames, overlay gizmos, textures and restyle.

import * as THREE from 'three';
import { applyPose, resolvePose, DEFAULT_POSE } from './rig.js';
import { ACCENTS, ACCESSORY_ROLES, PASSES, ROLES, visibleIn } from './passes.js';
import { loadRecipes } from './recipes.js';
import { canvasTexture } from './shapes.js';
import FIGURES from '../dist/figures.json' with { type: 'json' };

/** The figures (recipes.js), by id, in viewer order. */
export const VARIANTS = loadRecipes(FIGURES);

export { ACCENTS, BASE_COLOURS, PASSES } from './passes.js';
export { POSES, PoseDriver, resolvePose } from './rig.js';

// `qrPose` names the printed pose whose QR code (the recipe's `codes`) goes
// under the base; the viewer shows the signature pose's.
// `base` is the base's colour: black, white or blue (BASE_COLOURS).
// `edition` is the edition number in the QR link (the EDITION file, injected by build.sh).
// `accent` puts every accessory in one colour (ACCENTS: blue, green, yellow,
// red, grey), in the viewer and in print; by default the recipe's `accent`,
// and none (each part its own colour) for a recipe without one.
// `eyes` overrides the character's eye style in every pose (the stage's open / closed).
export function createPanda({
  passes = PASSES.length, pose = resolvePose(DEFAULT_POSE), variant = 'analyst', print = false,
  qrPose = VARIANTS[variant].signature, base = 'white', edition, accent = VARIANTS[variant].accent, eyes,
} = {}) {
  if (!Number.isInteger(edition)) throw new Error(`createPanda needs the edition, got ${edition}`);
  if (accent !== undefined && !ACCENTS[accent]) throw new Error(`Unknown accent "${accent}"`);
  const model = new PandaModel();
  model.style.print = print; // print mode: thicker details, flat inlays instead of painted decals (see print.js)
  model.accent = accent;
  const v = VARIANTS[variant];
  model.variant = { id: variant, ...v };
  if (eyes) model.variant = { ...model.variant, eyes, faces: Object.fromEntries(Object.entries(v.faces ?? {}).map(([p, { eyes: _, ...face }]) => [p, face])) };
  model.style.hologram = !!model.variant.hologram; // placeholder figures: drawn as a hologram (viewer only)
  model.qrPose = qrPose;
  model.base = base;
  model.edition = edition;
  for (const pass of PASSES.slice(0, passes)) {
    pass.apply(model);
    model.passes.push(pass.id);
    if (pass.id === 'rig') model.applyPose(pose); // later passes read posed joints
  }
  return model;
}

class PandaModel {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'panda';
    this.joints = null; // set by the Rig pass
    this.style = { look: false }; // switched by the Look pass; passed to every make()
    this.render = { shadows: false, environment: 0.3, groundShadow: 0 }; // read by the viewer
    this.passes = [];
    this.parts = []; // build order matters: restyle rebuilds in this order
    this.anchors = {};
    this.overlays = [];
    this.textures = {};
    this.materials = new Map();
    this.wireOn = false;
    this.bonesOn = false;
    this.groups = {}; // prop name → parts, for per-pose visibility
    this.pupils = [];
    this.snout = null; // the figure's snout shape (SNOUTS), set by the Details pass
  }

  /** Run fn and remember every part it adds under `name`. */
  group(name, fn) {
    const before = this.parts.length;
    fn();
    this.groups[name] = this.parts.slice(before);
  }

  /** Show the props, eyes, mouth and eye direction this character uses in `pose`. */
  showFor(pose) {
    const v = this.variant;
    if (!v) return;
    for (const [name, parts] of Object.entries(this.groups)) {
      const on = visibleIn(v, name, pose);
      for (const p of parts) p.mesh.visible = on;
    }
    const [lx, ly] = v.faces?.[pose]?.look ?? [0, 0];
    for (const pupil of this.pupils) {
      // slide in the surface's tangent plane, so the decal stays on the face
      const n = pupil.userData.normal;
      pupil.userData.home ??= pupil.position.clone();
      pupil.position.copy(pupil.userData.home).add(new THREE.Vector3(lx, ly, -(n.x * lx + n.y * ly) / n.z));
    }
  }

  // ----- parts -----

  /**
   * Add a part. `make(style, previousGeometry)` returns its geometry and is
   * called again on restyle, and after every pose change when `dynamic`.
   * `parent` is a joint name, anchor name, part name or Object3D (default: root).
   */
  add({ name, role: asked, parent, position, quaternion, make, dynamic = false, tags = [], shadow = true, print }) {
    if (this.get(name)) throw new Error(`Duplicate part "${name}"`);
    if (!ROLES[asked]) throw new Error(`Unknown role "${asked}" on part "${name}"`);
    const role = this.roleFor(asked);
    const mesh = new THREE.Mesh(make(this.style, null), this.material(role));
    mesh.name = name;
    mesh.castShadow = shadow;
    mesh.receiveShadow = shadow;
    if (position) mesh.position.copy(position);
    if (quaternion) mesh.quaternion.copy(quaternion);
    this.parentOf(parent).add(mesh);
    const part = { name, role, make, dynamic, tags, mesh, wire: null, print };
    this.parts.push(part);
    if (this.wireOn) this.attachWire(part);
    return part;
  }

  get(name) { return this.parts.find((p) => p.name === name); }

  /** The role a part takes: with an accent, accessory roles take the accent's colour (ACCENTS). */
  roleFor(role) {
    return this.accent && ACCESSORY_ROLES.has(role) ? ACCENTS[this.accent] : role;
  }

  /** Give an existing part a different material role (e.g. the Details pass adds fur markings). */
  setRole(name, asked) {
    const p = this.get(name);
    if (!p || !ROLES[asked]) throw new Error(`Cannot set role "${asked}" on "${name}"`);
    const role = this.roleFor(asked);
    p.role = role;
    p.mesh.material = this.material(role);
    if (p.wire) p.wire.material = this.wireMaterial(role);
  }

  remove(predicate) {
    const gone = this.parts.filter(predicate);
    for (const p of gone) {
      p.mesh.removeFromParent();
      p.mesh.geometry.dispose();
    }
    this.parts = this.parts.filter((p) => !gone.includes(p));
  }

  /** Empty transform frame that parts can hang from (e.g. the muzzle, the tablet grip). */
  anchor(name, parent, position, quaternion) {
    const o = new THREE.Object3D();
    o.name = name;
    if (position) o.position.copy(position);
    if (quaternion) o.quaternion.copy(quaternion);
    this.parentOf(parent).add(o);
    this.anchors[name] = o;
    return o;
  }

  /** Debug-only object (rig gizmos), drawn on top and shown with setBones(). */
  overlay(object, parent) {
    object.renderOrder = 999;
    object.visible = this.bonesOn;
    this.parentOf(parent).add(object);
    this.overlays.push(object);
  }

  /** Register a canvas texture in clay and colour versions: draw(ctx, size, isLook). */
  texture(name, draw, size = 256) {
    if (this.textures[name]) return; // both eyes register the same texture; the first one stays
    this.textures[name] = {
      clay: canvasTexture(size, (ctx, n) => draw(ctx, n, false)),
      look: canvasTexture(size, (ctx, n) => draw(ctx, n, true)),
    };
  }

  /** Joint position in the model's own (root) space. */
  jointPosition(name) {
    return this.root.worldToLocal(this.joints[name].getWorldPosition(new THREE.Vector3()));
  }

  parentOf(ref) {
    if (!ref) return this.root;
    if (ref.isObject3D) return ref;
    const found = this.joints?.[ref] ?? this.anchors[ref] ?? this.get(ref)?.mesh;
    if (!found) throw new Error(`Unknown parent "${ref}"`);
    return found;
  }

  // ----- style -----

  /** Rebuild every part (in build order) with the current style. */
  restyle({ geometry = true } = {}) {
    for (const p of this.parts) {
      if (geometry) this.swapGeometry(p, p.make(this.style, null));
      p.mesh.material = this.material(p.role);
      if (p.wire) p.wire.material = this.wireMaterial(p.role);
    }
    const used = new Set(this.parts.flatMap((p) => [p.mesh.material, p.wire?.material]));
    for (const [key, mat] of this.materials) if (!used.has(mat)) { mat.dispose(); this.materials.delete(key); }
  }

  swapGeometry(part, geometry) {
    if (geometry === part.mesh.geometry) return;
    part.mesh.geometry.dispose();
    part.mesh.geometry = geometry;
    if (part.wire) part.wire.geometry = geometry;
  }

  material(role) {
    const r = ROLES[role];
    const { look } = this.style;
    const holo = look && this.style.hologram;
    const key = `${role}|${look}|${holo}`;
    if (this.materials.has(key)) return this.materials.get(key);
    if (holo) {
      const tex = r.decal && this.textures[r.decal];
      const mat = hologramMaterial(r, tex?.look);
      this.materials.set(key, mat);
      return mat;
    }
    if (r.markings) {
      const mat = markedMaterial(r, look);
      this.materials.set(key, mat);
      return mat;
    }
    const tex = r.decal && this.textures[r.decal];
    const mat = r.decal
      ? new THREE.MeshStandardMaterial({
        map: tex ? (look ? tex.look : tex.clay) : null, transparent: true, alphaTest: 0.35, roughness: r.roughness,
        depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      })
      : new THREE.MeshStandardMaterial({
        color: look ? r.look : r.clay, roughness: look ? r.roughness : 0.85, metalness: r.metalness ?? 0,
        transparent: !!r.opacity, opacity: r.opacity ?? 1, depthWrite: !r.opacity,
        // pushed back a hair so the wireframe overlay draws cleanly on top
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
      });
    this.materials.set(key, mat);
    return mat;
  }

  wireMaterial(role) {
    const c = ROLES[role].wire;
    if (!c) return null;
    const key = `wire|${role}|${this.style.look}`;
    if (!this.materials.has(key)) {
      this.materials.set(key, new THREE.MeshBasicMaterial({
        color: this.style.look ? c : 0x66708a, wireframe: true, transparent: true, opacity: 0.85,
      }));
    }
    return this.materials.get(key);
  }

  // ----- pose -----

  /** Pose the joints, then re-sweep every dynamic part (limb tubes) through them. */
  applyPose(params) {
    if (!this.joints) return;
    applyPose(this.joints, params);
    this.root.updateMatrixWorld(true);
    for (const p of this.parts) if (p.dynamic) this.swapGeometry(p, p.make(this.style, p.mesh.geometry));
  }

  // ----- display helpers -----

  setWireframe(on) {
    this.wireOn = on;
    for (const p of this.parts) {
      if (on && !p.wire) this.attachWire(p);
      if (p.wire) p.wire.visible = on;
    }
  }

  attachWire(part) {
    const mat = this.wireMaterial(part.role);
    if (!mat) return;
    part.wire = new THREE.Mesh(part.mesh.geometry, mat);
    part.wire.raycast = () => {};
    part.mesh.add(part.wire);
  }

  setBones(on) {
    this.bonesOn = on;
    for (const o of this.overlays) o.visible = on;
  }

  stats() {
    const triangles = this.parts.reduce((sum, p) => {
      const g = p.mesh.geometry;
      return sum + (g.index ? g.index.count : g.attributes.position?.count ?? 0) / 3;
    }, 0);
    return { triangles: Math.round(triangles), parts: this.parts.length, joints: Object.keys(this.joints ?? {}).length };
  }

  dispose() {
    this.root.removeFromParent();
    for (const p of this.parts) p.mesh.geometry.dispose();
    for (const m of this.materials.values()) m.dispose();
    for (const t of Object.values(this.textures)) { t.clay.dispose(); t.look.dispose(); }
    const seen = new Set();
    for (const o of this.overlays) {
      for (const r of [o.geometry, o.material]) if (r && !seen.has(r)) { seen.add(r); r.dispose(); }
    }
    this.parts = [];
    this.overlays = [];
    this.materials.clear();
  }
}

// Hologram: the figure (base included) as a ghostly blueprint: near-white,
// parts printed in black a pale blue-grey, softly shaded, with a thin blue
// outline at the silhouettes and faint horizontal lines
// in world space. Decals use their texture's alpha, so eye patches keep their shape.
const HOLOGRAM = { white: 0xf6f9fc, black: 0xd3e0ed, line: 0x3a78d0, lines: 36 };

function hologramMaterial(r, map) {
  const colour = (r.print?.[0] ?? 'white') === 'white' ? HOLOGRAM.white : HOLOGRAM.black;
  return new THREE.ShaderMaterial({
    uniforms: {
      uColour: { value: new THREE.Color(colour) },
      uLine: { value: new THREE.Color(HOLOGRAM.line) },
      uMap: { value: map ?? null },
      uLines: { value: HOLOGRAM.lines },
    },
    defines: map ? { USE_DECAL: '' } : {},
    vertexShader: `
      varying vec3 vNormal; varying vec3 vView; varying float vY; varying vec2 vUv;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vNormal = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - world.xyz);
        vY = world.y;
        vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      uniform vec3 uColour; uniform vec3 uLine; uniform float uLines;
      #ifdef USE_DECAL
      uniform sampler2D uMap;
      #endif
      varying vec3 vNormal; varying vec3 vView; varying float vY; varying vec2 vUv;
      void main() {
        #ifdef USE_DECAL
        if (texture2D(uMap, vUv).a < 0.35) discard;
        #endif
        vec3 n = normalize(vNormal);
        float shade = 0.86 + 0.14 * max(dot(n, normalize(vec3(0.3, 0.8, 0.5))), 0.0);
        // the outline: where the surface turns away from the eye, and turns fast
        // (so a flat face seen edge-on, like the top of the base, stays clear)
        float ndv = abs(dot(n, normalize(vView)));
        float edge = smoothstep(0.72, 0.9, 1.0 - ndv) * clamp(fwidth(ndv) * 12.0, 0.0, 1.0);
        float line = smoothstep(0.88, 1.0, abs(fract(vY * uLines) - 0.5) * 2.0); // thin lines
        vec3 c = mix(uColour * shade, uLine, 0.18 * line);
        gl_FragColor = vec4(mix(c, uLine, edge), 1.0);
        #include <colorspace_fragment>
      }`,
    // decals lie on the head: pulled forward so they win the depth test
    polygonOffset: !!map, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
}

// Fur with black markings, evaluated per pixel in the body's own space.
// The field mirrors MARKINGS in passes.js: undo the pear taper, then black
// where above the shoulder line or below the hip line, minus a white bib.
function markedMaterial(r, look) {
  const [white, black] = look ? r.look : r.clay;
  const [roughWhite, roughBlack] = look ? r.roughness : [0.85, 0.85];
  const k = r.markings;
  const mat = new THREE.MeshStandardMaterial({
    color: white, roughness: roughWhite, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
  const uniforms = {
    uRadii: { value: k.radii.clone() },
    uPear: { value: k.pear },
    uBands: { value: new THREE.Vector2(k.shoulders, k.hips) },
    uBib: { value: new THREE.Vector3(k.bib.width, k.bib.height, k.bib.centre) },
    uBlack: { value: new THREE.Color(black) },
    uRough: { value: new THREE.Vector2(roughWhite, roughBlack) },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec3 vBodyPos;\n' + shader.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vBodyPos = position;');
    shader.fragmentShader = `
      varying vec3 vBodyPos;
      uniform vec3 uRadii; uniform float uPear; uniform vec2 uBands; uniform vec3 uBib;
      uniform vec3 uBlack; uniform vec2 uRough;
      float blackFur(vec3 p) {
        vec3 u = p / uRadii;
        float f = 1.0 - uPear * u.y;
        vec3 v = normalize(vec3(u.x / f, u.y, u.z / f));
        float band = max(v.y - uBands.x, uBands.y - v.y);
        float bib = (1.0 - length(vec2(v.x / uBib.x, (v.y - uBib.z) / uBib.y))) * smoothstep(0.05, 0.45, v.z);
        return band - 1.5 * max(bib, 0.0);
      }
    ` + shader.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        float furField = blackFur(vBodyPos);
        float furAA = fwidth(furField);
        float furBlack = smoothstep(-furAA, furAA, furField);
        diffuseColor.rgb = mix(diffuseColor.rgb, uBlack, furBlack);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(uRough.x, uRough.y, furBlack);`);
  };
  mat.customProgramCacheKey = () => 'marked-fur';
  return mat;
}

