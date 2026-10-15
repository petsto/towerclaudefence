// UI sandbox: home screen -> HUD over a placeholder stage, driven by a fake GameState.
import { DIFFICULTIES } from '../src/data/difficulty';
import { MAPS } from '../src/data/maps';
import { TOWERS } from '../src/data/towers';
import type { Command, CommandResult, GameState, SimConfig, TowerState } from '../src/sim/types';
import { createHomeScreen, createHud, type Hud } from '../src/ui';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const ui = document.getElementById('ui')!;
const stage = document.getElementById('stage')!;
let stop = (): void => {};
let muted = false;

function home(): void {
  stop();
  const screen = createHomeScreen(ui, (cfg) => {
    screen.destroy();
    play(cfg);
  });
}

function play(cfg: SimConfig): void {
  const map = MAPS[cfg.mapId];
  const diff = DIFFICULTIES[cfg.difficultyId];
  const tower: Mutable<TowerState> = {
    id: 1, defId: 'thumper', col: 5, row: 4, level: 1, targeting: 'first', rotation: 0,
    cooldown: 0, targetId: null, totalDamage: 0, kills: 0, sellValue: 105,
  };
  const s: Mutable<GameState> = {
    mapId: cfg.mapId, difficultyId: cfg.difficultyId, status: 'playing', speed: 1, time: 0,
    cash: Math.floor(map.startingCash * diff.startCashMult), lives: diff.lives, waveIndex: -1,
    waveCount: map.waves.length, waveActive: false, nextWaveIn: null,
    towers: [tower], enemies: [], projectiles: [], events: [],
  };
  let spawnLeft = 0;

  const dispatch = (cmd: Command): CommandResult => {
    if (s.status === 'victory' || s.status === 'defeat') return { ok: false, error: 'Mission over' };
    if (s.status === 'paused' && cmd.type !== 'resume' && cmd.type !== 'setSpeed') return { ok: false, error: 'Game is paused' };
    switch (cmd.type) {
      case 'pause': s.status = 'paused'; break;
      case 'resume': s.status = 'playing'; break;
      case 'setSpeed': s.speed = cmd.speed; break;
      case 'setTargeting': tower.targeting = cmd.mode; break;
      case 'callWave':
        if (s.waveIndex + 1 >= s.waveCount) return { ok: false, error: 'No waves left' };
        if (s.waveActive) return { ok: false, error: 'Wave still deploying' };
        if (s.nextWaveIn !== null) s.cash += Math.min(60, 3 * Math.floor(s.nextWaveIn));
        launch();
        break;
      case 'upgrade': {
        const next = TOWERS[tower.defId].levels[tower.level as number];
        if (!next) return { ok: false, error: 'Max level' };
        if (s.cash < next.cost) return { ok: false, error: 'Not enough credits' };
        s.cash -= next.cost;
        tower.level = (tower.level + 1) as 2 | 3;
        tower.sellValue += Math.floor(next.cost * 0.7);
        break;
      }
      case 'sell':
        s.cash += tower.sellValue;
        s.towers = [];
        towerEl.remove();
        break;
      case 'build':
        return { ok: false, error: 'Fake stage: no build pads' };
    }
    return { ok: true };
  };

  function launch(): void {
    s.waveIndex++;
    s.waveActive = true;
    s.nextWaveIn = null;
    spawnLeft = 6;
  }

  let hud: Hud;
  const towerEl = document.createElement('div');
  towerEl.className = 'fake-tower';
  towerEl.title = 'Fake tower (click to select)';
  stage.append(towerEl);
  towerEl.addEventListener('click', (e) => {
    e.stopPropagation();
    hud.selectTower(1);
    towerEl.classList.add('sel');
  });
  const onStage = (): void => {
    hud.selectTower(null);
    towerEl.classList.remove('sel');
  };
  stage.addEventListener('click', onStage);

  const devbar = document.createElement('div');
  devbar.id = 'devbar';
  for (const [label, fn] of [
    ['victory', () => (s.status = 'victory')],
    ['defeat', () => ((s.status = 'defeat'), (s.lives = 0))],
    ['leak', () => (s.lives = Math.max(1, s.lives - 3))],
    ['+500', () => (s.cash += 500)],
  ] as const) {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', fn);
    devbar.append(b);
  }
  document.body.append(devbar);

  const exit = (): void => home();
  hud = createHud(ui, {
    dispatch,
    onBuildSelect: (id) => console.log('[hud] build', id),
    onTowerSelect: (id) => {
      console.log('[hud] tower', id);
      towerEl.classList.toggle('sel', id !== null);
    },
    onExitToMenu: exit,
    onRestart: () => {
      stop();
      play(cfg);
    },
    onToggleMute: () => (muted = !muted),
  });

  let raf = 0;
  let last = performance.now();
  let tick = 0;
  function frame(now: number): void {
    const dt = Math.min(0.1, (now - last) / 1000) * s.speed;
    last = now;
    if (s.status === 'playing') {
      s.time += dt;
      tick += dt;
      if (s.waveIndex >= 0 && s.nextWaveIn !== null) {
        s.nextWaveIn -= dt;
        if (s.nextWaveIn <= 0) launch();
      }
      if (tick >= 0.8) {
        tick = 0;
        if (s.waveActive) {
          // a kill: bounty + float over the stage
          const x = 200 + Math.random() * (innerWidth - 400);
          const y = 120 + Math.random() * (innerHeight * 0.5);
          const bounty = 4 + Math.floor(Math.random() * 20);
          s.cash += bounty;
          if (s.towers.length) {
            tower.kills++;
            tower.totalDamage += 37 + Math.random() * 80;
          }
          hud.floatText(x, y, `+${bounty}`, 'cash');
          hud.floatText(x + 30, y + 20, String(Math.ceil(Math.random() * 40)), 'damage');
          if (--spawnLeft <= 0) {
            s.waveActive = false;
            if (s.waveIndex + 1 >= s.waveCount) s.status = 'victory';
            else s.nextWaveIn = 20;
          }
        }
      }
    }
    hud.update(s);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  stop = () => {
    cancelAnimationFrame(raf);
    hud.destroy();
    towerEl.remove();
    devbar.remove();
    stage.removeEventListener('click', onStage);
    stop = () => {};
  };
}

home();
