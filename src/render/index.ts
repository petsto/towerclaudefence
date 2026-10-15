// Renderer entry: owns the WebGL context, scene, lights, pixel pass, unit sprite atlas and interaction overlays.
// Per frame: world (terrain, ground decals, hover/range/selection) at ~384p posterized -> unit sprites at native
// resolution -> overlay layer (airborne FX, HP bars) at ~384p over them, depth-tested against the world.
import * as THREE from 'three';
import { ENEMIES, TOWER_LIST } from '../data';
import type { EnemyId, MapDef } from '../data/types';
import type { GameState } from '../sim/types';
import { createCameraRig, DEFAULT_PPU } from './camera';
import { bakeAtlas, enemyEntry, makeMaterials, towerEntry } from './hd';
import { createInterp, type Interp } from './interp';
import { createPixelPass, OVERLAY_LAYER } from './pixel';
import { createTerrain } from './terrain';
import { createUnits } from './units';

const SUN_DIR = new THREE.Vector3(-6, 14, -5); // key light from screen upper-left: shadows fall down-right
const SUN_I = 3.2;
const HEMI_I = 2.0;

/** Every enemy a map can field: its wave groups plus whatever their abilities spawn. */
export function mapEnemies(map: MapDef): EnemyId[] {
  const ids = new Set<EnemyId>();
  const add = (id: EnemyId): void => {
    if (ids.has(id)) return;
    ids.add(id);
    const ab = ENEMIES[id].ability;
    if (ab && 'spawn' in ab) add(ab.spawn);
  };
  for (const w of map.waves) for (const g of w.groups) add(g.enemyId);
  return [...ids];
}

export interface Renderer {
  /** Exposed so the FX module can add objects (layer OVERLAY_LAYER = drawn over the unit sprites). */
  readonly scene: THREE.Scene;
  /** Per-frame stats (calls include the shadow pass and blit). */
  readonly info: THREE.WebGLInfo;
  /** Between-step smoothing for enemies/projectiles: main captures before each step and sets alpha. */
  readonly interp: Interp;
  /** Sprite atlas bake stats (dev). */
  readonly bake: { ms: number; mb: number; size: string; ppu: number };
  render(state: GameState, frameDt: number): void;
  pickTile(clientX: number, clientY: number): { col: number; row: number } | null;
  setHover(tile: { col: number; row: number } | null, valid: boolean): void;
  setRangePreview(preview: { x: number; y: number; rangeTiles: number } | null): void;
  setSelectedTower(id: number | null): void;
  /** CSS pixels of the container covered by the bottom HUD console. */
  setBottomInset(cssPx: number): void;
  /** CSS pixels relative to the container. */
  worldToScreen(x: number, y: number, height?: number): { x: number; y: number };
  dispose(): void;
}

