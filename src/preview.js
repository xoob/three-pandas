// preview.js — renders exported print meshes (tools/print.mjs) for checking.
import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0xeef0f4);
document.body.appendChild(renderer.domElement);
window.showPrint = (figures, view = 'front') => {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8890a0, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-60, -120, 160); scene.add(sun);
  const box = new THREE.Box3();
  for (const f of figures) for (const p of f.parts) {
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p.positions, 3));
    g.setIndex(p.index);
    g = toCreasedNormals(g, Math.PI / 3); // inlay walls keep their own normals instead of bleeding into the surface
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: p.colour, roughness: 0.6, flatShading: false }));
    scene.add(mesh);
    box.expandByObject(mesh);
  }
  const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length();
  const cam = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 1, 2000);
  cam.up.set(0, 0, 1);
  // detail: close-up of face and belly from the front, to check painted areas
  if (view === 'detail') c.z = box.min.z + (box.max.z - box.min.z) * 0.62;
  const dir = { front: [0, -1, 0.15], iso: [0.6, -1, 0.5], back: [0, 1, 0.2], side: [1, 0, 0.15], top: [0, -0.01, 1], bottom: [0, -0.01, -1], detail: [0, -1, 0.1] }[view];
  cam.position.copy(c).add(new THREE.Vector3(...dir).normalize().multiplyScalar(size * (view === 'detail' ? 0.95 : 2.1)));
  cam.lookAt(c);
  renderer.render(scene, cam);
};
window.previewReady = true;
