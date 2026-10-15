// Sprite pipeline. bakeAtlas renders Built models once (at load) into one atlas: fixed 55° ortho camera, the map's
// sun + hemi light, self and ground shadow via ShadowMaterial, 2x supersampled + 4x MSAA HDR, box-filtered down.
// createSprites then draws atlas frames as camera-plane quads anchored at the unit's ground point, painter-sorted,
// in one instanced draw call (premultiplied alpha, no depth test).
//
// Frames per entry: tower = TOWER_YAW turret frames (turret at yaw f/TOWER_YAW·2π, shadowing the base and the ground
// the base's own shadow doesn't already cover) + one static base frame (TOWER_BASE); draw base then turret at the same
// anchor. A tower without turret parts gets only the base frame (Atlas.turret(key) = false). Enemy = WALK × ENEMY_YAW
// frames, see enemyFrame. Cells are sized per entry from the model's bounds + its shadow, so small units cost little.
import * as THREE from 'three';
import type { Built, MatId } from './kit';

export const TOWER_YAW = 16;
export const TOWER_BASE = TOWER_YAW;
export const ENEMY_YAW = 8; // sim paths are axis-aligned: enemies only face 4 ways; 8 leaves room to ease turns
export const WALK = 4;
/** Default bake density. ~The approved prototype (≈125 px/unit); the game's view is 11.25 units tall at default zoom. */
export const PX_PER_UNIT = 128;

const PITCH = THREE.MathUtils.degToRad(55);
const SIN = Math.sin(PITCH), COS = Math.cos(PITCH);
const MARGIN = 0.04; // world units around the computed bounds: soft shadow edge + AA, keeps cells from bleeding
const MAX_W = 8192; // keeps the full roster under 8192 tall at 128 px/unit

const yawIndex = (a: number, n: number): number => ((Math.round((a / (Math.PI * 2)) * n) % n) + n) % n;
/** Turret frame for a sim yaw (radians, 0 = +X, increasing toward +Z, as TowerState.rotation). */
export const towerFrame = (yaw: number): number => yawIndex(yaw, TOWER_YAW);
/** Enemy frame for a heading (as EnemyState.heading) and walk phase (0..1, wraps; advance it by distance walked). */
export const enemyFrame = (heading: number, phase: number): number =>
  ((((Math.floor(phase * WALK) % WALK) + WALK) % WALK) * ENEMY_YAW) + yawIndex(heading, ENEMY_YAW);

/** tower: builds = [model], baked as turret yaw frames + base. Enemy: builds = WALK models at phase i / WALK. */
export interface BakeEntry { key: string; tower: boolean; builds: Built[] }
/** Light rig to bake with: use the map palette and the game's sun direction so sprites match the terrain. */
export interface BakeLights { dir: THREE.Vector3; sunColor: THREE.ColorRepresentation; sunI: number; sky: THREE.ColorRepresentation; ground: THREE.ColorRepresentation; hemiI: number }

type Rect = readonly [number, number, number, number];
export interface Atlas {
  texture: THREE.Texture;
  /** Camera-plane quad (left, bottom, width, height) in world units around the ground anchor. */
  quad(key: string): Rect;
  /** Atlas uv rect (x, y, w, h) of one frame. */
  uv(key: string, frame: number): Rect;
  /** Model bounds in world units: max horizontal radius and height above the anchor (HP bars, FX heights). */
  bounds(key: string): { r: number; h: number };
  /** Tower has turret frames (0..TOWER_YAW-1); false = base frame only. */
  turret(key: string): boolean;
  ms: number;
  bytes: number;
  size: string;
  dispose(): void;
}

/** `frames`: the frame indices this cell holds (uv is indexed by frame, so it may be sparse). */
interface Cell { quad: Rect; wPx: number; hPx: number; frames: number[]; uv: Rect[]; r: number; h: number; turret: boolean }
const TURRET_SHADOW = 0.32; // turret shadow on its own base: the catcher's 0.6 reads as a black disc on the slewing ring

/** Max horizontal radius (any yaw) and height over all builds. */
export function bounds(builds: Built[]): { r: number; h: number } {
  let r = 0, h = 0;
  for (const b of builds) for (const p of b.parts) {
    const pos = p.geo.attributes.position!;
    const dy = p.turret ? b.pivot : 0;
    for (let i = 0; i < pos.count; i++) {
      r = Math.max(r, Math.hypot(pos.getX(i), pos.getZ(i)));
      h = Math.max(h, pos.getY(i) + dy);
    }
  }
  return { r, h };
}

