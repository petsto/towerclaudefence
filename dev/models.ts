// Dev showroom: all towers × levels and all enemies on a turntable, with the game's camera, lighting and pixel scale.
import * as THREE from 'three';
import { createEnemyGeometry, createTowerModel } from '../src/render/models';
import { ENEMIES } from '../src/data/enemies';
import { TOWER_LIST } from '../src/data/towers';
import type { EnemyId } from '../src/data/types';

const q = new URLSearchParams(location.search);
const PPU = Number(q.get('ppu') ?? 32);
const still = q.has('still');
const PITCH = THREE.MathUtils.degToRad(55);

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x140e09);
scene.add(new THREE.HemisphereLight(0xc9b08a, 0x3a2a1c, 0.8));
const sun = new THREE.DirectionalLight(0xffe2b8, 2.0);
sun.position.set(-6, 14, -5);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshLambertMaterial({ color: 0x7a5a3a }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const padGeo = new THREE.BoxGeometry(0.96, 0.05, 0.96).translate(0, -0.025, 0);
const padMat = new THREE.MeshLambertMaterial({ color: 0x5a6470 });

const spin: THREE.Object3D[] = [];
const SP = 1.6;
TOWER_LIST.forEach((def, c) => {
  for (const lv of [1, 2, 3] as const) {
    const x = (c - 2.5) * SP, z = (lv - 2.5) * SP;
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.set(x, 0.001, z);
    pad.receiveShadow = true;
    const m = createTowerModel(def.id, lv);
    m.position.set(x, 0, z);
    scene.add(pad, m);
    spin.push(m);
  }
});
const enemyMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
(Object.keys(ENEMIES) as EnemyId[]).forEach((id, i) => {
  const m = new THREE.Mesh(createEnemyGeometry(id), enemyMat);
  m.castShadow = true;
  m.position.set((i - 4) * 1.35, 0, 2.6);
  scene.add(m);
  spin.push(m);
});

const cam = new THREE.OrthographicCamera();
const target = new THREE.Vector3(0, 0, 0.2);
cam.position.set(target.x, 60 * Math.sin(PITCH), target.z + 60 * Math.cos(PITCH));
cam.lookAt(target);

function resize(): void {
  const scale = q.has('hi') ? 1 : Math.max(1, Math.round(innerHeight / 384));
  renderer.setPixelRatio(1 / scale);
  renderer.setSize(innerWidth, innerHeight);
  const w = innerWidth / scale / PPU, h = innerHeight / scale / PPU;
  Object.assign(cam, { left: -w / 2, right: w / 2, top: h / 2, bottom: -h / 2, near: 1, far: 200 });
  cam.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

renderer.setAnimationLoop((t) => {
  const yaw = still ? -0.6 : t * 0.0005;
  for (const o of spin) o.rotation.y = yaw;
  renderer.render(scene, cam);
});

// Vertex budget report (towers < ~1500, enemies < ~600).
const verts = (o: THREE.Object3D) => {
  let n = 0;
  o.traverse((c) => { if (c instanceof THREE.Mesh) n += c.geometry.attributes.position.count; });
  return n;
};
console.log('VERTS ' + JSON.stringify(Object.fromEntries([
  ...TOWER_LIST.map((d) => [d.id, ([1, 2, 3] as const).map((lv) => verts(createTowerModel(d.id, lv)))]),
  ...(Object.keys(ENEMIES) as EnemyId[]).map((id) => [id, createEnemyGeometry(id).attributes.position!.count]),
])));
