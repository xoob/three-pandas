// Find arm angles that put a paw at a target: npm run reach -- <R|L> x y z [maxBodyPress]
// Prints the best few (raise, forward, twist, bend) by distance, then clearance.
import * as THREE from 'three';
import { buildSkeleton, applyPose, resolvePose } from '../src/rig.js';
import { ARM, HEAD, BODY } from '../src/passes.js';
import { onEllipsoid } from '../src/shapes.js';
const [side, x, y, z] = [process.argv[2], ...process.argv.slice(3, 6).map(Number)];
const target = new THREE.Vector3(x, y, z);
const root = new THREE.Group(), j = buildSkeleton(root);
const gap = (pt, center, radii, inv) => { const q = inv ? pt.clone().applyMatrix4(inv) : pt.clone().sub(center); return q.length() - onEllipsoid(radii, q).p.length(); };
const res = [];
for (let raise = 0; raise <= 120; raise += 6) for (let forward = 0; forward <= 100; forward += 6)
for (let twist = -90; twist <= 90; twist += 15) for (let bend = 0; bend <= 140; bend += 8) {
  const p = resolvePose('rest'); Object.assign(p['arm' + side], { raise, forward, twist, bend, wrist: 0, turn: 0 });
  applyPose(j, p); root.updateMatrixWorld(true);
  const paw = j['paw' + side].getWorldPosition(new THREE.Vector3());
  const err = paw.distanceTo(target); if (err > 0.05) continue;
  const pts = ARM.joints.map((n) => j[n + side].getWorldPosition(new THREE.Vector3()));
  const c = new THREE.CatmullRomCurve3(pts, false, 'centripetal'); const inv = j.head.matrixWorld.clone().invert();
  let gh = 9, gb = 9;
  for (let i = 30; i <= 60; i++) { const u = i / 60, w = c.getPointAt(u);
    gh = Math.min(gh, gap(w, null, HEAD, inv) - 0.165);
    if (u > 0.5) gb = Math.min(gb, gap(w, new THREE.Vector3(0, 0.8, 0), BODY.radii) - 0.165); }
  res.push({ raise, forward, twist, bend, err: +err.toFixed(3), head: +gh.toFixed(3), body: +gb.toFixed(3) });
}
res.sort((a, b) => (Math.min(b.head, 0) + Math.min(b.body, 0) * 0.5 - b.err) - (Math.min(a.head, 0) + Math.min(a.body, 0) * 0.5 - a.err));
console.log(res.slice(0, 5).map((r) => JSON.stringify(r)).join('\n') || 'unreachable');