export function bakeAtlas(gl: THREE.WebGLRenderer, entries: BakeEntry[], mats: Record<MatId, THREE.Material>, L: BakeLights, pxPerUnit = PX_PER_UNIT): Atlas {
  const t0 = performance.now();
  const sx = -L.dir.x / L.dir.y, sz = -L.dir.z / L.dir.y; // ground shadow offset per unit of height

  // --- size each entry's cell, then shelf-pack all frames (tallest first) ---
  const cells = new Map<string, Cell>();
  for (const e of entries) {
    const { r, h } = bounds(e.builds);
    const l = -r + Math.min(0, sx * h) - MARGIN, right = r + Math.max(0, sx * h) + MARGIN;
    const b = -(r + Math.max(0, sz * h)) * SIN - MARGIN;
    const t = Math.max(h * COS + r * SIN, (r - Math.min(0, sz * h)) * SIN) + MARGIN;
    const wPx = Math.ceil((right - l) * pxPerUnit), hPx = Math.ceil((t - b) * pxPerUnit);
    const turret = e.tower && e.builds.some((bu) => bu.parts.some((p) => p.turret));
    const frames = [...Array(e.tower ? (turret ? TOWER_YAW + 1 : 0) : ENEMY_YAW * e.builds.length).keys()];
    if (e.tower && !turret) frames.push(TOWER_BASE);
    cells.set(e.key, { quad: [l, b, wPx / pxPerUnit, hPx / pxPerUnit], wPx, hPx, frames, uv: [], r, h, turret });
  }
  const maxTex = gl.capabilities.maxTextureSize;
  let AW = Math.min(MAX_W, maxTex);
  const order = [...entries].sort((a, b) => cells.get(b.key)!.hPx - cells.get(a.key)!.hPx);
  const px: [number, number][][] = [];
  let x = 0, y = 0, shelf = 0;
  for (const e of order) {
    const c = cells.get(e.key)!;
    const at: [number, number][] = [];
    for (let f = 0; f < c.frames.length; f++) {
      if (x + c.wPx > AW) [x, y, shelf] = [0, y + shelf, 0];
      at.push([x, y]);
      x += c.wPx;
      shelf = Math.max(shelf, c.hPx);
    }
    px.push(at);
  }
  const AH = y + shelf;
  if (y === 0) AW = x; // single shelf: trim the unused width
  if (AH > maxTex) throw new Error(`sprite atlas ${AW}x${AH} exceeds max texture size ${maxTex}: lower pxPerUnit or bake fewer entries`);
  order.forEach((e, i) => {
    const c = cells.get(e.key)!;
    px[i]!.forEach(([cx, cy], k) => (c.uv[c.frames[k]!] = [cx / AW, cy / AH, c.wPx / AW, c.hPx / AH]));
  });

  // --- bake rig ---
  const atlas = new THREE.WebGLRenderTarget(AW, AH, { colorSpace: THREE.SRGBColorSpace, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const scene = new THREE.Scene();
  const sun = new THREE.DirectionalLight(L.sunColor, L.sunI);
  sun.position.copy(L.dir).normalize().multiplyScalar(10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.01;
  sun.shadow.radius = 2;
  scene.add(sun, new THREE.HemisphereLight(L.sky, L.ground, L.hemiI));
  const catcher = new THREE.ShadowMaterial({ opacity: 0.6 });
  const baseCatcher = new THREE.ShadowMaterial({ opacity: TURRET_SHADOW });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), catcher);
  ground.receiveShadow = true;
  scene.add(ground);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 200);
  cam.position.set(0, 60 * SIN, 60 * COS);
  cam.lookAt(0, 0, 0);

  const down = new THREE.ShaderMaterial({
    uniforms: { t: { value: null }, base: { value: null }, useBase: { value: false } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    // bilinear tap at each 2x2 block centre = box filter. Premultiplied (cleared to 0,0,0,0): keep rgb <= a after clamping HDR.
    // Turret frames (useBase): a pure-shadow texel (rgb exactly 0) over ground (base frame alpha <= its 0.6 shadow) keeps only
    // what the base sprite's shadow under it doesn't already give, so base + turret composite to one shadow, not a double one.
    fragmentShader: /* glsl */ `
      uniform sampler2D t; uniform sampler2D base; uniform bool useBase; varying vec2 vUv;
      void main() {
        vec4 c = texture2D(t, vUv); c.a = clamp(c.a, 0.0, 1.0); c.rgb = min(c.rgb, vec3(c.a));
        float b = useBase ? clamp(texture2D(base, vUv).a, 0.0, 1.0) : 1.0;
        if (b < 0.62 && c.r + c.g + c.b == 0.0) c.a = max(0.0, c.a - b) / (1.0 - b);
        gl_FragColor = c;
      }`,
    blending: THREE.NoBlending, depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), down);
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene().add(quad);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const prevClear = gl.getClearColor(new THREE.Color());
  const prevAlpha = gl.getClearAlpha();
  gl.setClearColor(0x000000, 0);
  gl.setRenderTarget(atlas);
  gl.clear();

  for (const e of entries) {
    const c = cells.get(e.key)!;
    const [l, b, w, h] = c.quad;
    Object.assign(cam, { left: l, right: l + w, bottom: b, top: b + h });
    cam.updateProjectionMatrix();
    const ext = c.r + c.h * Math.hypot(sx, sz) + 0.1;
    Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 30 });
    sun.shadow.camera.updateProjectionMatrix();
    ground.scale.setScalar(ext * 2.5);
    const rt = (): THREE.WebGLRenderTarget => new THREE.WebGLRenderTarget(c.wPx * 2, c.hPx * 2, { type: THREE.HalfFloatType, samples: 4 });
    const scratch = rt();
    const baseShot = c.turret ? rt() : scratch; // kept through the turret frames: their shadow is cut against it
    const shoot = (frame: number, into = scratch): void => {
      down.uniforms.t!.value = into.texture;
      gl.setRenderTarget(into);
      gl.clear();
      gl.render(scene, cam);
      const [u, v] = c.uv[frame]!;
      atlas.viewport.set(Math.round(u * AW), Math.round(v * AH), c.wPx, c.hPx);
      atlas.scissor.copy(atlas.viewport);
      atlas.scissorTest = true;
      gl.setRenderTarget(atlas);
      gl.render(quadScene, quadCam);
    };

    e.builds.forEach((bu, wi) => {
      const root = builtToGroup(bu, mats);
      const turret = root.getObjectByName('turret')!;
      const baseMeshes = root.children.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh);
      scene.add(root);
      if (e.tower) {
        turret.visible = false;
        shoot(TOWER_BASE, baseShot);
        if (!c.turret) {
          scene.remove(root);
          return;
        }
        // turret frames: the base only catches the turret's shadow (and occludes); the base sprite draws it. The ground
        // catches it too, minus the base's own shadow (see `down`).
        turret.visible = true;
        for (const m of baseMeshes) {
          m.material = baseCatcher;
          m.castShadow = false;
        }
        down.uniforms.base!.value = baseShot.texture;
        down.uniforms.useBase!.value = true;
        for (let f = 0; f < TOWER_YAW; f++) {
          turret.rotation.y = -(f / TOWER_YAW) * Math.PI * 2;
          shoot(f);
        }
        down.uniforms.useBase!.value = false;
      } else {
        for (let f = 0; f < ENEMY_YAW; f++) {
          root.rotation.y = -(f / ENEMY_YAW) * Math.PI * 2;
          shoot(wi * ENEMY_YAW + f);
        }
      }
      scene.remove(root);
    });
    scratch.dispose();
    if (baseShot !== scratch) baseShot.dispose();
  }
  atlas.scissorTest = false;
  gl.readRenderTargetPixels(atlas, 0, 0, 1, 1, new Uint8Array(4)); // wait for the GPU so `ms` is the real bake time
  gl.setRenderTarget(null);
  gl.setClearColor(prevClear, prevAlpha);
  down.dispose();
  ground.geometry.dispose();
  catcher.dispose();
  baseCatcher.dispose();
  sun.shadow.map?.dispose();

  const cell = (key: string): Cell => {
    const c = cells.get(key);
    if (!c) throw new Error(`sprite atlas has no entry '${key}' (baked: towers + this map's enemies)`);
    return c;
  };
  return {
    texture: atlas.texture,
    quad: (key) => cell(key).quad,
    uv: (key, frame) => cell(key).uv[frame]!,
    bounds: (key) => cell(key),
    turret: (key) => cell(key).turret,
    ms: performance.now() - t0,
    bytes: AW * AH * 4,
    size: `${AW}x${AH}`,
    dispose: () => atlas.dispose(),
  };
}

