// print.js — describes a posed panda for 3D printing (runs in the browser).
//
// exportPrint(variant) builds the character in print mode and returns plain
// data for tools/print.mjs, which does the solid modelling:
//   mesh   a closed part in world space (positions + triangle indices)
//   flat   a painted area as 2D shapes in a surface frame (`local`, relative to
//          the part); it becomes an inlay. On a curved surface the surface falls
//          away from the frame's plane toward the edges, so `reach` adds depth
//          (a flat inlay only PRINT.inlay deep missed the edges: cut-off corners)
//          `depth` deep (or `depthMm` on the printed figure), clipped to the named part
//   field  the body's fur markings (same field as the viewer's shader)
// A mesh with `minus` keeps only what lies outside the named part (hair).
// Every region has a role; `roles` gives each role's filament and priority.

import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createPanda, VARIANTS, POSES, resolvePose } from './panda.js';
import { PRINT, BASE, ROLES, FILAMENTS } from './passes.js';

const visible = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };

// Height (model units) of a plain panda standing in the Rest pose, without
// the base: PRINT.height is this panda's printed height, so every figure
// shares one scale (a seated figure prints shorter, never bigger).
function referenceHeight() {
  const m = createPanda({ passes: 3, pose: resolvePose('rest'), print: true, edition: __EDITION__ });
  m.root.updateMatrixWorld(true);
  const height = new THREE.Box3().setFromObject(m.root).max.y - m.root.position.y;
  m.dispose();
  return height;
}

export function exportPrint(variant, pose, base) {
  const m = createPanda({ variant, pose: resolvePose(pose), print: true, qrPose: pose, base, edition: __EDITION__ });
  m.showFor(pose);
  m.root.updateMatrixWorld(true);
  const regions = [];
  for (const part of m.parts) {
    if (part.print === false || !visible(part.mesh)) continue;
    const spec = part.print ?? {};
    if (spec.layers) {
      const frame = part.mesh.matrixWorld.clone().multiply(spec.local); // relative to the part, so it follows moved parts (pupils)
      for (const layer of spec.layers) {
        regions.push({ kind: 'flat', name: part.name, role: m.roleFor(layer.role), ops: layer.ops, clip: spec.clip,
          matrix: frame.elements.slice(), depth: [PRINT.inlay + (spec.reach ?? 0), 0.03], depthMm: layer.depthMm });
      }
      continue;
    }
    let g = part.mesh.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    g = mergeVertices(g.index ? g : g, 1e-5);
    g.applyMatrix4(part.mesh.matrixWorld);
    regions.push({ kind: 'mesh', name: part.name, role: part.role, minus: spec.minus,
      positions: Array.from(g.attributes.position.array), index: Array.from(g.index.array) });
    if (spec.field) regions.push({ kind: 'field', name: part.name + ':markings', role: m.roleFor(spec.field.role), clip: part.name,
      field: spec.field, matrix: part.mesh.matrixWorld.elements.slice() });
  }
  // [filament, priority] of every printable role
  const roles = Object.fromEntries(Object.entries(ROLES).filter(([, r]) => r.print).map(([k, r]) => [k, r.print]));
  return { variant, pose, label: `${VARIANTS[variant].label} ${POSES[pose].label}`, regions, roles, print: PRINT, base: BASE, reference: referenceHeight() };
}

window.exportPrint = exportPrint;
// the figures' signature poses (what tools/print.mjs prints for a figure given by id)
window.signatures = Object.fromEntries(Object.values(VARIANTS).map((v) => [v.id, v.signature]));
window.filaments = FILAMENTS;
