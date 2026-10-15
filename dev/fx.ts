// FX + SFX test bench: fake sim loop that exercises every effect and sound. Not shipped.
import * as THREE from 'three';
import { ENEMIES, MAPS, TOWERS } from '../src/data';
import type { DamageType, EnemyId, TowerId } from '../src/data/types';
import type { EnemyState, GameState, ProjectileState, SimEvent, TowerState } from '../src/sim/types';
import { createFx } from '../src/render/fx';
import { createSfx } from '../src/audio/sfx';

type Mut<T> = { -readonly [K in keyof T]: T[K] };

// ---------------- renderer: low-res RT + posterize/dither blit, ortho camera pitched 55°
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(devicePixelRatio);
document.body.prepend(renderer.domElement);
const rt = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0c10);
const camera = new THREE.OrthographicCamera();
const PPU = 32;
const PITCH = THREE.MathUtils.degToRad(55);
const blitMat = new THREE.ShaderMaterial({
  uniforms: { tScene: { value: rt.texture }, uPost: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
  fragmentShader: `
    uniform sampler2D tScene; uniform float uPost; varying vec2 vUv;
    const float B[16] = float[](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
    void main(){
      vec4 c = texture2D(tScene, vUv);
      c.rgb = pow(c.rgb, vec3(1.0/2.2));
      if (uPost > 0.5) {
        ivec2 p = ivec2(vUv * vec2(textureSize(tScene, 0))) % 4;
        float d = (B[p.y * 4 + p.x] + 0.5) / 16.0 - 0.5;
        c.rgb = floor(c.rgb * 7.0 + 0.5 + d) / 7.0;
      }
      gl_FragColor = vec4(c.rgb, 1.0);
    }`,
});
const blitScene = new THREE.Scene();
blitScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blitMat));
const blitCam = new THREE.OrthographicCamera();

function resize(): void {
  renderer.setSize(innerWidth, innerHeight);
  const phys = renderer.getDrawingBufferSize(new THREE.Vector2());
  const scale = Math.max(1, Math.round(phys.y / 384));
  const w = Math.ceil(phys.x / scale), h = Math.ceil(phys.y / scale);
  rt.setSize(w, h);
  Object.assign(camera, { left: -w / PPU / 2, right: w / PPU / 2, top: h / PPU / 2, bottom: -h / PPU / 2, near: 1, far: 200 });
  camera.updateProjectionMatrix();
  const s = Math.sin(PITCH);
  camera.position.set(12, 60 * s, 8.5 + 60 * Math.cos(PITCH));
  camera.lookAt(12, 0, 8.5);
}
addEventListener('resize', resize);
resize();

scene.add(new THREE.HemisphereLight(0xb0c0d0, 0x302820, 0.9));
const sun = new THREE.DirectionalLight(0xfff0d8, 2);
sun.position.set(6, 14, 3);
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(24, 16).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x6a5a40 }));
ground.position.set(12, 0, 8);
scene.add(ground);
const path = new THREE.Mesh(new THREE.PlaneGeometry(24, 1).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x4a3e2c }));
path.position.set(12, 0.005, 8.5);
scene.add(path);

// ---------------- fake game state
const mapId = 'dust-ridge-outpost' as const;
let core = { x: 22.5, y: 8.5 };
MAPS[mapId].tiles.forEach((row, r) => row.forEach((t, c) => { if (t === 'core') core = { x: c + 0.5, y: r + 0.5 }; }));
const coreBox = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.9), new THREE.MeshLambertMaterial({ color: 0x38e0d0 }));
coreBox.position.set(core.x, 0.3, core.y);
scene.add(coreBox);

const state = {
  mapId, difficultyId: 'normal', status: 'playing', speed: 1, time: 0, cash: 999, lives: 20,
  waveIndex: 0, waveCount: 30, waveActive: true, nextWaveIn: null,
  towers: [] as Mut<TowerState>[], enemies: [] as Mut<EnemyState>[], projectiles: [] as Mut<ProjectileState>[], events: [],
} satisfies Mut<GameState>;

const events: SimEvent[] = [];
const fx = createFx(scene);
const sfx = createSfx();
let nextId = 1;