/** Real-time instance of a Built (bake, showroom close-ups). Child 'turret' is the yaw pivot. */
export function builtToGroup(b: Built, mats: Record<MatId, THREE.Material>): THREE.Group {
  const root = new THREE.Group();
  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.y = b.pivot;
  root.add(turret);
  for (const p of b.parts) {
    const m = new THREE.Mesh(p.geo, mats[p.mat]);
    m.castShadow = m.receiveShadow = p.mat !== 'glow';
    (p.turret ? turret : root).add(m);
  }
  return root;
}

/**
 * One sprite to draw: anchor (x, y, z) in world space; lower `order` draws first at equal z (tower base: 0, turret: 1).
 * Optional effects, 0..1: `flash` white hit flash, `slow` cyan tint, `shield` shimmer; `scale` about the anchor
 * (build/sell pop), `alpha` fade. Tints skip the baked ground shadow (alpha <= the catcher's 0.6).
 */
export interface SpriteItem {
  x: number; y: number; z: number; key: string; frame: number; order: number;
  scale?: number; alpha?: number; flash?: number; slow?: number; shield?: number;
}

/**
 * `depth`: override material that writes only the sprites' opaque body into the depth buffer (each sprite at its
 * anchor's depth: the quad lies in the camera plane), so a later pass can depth-test against unit silhouettes.
 */
