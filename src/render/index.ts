// Renderer entry: owns the WebGL context, scene, the two load-time bakes (unit sprite atlas, pre-rendered HD terrain)
// and the interaction overlays. Everything draws at native resolution, straight to the canvas:
//   world (layer 0): baked terrain quad -> terrain occluders (depth only) -> live terrain bits (pad lights, portal rings,
//     core glow), hover/range/selection, ground decals
//   unit sprites (painter-sorted, no depth) -> their opaque silhouettes into depth
//   overlay (layer OVERLAY_LAYER): airborne FX, HP bars, depth-tested against terrain, props and unit silhouettes
// No real-time lights or shadows: both bakes carry the map's sun + hemi light.
import * as THREE from 'three';
import { ENEMIES, TOWER_LIST } from '../data';
import type { EnemyId, MapDef } from '../data/types';
import type { GameState } from '../sim/types';
import { createCameraRig, DEFAULT_PPU } from './camera';
import { bakeAtlas, enemyEntry, makeMaterials, towerEntry } from './hd';
import { createMapTerrain } from './hd/terrain/bake';
import { createInterp, type Interp } from './interp';
import { createUnits } from './units';
import { OVERLAY_LAYER, viewGrid } from './view';

const SUN_DIR = new THREE.Vector3(-6, 14, -5); // baked key light from screen upper-left: shadows fall down-right
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
  /** Per-frame stats. */
  readonly info: THREE.WebGLInfo;
  /** Between-step smoothing for enemies/projectiles: main captures before each step and sets alpha. */
  readonly interp: Interp;
  /** Load-time bake stats (dev): sprite atlas, and the pre-rendered terrain under `terrain`. */
  readonly bake: { ms: number; mb: number; size: string; ppu: number; terrain: { ms: number; mb: number; size: string; ppu: number } };
  render(state: GameState, frameDt: number): void;
  pickTile(clientX: number, clientY: number): { col: number; row: number } | null;
  setHover(tile: { col: number; row: number } | null, valid: boolean): void;
  setRangePreview(preview: { x: number; y: number; rangeTiles: number } | null): void;
  setSelectedTower(id: number | null): void;
  /** CSS pixels of the container covered by the top HUD bar(s) and the bottom HUD console. */
  setInsets(topCss: number, bottomCss: number): void;
  /** CSS pixels relative to the container. */
  worldToScreen(x: number, y: number, height?: number): { x: number; y: number };
  dispose(): void;
}

