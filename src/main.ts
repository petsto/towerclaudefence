import * as THREE from 'three';

// ponytail: smoke test that Three renders; replaced by the real game loop in integration.
const container = document.getElementById('canvas-container')!;
const ui = document.getElementById('ui')!;
ui.textContent = 'Tower Claude Fence';

const renderer = new THREE.WebGLRenderer();
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera();
camera.position.set(10, 10, 10);
camera.lookAt(0, 0, 0);

const cube = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshNormalMaterial());
scene.add(cube);

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const viewHeight = 8;
  const aspect = w / h;
  camera.left = (-viewHeight * aspect) / 2;
  camera.right = (viewHeight * aspect) / 2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;
  camera.near = 0.1;
  camera.far = 100;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener('resize', resize);
resize();

renderer.setAnimationLoop((t) => {
  cube.rotation.y = t / 1000;
  renderer.render(scene, camera);
});