const towerMeshes = new Map<number, THREE.Mesh>();
function build(defId: TowerId, col: number, row: number): Mut<TowerState> {
  const t: Mut<TowerState> = {
    id: nextId++, defId, col, row, level: 1, targeting: 'first', rotation: Math.PI / 2, cooldown: Math.random(),
    targetId: null, totalDamage: 0, kills: 0, sellValue: 0,
  };
  state.towers.push(t);
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.7, MUZZLE_H[defId], 0.7), new THREE.MeshLambertMaterial({ color: 0x4a6f9a }));
  m.position.set(col + 0.5, MUZZLE_H[defId] / 2, row + 0.5);
  scene.add(m);
  towerMeshes.set(t.id, m);
  events.push({ type: 'build', towerId: t.id, defId, col, row });
  return t;
}
const MUZZLE_H: Record<TowerId, number> = { picket: 0.5, thumper: 0.55, stasis: 0.6, longshot: 0.9, breacher: 0.55, arc_coil: 0.8 };
(['picket', 'thumper', 'stasis', 'longshot', 'breacher', 'arc_coil'] as const).forEach((d, i) => build(d, 3 + i * 3, i % 2 ? 10 : 6));

const enemyGeo = new THREE.BoxGeometry(1, 1, 1);
const enemyMesh = new THREE.InstancedMesh(enemyGeo, new THREE.MeshLambertMaterial(), 128);
enemyMesh.frustumCulled = false;
scene.add(enemyMesh);
const ROSTER: EnemyId[] = ['skitterling', 'spindle_drone', 'husk_crawler', 'rivet_walker', 'skitterling', 'mender_unit', 'brood_carrier', 'anvil_tread'];
let rosterIdx = 0;
function spawn(defId: EnemyId): void {
  const d = ENEMIES[defId];
  const hp = Math.min(d.hp, 400);
  const e: Mut<EnemyState> = {
    id: nextId++, defId, pathIndex: 0, x: 0.5, y: 8.5 + (Math.random() - 0.5) * 0.4, progress: 0, distanceToCore: 22,
    heading: 0, hp, maxHp: hp, shield: Math.min(d.shield, 80), maxShield: Math.min(d.shield, 80), slowed: false, midBoss: false,
  };
  state.enemies.push(e);
  slowT.set(e.id, 0);
  events.push({ type: 'spawn', enemyId: e.id, defId, x: e.x, y: e.y });
}
const slowT = new Map<number, number>();
const SIZE: Record<string, number> = { light: 0.3, medium: 0.45, heavy: 0.7 };

function damage(e: Mut<EnemyState>, dmg: number, type: DamageType): void {
  if (e.hp <= 0) return;
  const absorbed = Math.min(e.shield, dmg);
  const hadShield = e.shield > 0;
  e.shield -= absorbed;
  e.hp -= dmg - absorbed;
  events.push({ type: 'hit', enemyId: e.id, x: e.x, y: e.y, damageType: type, damage: dmg, shield: absorbed });
  if (hadShield && e.shield <= 0) events.push({ type: 'shieldBreak', enemyId: e.id, x: e.x, y: e.y });
  if (e.hp <= 0) events.push({ type: 'death', enemyId: e.id, defId: e.defId, x: e.x, y: e.y, bounty: 1 });
}
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

function fire(t: Mut<TowerState>): void {
  const lv = TOWERS[t.defId].levels[t.level - 1]!;
  const tx = t.col + 0.5, ty = t.row + 0.5;
  const inRange = state.enemies.filter((e) => e.hp > 0 && dist(tx, ty, e.x, e.y) <= lv.range + 1 && dist(tx, ty, e.x, e.y) >= lv.minRange);
  const target = inRange.sort((a, b) => b.x - a.x)[0];
  if (!target) return;
  t.rotation = Math.atan2(target.y - ty, target.x - tx);
  t.targetId = target.id;
  t.cooldown = lv.cooldown;
  events.push({ type: 'shot', towerId: t.id, targetId: target.id });
  const dt = TOWERS[t.defId].damageType;
  switch (TOWERS[t.defId].delivery) {
    case 'hitscan': damage(target, lv.damage * 0.7, dt); break;
    case 'beam': damage(target, lv.damage, dt); slowT.set(target.id, lv.slowDuration); target.slowed = true; break;
    case 'chain': {
      const pts = [{ x: tx, y: ty }];
      const hops = inRange.sort((a, b) => dist(a.x, a.y, target.x, target.y) - dist(b.x, b.y, target.x, target.y)).slice(0, lv.chainTargets + 1);
      for (const e of hops) { pts.push({ x: e.x, y: e.y }); }
      events.push({ type: 'chain', towerId: t.id, points: pts });
      for (const e of hops) damage(e, lv.damage, dt);
      break;
    }
    case 'shell':
    case 'missile':
      state.projectiles.push({
        id: nextId++, kind: TOWERS[t.defId].delivery === 'shell' ? 'shell' : 'missile', towerId: t.id, damageType: dt,
        x: tx, y: ty, originX: tx, originY: ty, targetId: target.id, targetX: target.x, targetY: target.y,
      });
      break;
  }
}