export function createSprites(atlas: Atlas, cap: number): { mesh: THREE.InstancedMesh; depth: THREE.Material; set(list: SpriteItem[], time?: number): void } {
  const geo = new THREE.PlaneGeometry(1, 1); // only its uv (0..1) is used
  const attr = (): THREE.InstancedBufferAttribute => new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const aUv = attr(), aQuad = attr(), aFx = attr();
  geo.setAttribute('aUv', aUv);
  geo.setAttribute('aQuad', aQuad);
  geo.setAttribute('aFx', aFx);
  const time = { value: 0 };
  const defines = { SIN_P: SIN.toFixed(6), COS_P: COS.toFixed(6) };
  const vertexShader = /* glsl */ `
      attribute vec4 aUv; attribute vec4 aQuad; attribute vec4 aFx; varying vec2 vUv; varying vec2 vQ; varying vec4 vFx;
      void main() {
        vUv = aUv.xy + uv * aUv.zw;
        vec2 q = aQuad.xy + uv * aQuad.zw; // camera-plane offset from the anchor
        vQ = q;
        vFx = aFx;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(q.x, q.y * COS_P, -q.y * SIN_P, 1.0);
      }`;
  const mat = new THREE.ShaderMaterial({
    uniforms: { atlas: { value: atlas.texture }, time },
    defines,
    vertexShader,
    fragmentShader: /* glsl */ `
      uniform sampler2D atlas; uniform float time; varying vec2 vUv; varying vec2 vQ; varying vec4 vFx; // flash, slow, shield, alpha
      void main() {
        vec4 c = texture2D(atlas, vUv);
        if (c.a < 0.004) discard;
        vec3 rgb = c.rgb / c.a;
        float body = smoothstep(0.62, 0.9, c.a); // the baked ground shadow stays untinted
        rgb = mix(rgb, rgb * vec3(0.45, 0.95, 1.5) + vec3(0.0, 0.03, 0.06), vFx.y * body);
        float band = pow(0.5 + 0.5 * sin(vQ.y * 18.0 - vQ.x * 6.0 - time * 7.0), 6.0);
        rgb += vec3(0.2, 0.5, 1.0) * vFx.z * body * (0.12 + 0.5 * band);
        rgb = mix(rgb, vec3(1.0), vFx.x * body * 0.85);
        gl_FragColor = vec4(rgb, c.a); // un-premultiplied for the output transform, then back
        #include <colorspace_fragment>
        gl_FragColor.rgb *= gl_FragColor.a;
        gl_FragColor *= vFx.w;
      }`,
    transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const depth = new THREE.ShaderMaterial({
    uniforms: mat.uniforms,
    defines,
    vertexShader,
    // body only: the baked ground shadow (alpha <= 0.6) and faded-out (sold) sprites don't occlude
    fragmentShader: /* glsl */ `
      uniform sampler2D atlas; varying vec2 vUv; varying vec4 vFx;
      void main() { if (texture2D(atlas, vUv).a * vFx.w < 0.75) discard; gl_FragColor = vec4(0.0); }`,
    colorWrite: false,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  const m4 = new THREE.Matrix4();
  return {
    mesh,
    depth,
    set(list, t = 0) {
      time.value = t;
      list.sort((a, b) => a.z - b.z || a.order - b.order); // painter's order: farther rows first, base under turret
      const n = Math.min(list.length, cap);
      for (let i = 0; i < n; i++) {
        const s = list[i]!;
        const k = s.scale ?? 1;
        mesh.setMatrixAt(i, m4.makeScale(k, k, k).setPosition(s.x, s.y, s.z));
        aUv.setXYZW(i, ...atlas.uv(s.key, s.frame));
        aQuad.setXYZW(i, ...atlas.quad(s.key));
        aFx.setXYZW(i, s.flash ?? 0, s.slow ?? 0, s.shield ?? 0, s.alpha ?? 1);
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      aUv.needsUpdate = aQuad.needsUpdate = aFx.needsUpdate = true;
    },
  };
}