export function createRenderer(container: HTMLElement, map: MapDef): Renderer {
  const gl = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  gl.toneMapping = THREE.NoToneMapping;
  gl.shadowMap.enabled = true; // bakes only (soft PCF): the runtime scene has no lights
  gl.shadowMap.type = THREE.PCFShadowMap;
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
  const insetCss = { top: 0, bottom: 0 };
  let grid = viewGrid(1, 1);
  function resize(): void {
    gl.setPixelRatio(window.devicePixelRatio);
    gl.setSize(container.clientWidth, container.clientHeight, false);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    gl.getDrawingBufferSize(size);
    grid = viewGrid(size.x, size.y);
    rig.setTargetSize(grid.w, grid.h);
    const k = grid.h / Math.max(1, container.clientHeight);
    rig.setInsets(insetCss.top * k, insetCss.bottom * k);
  }
  resize();

  // --- load-time bakes, both at the screen's density and lit by the map's sun + hemi light ----------------------------
  // Unit sprites: HD models (all tower levels + this map's enemies). Terrain: the HD map scene, pre-rendered once at the
  // screen's px/unit at the default zoom (texels 1:1 there; the camera's texel-snapped pan keeps them aligned).
  const t0 = performance.now();
  const ppu = THREE.MathUtils.clamp(Math.round(grid.scale * DEFAULT_PPU), 96, 128);
  const lights = { dir: SUN_DIR, sunColor: p.keyLight, sunI: SUN_I, sky: p.hemiSky, ground: p.hemiGround, hemiI: HEMI_I };
  const mats = makeMaterials(gl); // shared by both bakes
  const entries = [
    ...TOWER_LIST.flatMap((t) => ([1, 2, 3] as const).map((lv) => towerEntry(t.id, lv))),
    ...mapEnemies(map).map(enemyEntry),
  ];
  const atlas = bakeAtlas(gl, entries, mats, lights, ppu);
  const atlasMs = Math.round(performance.now() - t0);
  // ponytail: capped at 180 px/unit (4K stays 1:1, ~50 MB); bigger screens magnify it slightly, as the sprites (cap 128)
  const terrain = createMapTerrain(gl, map, mats, lights, Math.min(180, grid.scale * DEFAULT_PPU));
  scene.add(terrain.group);
  for (const m of Object.values(mats)) {
    for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
    m.dispose();
  }
  const bake = { ms: atlasMs, mb: +(atlas.bytes / 1048576).toFixed(1), size: atlas.size, ppu, terrain: terrain.stats };
  gl.autoClear = false; // the world pass clears via scene.background; sprites and overlay composite over it

  const units = createUnits(scene, interp, atlas, terrain.topAt);
  const spriteScene = new THREE.Scene().add(units.sprites);
  // The rig sizes its camera for the whole view grid; the canvas shows only the grid's crop: draw with a cropped copy.
  const viewCam = new THREE.OrthographicCamera();
  const syncViewCam = (): void => {
    const { left, right, top, bottom, near, far } = camera;
    Object.assign(viewCam, { left, bottom, near, far, right: left + (right - left) * grid.cropX, top: bottom + (top - bottom) * grid.cropY });
    viewCam.updateProjectionMatrix();
    viewCam.position.copy(camera.position);
    viewCam.quaternion.copy(camera.quaternion);
    viewCam.updateMatrixWorld();
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
      if (sel) selection.position.set(sel.x, sel.y + 0.02, sel.z);
      if (hover.visible) hoverMat.opacity = 0.28 + Math.sin(clock * 6) * 0.08;

      gl.info.reset();
      syncViewCam();
      gl.setRenderTarget(null);
      gl.render(scene, viewCam); // world: clears to the void colour, terrain quad + occluder depth, decals, overlays
      gl.render(spriteScene, viewCam);
      // the unit sprites' silhouettes go into the depth too, so a shot or blast behind a tower/enemy hides behind it
      spriteScene.overrideMaterial = units.spriteDepth;
      gl.render(spriteScene, viewCam);
      spriteScene.overrideMaterial = null;
      viewCam.layers.set(OVERLAY_LAYER);
      scene.background = null;
      gl.render(scene, viewCam);
      scene.background = bg;
      viewCam.layers.set(0);
    },
    pickTile(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      // Canvas shows only the grid's crop, so map CSS px -> grid UV -> NDC of the uncropped camera.
      const u = ((clientX - r.left) / r.width) * grid.cropX;
      const vv = (1 - (clientY - r.top) / r.height) * grid.cropY;
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
      hover.position.set(tile.col + 0.5, terrain.topAt(tile.col, tile.row) + 0.04, tile.row + 0.5); // clears ground bumps
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
    setInsets(topCss, bottomCss) {
      Object.assign(insetCss, { top: topCss, bottom: bottomCss });
      resize();
    },
    worldToScreen(x, y, height = 0) {
      v.set(x, height, y).project(camera);
      const r = canvas.getBoundingClientRect();
      return {
        x: (((v.x + 1) / 2) / grid.cropX) * r.width,
        y: (1 - (v.y + 1) / 2 / grid.cropY) * r.height,
      };
    },
    dispose() {
      ro.disconnect();
      rig.dispose();
      units.dispose();
      atlas.dispose();
      terrain.dispose();
      [hoverGeo, hoverEdgeGeo, ringGeo, discGeo, selGeo, hoverMat, hoverEdgeMat, ringMat, discMat, selMat].forEach((d) => d.dispose());
      gl.dispose();
      gl.forceContextLoss(); // free the context now; browsers cap live WebGL contexts (~16)
      canvas.remove();
    },
  };
}
