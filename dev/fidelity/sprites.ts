// V2 "authentic" path: pre-render the HD models into a sprite atlas at startup (16 yaw frames, baked lighting,
// self-shadow and ground shadow via ShadowMaterial), then draw them as camera-facing quads, painter-sorted, in one call.
import * as THREE from 'three';
import type { Built, Kind, MatId } from './models';

export const FRAMES = 16;
const PITCH = THREE.MathUtils.degToRad(55);
/** Cell extent in camera-plane world units around the model's ground anchor (shadows fall down-right). */
const CELL = { l: -0.72, r: 0.88, b: -0.68, t: 0.92 };
const CW = CELL.r - CELL.l;
const ROWS: Kind[] = ['picket', 'breacher', 'husk', 'rivet'];
const COLS = FRAMES + 1; // + static tower base

export interface Atlas {
  texture: THREE.Texture;
  /** uv rect (x, y, w, h) of a frame; frame FRAMES = tower base. */
  rect(kind: Kind, frame: number): readonly [number, number, number, number];
  ms: number;
  bytes: number;
  size: string;
  cellPx: number;
}

export interface BakeLights { dir: THREE.Vector3; sunColor: THREE.ColorRepresentation; sunI: number; sky: THREE.ColorRepresentation; ground: THREE.ColorRepresentation; hemiI: number }

export function bakeAtlas(gl: THREE.WebGLRenderer, built: Record<Kind, Built>, mats: Record<MatId, THREE.Material>, L: BakeLights, pxPerUnit: number): Atlas {
  const t0 = performance.now();
  const cell = Math.ceil(CW * pxPerUnit);
  const AW = COLS * cell, AH = ROWS.length * cell;
  const atlas = new THREE.WebGLRenderTarget(AW, AH, { colorSpace: THREE.SRGBColorSpace, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  // 2x supersampled + 4x MSAA HDR scratch target, box-filtered down into the atlas cell
  const scratch = new THREE.WebGLRenderTarget(cell * 2, cell * 2, { type: THREE.HalfFloatType, samples: 4 });

  const scene = new THREE.Scene();
  const sun = new THREE.DirectionalLight(L.sunColor, L.sunI);
  sun.position.copy(L.dir).normalize().multiplyScalar(10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.01;
  sun.shadow.radius = 2;
  Object.assign(sun.shadow.camera, { left: -1.2, right: 1.2, top: 1.2, bottom: -1.2, near: 1, far: 30 });
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, new THREE.HemisphereLight(L.sky, L.ground, L.hemiI));
  const catcher = new THREE.ShadowMaterial({ opacity: 0.6 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6, 6).rotateX(-Math.PI / 2), catcher);
  ground.receiveShadow = true;
  scene.add(ground);
  const cam = new THREE.OrthographicCamera(CELL.l, CELL.r, CELL.t, CELL.b, 1, 200);
  cam.position.set(0, 60 * Math.sin(PITCH), 60 * Math.cos(PITCH));
  cam.lookAt(0, 0, 0);

  const down = new THREE.ShaderMaterial({
    uniforms: { t: { value: scratch.texture } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    // premultiplied (cleared to 0,0,0,0), so keep rgb <= a after clamping HDR
    fragmentShader: 'uniform sampler2D t; varying vec2 vUv; void main() { vec4 c = texture2D(t, vUv); c.a = clamp(c.a, 0.0, 1.0); c.rgb = min(c.rgb, vec3(c.a)); gl_FragColor = c; }',
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
  const shoot = (row: number, col: number): void => {
    gl.setRenderTarget(scratch);
    gl.clear();
    gl.render(scene, cam);
    atlas.viewport.set(col * cell, row * cell, cell, cell);
    atlas.scissor.copy(atlas.viewport);
    atlas.scissorTest = true;
    gl.setRenderTarget(atlas);
    gl.render(quadScene, quadCam);
  };

  ROWS.forEach((kind, row) => {
    const b = built[kind];
    const root = new THREE.Group();
    const turret = new THREE.Group();
    turret.position.y = b.pivot;
    root.add(turret);
    const baseMeshes: THREE.Mesh[] = [];
    for (const p of b.parts) {
      const m = new THREE.Mesh(p.geo, mats[p.mat]);
      m.castShadow = m.receiveShadow = p.mat !== 'glow';
      (p.turret ? turret : root).add(m);
      if (!p.turret) baseMeshes.push(m);
    }
    scene.add(root);
    const tower = b.parts.some((p) => p.turret);
    if (tower) {
      turret.visible = false;
      shoot(row, FRAMES);
      // turret frames: the base only catches the turret's shadow (and occludes), it is drawn by the base sprite
      turret.visible = true;
      ground.visible = false;
      for (const m of baseMeshes) {
        m.material = catcher;
        m.castShadow = false;
      }
      for (let f = 0; f < FRAMES; f++) {
        turret.rotation.y = -(f / FRAMES) * Math.PI * 2;
        shoot(row, f);
      }
      ground.visible = true;
    } else {
      for (let f = 0; f < FRAMES; f++) {
        root.rotation.y = -(f / FRAMES) * Math.PI * 2;
        shoot(row, f);
      }
    }
    scene.remove(root);
  });
  atlas.scissorTest = false;
  gl.setRenderTarget(null);
  gl.setClearColor(prevClear, prevAlpha);
  scratch.dispose();
  down.dispose();
  ground.geometry.dispose();

  return {
    texture: atlas.texture,
    rect: (kind, frame) => [(frame * cell) / AW, (ROWS.indexOf(kind) * cell) / AH, cell / AW, cell / AH],
    ms: performance.now() - t0,
    bytes: AW * AH * 4,
    size: `${AW}x${AH}`,
    cellPx: cell,
  };
}

export interface SpriteItem { x: number; y: number; z: number; kind: Kind; frame: number; order: number }

export function createSprites(atlas: Atlas, cap: number): { mesh: THREE.InstancedMesh; set(list: SpriteItem[]): void } {
  const geo = new THREE.PlaneGeometry(CW, CELL.t - CELL.b).translate((CELL.l + CELL.r) / 2, (CELL.b + CELL.t) / 2, 0).rotateX(-PITCH);
  const aCell = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
  aCell.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aCell', aCell);
  const mat = new THREE.ShaderMaterial({
    uniforms: { atlas: { value: atlas.texture } },
    vertexShader: /* glsl */ `
      attribute vec4 aCell; varying vec2 vUv;
      void main() { vUv = aCell.xy + uv * aCell.zw; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D atlas; varying vec2 vUv;
      void main() { vec4 c = texture2D(atlas, vUv); if (c.a < 0.004) discard; gl_FragColor = c; }`,
    transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  const m4 = new THREE.Matrix4();
  return {
    mesh,
    set(list) {
      list.sort((a, b) => a.z - b.z || a.order - b.order); // painter's order: farther rows first, base under turret
      list.forEach((s, i) => {
        mesh.setMatrixAt(i, m4.makeTranslation(s.x, s.y, s.z));
        aCell.setXYZW(i, ...atlas.rect(s.kind, s.frame));
      });
      mesh.count = list.length;
      mesh.instanceMatrix.needsUpdate = true;
      aCell.needsUpdate = true;
    },
  };
}
