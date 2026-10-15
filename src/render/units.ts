// Syncs sim towers/enemies into the scene: instanced towers (per def+level), instanced enemies, HP/shield bars.
import * as THREE from 'three';
import type { EnemyId, TowerId } from '../data/types';
import type { EnemyState, GameState, TowerState } from '../sim/types';
import type { Interp } from './interp';
import { createEnemyGeometry, createTowerModel } from './models';
import { PAD_Y, PATH_Y } from './terrain';

const BAR_W = 0.5;
const BAR_H = 0.07;
const SHIELD_H = 0.04;
const FLASH_S = 0.06;
const PITCH = THREE.MathUtils.degToRad(55);
const BUILD_S = 0.4;
const SELL_S = 0.35;
const UPGRADE_S = 0.35;
const TURN_RATE = 18; // 1/s, exponential ease of turret yaw toward the sim's (snapped) rotation

/** One InstancedMesh per mesh of a (defId, level) model; turret parts get the yaw applied per instance. */
interface TowerPart {
  mesh: THREE.InstancedMesh;
  local: THREE.Matrix4;
  turret: boolean;
}
interface TowerKind {
  parts: TowerPart[];
  turretPos: THREE.Vector3;
  capacity: number;
  count: number;
}
interface EnemyKind {
  mesh: THREE.InstancedMesh;
  height: number;
  capacity: number;
}

export interface Units {
  sync(state: GameState, frameDt: number): void;
  towerPosition(id: number): THREE.Vector3 | null;
  dispose(): void;
}

/** Per-tower render-side animation state (sim snaps everything). */
interface TowerAnim {
  yaw: number;
  level: 1 | 2 | 3;
  built: number;
  upgraded: number;
  seen: number;
  /** Last state, kept so a sold tower can sink out after it leaves the sim. */
  last: TowerState;
  sold: number;
}

const easeOutBack = (k: number): number => 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2;

