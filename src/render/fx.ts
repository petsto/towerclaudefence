// Transient VFX driven by SimEvents + live projectiles, plus the command powers drawn from state (tremor fields, Lance
// reticle + beam; mine LEDs). Everything is pooled with fixed caps and drawn in 16 batched draw calls (2 Points, 1 fat
// LineSegments2, 13 InstancedMesh). No allocation per event.
// World: 1 unit = 1 tile, +Y up, sim (x, y) -> world (x, ?, y).
import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { ENEMIES, POWERS } from '../data';
import type { DamageType, EnemyId, MapDef, TowerId } from '../data/types';
import type { GameState, SimEvent } from '../sim/types';
import { bounds, enemyBuilt, MINE_LED, TOWER_YAW, towerBuilt, towerFrame } from './hd';
import type { Interp } from './interp';
import { OVERLAY_LAYER } from './view';
import { PAD_Y, PATH_Y } from './hd/terrain/build';

export interface Fx {
  handle(events: readonly SimEvent[], state: GameState): void;
  update(dt: number): void;
  dispose(): void;
}

const C = (hex: number) => new THREE.Color(hex);
const COL = {
  white: C(0xffffff),
  black: C(0x000000),
  amber: C(0xffb030),
  yellow: C(0xffe070),
  orange: C(0xff7a20),
  red: C(0xff2a1a),
  darkRed: C(0x601008),
  cyan: C(0x60f0ff),
  ice: C(0xc8f8ff),
  blue: C(0x3a7cff),
  shield: C(0x8ad0ff),
  violet: C(0xb060ff),
  magenta: C(0xe05ab8),
  teal: C(0x38e0d0),
  dust: C(0x9a8a70),
  smoke: C(0x5a5650),
  dirt: C(0x4a3a2a),
  chorusBody: C(0x5e3a7a),
  chorusPlate: C(0xc8962e),
  chorusDark: C(0x2e1a3d),
  steel: C(0x2e3238),
  gunmetal: C(0x4a5058),
  rust: C(0x8a4a2a),
  hazard: C(0xd8a820),
  sparkHot: C(0xffd060),
};
const DAMAGE_COLOR: Readonly<Record<DamageType, THREE.Color>> = {
  normal: COL.yellow,
  concussive: COL.cyan,
  explosive: COL.orange,
  plasma: COL.violet,
};
// FX anchor points come from the unit models themselves (same Built the sprite atlas bakes), so they follow
// whatever size the HD models end up.
const muzzles = new Map<string, { h: number; fwd: number }>();
/** Turret's forward-most (+X) geometry = barrel tips, at yaw 0; arc_coil discharges from its crown. */
function muzzleOf(id: TowerId, level: 1 | 2 | 3): { h: number; fwd: number } {
  const key = `${id}:${level}`;
  let m = muzzles.get(key);
  if (m) return m;
  const b = towerBuilt(id, level);
  let fwd = 0, h = 0;
  if (id === 'arc_coil') h = bounds([b]).h;
  else {
    const tur = b.parts.filter((p) => p.turret).map((p) => p.geo.attributes.position!);
    for (const a of tur) for (let i = 0; i < a.count; i++) fwd = Math.max(fwd, a.getX(i));
    let sum = 0, n = 0;
    for (const a of tur) for (let i = 0; i < a.count; i++) if (a.getX(i) > fwd - 0.03) (sum += a.getY(i)), n++;
    h = b.pivot + (n ? sum / n : 0);
  }
  muzzles.set(key, (m = { h: PAD_Y + h, fwd }));
  return m;
}
const enemyDims = new Map<EnemyId, { r: number; h: number }>();
const dims = (id: EnemyId): { r: number; h: number } => {
  let d = enemyDims.get(id);
  if (!d) enemyDims.set(id, (d = bounds([enemyBuilt(id, 0)])));
  return d;
};
/** Where shots hit / deaths burst: ~60% up the model (flyers build their body high, so this follows them). */
function enemyHeight(defId: EnemyId | undefined): number {
  return defId ? PATH_Y + dims(defId).h * 0.6 : 0.3;
}
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const BEAM_H = 16; // Lance column height (world units): runs off the top of the view
const RAIL_CHARGE = 0.6; // s before an L3 railgun shot that its muzzle starts gathering charge
/** L3 rail beam as parallel fat lines (one line is ~3 px): [lateral, vertical offset, colour, life, jitter]. */
const RAIL3_LINES: readonly (readonly [number, number, THREE.Color, number, number])[] = [
  [0, 0, COL.white, 0.38, 0], [0, 0.012, COL.white, 0.32, 0], [0, -0.012, COL.white, 0.32, 0], // white-hot core
  [0.022, 0.02, COL.blue, 0.45, 0.015], [-0.022, -0.02, COL.blue, 0.45, 0.015], // crackling sheath
  [0.022, -0.02, COL.shield, 0.4, 0.015], [-0.022, 0.02, COL.shield, 0.4, 0.015],
  [0.045, 0, COL.violet, 0.28, 0.03], [-0.045, 0, COL.violet, 0.28, 0.03], // outer halo
];
const SCORCH_FADE = 10; // s the scorch takes to fade once the beam is gone

// ---------------------------------------------------------------- particles (Points, 1 draw each)

interface Particle {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  c0: THREE.Color; c1: THREE.Color; s0: number; s1: number;
  life: number; max: number; grav: number; drag: number;
}

const POINT_VS = /* glsl */ `
attribute vec4 aColor;
attribute float aSize;
uniform float uHalfH;
varying vec4 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float persp = projectionMatrix[2][3] == 0.0 ? 1.0 : -mv.z; // ortho: no attenuation
  gl_PointSize = aSize * projectionMatrix[1][1] * uHalfH / persp;
  vColor = aColor;
}`;
const POINT_FS = /* glsl */ `
uniform float uStar;
varying vec4 vColor;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float core = 1.0 - smoothstep(0.25, 1.0, length(p));
  float star = max(
    clamp(1.0 - abs(p.x) * 6.0, 0.0, 1.0) * (1.0 - abs(p.y)),
    clamp(1.0 - abs(p.y) * 6.0, 0.0, 1.0) * (1.0 - abs(p.x)));
  float a = max(core, star * uStar);
  if (a < 0.08) discard;
  gl_FragColor = vec4(vColor.rgb, vColor.a * a);
  #include <colorspace_fragment>
}`;