// ---------------- script
let clock = 0;
let nextSpawn = 0;
let nextCycle = 3;
let cycleStep = 0;
let scriptOn = true;
let spareTower: Mut<TowerState> | null = null;

function stepSim(dt: number): void {
  clock += dt;
  state.time += dt;
  if (clock > nextSpawn) { spawn(ROSTER[rosterIdx++ % ROSTER.length]!); nextSpawn = clock + 0.9; }
  for (const e of state.enemies) {
    const s = slowT.get(e.id)! - dt;
    slowT.set(e.id, s);
    e.slowed = s > 0;
    e.x += ENEMIES[e.defId].speed * 0.8 * (e.slowed ? 0.55 : 1) * dt;
    if (e.x >= core.x - 0.5 && e.hp > 0) { e.hp = 0; events.push({ type: 'leak', enemyId: e.id, defId: e.defId, lives: --state.lives }); }
  }
  for (const t of state.towers) {
    t.cooldown -= dt;
    if (t.cooldown <= 0) fire(t);
  }
  for (const p of state.projectiles) {
    const tgt = state.enemies.find((e) => e.id === p.targetId && e.hp > 0);
    if (tgt) { p.targetX = tgt.x; p.targetY = tgt.y; } else p.targetId = null;
    const def = TOWERS[state.towers.find((t) => t.id === p.towerId)!.defId];
    const lv = def.levels[0];
    const d = dist(p.x, p.y, p.targetX, p.targetY);
    const step = lv.projectileSpeed * dt;
    if (d <= step) {
      p.x = p.targetX; p.y = p.targetY; p.id = -1;
      const r = lv.splashRadius || 0.6;
      events.push({ type: 'explosion', x: p.x, y: p.y, radius: r });
      for (const e of state.enemies) if (dist(e.x, e.y, p.x, p.y) < r) damage(e, lv.damage, def.damageType);
    } else { p.x += ((p.targetX - p.x) / d) * step; p.y += ((p.targetY - p.y) / d) * step; }
  }
  state.projectiles = state.projectiles.filter((p) => p.id !== -1);
  state.enemies = state.enemies.filter((e) => e.hp > 0);

  if (clock > nextCycle) {
    nextCycle = clock + 2.5;
    switch (cycleStep++ % 5) {
      case 0: events.push({ type: 'waveStart', index: state.waveIndex++, earlyBonus: 0 }); spareTower = build('picket', 12, 4); break;
      case 1: if (spareTower) { spareTower.level = 2; events.push({ type: 'upgrade', towerId: spareTower.id, level: 2 }); } break;
      case 2: if (spareTower) { spareTower.level = 3; events.push({ type: 'upgrade', towerId: spareTower.id, level: 3 }); } break;
      case 3:
        if (spareTower) {
          events.push({ type: 'sell', towerId: spareTower.id, col: spareTower.col, row: spareTower.row, refund: 100 });
          scene.remove(towerMeshes.get(spareTower.id)!);
          state.towers = state.towers.filter((t) => t !== spareTower);
          spareTower = null;
        }
        break;
      case 4: events.push({ type: 'waveClear', index: state.waveIndex, bonus: 50 }); break;
    }
  }
}

