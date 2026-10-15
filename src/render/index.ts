// Renderer entry: owns the WebGL context, scene, lights, pixel pass and interaction overlays.
import * as THREE from 'three';
import type { MapDef } from '../data/types';
import type { GameState } from '../sim/types';
import { createCameraRig } from './camera';
import { createPixelPass } from './pixel';
import { createTerrain } from './terrain';
import { createUnits } from './units';

export interface Renderer {
  /** Exposed so the FX module can add objects. */
  readonly scene: THREE.Scene;
  readonly camera: THREE.OrthographicCamera;
  /** Per-frame stats (calls include the shadow pass and blit). */
  readonly info: THREE.WebGLInfo;
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
  scene.background = new THREE.Color(p.void);
  const rig = createCameraRig(canvas, map.cols, map.rows);
  const camera = rig.camera;
  const pixel = createPixelPass();

  // Lighting: hard key from screen upper-left (shadows fall down-right) + biome hemisphere fill.
  const cx = map.cols / 2;
  const cz = map.rows / 2;
  const sun = new THREE.DirectionalLight(p.keyLight, 3.2);
  sun.position.set(cx - 6, 14, cz - 5);
  sun.target.position.set(cx, 0, cz);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  const ext = Math.max(map.cols, map.rows) / 2 + 3;
  Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 40 });
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target, new THREE.HemisphereLight(p.hemiSky, p.hemiGround, 2.0));

  const terrain = createTerrain(map);
  scene.add(terrain.group);
  const units = createUnits(scene);

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
  function resize(): void {
    gl.setPixelRatio(window.devicePixelRatio);
    gl.setSize(container.clientWidth, container.clientHeight, false);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    gl.getDrawingBufferSize(size);
    const { w, h } = pixel.resize(size.x, size.y);
    rig.setTargetSize(w, h);
    rig.setBottomInset((insetCss * h) / Math.max(1, container.clientHeight));
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  let clock = 0;
  const occupied = new Set<string>();
  const ndc = new THREE.Vector2();
  const ray = new THREE.Raycaster();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  const v = new THREE.Vector3();

  return {
    scene,
    camera,
    info: gl.info,
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
      gl.setRenderTarget(pixel.target);
      gl.render(scene, camera);
      pixel.blit(gl);
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
      terrain.dispose();
      pixel.dispose();
      [hoverGeo, hoverEdgeGeo, ringGeo, discGeo, selGeo, hoverMat, hoverEdgeMat, ringMat, discMat, selMat].forEach((d) => d.dispose());
      gl.dispose();
      gl.forceContextLoss(); // free the context now; browsers cap live WebGL contexts (~16)
      canvas.remove();
    },
  };
}