export function createUnits(scene: THREE.Scene, interp: Interp): Units {
  const towerKinds = new Map<string, TowerKind>();
  const towerPos = new Map<number, THREE.Vector3>();
  const kinds = new Map<EnemyId, EnemyKind>();
  const enemyMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const flashes = new Map<number, { hp: number; t: number; seen: number }>();
  let frame = 0;

  // HP bars: camera-facing quads (no yaw camera => one fixed tilt baked into the geometry).
  const barGeo = new THREE.PlaneGeometry(1, 1);
  const barQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-PITCH, 0, 0)); // normal -> (0, sin55, cos55), towards the camera
  const barMat = new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false });
  let barCap = 0;
  let bars = new THREE.InstancedMesh(barGeo, barMat, 1);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const col = new THREE.Color();
  const white = new THREE.Color(1, 1, 1);
  const flashCol = new THREE.Color(3, 3, 3);
  const slowCol = new THREE.Color(0.55, 0.85, 1.4);
  const barBg = new THREE.Color('#080808');
  const shieldCol = new THREE.Color('#3aa0ff');

  function ensureBars(n: number): void {
    if (n <= barCap) return;
    barCap = Math.max(64, barCap * 2, n);
    scene.remove(bars);
    bars.dispose();
    bars = new THREE.InstancedMesh(barGeo, barMat, barCap);
    bars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    bars.setColorAt(0, white);
    bars.frustumCulled = false;
    bars.renderOrder = 10;
    bars.count = 0;
    scene.add(bars);
  }
  ensureBars(64);

  function kind(defId: EnemyId, need: number): EnemyKind {
    let k = kinds.get(defId);
    if (k && k.capacity >= need) return k;
    const geo = k?.mesh.geometry ?? createEnemyGeometry(defId);
    if (!geo.boundingBox) geo.computeBoundingBox();
    const capacity = Math.max(32, (k?.capacity ?? 0) * 2, need);
    if (k) {
      scene.remove(k.mesh);
      k.mesh.dispose();
    }
    const mesh = new THREE.InstancedMesh(geo, enemyMat, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.setColorAt(0, white);
    mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
    k = { mesh, height: geo.boundingBox!.max.y, capacity };
    kinds.set(defId, k);
    return k;
  }

  // Towers are instanced per (defId, level) so draw calls scale with distinct kinds, not tower count.
  // The model module caches geometry/materials; we only borrow them from a template group.
  function towerKind(key: string, defId: TowerId, level: 1 | 2 | 3, need: number): TowerKind {
    let k = towerKinds.get(key);
    if (k && k.capacity >= need) return k;
    const capacity = Math.max(8, (k?.capacity ?? 0) * 2, need);
    if (k) {
      for (const pt of k.parts) {
        scene.remove(pt.mesh);
        pt.mesh.dispose();
      }
    }
    const tpl = createTowerModel(defId, level);
    tpl.updateMatrixWorld(true);
    const turret = tpl.getObjectByName('turret');
    const inv = new THREE.Matrix4();
    const parts: TowerPart[] = [];
    tpl.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      let isTurret = false;
      for (let a: THREE.Object3D | null = o; a; a = a.parent) if (a === turret) isTurret = true;
      const ref = isTurret && turret ? turret : tpl;
      const local = inv.copy(ref.matrixWorld).invert().multiply(o.matrixWorld).clone();
      const mesh = new THREE.InstancedMesh(o.geometry, o.material, capacity);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // ponytail: turrets don't cast (bounds worst-case draw calls); base hull shadow carries the look.
      mesh.castShadow = o.castShadow && !isTurret;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      scene.add(mesh);
      parts.push({ mesh, local, turret: isTurret });
    });
    k = { parts, turretPos: turret ? turret.position.clone() : new THREE.Vector3(), capacity, count: 0 };
    towerKinds.set(key, k);
    return k;
  }

  const towerM = new THREE.Matrix4();
  const turretM = new THREE.Matrix4();
  const anims = new Map<number, TowerAnim>();
  let clock = 0;
  const towerQ = new THREE.Quaternion();

  function syncTowers(list: readonly TowerState[], dt: number, speed: number): void {
    clock += dt;
    for (const t of list) {
      let a = anims.get(t.id);
      if (!a) anims.set(t.id, (a = { yaw: t.rotation, level: t.level, built: clock, upgraded: -1, seen: frame, last: t, sold: -1 }));
      if (a.level !== t.level) a.upgraded = clock;
      a.level = t.level;
      a.last = t;
      a.seen = frame;
      const d = Math.atan2(Math.sin(t.rotation - a.yaw), Math.cos(t.rotation - a.yaw));
      a.yaw += d * (1 - Math.exp(-dt * speed * TURN_RATE));
    }
    for (const [id, a] of anims) {
      if (a.seen === frame) continue;
      if (a.sold < 0) a.sold = clock; // gone from the sim = sold: sink out
      if (clock - a.sold > SELL_S) anims.delete(id);
    }

    const need = new Map<string, number>();
    for (const a of anims.values()) need.set(`${a.last.defId}:${a.level}`, (need.get(`${a.last.defId}:${a.level}`) ?? 0) + 1);
    for (const k of towerKinds.values()) k.count = 0;
    for (const [key, n] of need) towerKind(key, key.split(':')[0] as TowerId, Number(key.split(':')[1]) as 1 | 2 | 3, n);
    towerPos.clear();
    for (const [id, a] of anims) {
      const t = a.last;
      const k = towerKinds.get(`${t.defId}:${a.level}`)!;
      const i = k.count++;
      const x = t.col + 0.5;
      const z = t.row + 0.5;
      // build: rise out of the pad with a slight overshoot; sell: sink and shrink; upgrade: one scale pulse
      let sy = 1;
      let sxz = 1;
      let dy = 0;
      const kb = Math.min(1, (clock - a.built) / BUILD_S);
      if (kb < 1) {
        sy = Math.max(0.05, easeOutBack(kb));
        sxz = 0.7 + 0.3 * Math.min(1, kb * 2);
        dy = -0.25 * (1 - kb);
      }
      if (a.upgraded >= 0 && clock - a.upgraded < UPGRADE_S) {
        const p = 1 + 0.2 * Math.sin((Math.PI * (clock - a.upgraded)) / UPGRADE_S);
        sy *= p;
        sxz *= p;
      }
      if (a.sold >= 0) {
        const ks = Math.min(1, (clock - a.sold) / SELL_S);
        sy *= 1 - ks * 0.8;
        sxz *= 1 - ks * 0.4;
        dy -= 0.3 * ks * ks;
      } else towerPos.set(id, new THREE.Vector3(x, PAD_Y, z));
      towerM.compose(pos.set(x, PAD_Y + dy, z), towerQ, scl.set(sxz, sy, sxz));
      // sim angle grows toward +z; three yaw grows toward -z
      turretM.makeRotationY(-a.yaw).setPosition(k.turretPos).premultiply(towerM);
      for (const pt of k.parts) pt.mesh.setMatrixAt(i, m4.multiplyMatrices(pt.turret ? turretM : towerM, pt.local));
    }
    for (const k of towerKinds.values()) {
      for (const pt of k.parts) {
        pt.mesh.count = k.count;
        pt.mesh.visible = k.count > 0;
        pt.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  function barColor(f: number): THREE.Color {
    // green -> yellow -> red
    return f > 0.5 ? col.setRGB((1 - f) * 2, 1, 0.1) : col.setRGB(1, f * 2, 0.05);
  }

  function pushBar(i: number, x: number, y: number, z: number, w: number, h: number, c: THREE.Color): number {
    m4.compose(pos.set(x, y, z), barQ, scl.set(w, h, 1));
    bars.setMatrixAt(i, m4);
    bars.setColorAt(i, c);
    return i + 1;
  }

  function syncEnemies(list: readonly EnemyState[], time: number, dt: number): void {
    const counts = new Map<EnemyId, number>();
    for (const en of list) counts.set(en.defId, (counts.get(en.defId) ?? 0) + 1);
    for (const [id, k] of kinds) if (!counts.has(id)) k.mesh.count = 0;
    for (const [id, n] of counts) kind(id, n).mesh.count = 0;

    let damaged = 0;
    for (const en of list) if (en.hp < en.maxHp || en.shield < en.maxShield) damaged++;
    ensureBars(damaged * 3);
    let b = 0;

    for (const en of list) {
      const k = kinds.get(en.defId)!;
      const i = k.mesh.count++;
      const phase = en.id * 1.7;
      const bob = 0.03 * Math.abs(Math.sin(time * 8 + phase));
      const roll = Math.sin(time * 8 + phase) * 0.087;
      const { x: ex, y: ey, heading } = interp.enemy(en);
      q.setFromEuler(e.set(roll, -heading, 0, 'YXZ'));
      m4.compose(pos.set(ex, PATH_Y + bob, ey), q, scl.set(1, 1, 1));
      k.mesh.setMatrixAt(i, m4);

      // hit flash: any drop in hp+shield since last frame
      const pool = en.hp + en.shield;
      let f = flashes.get(en.id);
      if (!f) flashes.set(en.id, (f = { hp: pool, t: 0, seen: frame }));
      if (pool < f.hp) f.t = FLASH_S;
      f.hp = pool;
      f.seen = frame;
      f.t = Math.max(0, f.t - dt);
      k.mesh.setColorAt(i, f.t > 0 ? flashCol : en.slowed ? slowCol : white);

      if (en.hp < en.maxHp || en.shield < en.maxShield) {
        const y = PATH_Y + k.height + 0.18;
        const x0 = ex - BAR_W / 2;
        const hf = Math.max(0, en.hp / en.maxHp);
        const rows = en.maxShield > 0 ? BAR_H + SHIELD_H + 0.02 : BAR_H;
        b = pushBar(b, ex, y + (rows - BAR_H) / 2, ey, BAR_W + 0.06, rows + 0.05, barBg);
        b = pushBar(b, x0 + (BAR_W * hf) / 2, y, ey, BAR_W * hf, BAR_H, barColor(hf));
        if (en.maxShield > 0 && en.shield > 0) {
          const sf = en.shield / en.maxShield;
          b = pushBar(b, x0 + (BAR_W * sf) / 2, y + BAR_H / 2 + 0.02 + SHIELD_H / 2, ey, BAR_W * sf, SHIELD_H, shieldCol);
        }
      }
    }
    for (const k of kinds.values()) {
      k.mesh.visible = k.mesh.count > 0;
      k.mesh.instanceMatrix.needsUpdate = true;
      if (k.mesh.instanceColor) k.mesh.instanceColor.needsUpdate = true;
    }
    bars.count = b;
    bars.instanceMatrix.needsUpdate = true;
    if (bars.instanceColor) bars.instanceColor.needsUpdate = true;
    for (const [id, f] of flashes) if (f.seen !== frame) flashes.delete(id);
  }

  return {
    sync(state, frameDt) {
      frame++;
      syncTowers(state.towers, frameDt, state.speed);
      syncEnemies(state.enemies, state.time, frameDt);
    },
    towerPosition(id) {
      return towerPos.get(id) ?? null;
    },
    dispose() {
      // geometry/materials belong to the models module cache: dispose only our instance buffers
      for (const k of towerKinds.values()) for (const pt of k.parts) pt.mesh.dispose();
      for (const k of kinds.values()) k.mesh.dispose();
      bars.dispose();
      barGeo.dispose();
      barMat.dispose();
      enemyMat.dispose();
    },
  };
}