export function createRenderer(container: HTMLElement, map: MapDef): Renderer {
  const gl = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  gl.toneMapping = THREE.NoToneMapping;
  gl.shadowMap.enabled = true;
  gl.shadowMap.type = THREE.BasicShadowMap;
  gl.info.autoReset = false;
  const canvas = gl.domElement;
  canvas.style.display = 'block';
  container.appendChild(canvas);

  const p = map.palette;
  const scene = new THREE.Scene();
  const bg = new THREE.Color(p.void);
  scene.background = bg;
  const rig = createCameraRig(canvas, map.cols, map.rows);
  const camera = rig.camera;
  // Open centred on the fight (every spawn + the core, extra margin above for portal/core height); the core stays in view.
  const rect = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
  const core = { x: map.cols / 2, z: map.rows / 2 };
  map.tiles.forEach((row, r) =>
    row.forEach((t, c) => {
      if (t !== 'spawn' && t !== 'core') return;
      if (t === 'core') Object.assign(core, { x: c + 0.5, z: r + 0.5 });
      Object.assign(rect, { x0: Math.min(rect.x0, c - 0.4), z0: Math.min(rect.z0, r - 1), x1: Math.max(rect.x1, c + 1.4), z1: Math.max(rect.z1, r + 1.5) });
    }),
  );
  if (rect.x0 < rect.x1) rig.frame(rect, core);
  const pixel = createPixelPass();

  // Lighting: hard key from screen upper-left (shadows fall down-right) + biome hemisphere fill.
  const cx = map.cols / 2;
  const cz = map.rows / 2;
  const sun = new THREE.DirectionalLight(p.keyLight, SUN_I);
  sun.position.set(cx, 0, cz).add(SUN_DIR);
  sun.target.position.set(cx, 0, cz);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  const ext = Math.max(map.cols, map.rows) / 2 + 3;
  Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 40 });
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target, new THREE.HemisphereLight(p.hemiSky, p.hemiGround, HEMI_I));

  const terrain = createTerrain(map);
  scene.add(terrain.group);
  const interp = createInterp();

  // --- interaction overlays -----------------------------------------------------------------
  const hoverMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.35, depthWrite: false });
  const hoverEdgeMat = new THREE.LineBasicMaterial();
  const hoverGeo = new THREE.PlaneGeometry(0.94, 0.94).rotateX(-Math.PI / 2);
  const hoverEdgeGeo = new THREE.EdgesGeometry(hoverGeo);
  const hover = new THREE.Mesh(hoverGeo, hoverMat);
  hover.add(new THREE.LineSegments(hoverEdgeGeo, hoverEdgeMat));
  hover.visible = false;
  hover.renderOrder = 5;

  const circle: number[] = [];
  for (let i = 0; i < 48; i++) circle.push(Math.cos((i / 48) * Math.PI * 2), 0, Math.sin((i / 48) * Math.PI * 2));
  const ringGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(circle, 3));
  const ringMat = new THREE.LineBasicMaterial({ color: '#7ab0ff', depthTest: false });
  const discGeo = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);
  const discMat = new THREE.MeshBasicMaterial({ color: '#4a6f9a', transparent: true, opacity: 0.12, depthWrite: false, depthTest: false });
  const range = new THREE.Group();
  range.add(new THREE.Mesh(discGeo, discMat), new THREE.LineLoop(ringGeo, ringMat));
  range.visible = false;
  range.renderOrder = 6;
  range.children.forEach((c) => (c.renderOrder = 6));

  const selGeo = new THREE.RingGeometry(0.44, 0.52, 24).rotateX(-Math.PI / 2);
  const selMat = new THREE.MeshBasicMaterial({ color: '#3cff6e' });
  const selection = new THREE.Mesh(selGeo, selMat);
  selection.visible = false;
  scene.add(hover, range, selection);
  let selectedId: number | null = null;

  // --- sizing -------------------------------------------------------------------------------
  const size = new THREE.Vector2();
  let insetCss = 0;
  let rtH = 1;
  function resize(): void {
    gl.setPixelRatio(window.devicePixelRatio);
    gl.setSize(container.clientWidth, container.clientHeight, false);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    gl.getDrawingBufferSize(size);
    const { w, h } = pixel.resize(size.x, size.y);
    rtH = h;
    rig.setTargetSize(w, h);
    rig.setBottomInset((insetCss * h) / Math.max(1, container.clientHeight));
  }
  resize();

  // --- unit sprites: HD models baked once per map (all tower levels + this map's enemies) at the screen's density ---
  const t0 = performance.now();
  const ppu = THREE.MathUtils.clamp(Math.round((size.y / rtH) * DEFAULT_PPU), 96, 128);
  const mats = makeMaterials(gl);
  const entries = [
    ...TOWER_LIST.flatMap((t) => ([1, 2, 3] as const).map((lv) => towerEntry(t.id, lv))),
    ...mapEnemies(map).map(enemyEntry),
  ];
  gl.shadowMap.type = THREE.PCFShadowMap; // soft baked shadows; the terrain keeps its hard Basic ones
  const atlas = bakeAtlas(gl, entries, mats, { dir: SUN_DIR, sunColor: p.keyLight, sunI: SUN_I, sky: p.hemiSky, ground: p.hemiGround, hemiI: HEMI_I }, ppu);
  gl.shadowMap.type = THREE.BasicShadowMap;
  for (const m of Object.values(mats)) {
    for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
    m.dispose();
  }
  const bake = { ms: Math.round(performance.now() - t0), mb: +(atlas.bytes / 1048576).toFixed(1), size: atlas.size, ppu };
  // Only the terrain casts now and it never moves: render its shadow map once (also keeps the overlay pass, which
  // sees no casters, from re-rendering it).
  gl.shadowMap.autoUpdate = false;
  gl.shadowMap.needsUpdate = true;
  gl.autoClear = false; // the world pass clears via scene.background; sprites and overlay composite over it

  const units = createUnits(scene, interp, atlas, terrain.topAt);
  const spriteScene = new THREE.Scene().add(units.sprites);
  // The canvas shows only uvScale of the low-res target: crop the sprite camera's frustum to match.
  const spriteCam = new THREE.OrthographicCamera();
  const syncSpriteCam = (): void => {
    const { left, right, top, bottom, near, far } = camera;
    Object.assign(spriteCam, { left, bottom, near, far, right: left + (right - left) * pixel.uvScale.x, top: bottom + (top - bottom) * pixel.uvScale.y });
    spriteCam.updateProjectionMatrix();
    spriteCam.position.copy(camera.position);
    spriteCam.quaternion.copy(camera.quaternion);
    spriteCam.updateMatrixWorld();
  };

  const ro = new ResizeObserver(resize);
  ro.observe(container);

  let clock = 0;
  const occupied = new Set<string>();
  const ndc = new THREE.Vector2();
  const ray = new THREE.Raycaster();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  const v = new THREE.Vector3();

  return {
    scene,
    info: gl.info,
    interp,
    bake,
    render(state, frameDt) {
      if (gl.getPixelRatio() !== window.devicePixelRatio) resize();
      clock += frameDt;
      rig.update(frameDt);
      units.sync(state, frameDt);
      occupied.clear();
      for (const t of state.towers) occupied.add(`${t.col},${t.row}`);
      terrain.setOccupied(occupied);
      terrain.update(clock);

      const sel = selectedId === null ? null : units.towerPosition(selectedId);
      selection.visible = sel !== null;
      if (sel) selection.position.set(sel.x, sel.y + 0.012, sel.z);
      if (hover.visible) hoverMat.opacity = 0.28 + Math.sin(clock * 6) * 0.08;

      gl.info.reset();
      camera.layers.set(0);
      gl.setRenderTarget(pixel.target);
      gl.render(scene, camera);
      pixel.blit(gl);
      syncSpriteCam();
      gl.render(spriteScene, spriteCam);
      // overlay: same target re-cleared to transparent, world depth kept so FX still hide behind terrain
      gl.setRenderTarget(pixel.target);
      gl.setClearColor(0x000000, 0);
      gl.clear(true, false, false);
      camera.layers.set(OVERLAY_LAYER);
      scene.background = null;
      gl.render(scene, camera);
      scene.background = bg;
      camera.layers.set(0);
      pixel.blitOverlay(gl);
    },
    pickTile(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      // Canvas shows only uvScale of the target (crop), so map CSS px -> target UV -> NDC.
      const u = ((clientX - r.left) / r.width) * pixel.uvScale.x;
      const vv = (1 - (clientY - r.top) / r.height) * pixel.uvScale.y;
      ndc.set(u * 2 - 1, vv * 2 - 1);
      ray.setFromCamera(ndc, camera);
      if (!ray.ray.intersectPlane(ground, hit)) return null;
      const col = Math.floor(hit.x);
      const row = Math.floor(hit.z);
      return col >= 0 && row >= 0 && col < map.cols && row < map.rows ? { col, row } : null;
    },
    setHover(tile, valid) {
      hover.visible = tile !== null;
      if (!tile) return;
      hover.position.set(tile.col + 0.5, terrain.topAt(tile.col, tile.row) + 0.02, tile.row + 0.5);
      const c = valid ? '#3cff6e' : '#ff3a2a';
      hoverMat.color.set(c);
      hoverEdgeMat.color.set(c);
    },
    setRangePreview(preview) {
      range.visible = preview !== null;
      if (!preview) return;
      range.position.set(preview.x, 0.1, preview.y);
      range.scale.set(preview.rangeTiles, 1, preview.rangeTiles);
    },
    setSelectedTower(id) {
      selectedId = id;
    },
    setBottomInset(cssPx) {
      insetCss = cssPx;
      resize();
    },
    worldToScreen(x, y, height = 0) {
      v.set(x, height, y).project(camera);
      const r = canvas.getBoundingClientRect();
      return {
        x: (((v.x + 1) / 2) / pixel.uvScale.x) * r.width,
        y: (1 - (v.y + 1) / 2 / pixel.uvScale.y) * r.height,
      };
    },
    dispose() {
      ro.disconnect();
      rig.dispose();
      units.dispose();
      atlas.dispose();
      terrain.dispose();
      pixel.dispose();
      [hoverGeo, hoverEdgeGeo, ringGeo, discGeo, selGeo, hoverMat, hoverEdgeMat, ringMat, discMat, selMat].forEach((d) => d.dispose());
      gl.dispose();
      gl.forceContextLoss(); // free the context now; browsers cap live WebGL contexts (~16)
      canvas.remove();
    },
  };
}