// ---------------- manual triggers
const P = { x: 12, y: 12.5 };
const panel = document.getElementById('panel')!;
function btn(label: string, fn: () => void): void {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = fn;
  panel.append(b);
}
function section(label: string): void {
  const b = document.createElement('b');
  b.textContent = label;
  panel.append(b);
}
const push = (...e: SimEvent[]) => events.push(...e);
section('bench');
btn('script on/off', () => { scriptOn = !scriptOn; });
btn('posterize on/off', () => { blitMat.uniforms.uPost!.value = 1 - blitMat.uniforms.uPost!.value; });
btn('mute', () => sfx.setMuted(!sfx.muted));
section('effects (at x12 z12.5)');
btn('explosion', () => push({ type: 'explosion', x: P.x, y: P.y, radius: 1.5 }));
for (const dt of ['normal', 'concussive', 'explosive', 'plasma'] as const) btn(`hit ${dt}`, () => push({ type: 'hit', enemyId: -1, x: P.x, y: P.y, damageType: dt, damage: 40, shield: 0 }));
btn('shield hit', () => push({ type: 'hit', enemyId: -1, x: P.x, y: P.y, damageType: 'plasma', damage: 20, shield: 20 }));
btn('shieldBreak', () => push({ type: 'shieldBreak', enemyId: -1, x: P.x, y: P.y }));
btn('chain', () => push({ type: 'chain', towerId: -1, points: [{ x: P.x - 3, y: P.y }, { x: P.x - 1.5, y: P.y - 0.6 }, { x: P.x, y: P.y + 0.3 }, { x: P.x + 1.6, y: P.y - 0.2 }, { x: P.x + 3, y: P.y + 0.5 }] }));
for (const d of ['skitterling', 'husk_crawler', 'brood_carrier', 'choir_mother', 'spindle_drone', 'rivet_walker', 'anvil_tread', 'foundry_colossus'] as const) {
  btn(`death ${d}`, () => push({ type: 'death', enemyId: -1, defId: d, x: P.x, y: P.y, bounty: 1 }));
}
btn('build', () => push({ type: 'build', towerId: -5, defId: 'picket', col: P.x, row: P.y - 0.5 }));
btn('sell', () => push({ type: 'sell', towerId: -5, col: P.x, row: P.y - 0.5, refund: 1 }));
btn('upgrade (L3)', () => { const t = state.towers[0]; if (t) push({ type: 'upgrade', towerId: t.id, level: 3 }); });
btn('leak', () => push({ type: 'leak', enemyId: -1, defId: 'skitterling', lives: 1 }));
btn('spawn', () => push({ type: 'spawn', enemyId: -1, defId: 'rivet_walker', x: P.x, y: P.y }));
section('sounds');
for (const t of state.towers.slice(0, 6)) btn(`shot ${t.defId}`, () => push({ type: 'shot', towerId: t.id, targetId: state.enemies[0]?.id ?? -1 }));
btn('waveStart', () => push({ type: 'waveStart', index: 0, earlyBonus: 0 }));
btn('waveClear', () => push({ type: 'waveClear', index: 0, bonus: 0 }));
btn('victory', () => push({ type: 'gameOver', result: 'victory' }));
btn('defeat', () => push({ type: 'gameOver', result: 'defeat' }));

// ---------------- loop
const tmpM = new THREE.Matrix4();
const tmpC = new THREE.Color();
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (scriptOn) stepSim(dt);
  for (const t of state.towers) towerMeshes.get(t.id)?.rotation.set(0, -t.rotation, 0);
  state.enemies.forEach((e, i) => {
    const d = ENEMIES[e.defId];
    const s = SIZE[d.size]!;
    tmpM.makeScale(s, s * 0.8, s).setPosition(e.x, s * 0.4, e.y);
    enemyMesh.setMatrixAt(i, tmpM);
    enemyMesh.setColorAt(i, tmpC.set(d.faction === 'chorus' ? 0x5e3a7a : 0x4a5058));
  });
  enemyMesh.count = state.enemies.length;
  enemyMesh.instanceMatrix.needsUpdate = true;
  if (enemyMesh.instanceColor) enemyMesh.instanceColor.needsUpdate = true;

  const batch = events.splice(0);
  fx.handle(batch, state);
  sfx.play(batch);
  fx.update(dt);

  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  (window as unknown as { __drawCalls: number }).__drawCalls = renderer.info.render.calls;
  renderer.setRenderTarget(null);
  renderer.render(blitScene, blitCam);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
