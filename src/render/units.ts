// Syncs sim towers/enemies into atlas sprites (./hd): tower = static base frame + turret yaw frame, enemy = heading ×
// walk-phase frame. Per-sprite hit flash, slow tint, shield shimmer and build/sell/upgrade pops. HP/shield bars live in
// the overlay layer, drawn over the sprites.
import * as THREE from 'three';
import type { EnemyId } from '../data/types';
import type { GameState, TowerState } from '../sim/types';
import { PITCH } from './camera';
import { createSprites, enemyFrame, TOWER_BASE, towerFrame, towerKey, type Atlas, type SpriteItem } from './hd';
import type { Interp } from './interp';
import { OVERLAY_LAYER } from './pixel';

const BAR_W = 0.5;
const BAR_H = 0.07;
const SHIELD_H = 0.04;
const FLASH_S = 0.08;
const BUILD_S = 0.4;
const SELL_S = 0.35;
const UPGRADE_S = 0.35;
const TURN_RATE = 18; // 1/s, exponential ease of turret yaw toward the sim's (snapped) rotation
const SPRITE_CAP = 1024; // 2 per tower + 1 per enemy

export interface Units {
  /** Unit sprites: drawn at native resolution between the pixel pass and the overlay. */
  readonly sprites: THREE.Object3D;
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
  /** Last state, kept so a sold tower can shrink out after it leaves the sim. */
  last: TowerState;
  sold: number;
  pos: THREE.Vector3;
}
/** Per-enemy: walk phase from distance walked, hit flash from any hp+shield drop. */
interface EnemyAnim { x: number; y: number; phase: number; pool: number; flash: number; seen: number }

const easeOutBack = (k: number): number => 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2;

