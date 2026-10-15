import {
  BOSS_SLOW_FACTOR,
  BOSS_WAVE_CLEAR_MULT,
  CHAIN_FALLOFF,
  CHAIN_JUMP_RANGE,
  DIFFICULTIES,
  EARLY_CALL_MAX,
  EARLY_CALL_PER_SECOND,
  ENEMIES,
  MAPS,
  MID_BOSS_BOUNTY,
  MID_BOSS_HP_MULT,
  SELL_REFUND,
  SPLASH_INNER,
  SPLASH_OUTER_MULT,
  TOWERS,
  UNDO_REFUND,
  WAVE_CLEAR_BASE,
  WAVE_CLEAR_PER_WAVE,
  WAVE_COUNTDOWN,
  WAVE_MAX_HOLD,
} from '../data';
import type { DamageType, DifficultyId, EnemyDef, EnemyId, TowerDef, TowerLevel } from '../data/types';
import { FIXED_DT } from './constants';
import { resolveHit } from './damage';
import { buildPath, pointAt } from './path';
import { inRange, rankTargets } from './targeting';
import type {
  Command,
  CommandResult,
  EnemyState,
  Game,
  GameState,
  ProjectileState,
  SimConfig,
  SimEvent,
  TowerState,
} from './types';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** Absorbs float drift from summing FIXED_DT (timers compare against authored seconds). */
const EPS = 1e-9;
const dt = FIXED_DT;

export interface Enemy extends Mutable<EnemyState> {
  readonly def: EnemyDef;
  /** 0-based wave this enemy (or its parent) belongs to, for wave-clear tracking. */
  readonly wave: number;
  readonly armor: number;
  speed: number;
  readonly bounty: number;
  readonly slowImmune: boolean;
  slow: number;
  slowTime: number;
  lastDamagedAt: number;
  birthTimer: number;
  dead: boolean;
}

export interface Tower extends Mutable<TowerState> {
  readonly def: TowerDef;
  invested: number;
  /** Enemy id counter at the last buy/upgrade; undo applies while nothing has spawned since. */
  undoMark: number;
  /** Credits spent in that no-spawn window (the part undo refunds in full). */
  undoable: number;
  salvoLeft: number;
  salvoTimer: number;
}

interface Projectile extends Mutable<ProjectileState> {
  readonly damage: number;
  readonly speed: number;
  readonly splashRadius: number;
  readonly shieldMult: number;
  done: boolean;
}

export interface SimState extends Mutable<Omit<GameState, 'towers' | 'enemies' | 'projectiles' | 'events'>> {
  towers: Tower[];
  enemies: Enemy[];
  projectiles: Projectile[];
  events: SimEvent[];
}

const ok: CommandResult = { ok: true };
const fail = (error: string): CommandResult => ({ ok: false, error });
const dist = (a: { x: number; y: number }, x: number, y: number) => Math.hypot(a.x - x, a.y - y);

/** Credits CALL WAVE pays now: EARLY_CALL_PER_SECOND per whole second left, capped, scaled by difficulty. */
export function earlyCallBonus(nextWaveIn: number | null, difficultyId: DifficultyId): number {
  if (nextWaveIn === null) return 0;
  return Math.floor(Math.min(EARLY_CALL_MAX, EARLY_CALL_PER_SECOND * Math.floor(nextWaveIn)) * DIFFICULTIES[difficultyId].cashMult);
}

export function createGame(config: SimConfig): Game {
  return createSim(config).game;
}

