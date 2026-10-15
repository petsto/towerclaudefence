// Graphics fidelity comparison (dev only, src/ untouched). One variant per page load:
//   ?v=0 current models + pixel/posterize pass (baseline)      ?v=1 HD models, native res, MSAA, PBR + env + bloom
//   ?v=2 HD models pre-rendered into a 16-angle sprite atlas    ?v=3 HD models through the pixel pass at 2x res, subtle posterize
// Flags: &terrain=pixel (V1/V2: terrain keeps the low-res posterized look, units HD on top), &stress (40 towers +
// 60 enemies, whole map), &close (close-up), &still (freeze time), &ao=1 (GTAO, V1 native only), &levels=N (V3),
// &bench (sync-timed frames), &clean (hide UI).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ENEMIES, MAPS } from '../src/data';
import type { Path } from '../src/data/types';
import { createInterp } from '../src/render/interp';
import { createPixelPass } from '../src/render/pixel';
import { createTerrain, PAD_Y, PATH_Y } from '../src/render/terrain';
import { createUnits } from '../src/render/units';
import type { EnemyState, GameState, TowerState } from '../src/sim/types';
import { BUILD, makeMaterials, type Built, type Kind } from './fidelity/models';
import { bakeAtlas, createSprites, FRAMES, type Atlas, type SpriteItem } from './fidelity/sprites';
import { blobTexture } from './fidelity/textures';

const q = new URLSearchParams(location.search);
const V = Math.min(3, Math.max(0, Number(q.get('v') ?? 1)));
const PIXEL_TERRAIN = (V === 1 || V === 2) && q.get('terrain') === 'pixel';
const STRESS = q.has('stress');
const CLOSE = q.has('close');
const STILL = q.has('still') || CLOSE;
const AO = V === 1 && !PIXEL_TERRAIN && q.get('ao') === '1';
const LEVELS = Number(q.get('levels') ?? 24);
if (q.has('clean')) document.body.classList.add('clean');

const map = MAPS['dust-ridge-outpost'];
const pal = map.palette;
const PITCH = THREE.MathUtils.degToRad(55);
const VIEW_H = CLOSE ? 2.9 : STRESS ? 14.8 : 11.25; // 11.25 = the game's view height at default zoom
const [CX, CZ] = CLOSE ? [10, 5.45] : STRESS ? [12, 8] : [11, 7];

// --- nav --------------------------------------------------------------------------------------------------------
const bar = document.getElementById('bar')!;
const link = (label: string, params: Record<string, string | null>, on: boolean): void => {
  const p = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(params)) v === null ? p.delete(k) : p.set(k, v);
  const a = document.createElement('a');
  a.href = `?${p}`;
  a.textContent = label;
  if (on) a.className = 'on';
  bar.appendChild(a);
};
link('V0 current', { v: '0', terrain: null }, V === 0);
link('V1 HD realtime', { v: '1', terrain: null }, V === 1 && !PIXEL_TERRAIN);
link('V2 sprites', { v: '2', terrain: null }, V === 2 && !PIXEL_TERRAIN);
link('V3 hybrid 2x', { v: '3', terrain: null }, V === 3);
link('V1 + pixel terrain', { v: '1', terrain: 'pixel' }, V === 1 && PIXEL_TERRAIN);
link('V2 + pixel terrain', { v: '2', terrain: 'pixel' }, V === 2 && PIXEL_TERRAIN);
link(STRESS ? 'stress: on' : 'stress: off', { stress: STRESS ? null : '1', close: null }, STRESS);
link(CLOSE ? 'close-up: on' : 'close-up: off', { close: CLOSE ? null : '1', stress: null }, CLOSE);

// --- world (fake state) -----------------------------------------------------------------------------------------
type TowerKind = 'picket' | 'breacher';
type EnemyKind = 'husk' | 'rivet';
interface TowerSpot { kind: TowerKind; col: number; row: number; yaw: number }
interface Foe { kind: EnemyKind; x: number; z: number; heading: number; parked: boolean; i: number }