export function createUnits(scene: THREE.Scene, interp: Interp, atlas: Atlas, topAt: (col: number, row: number) => number): Units {
  const sprites = createSprites(atlas, SPRITE_CAP);
  const list: SpriteItem[] = [];
  const towers = new Map<number, TowerAnim>();
  const enemies = new Map<number, EnemyAnim>();
  const stride = new Map<EnemyId, number>();
  let frame = 0;
  let clock = 0;

  // HP bars: camera-facing quads (no yaw camera => one fixed tilt baked into the geometry).
  const barGeo = new THREE.PlaneGeometry(1, 1);
  const barQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-PITCH, 0, 0)); // normal -> towards the camera
  const barMat = new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false });
  let barCap = 0;
  let bars = new THREE.InstancedMesh(barGeo, barMat, 1);

  const m4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const col = new THREE.Color();
  const white = new THREE.Color(1, 1, 1);
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
    bars.layers.set(OVERLAY_LAYER);
    bars.count = 0;
    scene.add(bars);
  }
  ensureBars(64);

  function syncTowers(state: GameState, dt: number): void {
    for (const t of state.towers) {
      let a = towers.get(t.id);
      if (!a) {
        const p = new THREE.Vector3(t.col + 0.5, topAt(t.col, t.row), t.row + 0.5);
        towers.set(t.id, (a = { yaw: t.rotation, level: t.level, built: clock, upgraded: -1, seen: frame, last: t, sold: -1, pos: p }));
      }
      if (a.level !== t.level) a.upgraded = clock;
      a.level = t.level;
      a.last = t;
      a.seen = frame;
      const d = Math.atan2(Math.sin(t.rotation - a.yaw), Math.cos(t.rotation - a.yaw));
      a.yaw += d * (1 - Math.exp(-dt * state.speed * TURN_RATE));
    }
    for (const [id, a] of towers) {
      if (a.seen !== frame && a.sold < 0) a.sold = clock; // gone from the sim = sold: shrink and fade out
      if (a.sold >= 0 && clock - a.sold > SELL_S) {
        towers.delete(id);
        continue;
      }
      // build: pop up from nothing with an overshoot; upgrade: one scale pulse; sell: shrink + fade
      let scale = 1;
      let alpha = 1;
      const kb = Math.min(1, (clock - a.built) / BUILD_S);
      if (kb < 1) scale = Math.max(0.05, easeOutBack(kb));
      if (a.upgraded >= 0 && clock - a.upgraded < UPGRADE_S) scale *= 1 + 0.15 * Math.sin((Math.PI * (clock - a.upgraded)) / UPGRADE_S);
      if (a.sold >= 0) {
        const ks = Math.min(1, (clock - a.sold) / SELL_S);
        scale *= 1 - 0.4 * ks;
        alpha = 1 - ks;
      }
      const key = towerKey(a.last.defId, a.level);
      const { x, y, z } = a.pos;
      list.push({ x, y, z, key, frame: TOWER_BASE, order: 0, scale, alpha });
      if (atlas.turret(key)) list.push({ x, y, z, key, frame: towerFrame(a.yaw), order: 1, scale, alpha });
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

  function syncEnemies(state: GameState, dt: number): void {
    let damaged = 0;
    for (const en of state.enemies) if (en.hp < en.maxHp || en.shield < en.maxShield) damaged++;
    ensureBars(damaged * 3);
    let b = 0;

    for (const en of state.enemies) {
      const { x, y: z, heading } = interp.enemy(en);
      const y = topAt(Math.floor(x), Math.floor(z));
      const pool = en.hp + en.shield;
      let a = enemies.get(en.id);
      if (!a) enemies.set(en.id, (a = { x, y: z, phase: en.id * 0.37, pool, flash: 0, seen: frame }));
      let s = stride.get(en.defId);
      if (s === undefined) stride.set(en.defId, (s = THREE.MathUtils.clamp(atlas.bounds(en.defId).r * 2.2, 0.35, 1.4)));
      a.phase += Math.hypot(x - a.x, z - a.y) / s; // one walk cycle per stride of distance
      a.x = x;
      a.y = z;
      if (pool < a.pool) a.flash = FLASH_S;
      a.pool = pool;
      a.flash = Math.max(0, a.flash - dt);
      a.seen = frame;
      list.push({
        x, y, z, key: en.defId, frame: enemyFrame(heading, a.phase), order: 2,
        flash: a.flash / FLASH_S, slow: en.slowed ? 1 : 0, shield: en.shield > 0 ? 0.3 + 0.7 * (en.shield / en.maxShield) : 0,
      });

      if (en.hp < en.maxHp || en.shield < en.maxShield) {
        const by = y + atlas.bounds(en.defId).h + 0.15;
        const x0 = x - BAR_W / 2;
        const hf = Math.max(0, en.hp / en.maxHp);
        const rows = en.maxShield > 0 ? BAR_H + SHIELD_H + 0.02 : BAR_H;
        b = pushBar(b, x, by + (rows - BAR_H) / 2, z, BAR_W + 0.06, rows + 0.05, barBg);
        b = pushBar(b, x0 + (BAR_W * hf) / 2, by, z, BAR_W * hf, BAR_H, barColor(hf));
        if (en.maxShield > 0 && en.shield > 0) {
          const sf = en.shield / en.maxShield;
          b = pushBar(b, x0 + (BAR_W * sf) / 2, by + BAR_H / 2 + 0.02 + SHIELD_H / 2, z, BAR_W * sf, SHIELD_H, shieldCol);
        }
      }
    }
    for (const [id, a] of enemies) if (a.seen !== frame) enemies.delete(id);
    bars.count = b;
    bars.instanceMatrix.needsUpdate = true;
    if (bars.instanceColor) bars.instanceColor.needsUpdate = true;
  }

  return {
    sprites: sprites.mesh,
    sync(state, frameDt) {
      frame++;
      clock += frameDt;
      list.length = 0;
      syncTowers(state, frameDt);
      syncEnemies(state, frameDt);
      sprites.set(list, clock);
    },
    towerPosition(id) {
      const a = towers.get(id);
      return a && a.sold < 0 ? a.pos : null;
    },
    dispose() {
      sprites.mesh.geometry.dispose();
      (sprites.mesh.material as THREE.Material).dispose();
      sprites.mesh.dispose();
      bars.dispose();
      barGeo.dispose();
      barMat.dispose();
    },
  };
}
