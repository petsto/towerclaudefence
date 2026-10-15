// Pre-rendered terrain (V2): render the static HD terrain once, from the game's fixed 55° ortho view, into one texture
// at the sprites' px/unit, then draw it as a single camera-plane quad. The camera never yaws or tilts, so panning and
// zooming an ortho view of a static scene is exactly a pan/scale of this image. Same recipe as the sprite bake
// (../sprites.ts): soft PCF shadows, 2x supersampled + 4x MSAA half-float tiles box-filtered into an sRGB RGBA8 target.
import * as THREE from 'three';

const PITCH = THREE.MathUtils.degToRad(55);
const SIN = Math.sin(PITCH), COS = Math.cos(PITCH);
const TILE = 512; // output px per bake tile (scratch is 2x)

export interface BakedTerrain {
  /** Camera-plane quad showing the bake; draw first, no depth. */
  readonly quad: THREE.Mesh;
  readonly bytes: number;
  readonly size: string;
  readonly ms: number;
  dispose(): void;
}

/**
 * `scene` holds the terrain (minus live objects, hide them first) plus the sun/hemi lights, with scene.background set to
 * the void colour. `ppu`: output px per world unit (match the sprite atlas).
 */
export function bakeTerrain(gl: THREE.WebGLRenderer, scene: THREE.Scene, sun: THREE.DirectionalLight, ppu: number): BakedTerrain {
  const t0 = performance.now();
  // camera-plane bounds of everything in the scene: sx = x, sy = y·cos − z·sin
  const box = new THREE.Box3();
  scene.traverse((o) => o instanceof THREE.Mesh && o.visible && box.expandByObject(o));
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
  if (W > max || H > max) throw new Error(`terrain bake ${W}x${H} exceeds max texture size ${max}`);

  const out = new THREE.WebGLRenderTarget(W, H, { colorSpace: THREE.SRGBColorSpace, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const scratch = new THREE.WebGLRenderTarget(TILE * 2, TILE * 2, { type: THREE.HalfFloatType, samples: 4 });
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 200);
  cam.position.set(0, 60 * SIN, 60 * COS);
  cam.lookAt(0, 0, 0);
  const down = new THREE.ShaderMaterial({
    uniforms: { t: { value: scratch.texture } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform sampler2D t; varying vec2 vUv; void main() { gl_FragColor = vec4(texture2D(t, vUv).rgb, 1.0); }',
    blending: THREE.NoBlending, depthTest: false, depthWrite: false,
  });
  const fsq = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), down);
  fsq.frustumCulled = false;
  const fsScene = new THREE.Scene().add(fsq);
  const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // soft, high-res shadows for the bake only (restored after)
  const prev = { type: gl.shadowMap.type, auto: gl.shadowMap.autoUpdate, size: sun.shadow.mapSize.clone(), radius: sun.shadow.radius };
  gl.shadowMap.type = THREE.PCFShadowMap;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.radius = 3;
  const dropShadowMap = (): void => {
    sun.shadow.map?.dispose(); // re-created at the new size on the next shadow render
    sun.shadow.map = null;
  };
  dropShadowMap();
  gl.shadowMap.autoUpdate = false;
  gl.shadowMap.needsUpdate = true;

  for (let ty = 0; ty < H; ty += TILE) for (let tx = 0; tx < W; tx += TILE) {
    const w = Math.min(TILE, W - tx), h = Math.min(TILE, H - ty);
    // scratch always renders a full TILE frustum; only the w×h corner is copied
    Object.assign(cam, { left: sx0 + tx / ppu, right: sx0 + (tx + TILE) / ppu, bottom: sy0 + ty / ppu, top: sy0 + (ty + TILE) / ppu });
    cam.updateProjectionMatrix();
    gl.setRenderTarget(scratch);
    gl.render(scene, cam);
    out.viewport.set(tx, ty, TILE, TILE);
    out.scissor.set(tx, ty, w, h);
    out.scissorTest = true;
    gl.setRenderTarget(out);
    gl.render(fsScene, fsCam);
  }
  out.scissorTest = false;
  gl.readRenderTargetPixels(out, 0, 0, 1, 1, new Uint8Array(4)); // sync so `ms` is real
  gl.setRenderTarget(null);
  dropShadowMap();
  sun.shadow.mapSize.copy(prev.size);
  sun.shadow.radius = prev.radius;
  gl.shadowMap.type = prev.type;
  gl.shadowMap.autoUpdate = prev.auto;
  gl.shadowMap.needsUpdate = true;
  scratch.dispose();
  down.dispose();
  fsq.geometry.dispose();

  // the quad: a plane spanned by screen-right (1,0,0) and screen-up (0,cos,−sin), i.e. XY rotated −55° about X
  const qw = W / ppu, qh = H / ppu;
  const geo = new THREE.PlaneGeometry(qw, qh).rotateX(-PITCH);
  const cx = sx0 + qw / 2, cy = sy0 + qh / 2;
  const mat = new THREE.MeshBasicMaterial({ map: out.texture, depthTest: false, depthWrite: false });
  const quad = new THREE.Mesh(geo, mat);
  quad.position.set(cx, cy * COS, -cy * SIN);
  quad.renderOrder = -10;
  quad.frustumCulled = false;
  return {
    quad,
    bytes: W * H * 4,
    size: `${W}x${H}`,
    ms: performance.now() - t0,
    dispose() {
      out.dispose();
      geo.dispose();
      mat.dispose();
    },
  };
}
