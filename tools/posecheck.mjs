// Pose sanity check: forearm/paw clearance from the head for every pose,
// sampled across each pose's motion. Run after editing POSES in src/rig.js:
//   npm run posecheck
// A negative gap means the arm cuts into the head (allowed slightly for arms listed in a pose's `contact`).
import * as THREE from 'three';
import { buildSkeleton, applyPose, resolvePose, POSES } from '../src/rig.js';
import { ARM, HEAD } from '../src/passes.js';
import { onEllipsoid } from '../src/shapes.js';

const root = new THREE.Group();
const joints = buildSkeleton(root);
let failed = false;
for (const name of Object.keys(POSES)) {
  for (const side of ['R', 'L']) {
    let worst = Infinity;
    for (let t = 0; t < 2; t += 0.05) {
      const p = resolvePose(name);
      const m = POSES[name].motion?.(t);
      if (m) for (const g in m) for (const k in m[g]) p[g][k] += m[g][k];
      applyPose(joints, p);
      root.updateMatrixWorld(true);
      const toHead = joints.head.matrixWorld.clone().invert();
      const pts = ARM.joints.map((j) => joints[j + side].getWorldPosition(new THREE.Vector3()));
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      for (let i = 45; i <= 60; i++) { // wrist → paw end of the arm
        const u = i / 60;
        const q = curve.getPointAt(u).applyMatrix4(toHead);
        worst = Math.min(worst, q.length() - onEllipsoid(HEAD, q).p.length() - ARM.radii[ARM.radii.length - 1]);
      }
    }
    // poses can declare an arm that rests against the face on purpose; it may press in a little
    const contact = POSES[name].contact?.includes('arm' + side);
    const ok = worst >= (contact ? -0.07 : 0);
    failed ||= !ok;
    console.log(`${ok ? (contact ? 'touch' : 'ok   ') : 'FAIL '} ${name.padEnd(8)} arm${side}  closest to head: ${worst.toFixed(3)}`);
  }
}
process.exit(failed ? 1 : 0);