const path: Path = map.paths[0]!;
let pathLen = 0;
for (let i = 1; i < path.length; i++) pathLen += Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]);
function along(d: number): { x: number; z: number; heading: number } {
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1]!, [bx, by] = path[i]!;
    const seg = Math.hypot(bx - ax, by - ay);
    if (d <= seg || i === path.length - 1) {
      const f = Math.min(1, d / seg);
      return { x: ax + (bx - ax) * f + 0.5, z: ay + (by - ay) * f + 0.5, heading: Math.atan2(by - ay, bx - ax) };
    }
    d -= seg;
  }
  return { x: 0.5, z: 0.5, heading: 0 };
}

const pads: [number, number][] = [];
map.tiles.forEach((row, r) => row.forEach((t, c) => t === 'build' && pads.push([c, r])));
const towers: TowerSpot[] = STRESS
  ? pads.slice(0, 40).map(([col, row], i) => ({ kind: i % 2 ? 'breacher' : 'picket', col, row, yaw: 0 }))
  : ([[9, 4, 'picket'], [10, 4, 'breacher'], [6, 4, 'breacher'], [13, 4, 'picket'], [16, 4, 'breacher'], [7, 8, 'picket'], [13, 8, 'breacher'], [15, 8, 'picket']] as const)
      .map(([col, row, kind]) => ({ kind, col, row, yaw: 0 }));
const WALKERS = STRESS ? 60 : 8;
const foes: Foe[] = [];
for (let i = 0; i < WALKERS; i++) foes.push({ kind: i % 2 ? 'rivet' : 'husk', x: 0, z: 0, heading: 0, parked: false, i });
if (!STRESS) foes.push({ kind: 'husk', x: 9.35, z: 6.45, heading: 0.45, parked: true, i: 0 }, { kind: 'rivet', x: 10.65, z: 6.5, heading: Math.PI - 0.45, parked: true, i: 1 });

function step(time: number): void {
  for (const f of foes) {
    if (f.parked) continue;
    const p = along((time * 0.8 + (f.i * pathLen) / WALKERS) % pathLen);
    f.x = p.x; f.z = p.z; f.heading = p.heading;
  }
  towers.forEach((t, i) => {
    let best: Foe | null = null;
    let bd = 4;
    for (const f of foes) {
      const d = Math.hypot(f.x - t.col - 0.5, f.z - t.row - 0.5);
      if (d < bd) [bd, best] = [d, f];
    }
    t.yaw = best ? Math.atan2(best.z - t.row - 0.5, best.x - t.col - 0.5) : time * 0.5 + i;
  });
}
const bob = (f: Foe, time: number): number => (STILL ? 0 : 0.02 * Math.abs(Math.sin(time * 8 + f.i * 1.7)));

// --- renderer, scene, lights (same rig as src/render/index.ts) ------------------------------------------------
const gl = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
gl.setPixelRatio(devicePixelRatio);
gl.setSize(innerWidth, innerHeight);
gl.info.autoReset = false;
gl.shadowMap.enabled = true;
gl.shadowMap.type = V === 0 ? THREE.BasicShadowMap : THREE.PCFShadowMap;
gl.toneMapping = THREE.NoToneMapping; // as in the game: the map palette is tuned for a plain clamp (Neutral/ACES wash out the lit sand)
document.body.prepend(gl.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(pal.void);
const sunDir = new THREE.Vector3(-6, 14, -5);
const sun = new THREE.DirectionalLight(pal.keyLight, 3.2);
sun.position.set(map.cols / 2, 0, map.rows / 2).add(sunDir);
sun.target.position.set(map.cols / 2, 0, map.rows / 2);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(V === 0 ? 1024 : 4096);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
sun.shadow.radius = 2;
const ext = Math.max(map.cols, map.rows) / 2 + 3;
Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 40 });
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.camera.layers.enableAll(); // units live on layer 1 but always cast
const HEMI_I = 2.0;
scene.add(sun, sun.target, new THREE.HemisphereLight(pal.hemiSky, pal.hemiGround, HEMI_I));
const terrain = createTerrain(map);
scene.add(terrain.group);

const ENV_I = 1.2;
let env: THREE.Texture | null = null;
if (V !== 0) {
  const pmrem = new THREE.PMREMGenerator(gl);
  env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  // per-material, not scene.environment: in r186 that also lights MeshLambertMaterial and would brighten the terrain
}

