// UI sandbox: home screen -> HUD over a placeholder stage, driven by the real sim (no renderer).
// The competent bot builds and upgrades; clicking the stage in build mode deploys on the first free pad.
import { MAPS } from '../src/data';
import type { TowerId } from '../src/data/types';
import { FIXED_DT, type SimConfig } from '../src/sim';
import { competentStrategy } from '../src/sim/autoplay';
import { createSim } from '../src/sim/game';
import { createHomeScreen, createHud } from '../src/ui';

const ui = document.getElementById('ui')!;
const stage = document.getElementById('stage')!;
let muted = false;

function home(): void {
  const screen = createHomeScreen(ui, (cfg) => {
    screen.destroy();
    play(cfg);
  });
}

function play(cfg: SimConfig): void {
  const map = MAPS[cfg.mapId];
  const { game, state } = createSim(cfg);
  const bot = competentStrategy();
  let botOn = true;
  let build: TowerId | null = null;
  let pick = 0;

  const hud = createHud(ui, {
    dispatch: (cmd) => game.dispatch(cmd),
    onBuildSelect: (id) => (build = id),
    onTowerSelect: (id) => console.log('[hud] tower', id),
    onExitToMenu: () => {
      stop();
      home();
    },
    onRestart: () => {
      stop();
      play(cfg);
    },
    onToggleMute: () => (muted = !muted),
    muted,
  });

  const onStage = (): void => {
    if (build === null) return hud.selectTower(null);
    const pad = map.tiles.flatMap((row, r) => row.map((_, c) => [c, r] as const)).find(([c, r]) => game.canBuild(c, r));
    const r = pad ? game.dispatch({ type: 'build', defId: build, col: pad[0], row: pad[1] }) : { ok: false as const, error: 'No free pad' };
    if (!r.ok) hud.flash(r.error);
    build = null;
    hud.selectBuild(null);
  };
  stage.addEventListener('click', onStage);

  // Dev-only shortcuts poke the sim's mutable state directly.
  const devbar = document.createElement('div');
  devbar.id = 'devbar';
  for (const [label, fn] of [
    ['bot on/off', () => (botOn = !botOn)],
    ['select next tower', () => hud.selectTower(state.towers[pick++ % Math.max(1, state.towers.length)]?.id ?? null)],
    ['+500', () => (state.cash += 500)],
    ['leak', () => (state.lives = Math.max(1, state.lives - 3))],
    ['victory', () => (state.status = 'victory')],
    ['defeat', () => (state.lives = 0)],
  ] as const) {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', fn);
    devbar.append(b);
  }
  document.body.append(devbar);

  let raf = 0;
  let last = performance.now();
  let acc = 0;
  let steps = 0;
  function frame(now: number): void {
    raf = requestAnimationFrame(frame);
    acc += Math.min(Math.max(0, (now - last) / 1000), 0.25) * state.speed;
    last = now;
    for (; acc >= FIXED_DT; acc -= FIXED_DT) {
      if (botOn && steps++ % 15 === 0 && state.status === 'playing') bot(game, map);
      game.step();
    }
    for (const ev of game.drainEvents()) {
      // no camera here: place floats by the event's position on the map grid
      if (ev.type === 'death') hud.floatText((ev.x / map.cols) * innerWidth, (ev.y / map.rows) * innerHeight, `+${ev.bounty}`, 'cash');
      else if (ev.type === 'leak') hud.leak();
    }
    hud.update(state);
  }
  raf = requestAnimationFrame(frame);

  function stop(): void {
    cancelAnimationFrame(raf);
    hud.destroy();
    devbar.remove();
    stage.removeEventListener('click', onStage);
  }
}

home();