function particleSystem(cap: number, additive: boolean) {
  const pool: Particle[] = Array.from({ length: cap }, () => ({
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, c0: new THREE.Color(), c1: new THREE.Color(),
    s0: 0, s1: 0, life: 0, max: 1, grav: 0, drag: 0,
  }));
  const pos = new Float32Array(cap * 3);
  const col = new Float32Array(cap * 4);
  const size = new Float32Array(cap);
  const geo = new THREE.BufferGeometry();
  const posA = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const colA = new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage);
  const sizeA = new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posA).setAttribute('aColor', colA).setAttribute('aSize', sizeA);
  const uHalfH = { value: 180 };
  const mat = new THREE.ShaderMaterial({
    uniforms: { uHalfH, uStar: { value: additive ? 1 : 0 } },
    vertexShader: POINT_VS,
    fragmentShader: POINT_FS,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = additive ? 12 : 11;
  const v2 = new THREE.Vector2();
  points.onBeforeRender = (renderer) => {
    const rt = renderer.getRenderTarget();
    uHalfH.value = (rt ? rt.height : renderer.getDrawingBufferSize(v2).y) / 2;
  };
  let next = 0;
  let alive = 0;

  function spawn(
    x: number, y: number, z: number, vx: number, vy: number, vz: number,
    c0: THREE.Color, c1: THREE.Color, s: number, endScale: number, life: number, grav = 0, drag = 1.5,
  ): void {
    const p = pool[next]!;
    next = (next + 1) % cap;
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz;
    p.c0.copy(c0); p.c1.copy(c1); p.s0 = s; p.s1 = s * endScale;
    p.life = p.max = life * rand(0.75, 1.25); p.grav = grav; p.drag = drag;
    alive = cap;
  }

  /** Random-direction burst; upBias lifts the hemisphere (1 = mostly up). */
  function burst(
    n: number, x: number, y: number, z: number, speed: number, c0: THREE.Color, c1: THREE.Color,
    s: number, life: number, grav = 6, upBias = 0.5, endScale = 0.3,
  ): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const u = rand(-1 + upBias * 1.5, 1);
      const r = Math.sqrt(Math.max(0, 1 - u * u));
      const sp = speed * rand(0.4, 1);
      spawn(x, y, z, Math.cos(a) * r * sp, u * sp, Math.sin(a) * r * sp, c0, c1, s * rand(0.7, 1.3), endScale, life, grav);
    }
  }

  function update(dt: number): void {
    if (alive === 0) return;
    let n = 0;
    for (let i = 0; i < cap; i++) {
      const p = pool[i]!;
      if (p.life <= 0) {
        size[i] = 0;
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) {
        size[i] = 0;
        continue;
      }
      n++;
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k; p.vz *= k; p.vy = p.vy * k - p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.02) { p.y = 0.02; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      const t = 1 - p.life / p.max;
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      col[i * 4] = p.c0.r + (p.c1.r - p.c0.r) * t;
      col[i * 4 + 1] = p.c0.g + (p.c1.g - p.c0.g) * t;
      col[i * 4 + 2] = p.c0.b + (p.c1.b - p.c0.b) * t;
      col[i * 4 + 3] = 1 - t * t;
      size[i] = p.s0 + (p.s1 - p.s0) * t;
    }
    alive = n;
    posA.needsUpdate = colA.needsUpdate = sizeA.needsUpdate = true;
  }
  return { object: points, spawn, burst, update };
}

// ---------------------------------------------------------------- tumbling chunks (InstancedMesh)

interface Chunk {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  rot: THREE.Euler; wx: number; wy: number; wz: number; s: number; life: number; max: number;
}
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function chunkSystem(cap: number, geo: THREE.BufferGeometry, additive: boolean) {
  const mat = new THREE.MeshBasicMaterial(
    additive ? { blending: THREE.AdditiveBlending, transparent: true, depthWrite: false } : {},
  );
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < cap; i++) { mesh.setMatrixAt(i, ZERO); mesh.setColorAt(i, COL.white); }
  const pool: Chunk[] = Array.from({ length: cap }, () => ({
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rot: new THREE.Euler(), wx: 0, wy: 0, wz: 0, s: 0, life: 0, max: 1,
  }));
  let next = 0;
  let alive = 0;

  function spawn(x: number, y: number, z: number, speed: number, s: number, color: THREE.Color, life: number): void {
    const i = next;
    const c = pool[i]!;
    next = (next + 1) % cap;
    const a = Math.random() * Math.PI * 2;
    const sp = speed * rand(0.5, 1);
    c.x = x; c.y = y; c.z = z;
    c.vx = Math.cos(a) * sp; c.vz = Math.sin(a) * sp; c.vy = rand(1.2, 2.6) * Math.max(1, speed * 0.6);
    c.rot.set(rand(0, 6), rand(0, 6), rand(0, 6));
    c.wx = rand(-14, 14); c.wy = rand(-14, 14); c.wz = rand(-14, 14);
    c.s = s * rand(0.7, 1.3); c.life = c.max = life * rand(0.8, 1.2);
    mesh.setColorAt(i, color);
    mesh.instanceColor!.needsUpdate = true;
    alive = cap;
  }

  function update(dt: number): void {
    if (alive === 0) return;
    let n = 0;
    for (let i = 0; i < cap; i++) {
      const c = pool[i]!;
      if (c.life <= 0) continue;
      c.life -= dt;
      if (c.life <= 0) { mesh.setMatrixAt(i, ZERO); continue; }
      n++;
      const floor = c.s * 0.5;
      if (c.y > floor || c.vy > 0) {
        c.vy -= 9 * dt;
        c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
        c.rot.x += c.wx * dt; c.rot.y += c.wy * dt; c.rot.z += c.wz * dt;
        if (c.y < floor) {
          c.y = floor; c.vy = Math.abs(c.vy) > 1.2 ? -c.vy * 0.35 : 0;
          c.vx *= 0.5; c.vz *= 0.5; c.wx *= 0.4; c.wy *= 0.4; c.wz *= 0.4;
        }
      }
      const shrink = Math.min(1, c.life / Math.min(1, c.max * 0.4));
      _q.setFromEuler(c.rot);
      _m.compose(_p.set(c.x, c.y, c.z), _q, _s.setScalar(c.s * shrink));
      mesh.setMatrixAt(i, _m);
    }
    alive = n;
    mesh.instanceMatrix.needsUpdate = true;
  }
  return { object: mesh, spawn, update };
}

// ---------------------------------------------------------------- expanding pulses (spheres / ground rings)

interface Pulse {
  x: number; y: number; z: number; r0: number; r1: number; life: number; max: number;
  c0: THREE.Color; c1: THREE.Color; c2: THREE.Color; delay: number;
}

function pulseSystem(cap: number, geo: THREE.BufferGeometry) {
  const mat = new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < cap; i++) { mesh.setMatrixAt(i, ZERO); mesh.setColorAt(i, COL.black); }
  const pool: Pulse[] = Array.from({ length: cap }, () => ({
    x: 0, y: 0, z: 0, r0: 0, r1: 0, life: 0, max: 1, c0: new THREE.Color(), c1: new THREE.Color(), c2: new THREE.Color(), delay: 0,
  }));
  let next = 0;
  let alive = 0;

  function spawn(
    x: number, y: number, z: number, r0: number, r1: number, life: number,
    c0: THREE.Color, c1: THREE.Color, c2: THREE.Color = c1, delay = 0,
  ): void {
    const p = pool[next]!;
    next = (next + 1) % cap;
    p.x = x; p.y = y; p.z = z; p.r0 = r0; p.r1 = r1; p.life = p.max = life; p.delay = delay;
    p.c0.copy(c0); p.c1.copy(c1); p.c2.copy(c2);
    alive = cap;
  }

  function update(dt: number): void {
    if (alive === 0) return;
    let n = 0;
    for (let i = 0; i < cap; i++) {
      const p = pool[i]!;
      if (p.life <= 0) continue;
      n++;
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.life -= dt;
      if (p.life <= 0) { mesh.setMatrixAt(i, ZERO); continue; }
      const t = 1 - p.life / p.max;
      const e = 1 - (1 - t) ** 3;
      _m.compose(_p.set(p.x, p.y, p.z), _q.identity(), _s.setScalar(p.r0 + (p.r1 - p.r0) * e));
      mesh.setMatrixAt(i, _m);
      if (t < 0.5) _c.copy(p.c0).lerp(p.c1, t * 2);
      else _c.copy(p.c1).lerp(p.c2, t * 2 - 1);
      mesh.setColorAt(i, _c.multiplyScalar(1 - t * t));
    }
    alive = n;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor!.needsUpdate = true;
  }
  return { object: mesh, spawn, update };
}

// ---------------------------------------------------------------- bolts (tracers, beams, rails, lightning)

const BOLT_PTS = 10;
interface Bolt {
  n: number; pts: Float32Array; ca: THREE.Color; cb: THREE.Color | null;
  life: number; max: number; jitter: number; sub: number; flicker: boolean;
}