const cam = new THREE.OrthographicCamera();
cam.layers.enableAll();
function frameCam(aspect: number): void {
  const h = VIEW_H, w = h * aspect;
  Object.assign(cam, { left: -w / 2, right: w / 2, top: h / 2, bottom: -h / 2, near: 1, far: 200 });
  cam.updateProjectionMatrix();
  cam.position.set(CX, 60 * Math.sin(PITCH), CZ + 60 * Math.cos(PITCH));
  cam.lookAt(CX, 0, CZ);
  cam.updateMatrixWorld();
}

// --- units ------------------------------------------------------------------------------------------------------
const tBuild = performance.now();
const built = V === 0 ? null : (Object.fromEntries((Object.keys(BUILD) as Kind[]).map((k) => [k, BUILD[k]()])) as Record<Kind, Built>);
const mats = V === 0 ? null : makeMaterials();
if (mats) for (const m of Object.values(mats)) if (m instanceof THREE.MeshStandardMaterial) Object.assign(m, { envMap: env, envMapIntensity: m.envMapIntensity * ENV_I });
const buildMs = performance.now() - tBuild;
const count = (k: Kind): number => (k === 'picket' || k === 'breacher' ? towers : foes).filter((u) => u.kind === k).length;

let syncUnits: (time: number, dt: number) => void = () => {};
const unitMats: THREE.Material[] = mats ? Object.values(mats) : [];
let atlas: Atlas | null = null;

