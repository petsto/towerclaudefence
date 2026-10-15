// Pre-rendered map terrain (docs/terrain-hd.md). createMapTerrain builds the HD terrain scene (./build.ts), renders it
// once from the game's fixed 55° ortho view into one texture, and returns what the frame needs:
//   - a camera-plane quad showing the bake (the camera never yaws or tilts, so panning and zooming an ortho view of a
//     static scene is exactly a pan/scale of this image); draw it first, no depth
//   - the static terrain meshes again as depth-only occluders (hover, ground decals and FX hide behind cliffs and rocks)
//   - the live pieces real-time: pad lights (occupied state), spawn portal rings, core glow
// Bake recipe as the sprite atlas (../sprites.ts): the map's sun + hemi light, soft PCF shadows, 2x supersampled + 4x
// MSAA half-float tiles box-filtered into an sRGB RGBA8 target.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MapDef } from '../../../data/types';
import type { MatId } from '../kit';
import type { BakeLights } from '../sprites';
import { createHdTerrain } from './build';

const PITCH = THREE.MathUtils.degToRad(55);
const SIN = Math.sin(PITCH), COS = Math.cos(PITCH);
const TILE = 512; // output px per bake tile (scratch is 2x)

export interface MapTerrain {
  /** Baked quad + depth-only occluders + live pieces: add to the world scene (layer 0). */
  readonly group: THREE.Group;
  /** Top surface height of a tile (where units/towers stand). */
  topAt(col: number, row: number): number;
  /** Occupied pads switch their lights to team amber. Keys are `col,row`. */
  setOccupied(keys: ReadonlySet<string>): void;
  update(time: number): void;
  /** Build + bake time, texture size and memory (dev). */
  readonly stats: { ms: number; mb: number; size: string; ppu: number };
  dispose(): void;
}

/**
 * `mats`: the unit materials (shared with the atlas bake; caller disposes them afterwards). `ppu`: bake px per world
 * unit, the screen's px/unit at the default zoom so baked texels land 1:1 on screen pixels there.
 */
export function createMapTerrain(gl: THREE.WebGLRenderer, map: MapDef, mats: Record<MatId, THREE.Material>, L: BakeLights, ppu: number): MapTerrain {
  const t0 = performance.now();
  const hd = createHdTerrain(map, mats);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(map.palette.void);
  const c = new THREE.Vector3(map.cols / 2, 0, map.rows / 2);
  const sun = new THREE.DirectionalLight(L.sunColor, L.sunI);
  sun.position.copy(c).add(L.dir);
  sun.target.position.copy(c);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.015;
  sun.shadow.radius = 3;
  const ext = Math.max(map.cols, map.rows) / 2 + 3;
  Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 40 });
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target, new THREE.HemisphereLight(L.sky, L.ground, L.hemiI), hd.group);

  hd.live.forEach((o) => (o.visible = false));
  const baked = render(gl, scene, ppu);
  hd.live.forEach((o) => (o.visible = true));
  sun.shadow.map?.dispose();
  scene.remove(hd.group);

  // the static meshes become one merged depth-only occluder (indexed, position only); then free their GPU resources
  const live = new Set<THREE.Object3D>();
  for (const o of hd.live) o.traverse((d) => live.add(d));
  const parts: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4(), im = new THREE.Matrix4();
  hd.group.updateMatrixWorld(true);
  hd.group.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || live.has(o)) return;
    const src = o.geometry as THREE.BufferGeometry;
    const occ = (o.userData.occluder === undefined ? src : o.userData.occluder) as THREE.BufferGeometry | null; // see ./build.ts
    const pos = occ?.attributes.position as THREE.BufferAttribute;
    const n = !occ ? 0 : o instanceof THREE.InstancedMesh ? o.count : 1;
    for (let i = 0; i < n; i++) {
      if (o instanceof THREE.InstancedMesh) m.multiplyMatrices(o.matrixWorld, (o.getMatrixAt(i, im), im));
      else m.copy(o.matrixWorld);
      const g = new THREE.BufferGeometry().setAttribute('position', pos.clone());
      g.setIndex(occ!.index ? occ!.index.clone() : Array.from({ length: pos.count }, (_, k) => k));
      parts.push(g.applyMatrix4(m));
    }
    src.dispose();
    const mat = o.material as THREE.Material & { userData: { tex?: THREE.Texture[] } };
    mat.userData.tex?.forEach((t) => t.dispose()); // terrain sets + mask
  });
  const occGeo = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());
  if (!occGeo) throw new Error('terrain occluder merge failed');
  const occluderMat = new THREE.MeshBasicMaterial({ colorWrite: false });
  const occluder = new THREE.Mesh(occGeo, occluderMat);
  occluder.renderOrder = -5; // after the quad, before anything depth-tested
  occluder.frustumCulled = false;
  const group = new THREE.Group().add(baked.quad, occluder, ...hd.live);

  const mb = +(baked.bytes / 1048576).toFixed(1);
  return {
    group,
    topAt: hd.topAt,
    setOccupied: hd.setOccupied,
    update: hd.update,
    stats: { ms: Math.round(performance.now() - t0), mb, size: baked.size, ppu },
    dispose() {
      hd.dispose();
      baked.dispose();
      occGeo.dispose();
      occluderMat.dispose();
    },
  };
}