function boltSystem(cap: number, maxVerts: number) {
  const pos = new Float32Array(maxVerts * 3);
  const col = new Float32Array(maxVerts * 3);
  // Screen-space fat lines (native resolution would make GL lines 1 px hairlines): the geometry wraps pos/col as
  // per-segment instance buffers (xyz xyz / rgb rgb), so filling them in place is enough.
  const geo = new LineSegmentsGeometry().setPositions(pos).setColors(col);
  const posB = (geo.attributes.instanceStart as THREE.InterleavedBufferAttribute).data;
  const colB = (geo.attributes.instanceColorStart as THREE.InterleavedBufferAttribute).data;
  posB.setUsage(THREE.DynamicDrawUsage);
  colB.setUsage(THREE.DynamicDrawUsage);
  geo.instanceCount = 0;
  const mat = new LineMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
  const lines = new LineSegments2(geo, mat);
  lines.onBeforeRender = (renderer) => {
    LineSegments2.prototype.onBeforeRender.call(lines, renderer); // resolution = viewport (CSS px)
    mat.linewidth = Math.max(1, mat.resolution.y / 480); // ~3 physical px at 1440p, at any DPR
  };
  lines.frustumCulled = false;
  lines.renderOrder = 13;
  const pool: Bolt[] = Array.from({ length: cap }, () => ({
    n: 0, pts: new Float32Array(BOLT_PTS * 3), ca: new THREE.Color(), cb: null, life: 0, max: 1, jitter: 0, sub: 1, flicker: false,
  }));
  const cbStore = pool.map(() => new THREE.Color());
  let next = 0;
  let v = 0;

  /** Starts a bolt; caller appends points with `point()`. */
  function start(ca: THREE.Color, cb: THREE.Color | null, life: number, jitter = 0, sub = 1, flicker = false): Bolt {
    const i = next;
    const b = pool[i]!;
    next = (next + 1) % cap;
    b.n = 0; b.ca.copy(ca); b.cb = cb ? cbStore[i]!.copy(cb) : null;
    b.life = b.max = life; b.jitter = jitter; b.sub = sub; b.flicker = flicker;
    return b;
  }
  function point(b: Bolt, x: number, y: number, z: number): void {
    if (b.n >= BOLT_PTS) return;
    b.pts[b.n * 3] = x; b.pts[b.n * 3 + 1] = y; b.pts[b.n * 3 + 2] = z;
    b.n++;
  }

  let px = 0, py = 0, pz = 0;
  function vert(x: number, y: number, z: number, c: THREE.Color, k: number): void {
    pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
    col[v * 3] = c.r * k; col[v * 3 + 1] = c.g * k; col[v * 3 + 2] = c.b * k;
    v++;
  }
  function polyline(b: Bolt, c: THREE.Color, k: number, dy: number): void {
    for (let s = 0; s + 1 < b.n; s++) {
      const ax = b.pts[s * 3]!, ay = b.pts[s * 3 + 1]! + dy, az = b.pts[s * 3 + 2]!;
      const bx = b.pts[s * 3 + 3]!, by = b.pts[s * 3 + 4]! + dy, bz = b.pts[s * 3 + 5]!;
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const nx = -(bz - az) / len, nz = (bx - ax) / len;
      px = ax; py = ay; pz = az;
      for (let j = 1; j <= b.sub; j++) {
        if (v + 2 > maxVerts) return;
        const t = j / b.sub;
        let x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
        if (j < b.sub && b.jitter > 0) {
          const o = rand(-b.jitter, b.jitter);
          x += nx * o; z += nz * o; y += rand(-b.jitter, b.jitter) * 0.6;
        }
        vert(px, py, pz, c, k);
        vert(x, y, z, c, k);
        px = x; py = y; pz = z;
      }
    }
  }

  function update(dt: number): void {
    v = 0;
    for (const b of pool) {
      if (b.life <= 0) continue;
      b.life -= dt;
      if (b.life <= 0) continue;
      const t = 1 - b.life / b.max;
      const k = (1 - t) * (b.flicker && Math.random() < 0.3 ? 0.25 : 1);
      polyline(b, b.ca, k, 0);
      if (b.cb) polyline(b, b.cb, k, 0.04);
    }
    geo.instanceCount = v / 2;
    posB.needsUpdate = colB.needsUpdate = true;
  }
  return { object: lines, start, point, update };
}

// ---------------------------------------------------------------- shader decals (command powers)