if (V === 0) {
  const units = createUnits(scene, createInterp());
  const defOf = { husk: 'husk_crawler', rivet: 'rivet_walker' } as const;
  syncUnits = (time, dt) => {
    const ts: TowerState[] = towers.map((t, i) => ({
      id: i + 1, defId: t.kind, col: t.col, row: t.row, level: 1, targeting: 'first', rotation: t.yaw,
      cooldown: 0, targetId: null, totalDamage: 0, kills: 0, sellValue: 0,
    }));
    const es: EnemyState[] = foes.map((f, i) => {
      const def = ENEMIES[defOf[f.kind]];
      return {
        id: i + 1, defId: def.id, pathIndex: 0, x: f.x, y: f.z, progress: 0, distanceToCore: 0, heading: f.heading,
        hp: def.hp, maxHp: def.hp, shield: def.shield, maxShield: def.shield, slowed: false, midBoss: false,
      };
    });
    const state: GameState = {
      mapId: map.id, difficultyId: 'normal', status: 'playing', speed: 1, time: STILL ? 0 : time, cash: 0, lives: 20,
      waveIndex: 0, waveCount: 1, waveActive: true, nextWaveIn: null, towers: ts, enemies: es, projectiles: [], events: [],
    };
    units.sync(state, Math.max(dt, 0.5)); // big first dt: skip the build-rise animation
  };
} else if (V === 2) {
  const physPerUnit = gl.getDrawingBufferSize(new THREE.Vector2()).y / VIEW_H;
  atlas = bakeAtlas(gl, built!, mats!, { dir: sunDir, sunColor: pal.keyLight, sunI: 3.2, sky: pal.hemiSky, ground: pal.hemiGround, hemiI: HEMI_I }, physPerUnit);
  const sprites = createSprites(atlas, towers.length * 2 + foes.length);
  sprites.mesh.layers.set(1);
  unitMats.push(sprites.mesh.material as THREE.Material);
  scene.add(sprites.mesh);
  const frameOf = (a: number): number => ((Math.round((a / (Math.PI * 2)) * FRAMES) % FRAMES) + FRAMES) % FRAMES;
  const list: SpriteItem[] = [];
  syncUnits = (time) => {
    list.length = 0;
    for (const t of towers) {
      list.push({ x: t.col + 0.5, y: PAD_Y, z: t.row + 0.5, kind: t.kind, frame: FRAMES, order: 0 });
      list.push({ x: t.col + 0.5, y: PAD_Y, z: t.row + 0.5, kind: t.kind, frame: frameOf(t.yaw), order: 1 });
    }
    for (const f of foes) list.push({ x: f.x, y: PATH_Y + bob(f, time), z: f.z, kind: f.kind, frame: frameOf(f.heading), order: 2 });
    sprites.set(list);
  };
} else {
  // V1 / V3: instanced HD meshes, one InstancedMesh per (kind, material, turret) + contact-shadow blobs
  const m4 = new THREE.Matrix4(), tm = new THREE.Matrix4(), rot = new THREE.Matrix4(), off = new THREE.Matrix4();
  const parts: Record<Kind, { mesh: THREE.InstancedMesh; turret: boolean }[]> = { picket: [], breacher: [], husk: [], rivet: [] };
  for (const k of Object.keys(BUILD) as Kind[]) {
    for (const p of built![k].parts) {
      const mesh = new THREE.InstancedMesh(p.geo, mats![p.mat], Math.max(1, count(k)));
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = mesh.receiveShadow = p.mat !== 'glow';
      mesh.frustumCulled = false;
      mesh.layers.set(1);
      scene.add(mesh);
      parts[k].push({ mesh, turret: p.turret });
    }
  }
  const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, map: blobTexture(), transparent: true, opacity: 0.55, depthWrite: false });
  const blobs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), blobMat, towers.length + foes.length);
  blobs.layers.set(1);
  unitMats.push(blobMat);
  blobs.frustumCulled = false;
  scene.add(blobs);
  const n: Record<Kind, number> = { picket: 0, breacher: 0, husk: 0, rivet: 0 };
  const scl = new THREE.Vector3(), pos = new THREE.Vector3(), quat = new THREE.Quaternion();
  syncUnits = (time) => {
    for (const k of Object.keys(n) as Kind[]) n[k] = 0;
    let b = 0;
    for (const t of towers) {
      const i = n[t.kind]++;
      const x = t.col + 0.5, z = t.row + 0.5;
      tm.makeTranslation(x, PAD_Y, z);
      const turret = m4.multiplyMatrices(tm, off.makeTranslation(0, built![t.kind].pivot, 0)).multiply(rot.makeRotationY(-t.yaw)).clone();
      for (const p of parts[t.kind]) p.mesh.setMatrixAt(i, p.turret ? turret : tm);
      blobs.setMatrixAt(b++, m4.compose(pos.set(x + 0.04, PAD_Y + 0.003, z + 0.04), quat.identity(), scl.set(1.3, 1, 1.3)));
    }
    for (const f of foes) {
      const i = n[f.kind]++;
      m4.makeRotationY(-f.heading).setPosition(f.x, PATH_Y + bob(f, time), f.z);
      for (const p of parts[f.kind]) p.mesh.setMatrixAt(i, m4);
      blobs.setMatrixAt(b++, tm.compose(pos.set(f.x, PATH_Y + 0.004, f.z), quat.identity(), scl.set(0.62, 1, 0.62)));
    }
    for (const k of Object.keys(parts) as Kind[]) for (const p of parts[k]) p.mesh.instanceMatrix.needsUpdate = true;
    blobs.count = b;
    blobs.instanceMatrix.needsUpdate = true;
  };
}