function render(gl: THREE.WebGLRenderer, scene: THREE.Scene, ppu: number): { quad: THREE.Mesh; bytes: number; size: string; dispose(): void } {
  // camera-plane bounds of everything visible: sx = x, sy = y·cos − z·sin
  const box = new THREE.Box3();
  scene.traverseVisible((o) => o instanceof THREE.Mesh && box.expandByObject(o));
  let sx0 = Infinity, sx1 = -Infinity, sy0 = Infinity, sy1 = -Infinity;
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const sy = y * COS - z * SIN;
    [sx0, sx1, sy0, sy1] = [Math.min(sx0, x), Math.max(sx1, x), Math.min(sy0, sy), Math.max(sy1, sy)];
  }
  // snap the origin to the bake's pixel grid so texels land on screen pixels at the matching zoom
  sx0 = Math.floor(sx0 * ppu) / ppu;
  sy0 = Math.floor(sy0 * ppu) / ppu;
  const W = Math.ceil((sx1 - sx0) * ppu), H = Math.ceil((sy1 - sy0) * ppu);
  const max = gl.capabilities.maxTextureSize;
  // ponytail: one texture per map; maps much bigger than 24×16 at 1440p+ would need the quad split into tiles
  if (W > max || H > max) throw new Error(`terrain bake ${W}x${H} exceeds max texture size ${max}`);

  const out = new THREE.WebGLRenderTarget(W, H, { colorSpace: THREE.SRGBColorSpace, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const scratch = new THREE.WebGLRenderTarget(TILE * 2, TILE * 2, { type: THREE.HalfFloatType, samples: 4 });
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 200);
  cam.position.set(0, 60 * SIN, 60 * COS);
  cam.lookAt(0, 0, 0);
  const down = new THREE.ShaderMaterial({
    uniforms: { t: { value: scratch.texture } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    // bilinear tap at each 2x2 block centre = box filter
    fragmentShader: 'uniform sampler2D t; varying vec2 vUv; void main() { gl_FragColor = vec4(texture2D(t, vUv).rgb, 1.0); }',
    blending: THREE.NoBlending, depthTest: false, depthWrite: false,
  });
  const fsq = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), down);
  fsq.frustumCulled = false;
  const fsScene = new THREE.Scene().add(fsq);
  const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const prev = { type: gl.shadowMap.type, autoUpdate: gl.shadowMap.autoUpdate, enabled: gl.shadowMap.enabled };
  Object.assign(gl.shadowMap, { enabled: true, type: THREE.PCFShadowMap, autoUpdate: false, needsUpdate: true }); // one shadow render for all tiles
  for (let ty = 0; ty < H; ty += TILE) for (let tx = 0; tx < W; tx += TILE) {
    // scratch always renders a full TILE frustum; only the w×h corner is copied
    Object.assign(cam, { left: sx0 + tx / ppu, right: sx0 + (tx + TILE) / ppu, bottom: sy0 + ty / ppu, top: sy0 + (ty + TILE) / ppu });
    cam.updateProjectionMatrix();
    gl.setRenderTarget(scratch);
    gl.render(scene, cam);
    out.viewport.set(tx, ty, TILE, TILE);
    out.scissor.set(tx, ty, Math.min(TILE, W - tx), Math.min(TILE, H - ty));
    out.scissorTest = true;
    gl.setRenderTarget(out);
    gl.render(fsScene, fsCam);
  }
  out.scissorTest = false;
  gl.readRenderTargetPixels(out, 0, 0, 1, 1, new Uint8Array(4)); // sync so the bake time is real
  gl.setRenderTarget(null);
  Object.assign(gl.shadowMap, prev);
  scratch.dispose();
  down.dispose();
  fsq.geometry.dispose();

  // the quad: a plane spanned by screen-right (1,0,0) and screen-up (0,cos,−sin), i.e. XY rotated −55° about X
  const qw = W / ppu, qh = H / ppu;
  const geo = new THREE.PlaneGeometry(qw, qh).rotateX(-PITCH);
  const cy = sy0 + qh / 2;
  const mat = new THREE.MeshBasicMaterial({ map: out.texture, depthTest: false, depthWrite: false });
  const quad = new THREE.Mesh(geo, mat);
  quad.position.set(sx0 + qw / 2, cy * COS, -cy * SIN);
  quad.renderOrder = -10;
  quad.frustumCulled = false;
  return {
    quad,
    bytes: W * H * 4,
    size: `${W}x${H}`,
    dispose() {
      out.dispose();
      geo.dispose();
      mat.dispose();
    },
  };
}