// One instanced quad per decal, drawn from state each frame. vP = quad position, -1..1; vD = 4 floats per instance.
const DECAL_VS = /* glsl */ `
attribute vec4 aD;
varying vec2 vP;
varying vec4 vD;
void main() {
  vP = uv * 2.0 - 1.0;
  vD = aD;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
/** Tremor field (additive), vD = (age s, alpha): faint tint, rim, and a ripple running out every 0.5 s. */
const FIELD_FS = /* glsl */ `
uniform vec3 uCol;
varying vec2 vP;
varying vec4 vD;
void main() {
  float r = length(vP);
  if (r > 1.0) discard;
  float rim = smoothstep(0.86, 0.95, r) * (1.0 - smoothstep(0.96, 1.0, r));
  float rp = fract(vD.x * 2.0);
  float rip = exp(-pow((r - rp) * 11.0, 2.0)) * (1.0 - 0.6 * rp);
  float a = 0.1 * (1.0 - 0.5 * r) + 0.7 * rim + 0.38 * rip;
  gl_FragColor = vec4(uCol, a * vD.y);
  #include <colorspace_fragment>
}`;
/**
 * Lance reticle (additive; quad = 1.6 × radius), vD = (telegraph progress 0..1, spin, centre blink 0..1, white flash 0..1).
 * Ring + counter-spinning ticks at the radius, triangle corner brackets closing in from 1.55× to the ring.
 */
const RETICLE_FS = /* glsl */ `
uniform vec3 uCol;
varying vec2 vP;
varying vec4 vD;
float line(float d, float w) { return 1.0 - smoothstep(w * 0.5, w, d); }
void main() {
  vec2 q = vP * 1.6;
  float r = length(q);
  float k = vD.x;
  float s = mix(1.55, 1.0, 1.0 - pow(1.0 - k, 3.0));
  float w = 0.04;
  float a = line(abs(r - 1.0), w * 0.8) * (0.35 + 0.35 * k);
  float ang = atan(q.y, q.x) + vD.y;
  a += line(abs(fract(ang / 0.5236 + 0.5) - 0.5) * 0.5236 * r, w * 0.8) * step(abs(r - 1.08), 0.05) * 0.6;
  for (int i = 0; i < 3; i++) {
    float t = -vD.y * 0.6 + 1.5708 + float(i) * 2.0944;
    vec2 n = -vec2(cos(t), sin(t));
    float u = abs(dot(q, vec2(-n.y, n.x))) / (s * 0.866);
    a += line(abs(dot(q, n) - s * 0.5), w * 1.15) * step(0.55, u) * step(u, 1.0);
  }
  a += (1.0 - smoothstep(0.06, 0.09, r)) * vD.z;
  a += (line(abs(q.x), w) * step(abs(q.y), 0.2) + line(abs(q.y), w) * step(abs(q.x), 0.2)) * step(0.12, r) * 0.6;
  a += (1.0 - smoothstep(0.0, 0.5, r)) * vD.w * 0.5;
  gl_FragColor = vec4(mix(uCol, vec3(1.0), vD.w), min(a, 1.0) * (0.75 + 0.25 * vD.w));
  #include <colorspace_fragment>
}`;
/** Lance scorch (normal blend), vD = (age s, alpha, seed): glassy black blot, irregular rim, molten centre while hot. */
const SCORCH_FS = /* glsl */ `
varying vec2 vP;
varying vec4 vD;
void main() {
  float r = length(vP);
  if (r > 1.0) discard;
  float th = atan(vP.y, vP.x);
  float sd = vD.z;
  float edge = 0.8 + 0.08 * sin(th * 5.0 + sd) + 0.05 * sin(th * 11.0 + sd * 2.3) + 0.03 * sin(th * 23.0 + sd * 4.1);
  float a = 0.8 * (1.0 - smoothstep(edge * 0.5, edge, r)) + 0.25 * (1.0 - smoothstep(edge, 1.0, r));
  vec3 col = vec3(0.035, 0.03, 0.04);
  float glint = pow(0.5 + 0.5 * sin(r * 22.0 + sd + sin(th * 5.0 + sd) * 0.5 * r), 14.0) * smoothstep(0.2, 0.4, r) * (1.0 - r);
  col += vec3(0.25, 0.3, 0.42) * glint * 0.4;
  float heat = (1.0 - smoothstep(3.0, 5.5, vD.x)) * (1.0 - smoothstep(0.0, 0.55, r));
  col = mix(col, vec3(1.0, 0.5, 0.18), heat * 0.8);
  gl_FragColor = vec4(col, max(a, heat) * vD.y);
  #include <colorspace_fragment>
}`;
/**
 * Lance column (additive, vertical quad facing the camera: no yaw, so its x is screen x), vD = (intensity, core, time).
 * Steel-blue/violet glow across the full width, white-hot core in the middle third, fading out toward orbit.
 */
const BEAM_FS = /* glsl */ `
uniform vec3 uGlow;
uniform vec3 uRim;
varying vec2 vP;
varying vec4 vD;
void main() {
  float d = abs(vP.x);
  float h = vP.y * 0.5 + 0.5;
  float shimmer = 0.85 + 0.15 * sin(h * 70.0 - vD.z * 45.0);
  float glow = pow(1.0 - d, 2.2);
  float core = 1.0 - smoothstep(0.16, 0.34, d);
  vec3 col = mix(uRim, uGlow, 1.0 - d) * glow * 0.4 + vec3(core * vD.y * 0.85);
  float base = smoothstep(0.0, 0.012, h); // soft foot: the ground glow decal carries the contact
  gl_FragColor = vec4(col * vD.x * shimmer * base * (1.0 - smoothstep(0.35, 1.0, h)), 1.0);
  #include <colorspace_fragment>
}`;

/** Lance ground glow (additive), vD = (intensity): soft steel-blue pool of light at the column's foot. */
const FOOT_FS = /* glsl */ `
uniform vec3 uCol;
varying vec2 vP;
varying vec4 vD;
void main() {
  float r = length(vP);
  if (r > 1.0) discard;
  float a = exp(-r * r * 5.0) * (1.0 - r) + exp(-r * r * 40.0);
  gl_FragColor = vec4(mix(uCol, vec3(1.0), exp(-r * r * 30.0)), a * vD.x);
  #include <colorspace_fragment>
}`;

function decalSystem(cap: number, geo: THREE.BufferGeometry, fs: string, uniforms: Record<string, THREE.IUniform>, blending: THREE.Blending, depthTest = true) {
  const aD = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aD', aD);
  const mat = new THREE.ShaderMaterial({ vertexShader: DECAL_VS, fragmentShader: fs, uniforms, transparent: true, depthWrite: false, depthTest, blending });
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  let n = 0;
  return {
    object: mesh,
    begin(): void { n = 0; },
    /** sx/sy: scale of the unit quad (ground decals: radius, radius). */
    push(x: number, y: number, z: number, sx: number, sy: number, a: number, b = 0, c = 0, d = 0): void {
      if (n >= cap) return;
      mesh.setMatrixAt(n, _m.compose(_p.set(x, y, z), _q.identity(), _s.set(sx, sy, sx)));
      aD.setXYZW(n++, a, b, c, d);
    },
    end(): void {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = aD.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------- geometry helpers

function splatGeometry(): THREE.BufferGeometry {
  // Irregular goo blot, flat on the ground: dark wet centre, body-colour ring, feathered (alpha 0) rim so it soaks into
  // the HD terrain instead of reading as a flat polygon. RGBA vertex colours.
  const sides = 16;
  const dark = COL.chorusDark, body = COL.chorusBody;
  const pos = [0, 0, 0];
  const col = [dark.r, dark.g, dark.b, 0.9];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const r = 0.62 + 0.18 * Math.sin(i * 2.3) * Math.sin(i * 1.7 + 1); // lumpy, deterministic
    pos.push(Math.cos(a) * r, 0, Math.sin(a) * r, Math.cos(a) * (r + 0.35), 0, Math.sin(a) * (r + 0.35));
    col.push(body.r, body.g, body.b, 0.8, body.r, body.g, body.b, 0);
  }
  const idx: number[] = [];
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    const a = 1 + i * 2, b = 1 + j * 2; // inner ring vertex; +1 = its feathered outer twin
    idx.push(0, b, a, a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  return g;
}

// ---------------------------------------------------------------- Fx

/** `interp` smooths projectile/slow-ring positions between sim steps, matching the units. */
export function createFx(scene: THREE.Scene, interp: Interp, map: MapDef): Fx {
  const glow = particleSystem(2048, true);
  const dust = particleSystem(512, false);
  const bolts = boltSystem(96, 4096);
  const spheres = pulseSystem(64, new THREE.IcosahedronGeometry(1, 2)); // round at native res (detail 0 reads as a hexagon)
  const rings = pulseSystem(64, new THREE.RingGeometry(0.8, 1, 20).rotateX(-Math.PI / 2));
  const debris = chunkSystem(256, new THREE.BoxGeometry(1, 1, 1), false);
  const gibs = chunkSystem(192, new THREE.TetrahedronGeometry(0.7, 0), false);
  const shards = chunkSystem(128, new THREE.TetrahedronGeometry(0.7, 0).scale(0.4, 1.6, 0.4), true);

  const splatCap = 64;
  const splatMesh = new THREE.InstancedMesh(
    splatGeometry(),
    new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }),
    splatCap,
  );
  splatMesh.frustumCulled = false;
  splatMesh.renderOrder = 1;
  for (let i = 0; i < splatCap; i++) splatMesh.setMatrixAt(i, ZERO);
  const splats = Array.from({ length: splatCap }, () => ({ x: 0, z: 0, r: 0, rot: 0, life: 0, max: 1 }));
  let splatNext = 0;

  const slowCap = 64;
  const slowMesh = new THREE.InstancedMesh(
    new THREE.RingGeometry(0.75, 1, 16).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: COL.cyan, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.7 }),
    slowCap,
  );
  slowMesh.frustumCulled = false;
  slowMesh.count = 0;

  const projCap = 64;
  const shellMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.09, 0), new THREE.MeshBasicMaterial({ color: 0xffd050 }), projCap);
  const missileMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.24, 0.07, 0.07), new THREE.MeshBasicMaterial({ color: 0xe8ecf0 }), projCap);
  for (const m of [shellMesh, missileMesh]) { m.frustumCulled = false; m.count = 0; }

  const delayed = Array.from({ length: 16 }, () => ({ t: 0, x: 0, y: 0, r: 0 }));

  // command powers: tremor fields, Lance reticle, scorch (ground decals) and the Lance column (overlay)
  const flat = (): THREE.BufferGeometry => new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const col3 = (c: THREE.Color): THREE.IUniform => ({ value: c.clone() });
  const fields = decalSystem(32, flat(), FIELD_FS, { uCol: col3(COL.teal) }, THREE.AdditiveBlending);
  const reticles = decalSystem(4, flat(), RETICLE_FS, { uCol: col3(COL.amber) }, THREE.AdditiveBlending, false);
  const scorchFx = decalSystem(4, flat(), SCORCH_FS, {}, THREE.NormalBlending);
  const feet = decalSystem(4, flat(), FOOT_FS, { uCol: col3(COL.shield) }, THREE.AdditiveBlending);
  const beams = decalSystem(4, new THREE.PlaneGeometry(2, 1).translate(0, 0.5, 0), BEAM_FS, { uGlow: col3(COL.shield), uRim: col3(COL.violet) }, THREE.AdditiveBlending);
  fields.object.renderOrder = 2;
  scorchFx.object.renderOrder = 1;
  reticles.object.renderOrder = 3;
  feet.object.renderOrder = 3;
  beams.object.renderOrder = 12;
  const scorches = Array.from({ length: 4 }, () => ({ x: 0, y: 0, z: 0, age: 0, life: 0, seed: 0 }));
  let scorchNext = 0;
  const ripples = new Map<number, number>(); // field id -> last ripple index (dust kick per ripple)
  let ledBeat = -1;

  const objects: THREE.Object3D[] = [
    splatMesh, slowMesh, debris.object, gibs.object, shellMesh, missileMesh,
    dust.object, rings.object, spheres.object, shards.object, glow.object, bolts.object,
    scorchFx.object, fields.object, reticles.object, feet.object, beams.object,
  ];
  scene.add(...objects);
  // airborne FX draw over the unit sprites; ground decals (splats, slow rings, shockwave rings, power decals) stay under them
  const ground: THREE.Object3D[] = [splatMesh, slowMesh, rings.object, scorchFx.object, fields.object, reticles.object, feet.object];
  for (const o of objects) if (!ground.includes(o)) o.layers.set(OVERLAY_LAYER);

  let state: GameState | null = null;
  const end = map.paths[0]!.at(-1)!; // every path ends on the core (data.test.ts)
  const core = { x: end[0] + 0.5, y: end[1] + 0.5 };
  let time = 0;
  /** Surface height of the tile under (x, y): path recess, pad, ground, raised decor (approx.). */
  function topY(x: number, y: number): number {
    const t = map.tiles[Math.floor(y)]?.[Math.floor(x)];
    return t === 'path' || t === 'spawn' || t === 'core' ? PATH_Y : t === 'build' ? PAD_Y : t === 'decor' ? 0.45 : 0;
  }
  /** Flat ground decals sit just above the pads so they show on path, pads and open ground alike. */
  const decalY = (x: number, y: number): number => Math.max(PAD_Y + 0.01, topY(x, y) + 0.01);

  // -------- lookups

  function findEnemy(id: number) {
    if (state) for (const e of state.enemies) if (e.id === id) return e;
    return undefined;
  }
  function findTower(id: number) {
    if (state) for (const t of state.towers) if (t.id === id) return t;
    return undefined;
  }
  const tgt = { x: 0, y: 0, h: 0.35 };
  /** Enemy position: live state, else a hit/death in this batch (it may already be gone). */
  function locate(id: number, events: readonly SimEvent[]): boolean {
    const e = findEnemy(id);
    if (e) { tgt.x = e.x; tgt.y = e.y; tgt.h = enemyHeight(e.defId); return true; }
    for (const ev of events) {
      if ((ev.type === 'hit' || ev.type === 'death' || ev.type === 'shieldBreak') && ev.enemyId === id) {
        tgt.x = ev.x; tgt.y = ev.y; tgt.h = enemyHeight(ev.type === 'death' ? ev.defId : undefined);
        return true;
      }
    }
    return false;
  }
  const mz = { x: 0, y: 0, z: 0 };
  function muzzle(t: { defId: TowerId; level: 1 | 2 | 3; col: number; row: number; rotation: number }): void {
    const m = muzzleOf(t.defId, t.level);
    const yaw = (towerFrame(t.rotation) / TOWER_YAW) * Math.PI * 2; // the turret sprite's baked yaw
    mz.x = t.col + 0.5 + Math.cos(yaw) * m.fwd;
    mz.y = m.h;
    mz.z = t.row + 0.5 + Math.sin(yaw) * m.fwd;
  }

  // -------- composite effects

  function explode(x: number, z: number, radius: number): void {
    spheres.spawn(x, 0.25, z, 0.15, radius * 0.75, 0.32, COL.white, COL.amber, COL.darkRed);
    rings.spawn(x, 0.04, z, 0.2, radius * 1.1, 0.38, COL.yellow, COL.orange, COL.darkRed);
    glow.burst(16, x, 0.3, z, 4.5 * Math.max(0.6, radius), COL.yellow, COL.red, 0.14, 0.45, 7, 0.6);
    glow.spawn(x, 0.4, z, 0, 0, 0, COL.white, COL.orange, radius * 1.6, 0.4, 0.12);
    dust.burst(6, x, 0.25, z, 1.2, COL.smoke, COL.smoke, 0.35, 0.9, -0.6, 0.8, 2.2);
    for (let i = 0; i < 6; i++) debris.spawn(x, 0.2, z, 2.2, 0.06, i % 2 ? COL.dirt : COL.smoke, 1.2);
  }

  /** Longshot L3, from the muzzle (`mz`) to (tx, ty, tz): thick white-hot beam in a crackling cyan sheath, a double
   *  helix of charge that unwinds and drifts apart, a lingering ionised trail, muzzle flash and impact flare. */
  function rail3(tx: number, ty: number, tz: number): void {
    const dx = tx - mz.x, dy = ty - mz.y, dz = tz - mz.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const hl = Math.hypot(dx, dz) || 1;
    const nx = -dz / hl, nz = dx / hl; // horizontal normal; +Y is the other axis (the beam is near-horizontal)
    for (const [lat, up, c, life, jitter] of RAIL3_LINES) {
      const b = bolts.start(c, null, life, jitter, jitter ? 8 : 1, jitter > 0);
      bolts.point(b, mz.x + nx * lat, mz.y + up, mz.z + nz * lat);
      bolts.point(b, tx + nx * lat, ty + up, tz + nz * lat);
    }
    // double helix: 2.2 turns per tile, radius 0.11, each mote drifting outward so the coil loosens as it fades
    const n = Math.min(64, Math.ceil(len * 8));
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const x = mz.x + dx * k, y = mz.y + dy * k, z = mz.z + dz * k;
      for (let s = 0; s < 2; s++) {
        const a = k * len * 2.2 * Math.PI * 2 + s * Math.PI;
        const ca = Math.cos(a), sa = Math.sin(a);
        glow.spawn(x + nx * ca * 0.11, y + sa * 0.11, z + nz * ca * 0.11, nx * ca * 0.25, sa * 0.25, nz * ca * 0.25,
          s ? COL.cyan : COL.ice, COL.blue, 0.08, 0.5, 0.5, 0, 2.5);
      }
      // ionised trail: slow-rising violet motes that hang in the air after the beam is gone
      if (i % 2 === 0) glow.spawn(x, y, z, rand(-0.15, 0.15), rand(0.15, 0.4), rand(-0.15, 0.15), COL.ice, COL.violet, 0.09, 0.6, 1.1, 0, 1);
    }
    // muzzle: flash, accelerator pulse, recoil smoke
    glow.spawn(mz.x, mz.y, mz.z, 0, 0, 0, COL.white, COL.cyan, 1.3, 0.3, 0.12, 0, 0);
    spheres.spawn(mz.x, mz.y, mz.z, 0.05, 0.24, 0.16, COL.white, COL.ice, COL.blue);
    dust.burst(5, mz.x, mz.y, mz.z, 0.8, COL.smoke, COL.smoke, 0.22, 0.8, -0.5, 0.9, 2);
    // impact: flare, ground shock ring, hot sparks and shards
    glow.spawn(tx, ty, tz, 0, 0, 0, COL.white, COL.shield, 1.0, 0.4, 0.14, 0, 0);
    spheres.spawn(tx, ty, tz, 0.08, 0.4, 0.2, COL.white, COL.ice, COL.blue);
    rings.spawn(tx, decalY(tx, tz), tz, 0.15, 0.75, 0.35, COL.shield, COL.blue, COL.black);
    glow.burst(18, tx, ty, tz, 5, COL.white, COL.sparkHot, 0.08, 0.35, 8, 0.5);
    for (let i = 0; i < 6; i++) shards.spawn(tx, ty, tz, 2.6, 0.07, i % 2 ? COL.ice : COL.blue, 0.5);
  }

  /** L3 railguns about to fire gather charge: motes stream into the muzzle and its glow swells over RAIL_CHARGE s. */
  function railCharge(dt: number): void {
    if (!state || dt <= 0) return;
    for (const t of state.towers) {
      if (t.defId !== 'longshot' || t.level !== 3 || t.targetId === null || t.cooldown > RAIL_CHARGE) continue;
      const k = 1 - t.cooldown / RAIL_CHARGE;
      muzzle(t);
      glow.spawn(mz.x, mz.y, mz.z, 0, 0, 0, COL.white, COL.cyan, 0.2 + 0.55 * k * k, 0.8, 0.06, 0, 0);
      if (Math.random() < dt * 40 * k) {
        const ox = rand(-0.35, 0.35), oy = rand(-0.2, 0.3), oz = rand(-0.35, 0.35);
        glow.spawn(mz.x + ox, mz.y + oy, mz.z + oz, -ox / 0.22, -oy / 0.22, -oz / 0.22, COL.ice, COL.white, 0.06, 0.3, 0.22, 0, 0);
      }
    }
  }

  function shot(ev: Extract<SimEvent, { type: 'shot' }>, events: readonly SimEvent[]): void {
    const t = findTower(ev.towerId);
    if (!t) return;
    muzzle(t);
    const hasTarget = locate(ev.targetId, events);
    const tx = hasTarget ? tgt.x : mz.x + Math.cos(t.rotation) * 3;
    const ty = hasTarget ? tgt.h : 0.3;
    const tz = hasTarget ? tgt.y : mz.z + Math.sin(t.rotation) * 3;
    switch (t.defId) {
      case 'picket': {
        glow.spawn(mz.x, mz.y, mz.z, 0, 0, 0, COL.white, COL.amber, 0.55, 0.4, 0.06, 0, 0);
        const b = bolts.start(COL.yellow, null, 0.08);
        const off = rand(-0.06, 0.06);
        bolts.point(b, mz.x, mz.y, mz.z);
        bolts.point(b, tx + off, ty + off, tz - off);
        glow.spawn(mz.x, mz.y, mz.z, rand(-1, 1), 1.5, rand(-1, 1), COL.amber, COL.amber, 0.05, 1, 0.3, 8); // casing
        break;
      }
      case 'thumper':
        glow.spawn(mz.x, mz.y, mz.z, 0, 0, 0, COL.white, COL.orange, 0.9, 0.5, 0.09, 0, 0);
        dust.burst(5, mz.x, mz.y, mz.z, 0.8, COL.smoke, COL.smoke, 0.25, 0.8, -0.8, 0.9, 2.5);
        break;
      case 'stasis': {
        glow.spawn(mz.x, mz.y, mz.z, 0, 0, 0, COL.ice, COL.cyan, 0.45, 0.6, 0.12, 0, 0);
        const b = bolts.start(COL.cyan, COL.ice, 0.22, 0.05, 8);
        bolts.point(b, mz.x, mz.y, mz.z);
        bolts.point(b, tx, ty, tz);
        rings.spawn(tx, 0.05, tz, 0.15, 0.65, 0.4, COL.ice, COL.cyan, COL.blue);
        glow.burst(5, tx, ty, tz, 1, COL.ice, COL.cyan, 0.08, 0.5, -1, 0.5);
        break;
      }
      case 'longshot': {
        if (t.level === 3) { rail3(tx, ty, tz); break; }
        glow.spawn(mz.x, mz.y, mz.z, 0, 0, 0, COL.white, COL.shield, 1.3, 0.3, 0.1, 0, 0);
        const b = bolts.start(COL.white, COL.blue, 0.32);
        bolts.point(b, mz.x, mz.y, mz.z);
        bolts.point(b, tx, ty, tz);
        for (let i = 0; i < 14; i++) {
          const k = i / 13;
          glow.spawn(mz.x + (tx - mz.x) * k, mz.y + (ty - mz.y) * k, mz.z + (tz - mz.z) * k,
            rand(-0.3, 0.3), rand(0.2, 0.7), rand(-0.3, 0.3), COL.ice, COL.blue, 0.1, 0.4, 0.5, 0, 1);
        }
        dust.burst(3, mz.x, mz.y, mz.z, 0.6, COL.smoke, COL.smoke, 0.2, 0.7, -0.5, 0.9, 2);
        break;
      }
      case 'breacher':
        glow.spawn(mz.x, mz.y, mz.z, 0, 0, 0, COL.yellow, COL.orange, 0.6, 0.5, 0.07, 0, 0);
        dust.burst(4, mz.x, mz.y, mz.z, 0.9, COL.smoke, COL.smoke, 0.22, 0.9, -0.5, 0.6, 2.5);
        break;
      case 'arc_coil':
        glow.spawn(mz.x, mz.y, mz.z, 0, 0, 0, COL.white, COL.violet, 0.7, 0.5, 0.1, 0, 0);
        break;
    }
  }

  function chain(ev: Extract<SimEvent, { type: 'chain' }>): void {
    const b1 = bolts.start(COL.white, COL.violet, 0.16, 0.15, 6, true);
    const b2 = bolts.start(COL.cyan, null, 0.12, 0.2, 6, true);
    const t = findTower(ev.towerId);
    ev.points.forEach((p, i) => {
      const h = i === 0 ? (t ? muzzleOf(t.defId, t.level).h : 0.85) : 0.35;
      bolts.point(b1, p.x, h, p.y);
      bolts.point(b2, p.x, h, p.y);
      if (i > 0) {
        glow.spawn(p.x, h, p.y, 0, 0, 0, COL.white, COL.violet, 0.45, 0.5, 0.12, 0, 0);
        glow.burst(4, p.x, h, p.y, 2, COL.white, COL.violet, 0.07, 0.25, 4);
      }
    });
  }

  function death(ev: Extract<SimEvent, { type: 'death' }>): void {
    const d = ENEMIES[ev.defId];
    const h = enemyHeight(ev.defId);
    const big = d.isBoss ? 2.2 : d.size === 'heavy' ? 1.5 : d.size === 'medium' ? 1 : 0.7;
    if (d.faction === 'chorus') {
      const s = splats[splatNext]!;
      splatNext = (splatNext + 1) % splatCap;
      s.x = ev.x; s.z = ev.y; s.r = 0.32 * big; s.rot = rand(0, 6.3); s.life = s.max = 6;
      const n = Math.round(8 + 4 * big);
      for (let i = 0; i < n; i++) gibs.spawn(ev.x, h, ev.y, 1.6 * big, 0.06 * Math.sqrt(big), i % 3 ? COL.chorusBody : COL.chorusPlate, 1.4);
      glow.burst(Math.round(6 * big), ev.x, h, ev.y, 2.5, COL.magenta, COL.chorusBody, 0.12, 0.6, 6, 0.7);
      dust.burst(Math.round(5 * big), ev.x, h, ev.y, 2, COL.chorusBody, COL.chorusDark, 0.12, 0.6, 7, 0.7, 0.8);
      if (big >= 1.5) glow.burst(10, ev.x, h, ev.y, 3.5, COL.white, COL.magenta, 0.16, 0.7, 5, 0.8);
    } else {
      glow.burst(Math.round(10 + 4 * big), ev.x, h, ev.y, 4.5, COL.sparkHot, COL.red, 0.09, 0.4, 6, 0.6);
      spheres.spawn(ev.x, h, ev.y, 0.1, 0.35 * big, 0.12, COL.white, COL.orange, COL.red);
      const n = Math.round(2 + 2 * big);
      const hull = [COL.gunmetal, COL.steel, COL.rust, COL.hazard] as const;
      for (let i = 0; i < n; i++) debris.spawn(ev.x, h, ev.y, 1.8, 0.09 * Math.sqrt(big), hull[i % 4]!, 4);
      if (d.isBoss) {
        let k = 0;
        for (const q of delayed) {
          if (q.t > 0) continue;
          q.t = 0.15 + k * 0.35; q.x = ev.x + rand(-0.4, 0.4); q.y = ev.y + rand(-0.4, 0.4); q.r = 1.2;
          if (++k === 3) break;
        }
      }
    }
  }

  function handle(events: readonly SimEvent[], s: GameState): void {
    state = s;
    for (const ev of events) {
      switch (ev.type) {
        case 'shot': shot(ev, events); break;
        case 'hit': {
          const c = DAMAGE_COLOR[ev.damageType];
          const h = enemyHeight(findEnemy(ev.enemyId)?.defId);
          const n = Math.min(10, 3 + Math.round(ev.damage / 15));
          glow.burst(n, ev.x, h, ev.y, 3, COL.white, c, 0.07, 0.22, 6, 0.4);
          if (ev.shield > 0) spheres.spawn(ev.x, h, ev.y, 0.32, 0.42, 0.14, COL.shield, COL.blue);
          break;
        }
        case 'explosion': explode(ev.x, ev.y, ev.radius); break;
        case 'chain': chain(ev); break;
        case 'shieldBreak': {
          const h = enemyHeight(findEnemy(ev.enemyId)?.defId);
          spheres.spawn(ev.x, h, ev.y, 0.38, 0.6, 0.25, COL.white, COL.shield, COL.blue);
          for (let i = 0; i < 10; i++) shards.spawn(ev.x, h, ev.y, 2.4, 0.09, i % 2 ? COL.shield : COL.blue, 0.6);
          glow.burst(8, ev.x, h, ev.y, 3, COL.white, COL.shield, 0.08, 0.35, 4);
          break;
        }
        case 'death': death(ev); break;
        case 'build':
          spheres.spawn(ev.col + 0.5, 0.35, ev.row + 0.5, 0.15, 0.6, 0.14, COL.white, COL.teal, COL.blue); // construction flash (short: it draws over the sprite's build pop)
          rings.spawn(ev.col + 0.5, 0.05, ev.row + 0.5, 0.2, 0.75, 0.45, COL.white, COL.teal, COL.blue);
          glow.burst(10, ev.col + 0.5, 0.1, ev.row + 0.5, 1.6, COL.teal, COL.amber, 0.08, 0.6, -1, 1);
          dust.burst(8, ev.col + 0.5, 0.08, ev.row + 0.5, 1.4, COL.dust, COL.dust, 0.2, 0.8, -0.3, 0.2, 2.5);
          break;
        case 'upgrade': {
          const t = findTower(ev.towerId);
          if (!t) break;
          const x = t.col + 0.5, z = t.row + 0.5;
          rings.spawn(x, 0.05, z, 0.25, 0.85, 0.5, COL.white, COL.amber, COL.orange);
          spheres.spawn(x, 0.4, z, 0.2, 0.55, 0.25, COL.white, COL.amber, COL.darkRed);
          glow.burst(ev.level === 3 ? 22 : 14, x, 0.2, z, 2.2, COL.white, COL.amber, 0.09, 0.7, -1.5, 1);
          break;
        }
        case 'sell':
          dust.burst(12, ev.col + 0.5, 0.15, ev.row + 0.5, 1.6, COL.dust, COL.dust, 0.3, 0.9, -0.4, 0.4, 2.5);
          glow.burst(6, ev.col + 0.5, 0.3, ev.row + 0.5, 1.2, COL.yellow, COL.amber, 0.08, 0.6, -1.2, 1);
          for (let i = 0; i < 4; i++) debris.spawn(ev.col + 0.5, 0.3, ev.row + 0.5, 1.2, 0.07, COL.gunmetal, 1.5);
          break;
        case 'spawn': {
          const c = ENEMIES[ev.defId].faction === 'chorus' ? COL.magenta : COL.red;
          rings.spawn(ev.x, 0.04, ev.y, 0.1, 0.5, 0.3, c, c, COL.black);
          break;
        }
        case 'leak':
          spheres.spawn(core.x, 0.4, core.y, 0.3, 1.1, 0.4, COL.white, COL.red, COL.darkRed);
          rings.spawn(core.x, 0.05, core.y, 0.4, 2, 0.55, COL.red, COL.red, COL.darkRed);
          glow.burst(18, core.x, 0.4, core.y, 4, COL.white, COL.red, 0.12, 0.5, 5, 0.6);
          break;
        case 'minePlanted': {
          const y = PATH_Y + 0.03;
          rings.spawn(ev.x, y, ev.y, 0.05, 0.4, 0.3, COL.white, COL.teal, COL.blue);
          dust.burst(5, ev.x, 0.05, ev.y, 0.8, COL.dust, COL.dust, 0.14, 0.6, -0.3, 0.2, 2.5);
          glow.burst(4, ev.x, 0.08, ev.y, 1, COL.amber, COL.orange, 0.05, 0.3, 4, 0.8);
          break;
        }
        case 'mineTriggered': {
          // ground thump out to the field radius, then a dust kick
          const y = decalY(ev.x, ev.y);
          rings.spawn(ev.x, y, ev.y, 0.15, ev.radius, 0.45, COL.white, COL.teal, COL.blue);
          rings.spawn(ev.x, y, ev.y, 0.1, ev.radius * 0.7, 0.4, COL.teal, COL.teal, COL.blue, 0.12);
          glow.spawn(ev.x, 0.15, ev.y, 0, 0, 0, COL.amber, COL.teal, 0.6, 0.4, 0.12, 0, 0);
          dust.burst(14, ev.x, 0.08, ev.y, 2.2, COL.dust, COL.dust, 0.3, 1, -0.4, 0.25, 2.5);
          for (let i = 0; i < 5; i++) debris.spawn(ev.x, 0.05, ev.y, 1.4, 0.05, i % 2 ? COL.dirt : COL.gunmetal, 1);
          break;
        }
        case 'strikePulse': {
          // beam impact: ground flash + shock ring; the first pulse also bursts debris and lays the scorch
          const y = decalY(ev.x, ev.y);
          const first = ev.index === 0;
          rings.spawn(ev.x, y, ev.y, 0.3, ev.radius * (first ? 1.3 : 1), first ? 0.5 : 0.35, first ? COL.ice : COL.shield, COL.shield, COL.blue);
          glow.spawn(ev.x, 0.2, ev.y, 0, 0, 0, COL.ice, COL.violet, first ? 1.4 : 0.9, 0.5, first ? 0.16 : 0.1, 0, 0);
          glow.burst(first ? 24 : 10, ev.x, 0.2, ev.y, first ? 5 : 3.5, COL.white, COL.violet, 0.09, 0.45, 6, 0.6);
          if (first) {
            rings.spawn(ev.x, y, ev.y, 0.2, ev.radius * 1.05, 0.4, COL.shield, COL.blue, COL.black, 0.08);
            dust.burst(16, ev.x, 0.2, ev.y, 2.6, COL.smoke, COL.smoke, 0.35, 1.1, -0.5, 0.5, 2.2);
            for (let i = 0; i < 8; i++) debris.spawn(ev.x, 0.15, ev.y, 2.4, 0.06, i % 2 ? COL.dirt : COL.smoke, 1.4);
            const sc = scorches[scorchNext]!;
            scorchNext = (scorchNext + 1) % scorches.length;
            const p = POWERS.lance_strike;
            Object.assign(sc, { x: ev.x, y, z: ev.y, age: 0, life: p.pulses * p.pulseInterval + SCORCH_FADE, seed: rand(0, 6.3) });
          }
          break;
        }
        case 'strikeTelegraph': // reticle + thread come from state.strikes
        case 'powerReady':
        case 'waveStart':
        case 'waveClear':
        case 'gameOver':
          break; // HUD + audio only
      }
    }
  }

  function updateSlow(): void {
    let n = 0;
    if (state) {
      const pulse = 1 + Math.sin(time * 8) * 0.12;
      for (const e of state.enemies) {
        if (!e.slowed || n >= slowCap) continue;
        const r = (dims(e.defId).r + 0.05) * pulse;
        const at = interp.enemy(e);
        _m.compose(_p.set(at.x, 0.04, at.y), _q.identity(), _s.set(r, 1, r));
        slowMesh.setMatrixAt(n++, _m);
      }
    }
    slowMesh.count = n;
    slowMesh.instanceMatrix.needsUpdate = true;
  }

  const _dir = new THREE.Vector3();
  function updateProjectiles(dt: number): void {
    let ns = 0, nm = 0;
    if (state) {
      for (const p of state.projectiles) {
        const at = interp.projectile(p);
        const px = at.x, py = at.y;
        const total = Math.hypot(p.targetX - p.originX, p.targetY - p.originY) || 1;
        const t = Math.min(1, Math.hypot(px - p.originX, py - p.originY) / total);
        if (p.kind === 'shell' && ns < projCap) {
          const y = 0.6 + (0.3 - 0.6) * t + (0.5 + 0.35 * total) * 4 * t * (1 - t);
          _m.compose(_p.set(px, y, py), _q.identity(), _s.setScalar(1));
          shellMesh.setMatrixAt(ns++, _m);
          if (Math.random() < dt * 30) glow.spawn(px, y, py, 0, 0, 0, COL.amber, COL.red, 0.08, 0.3, 0.25, 0, 0);
        } else if (p.kind === 'missile' && nm < projCap) {
          const y = 0.55 + (0.35 - 0.55) * t + 0.3 * 4 * t * (1 - t);
          _dir.set(p.targetX - px, 0, p.targetY - py);
          const yaw = Math.atan2(-_dir.z, _dir.x);
          _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
          _m.compose(_p.set(px, y, py), _q, _s.setScalar(1));
          missileMesh.setMatrixAt(nm++, _m);
          const bx = px - Math.cos(-yaw) * 0.14, bz = py - Math.sin(-yaw) * 0.14;
          glow.spawn(bx, y, bz, 0, 0, 0, COL.yellow, COL.red, 0.13, 0.3, 0.15, 0, 0);
          if (Math.random() < dt * 40) dust.spawn(bx, y, bz, rand(-0.1, 0.1), 0.25, rand(-0.1, 0.1), COL.smoke, COL.smoke, 0.1, 3, 0.7, 0, 1);
        }
      }
    }
    shellMesh.count = ns;
    missileMesh.count = nm;
    shellMesh.instanceMatrix.needsUpdate = missileMesh.instanceMatrix.needsUpdate = true;
  }

  function updateSplats(dt: number): void {
    for (let i = 0; i < splatCap; i++) {
      const s = splats[i]!;
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { splatMesh.setMatrixAt(i, ZERO); continue; }
      const age = s.max - s.life;
      const k = Math.min(1, age / 0.12) * Math.min(1, s.life / 1.5);
      _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, s.rot);
      _m.compose(_p.set(s.x, 0.015, s.z), _q, _s.set(s.r * k, 1, s.r * k));
      splatMesh.setMatrixAt(i, _m);
    }
    splatMesh.instanceMatrix.needsUpdate = true;
  }

  /** Mines (LED blink), tremor fields and Lance strikes from state: they freeze with the sim while paused. */
  function updatePowers(dt: number): void {
    fields.begin();
    feet.begin();
    reticles.begin();
    beams.begin();
    scorchFx.begin();
    if (state) {
      // armed mines: amber LED, one blink per second (all in step)
      const beat = Math.floor(time);
      if (beat !== ledBeat) {
        ledBeat = beat;
        for (const m of state.mines) glow.spawn(m.x + MINE_LED.x, PATH_Y + MINE_LED.y, m.y + MINE_LED.z, 0, 0, 0, COL.amber, COL.orange, 0.13, 1, 0.45, 0, 0);
      }
      const M = POWERS.tremor_mines;
      for (const f of state.tremorFields) {
        const age = M.fieldDuration - f.timeLeft;
        const open = 1 - (1 - Math.min(1, age / 0.25)) ** 3;
        fields.push(f.x, decalY(f.x, f.y), f.y, f.radius * open, f.radius * open, age, Math.min(1, f.timeLeft / 1.5));
        const rip = Math.floor(age * 2);
        if (ripples.get(f.id) !== rip) {
          ripples.set(f.id, rip);
          for (let i = 0; i < 3; i++) {
            const a = rand(0, Math.PI * 2), r = f.radius * rand(0.3, 0.9);
            dust.spawn(f.x + Math.cos(a) * r, 0.05, f.y + Math.sin(a) * r, Math.cos(a) * 0.3, 0.35, Math.sin(a) * 0.3, COL.dust, COL.dust, 0.12, 2, 0.6, 0.4, 2);
          }
        }
      }
      if (ripples.size > state.tremorFields.length) for (const id of ripples.keys()) if (!state.tremorFields.some((f) => f.id === id)) ripples.delete(id);

      const L = POWERS.lance_strike;
      const fire = L.pulses * L.pulseInterval;
      for (const s of state.strikes) {
        const y0 = topY(s.x, s.y);
        if (s.phase === 'telegraph') {
          const k = 1 - s.timeLeft / L.telegraph;
          const flash = s.timeLeft < 0.3 ? 1 - s.timeLeft / 0.3 : 0;
          const blink = Math.sin(k * k * 40) > 0 ? 1 : 0.15; // faster as impact nears
          reticles.push(s.x, decalY(s.x, s.y), s.y, s.radius * 1.6, s.radius * 1.6, k, k * 1.2, blink, flash);
          beams.push(s.x, y0, s.y, 0.04 + 0.04 * flash, BEAM_H, (0.35 + 0.4 * k) * Math.min(1, k * 4), flash, time); // targeting thread
        } else {
          const t = fire - s.timeLeft;
          const pulse = Math.exp(-(t % L.pulseInterval) * 7);
          const w = Math.min(1, t / 0.08) * Math.min(1, s.timeLeft / 0.25);
          beams.push(s.x, y0, s.y, 0.9 * (0.75 + 0.25 * w) * w, BEAM_H, 0.55 + 0.45 * pulse, 0.7 + 0.3 * pulse, time);
          feet.push(s.x, decalY(s.x, s.y), s.y, (1.1 + 0.4 * pulse) * w, 1, 0.55 + 0.45 * pulse);
          if (Math.random() < dt * 30) glow.spawn(s.x + rand(-0.3, 0.3), 0.1, s.y + rand(-0.3, 0.3), rand(-1.5, 1.5), rand(1, 2.5), rand(-1.5, 1.5), COL.white, COL.violet, 0.06, 0.3, 0.35, 5);
        }
      }
    }
    for (const sc of scorches) {
      if (sc.life <= 0) continue;
      sc.life -= dt;
      sc.age += dt;
      if (sc.life > 0) scorchFx.push(sc.x, sc.y - 0.005, sc.z, 1.5, 1.5, sc.age, Math.min(1, sc.life / SCORCH_FADE) * Math.min(1, sc.age / 0.1), sc.seed);
    }
    fields.end();
    feet.end();
    reticles.end();
    beams.end();
    scorchFx.end();
  }

  function update(rawDt: number): void {
    const dt = Math.min(rawDt, 0.1);
    time += dt;
    updatePowers(dt);
    railCharge(dt);
    for (const q of delayed) {
      if (q.t <= 0) continue;
      q.t -= dt;
      if (q.t <= 0) explode(q.x, q.y, q.r);
    }
    updateProjectiles(dt);
    updateSlow();
    updateSplats(dt);
    glow.update(dt);
    dust.update(dt);
    bolts.update(dt);
    spheres.update(dt);
    rings.update(dt);
    debris.update(dt);
    gibs.update(dt);
    shards.update(dt);
  }

  function dispose(): void {
    for (const o of objects) {
      scene.remove(o);
      const m = o as THREE.Mesh;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  }

  return { handle, update, dispose };
}