/** createGame plus internals; tests use `spawnEnemy` and the mutable state. */
export function createSim(config: SimConfig) {
  const map = MAPS[config.mapId];
  const diff = DIFFICULTIES[config.difficultyId];
  const paths = map.paths.map(buildPath);
  const growth = map.hpGrowth + diff.growthAdd;
  const scaleCash = (n: number) => Math.floor(n * diff.cashMult);

  const s: SimState = {
    mapId: config.mapId,
    difficultyId: config.difficultyId,
    status: 'playing',
    speed: 1,
    time: 0,
    cash: Math.floor(map.startingCash * diff.startCashMult),
    lives: diff.lives,
    waveIndex: -1,
    waveCount: map.waves.length,
    waveActive: false,
    nextWaveIn: null,
    towers: [],
    enemies: [],
    projectiles: [],
    events: [],
  };

  let tick = 0;
  let nextEnemyId = 1;
  let nextTowerId = 1;
  let nextProjectileId = 1;
  let spawner: { wave: number; ticks: number; spawned: number[] } | null = null;
  /** Seconds the current countdown has been held waiting for its wave to clear. */
  let held = 0;
  const cleared = map.waves.map(() => false);
  const emit = (e: SimEvent) => s.events.push(e);
  const findEnemy = (id: number | null) => (id === null ? undefined : s.enemies.find((e) => e.id === id && !e.dead));
  const level = (t: Tower): TowerLevel => t.def.levels[t.level - 1]!;

  // ---- enemies ----

  function spawnEnemy(defId: EnemyId, pathIndex: number, wave: number, progress = 0, midBoss = false): Enemy {
    const def = ENEMIES[defId];
    const path = paths[pathIndex]!;
    const scale = diff.hpMult * growth ** wave * (midBoss ? MID_BOSS_HP_MULT : 1);
    const p = pointAt(path, progress);
    const e: Enemy = {
      id: nextEnemyId++,
      defId,
      pathIndex,
      x: p.x,
      y: p.y,
      progress,
      distanceToCore: path.length - progress,
      heading: p.heading,
      hp: def.hp * scale,
      maxHp: def.hp * scale,
      shield: def.shield * scale,
      maxShield: def.shield * scale,
      slowed: false,
      midBoss,
      def,
      wave,
      armor: def.armor + diff.armorAdd,
      speed: def.speed * diff.speedMult,
      bounty: scaleCash(midBoss ? MID_BOSS_BOUNTY : def.bounty),
      slowImmune: def.ability?.kind === 'slowImmune',
      slow: 0,
      slowTime: 0,
      lastDamagedAt: s.time,
      birthTimer: 0,
      dead: false,
    };
    s.enemies.push(e);
    emit({ type: 'spawn', enemyId: e.id, defId, x: e.x, y: e.y });
    return e;
  }

  function kill(e: Enemy, tower: Tower | undefined) {
    e.dead = true;
    e.hp = 0;
    s.cash += e.bounty;
    if (tower) tower.kills++;
    emit({ type: 'death', enemyId: e.id, defId: e.defId, x: e.x, y: e.y, bounty: e.bounty });
    const a = e.def.ability;
    if (a?.kind === 'broodBurst') {
      for (let i = 0; i < a.count; i++) {
        const back = a.count > 1 ? (a.spread * i) / (a.count - 1) : 0;
        spawnEnemy(a.spawn, e.pathIndex, e.wave, Math.max(0, e.progress - back));
      }
    }
  }

  function hit(e: Enemy, damage: number, type: DamageType, shieldMult: number, towerId: number, execute = 0) {
    if (e.dead) return;
    const r = resolveHit(e.shield, e.armor, e.def.size, damage, type, shieldMult);
    const hpBefore = e.hp;
    const hadShield = e.shield > 0;
    e.shield -= r.shieldDamage;
    e.hp -= r.hpDamage;
    e.lastDamagedAt = s.time;
    emit({ type: 'hit', enemyId: e.id, x: e.x, y: e.y, damageType: type, damage: r.hpDamage, shield: r.shieldDamage });
    if (hadShield && e.shield <= 0) {
      e.shield = 0;
      emit({ type: 'shieldBreak', enemyId: e.id, x: e.x, y: e.y });
    }
    if (execute > 0 && e.hp > 0 && e.shield === 0 && !e.def.isBoss && e.hp <= execute * e.maxHp) e.hp = 0;
    const tower = s.towers.find((t) => t.id === towerId);
    if (tower) tower.totalDamage += r.shieldDamage + hpBefore - Math.max(0, e.hp);
    if (e.hp <= 0) kill(e, tower);
  }

  function applySlow(e: Enemy, slow: number, duration: number) {
    if (e.dead || e.slowImmune) return;
    const strength = slow * (e.def.isBoss ? BOSS_SLOW_FACTOR : 1);
    if (strength > e.slow || e.slowTime <= 0) {
      e.slow = strength;
      e.slowTime = duration;
    } else if (strength === e.slow) {
      e.slowTime = Math.max(e.slowTime, duration);
    }
    e.slowed = true;
  }

  function explode(x: number, y: number, primary: Enemy | undefined, p: Projectile) {
    const r = p.splashRadius;
    emit({ type: 'explosion', x, y, radius: r });
    const victims = s.enemies.filter((e) => !e.dead && (e === primary || dist(e, x, y) <= r));
    for (const e of victims) {
      const full = e === primary || dist(e, x, y) <= SPLASH_INNER * r;
      hit(e, p.damage * (full ? 1 : SPLASH_OUTER_MULT), p.damageType, p.shieldMult, p.towerId);
    }
  }

  // ---- towers ----

  function launch(t: Tower, lvl: TowerLevel, target: Enemy, kind: 'shell' | 'missile') {
    const x = t.col + 0.5;
    const y = t.row + 0.5;
    emit({ type: 'shot', towerId: t.id, defId: t.defId, targetId: target.id });
    s.projectiles.push({
      id: nextProjectileId++,
      kind,
      towerId: t.id,
      damageType: t.def.damageType,
      x,
      y,
      originX: x,
      originY: y,
      targetId: target.id,
      targetX: target.x,
      targetY: target.y,
      damage: lvl.damage,
      speed: lvl.projectileSpeed,
      splashRadius: lvl.splashRadius,
      shieldMult: lvl.shieldMult,
      done: false,
    });
  }

  function fire(t: Tower, lvl: TowerLevel, ranked: Enemy[]) {
    const target = ranked[0]!;
    const type = t.def.damageType;
    t.targetId = target.id;
    switch (t.def.delivery) {
      case 'hitscan':
        emit({ type: 'shot', towerId: t.id, defId: t.defId, targetId: target.id });
        hit(target, lvl.damage, type, lvl.shieldMult, t.id, lvl.executeThreshold);
        break;
      case 'beam':
        for (const e of ranked.slice(0, lvl.beamTargets)) {
          emit({ type: 'shot', towerId: t.id, defId: t.defId, targetId: e.id });
          hit(e, lvl.damage, type, lvl.shieldMult, t.id);
          applySlow(e, lvl.slow, lvl.slowDuration);
        }
        break;
      case 'chain': {
        emit({ type: 'shot', towerId: t.id, defId: t.defId, targetId: target.id });
        const points = [{ x: t.col + 0.5, y: t.row + 0.5 }];
        const struck = new Set<Enemy>();
        let cur = target;
        let d = lvl.damage;
        for (let k = 0; k <= lvl.chainTargets; k++) {
          points.push({ x: cur.x, y: cur.y });
          struck.add(cur);
          hit(cur, d, type, lvl.shieldMult, t.id);
          let next: Enemy | undefined;
          let best = CHAIN_JUMP_RANGE;
          // enemies are in id order, so the first match keeps the lowest id on ties
          for (const e of s.enemies) {
            const dd = dist(e, cur.x, cur.y);
            if (!e.dead && !struck.has(e) && (dd < best || (dd === best && !next))) {
              best = dd;
              next = e;
            }
          }
          if (!next) break;
          cur = next;
          d *= CHAIN_FALLOFF;
        }
        emit({ type: 'chain', towerId: t.id, points });
        break;
      }
      case 'shell':
        launch(t, lvl, target, 'shell');
        break;
      case 'missile':
        launch(t, lvl, target, 'missile');
        t.salvoLeft = lvl.shots - 1;
        t.salvoTimer = lvl.salvoInterval;
        break;
    }
  }

  function updateTower(t: Tower) {
    const lvl = level(t);
    const cx = t.col + 0.5;
    const cy = t.row + 0.5;
    t.cooldown = Math.max(0, t.cooldown - dt);
    const current = findEnemy(t.targetId);
    if (!current || !inRange(current, cx, cy, lvl.range, lvl.minRange)) t.targetId = null;
    const ranked = () =>
      rankTargets(s.enemies.filter((e) => !e.dead), cx, cy, lvl.range, lvl.minRange, t.targeting, t.def.prefersUnslowed);

    if (t.salvoLeft > 0) {
      t.salvoTimer -= dt;
      if (t.salvoTimer <= EPS) {
        const target = findEnemy(t.targetId) ?? ranked()[0];
        if (target) {
          t.targetId = target.id;
          launch(t, lvl, target, 'missile');
        }
        t.salvoLeft--;
        t.salvoTimer += lvl.salvoInterval;
      }
    } else if (t.cooldown <= EPS) {
      const targets = ranked();
      if (targets.length > 0) {
        // Face the first target before firing: a kill shot clears targetId, so the aim below would keep the old angle.
        t.rotation = Math.atan2(targets[0]!.y - cy, targets[0]!.x - cx);
        fire(t, lvl, targets);
        t.cooldown = lvl.cooldown;
      }
    }

    const aim = findEnemy(t.targetId);
    if (aim) t.rotation = Math.atan2(aim.y - cy, aim.x - cx);
    else t.targetId = null;
  }

  function updateProjectile(p: Projectile) {
    const target = findEnemy(p.targetId);
    if (p.targetId !== null && !target) {
      if (p.kind === 'missile') {
        p.done = true; // fizzles
        return;
      }
      p.targetId = null; // shell flies on to the last known position
    }
    if (target) {
      p.targetX = target.x;
      p.targetY = target.y;
    }
    const d = dist(p, p.targetX, p.targetY);
    const travel = p.speed * dt;
    if (d > travel) {
      p.x += ((p.targetX - p.x) / d) * travel;
      p.y += ((p.targetY - p.y) / d) * travel;
      return;
    }
    p.x = p.targetX;
    p.y = p.targetY;
    p.done = true;
    if (p.kind === 'shell') explode(p.x, p.y, target, p);
    else if (target) hit(target, p.damage, p.damageType, p.shieldMult, p.towerId);
  }

  /** Spend since the last spawn refunds at UNDO_REFUND, everything older at SELL_REFUND. */
  function sellValue(t: Tower): number {
    const fresh = t.undoMark === nextEnemyId ? t.undoable : 0;
    return fresh * UNDO_REFUND + Math.floor((t.invested - fresh) * SELL_REFUND);
  }

  function refreshSellValues() {
    for (const t of s.towers) t.sellValue = sellValue(t);
  }

  // ---- waves ----

  function launchWave(earlyBonus: number) {
    s.waveIndex++;
    spawner = { wave: s.waveIndex, ticks: 0, spawned: map.waves[s.waveIndex]!.groups.map(() => 0) };
    s.waveActive = true;
    s.nextWaveIn = null;
    s.cash += earlyBonus;
    emit({ type: 'waveStart', index: s.waveIndex, earlyBonus, boss: map.waves[s.waveIndex]!.boss });
  }

  function updateSpawner() {
    if (!spawner) return;
    const wave = map.waves[spawner.wave]!;
    const t = spawner.ticks * dt + EPS;
    let done = true;
    wave.groups.forEach((g, i) => {
      let n = spawner!.spawned[i]!;
      while (n < g.count && t >= g.delay + n * g.interval) {
        spawnEnemy(g.enemyId, g.pathIndex, spawner!.wave, 0, wave.boss === 'mid' && ENEMIES[g.enemyId].isBoss);
        n++;
      }
      spawner!.spawned[i] = n;
      if (n < g.count) done = false;
    });
    spawner.ticks++;
    if (done) {
      spawner = null;
      s.waveActive = false;
      if (s.waveIndex < s.waveCount - 1) s.nextWaveIn = WAVE_COUNTDOWN;
      held = 0;
    }
  }

  function updateEnemies() {
    // Repair field: strongest single heal per enemy, never self.
    const heal = new Map<Enemy, number>();
    for (const m of s.enemies) {
      const a = m.def.ability;
      if (a?.kind !== 'repairField') continue;
      for (const o of s.enemies) {
        if (o !== m && dist(o, m.x, m.y) <= a.radius) heal.set(o, Math.max(heal.get(o) ?? 0, a.hpPerSecond));
      }
    }
    const count = s.enemies.length; // children born this step start next step
    for (let i = 0; i < count; i++) {
      const e = s.enemies[i]!;
      const a = e.def.ability;
      const regen = (heal.get(e) ?? 0) + (a?.kind === 'regen' ? a.hpPerSecond : 0);
      if (regen > 0) e.hp = Math.min(e.maxHp, e.hp + regen * dt);
      if (a?.kind === 'shieldReboot' && s.time - e.lastDamagedAt >= a.delay - EPS) {
        e.shield = Math.min(e.maxShield, e.shield + a.perSecond * dt);
      }
      if (a?.kind === 'birthing') {
        e.birthTimer += dt;
        if (e.birthTimer >= a.interval - EPS) {
          e.birthTimer -= a.interval;
          for (let k = 0; k < a.count; k++) {
            spawnEnemy(a.spawn, e.pathIndex, e.wave, Math.max(0, e.progress - a.offset * (k + 1)));
          }
        }
      }

      if (e.slowTime > 0) {
        e.slowTime -= dt;
        if (e.slowTime <= EPS) {
          e.slowTime = 0;
          e.slow = 0;
        }
      }
      e.slowed = e.slowTime > 0;
      e.progress += e.speed * (1 - e.slow) * dt;
      const path = paths[e.pathIndex]!;
      if (e.progress >= path.length) {
        e.dead = true;
        s.lives -= e.def.lives;
        emit({ type: 'leak', enemyId: e.id, defId: e.defId, lives: e.def.lives });
        continue;
      }
      const p = pointAt(path, e.progress);
      e.x = p.x;
      e.y = p.y;
      e.heading = p.heading;
      e.distanceToCore = path.length - e.progress;
    }
  }

  function checkWaves() {
    const alive = new Set(s.enemies.map((e) => e.wave));
    for (let w = 0; w <= s.waveIndex; w++) {
      if (cleared[w] || spawner?.wave === w || alive.has(w)) continue;
      cleared[w] = true;
      const boss = map.waves[w]!.boss ? BOSS_WAVE_CLEAR_MULT : 1;
      const bonus = scaleCash((WAVE_CLEAR_BASE + WAVE_CLEAR_PER_WAVE * (w + 1)) * boss);
      s.cash += bonus;
      emit({ type: 'waveClear', index: w, bonus });
    }
  }

  // ---- public API ----

  function step() {
    if (s.status !== 'playing') return;
    // Countdown holds while the latest wave still has enemies alive, for at most WAVE_MAX_HOLD s
    // (no pile-up of auto-launched waves; CALL WAVE still launches early).
    if (s.nextWaveIn !== null && !cleared[s.waveIndex] && held < WAVE_MAX_HOLD - EPS) {
      held += dt;
    } else if (s.nextWaveIn !== null) {
      s.nextWaveIn -= dt;
      if (s.nextWaveIn <= EPS) launchWave(0);
    }
    updateSpawner();
    updateEnemies();
    for (const t of s.towers) updateTower(t);
    for (const p of s.projectiles) updateProjectile(p);
    s.projectiles = s.projectiles.filter((p) => !p.done);
    s.enemies = s.enemies.filter((e) => !e.dead);
    checkWaves();

    if (s.lives <= 0) {
      s.lives = 0;
      s.status = 'defeat';
      emit({ type: 'gameOver', result: 'defeat' });
    } else if (s.waveIndex === s.waveCount - 1 && !spawner && s.enemies.length === 0) {
      s.status = 'victory';
      emit({ type: 'gameOver', result: 'victory' });
    }
    refreshSellValues();
    tick++;
    s.time = tick * dt;
  }

  function canBuild(col: number, row: number): boolean {
    return map.tiles[row]?.[col] === 'build' && !s.towers.some((t) => t.col === col && t.row === row);
  }

  function apply(cmd: Command): CommandResult {
    switch (cmd.type) {
      case 'build': {
        const def = TOWERS[cmd.defId];
        if (!def) return fail('Unknown structure');
        if (!canBuild(cmd.col, cmd.row)) return fail('Cannot build there');
        const cost = def.levels[0].cost;
        if (s.cash < cost) return fail('Not enough credits');
        s.cash -= cost;
        const t: Tower = {
          id: nextTowerId++,
          defId: def.id,
          col: cmd.col,
          row: cmd.row,
          level: 1,
          targeting: def.defaultTargeting,
          rotation: 0,
          cooldown: 0,
          targetId: null,
          totalDamage: 0,
          kills: 0,
          sellValue: cost,
          def,
          invested: cost,
          undoMark: nextEnemyId,
          undoable: cost,
          salvoLeft: 0,
          salvoTimer: 0,
        };
        s.towers.push(t);
        emit({ type: 'build', towerId: t.id, defId: def.id, col: t.col, row: t.row });
        return ok;
      }
      case 'upgrade': {
        const t = s.towers.find((x) => x.id === cmd.towerId);
        if (!t) return fail('No such structure');
        if (t.level === 3) return fail('Maximum level reached');
        const cost = t.def.levels[t.level]!.cost;
        if (s.cash < cost) return fail('Not enough credits');
        s.cash -= cost;
        t.level = t.level === 1 ? 2 : 3;
        t.invested += cost;
        t.undoable = (t.undoMark === nextEnemyId ? t.undoable : 0) + cost;
        t.undoMark = nextEnemyId;
        emit({ type: 'upgrade', towerId: t.id, level: t.level });
        return ok;
      }
      case 'sell': {
        const t = s.towers.find((x) => x.id === cmd.towerId);
        if (!t) return fail('No such structure');
        const refund = sellValue(t);
        s.towers = s.towers.filter((x) => x !== t);
        s.cash += refund;
        emit({ type: 'sell', towerId: t.id, col: t.col, row: t.row, refund });
        return ok;
      }
      case 'setTargeting': {
        const t = s.towers.find((x) => x.id === cmd.towerId);
        if (!t) return fail('No such structure');
        t.targeting = cmd.mode;
        return ok;
      }
      case 'callWave': {
        if (s.waveIndex >= s.waveCount - 1) return fail('No more waves');
        if (spawner) return fail('Wave still deploying');
        launchWave(earlyCallBonus(s.nextWaveIn, config.difficultyId));
        return ok;
      }
      case 'pause':
        if (s.status !== 'playing') return fail('Not playing');
        s.status = 'paused';
        return ok;
      case 'resume':
        if (s.status !== 'paused') return fail('Not paused');
        s.status = 'playing';
        return ok;
      case 'setSpeed':
        if (![1, 2, 3].includes(cmd.speed)) return fail('Invalid speed');
        s.speed = cmd.speed;
        return ok;
    }
  }

  function dispatch(cmd: Command): CommandResult {
    if (s.status === 'victory' || s.status === 'defeat') return fail('Mission over');
    if (s.status === 'paused' && cmd.type !== 'resume' && cmd.type !== 'setSpeed') return fail('Game paused');
    const r = apply(cmd);
    refreshSellValues();
    return r;
  }

  const game: Game = {
    get state() {
      return s;
    },
    dispatch,
    step,
    canBuild,
    drainEvents() {
      const events = s.events;
      s.events = [];
      return events;
    },
  };

  return { game, state: s, spawnEnemy };
}