// --- pipelines ----------------------------------------------------------------------------------------------------
/** Low-res target + posterize/dither blit (same shader as src/render/pixel.ts, parametrised; can also output to an RT). */
function makePixel(targetH: number, levels: number) {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
  const out = new THREE.WebGLRenderTarget(1, 1, { colorSpace: THREE.SRGBColorSpace, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, depthBuffer: false });
  const uvScale = new THREE.Vector2(1, 1);
  const vert = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const post = new THREE.ShaderMaterial({
    uniforms: { tScene: { value: target.texture }, crop: { value: new THREE.Vector2(1, 1) }, levels: { value: levels }, toLinear: { value: 0 } },
    vertexShader: vert,
    fragmentShader: /* glsl */ `
      uniform sampler2D tScene; uniform vec2 crop; uniform float levels; uniform float toLinear;
      varying vec2 vUv;
      const mat4 BAYER = mat4(0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.) / 16.;
      void main() {
        vec2 uv = vUv * crop;
        vec4 c = texture2D(tScene, uv);
        #ifdef TONE_MAPPING
        c.rgb = toneMapping(c.rgb);
        #endif
        c = sRGBTransferOETF(clamp(c, 0.0, 1.0));
        if (levels > 0.0) {
          ivec2 p = ivec2(uv * vec2(textureSize(tScene, 0))) % 4;
          float d = BAYER[p.x][p.y] - 0.5;
          c.rgb = floor(c.rgb * (levels - 1.0) + 0.5 + d * 0.6) / (levels - 1.0);
        }
        if (toLinear > 0.5) c = sRGBTransferEOTF(c);
        gl_FragColor = vec4(c.rgb, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  const bg = new THREE.ShaderMaterial({
    uniforms: { t: { value: out.texture }, crop: { value: uvScale } },
    vertexShader: vert,
    fragmentShader: 'uniform sampler2D t; uniform vec2 crop; varying vec2 vUv; void main() { gl_FragColor = texture2D(t, vUv * crop); }',
    depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post);
  quad.frustumCulled = false;
  const qs = new THREE.Scene().add(quad);
  const qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  return {
    target,
    resize(physW: number, physH: number): { w: number; h: number } {
      const scale = Math.max(1, Math.round(physH / targetH));
      const w = Math.ceil(physW / scale), h = Math.ceil(physH / scale);
      target.setSize(w, h);
      out.setSize(w, h);
      uvScale.set(physW / (w * scale), physH / (h * scale));
      return { w, h };
    },
    /** To the canvas (sRGB, cropped). */
    blit(r: THREE.WebGLRenderer): void {
      quad.material = post;
      post.uniforms.crop!.value.copy(uvScale);
      post.uniforms.toLinear!.value = 0;
      r.setRenderTarget(null);
      r.render(qs, qc);
    },
    /** Posterized result into the internal sRGB RT (for compositing under HD units). */
    blitToOut(r: THREE.WebGLRenderer): void {
      quad.material = post;
      post.uniforms.crop!.value.set(1, 1);
      post.uniforms.toLinear!.value = 1;
      r.setRenderTarget(out);
      r.render(qs, qc);
    },
    /** Nearest-upscaled posterized terrain as a fullscreen background into the current target. */
    drawBg(r: THREE.WebGLRenderer): void {
      quad.material = bg;
      r.render(qs, qc);
    },
  };
}

const size = new THREE.Vector2();
let renderFrame: () => void;
let resize: () => void;

if (V === 0 || V === 3) {
  const src = V === 0 ? createPixelPass() : null;
  const mine = V === 3 ? makePixel(768, LEVELS) : null;
  resize = () => {
    gl.setSize(innerWidth, innerHeight);
    gl.getDrawingBufferSize(size);
    const { w, h } = (src ?? mine!).resize(size.x, size.y);
    frameCam(w / h);
  };
  renderFrame = () => {
    gl.setRenderTarget((src ?? mine!).target);
    gl.render(scene, cam);
    if (src) src.blit(gl);
    else mine!.blit(gl);
  };
} else {
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(gl, rt);
  const px = PIXEL_TERRAIN ? makePixel(384, 8) : null;
  if (px) {
    // terrain (+ unit shadows) low-res & posterized exactly like V0; units HD on top with native-res terrain depth
    const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false });
    gl.shadowMap.autoUpdate = false;
    class SplitPass extends Pass {
      constructor() {
        super();
        this.needsSwap = false;
      }
      override render(r: THREE.WebGLRenderer, _w: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget): void {
        // low-res pass sees units (the shadow map culls by the main camera's layers) but they write nothing
        r.shadowMap.needsUpdate = true;
        const dw = unitMats.map((m) => m.depthWrite);
        for (const m of unitMats) m.colorWrite = m.depthWrite = false;
        r.setRenderTarget(px!.target);
        r.clear();
        r.render(scene, cam);
        unitMats.forEach((m, i) => ((m.colorWrite = true), (m.depthWrite = dw[i]!)));
        px!.blitToOut(r);
        cam.layers.set(0);
        r.setRenderTarget(read);
        r.clear();
        px!.drawBg(r);
        const bgc = scene.background;
        scene.background = null;
        const ac = r.autoClear;
        r.autoClear = false;
        scene.overrideMaterial = depthOnly;
        r.render(scene, cam);
        scene.overrideMaterial = null;
        cam.layers.set(1);
        r.render(scene, cam);
        cam.layers.enableAll();
        scene.background = bgc;
        r.autoClear = ac;
      }
    }
    composer.addPass(new SplitPass());
  } else composer.addPass(new RenderPass(scene, cam));
  let gtao: GTAOPass | null = null;
  if (AO) {
    gtao = new GTAOPass(scene, cam, 1, 1);
    gtao.updateGtaoMaterial({ radius: 0.12, distanceExponent: 1.5, thickness: 1, scale: 1.2 });
    gtao.blendIntensity = 1;
    composer.addPass(gtao);
  }
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.3, 1.8) // threshold above the brightest lit terrain;
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  resize = () => {
    gl.setSize(innerWidth, innerHeight);
    composer.setPixelRatio(devicePixelRatio);
    composer.setSize(innerWidth, innerHeight);
    gl.getDrawingBufferSize(size);
    if (px) {
      const { w, h } = px.resize(size.x, size.y);
      frameCam(w / h);
    } else frameCam(size.x / size.y);
  };
  renderFrame = () => composer.render();
}
resize();
addEventListener('resize', resize);

// --- loop + stats -----------------------------------------------------------------------------------------------
const hud = document.getElementById('hud')!;
const tris = built ? (Object.keys(built) as Kind[]).map((k) => `${k} ${Math.round(built[k].tris / 100) / 10}k`).join(', ') : 'current low-poly (50-300 each)';
const label = ['V0 current (pixel 384p + posterize 8)', 'V1 HD realtime (native, MSAA, PBR, env, bloom)', 'V2 pre-rendered sprites (16 yaw, baked light)', `V3 hybrid (pixel 768p, posterize ${LEVELS})`][V]! + (PIXEL_TERRAIN ? ' + pixel terrain' : '') + (AO ? ' + GTAO' : '');
const stats = { variant: label, models: tris, fps: 0, calls: 0, tris: 0, benchMs: 0, buildMs: Math.round(buildMs), bakeMs: atlas ? Math.round(atlas.ms) : 0, atlas: atlas ? `${atlas.size} (${atlas.cellPx}px cells) ${(atlas.bytes / 1048576).toFixed(1)} MB` : '' };
Object.assign(window, { __fid: stats });

let time = STILL ? 3 : 0;
let last = performance.now();
let frames = 0;
let acc = 0;
function draw(dt: number): void {
  if (!STILL) time += dt;
  step(time);
  syncUnits(time, dt);
  terrain.update(time);
  gl.info.reset();
  renderFrame();
  stats.calls = gl.info.render.calls;
  stats.tris = gl.info.render.triangles;
}
function bench(): void {
  const px = new Uint8Array(4);
  const ctx = gl.getContext();
  const t0 = performance.now();
  const N = 120;
  for (let i = 0; i < N; i++) {
    draw(1 / 60);
    ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px); // forces GPU sync per frame
  }
  stats.benchMs = Math.round(((performance.now() - t0) / N) * 100) / 100;
}
function loop(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  draw(dt);
  frames++;
  acc += dt;
  if (acc >= 1) {
    stats.fps = Math.round(frames / acc);
    frames = 0;
    acc = 0;
    if (q.has('bench') && stats.benchMs === 0) bench();
  }
  hud.textContent = `${label}\nfps ${stats.fps}  calls ${stats.calls}  tris ${stats.tris}${stats.benchMs ? `  sync frame ${stats.benchMs} ms` : ''}\n` +
    `towers ${towers.length}  enemies ${foes.length}  dpr ${devicePixelRatio}  canvas ${size.x}x${size.y}\nmodels: ${tris}  build ${stats.buildMs} ms` +
    (atlas ? `\natlas ${stats.atlas}  bake ${stats.bakeMs} ms` : '');
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/** Dev capture: render one frame and POST the canvas PNG to a local receiver (`__shot('fid-v1.png')`). */
Object.assign(window, {
  __bench: (): typeof stats => (bench(), stats),
  __shot: (name: string, url = 'http://127.0.0.1:5181/'): Promise<string> =>
    new Promise((res) => {
      draw(0);
      gl.domElement.toBlob((b) => void fetch(url + name, { method: 'POST', body: b }).then((r) => r.text()).then(res));
    }),
});
