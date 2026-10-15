// Boot: Home -> Playing -> Home. Wires sim, renderer, FX, audio and HUD, and runs the fixed-step loop.
import { createSfx } from './audio/sfx';
import { MAPS, TOWERS } from './data';
import type { TowerId } from './data/types';
import { createRenderer } from './render';
import { createFx } from './render/fx';
import { createGame, FIXED_DT, type SimConfig, type SimEvent } from './sim';
import { createHomeScreen, createHud } from './ui';

const container = document.getElementById('canvas-container')!;
const ui = document.getElementById('ui')!;
// App lifetime: its gesture-unlock listeners and mute state outlive individual games.
const sfx = createSfx();
/** Damage-number floats are noisy; opt in with ?dmg in the URL. */
const DAMAGE_FLOATS = new URLSearchParams(location.search).has('dmg');

function home(): void {
  const screen = createHomeScreen(ui, (cfg) => {
    screen.destroy();
    play(cfg);
  });
}

function play(cfg: SimConfig): void {
  const game = createGame(cfg);
  const renderer = createRenderer(container, MAPS[cfg.mapId]);
  const fx = createFx(renderer.scene, renderer.interp, MAPS[cfg.mapId]);
  const canvas = container.querySelector('canvas')!;
  let build: TowerId | null = null;
  let selected: number | null = null;
  let pointer: { x: number; y: number } | null = null;
  let raf = 0;

  const hud = createHud(ui, {
    dispatch: (cmd) => game.dispatch(cmd),
    onBuildSelect: (id) => (build = id), // HUD clears its tower selection itself (-> onTowerSelect)
    onTowerSelect: (id) => setSelected(id),
    onExitToMenu: () => {
      stop();
      home();
    },
    onRestart: () => {
      stop();
      play(cfg);
    },
    onToggleMute: () => {
      sfx.setMuted(!sfx.muted);
      return sfx.muted;
    },
    muted: sfx.muted,
  });

  function setSelected(id: number | null): void {
    selected = id;
    renderer.setSelectedTower(id);
  }
  /** Canvas-originated changes: HUD setters don't fire callbacks, so mirror locally. */
  function selectTower(id: number | null): void {
    setBuild(null);
    hud.selectTower(id);
    setSelected(id);
  }
  function setBuild(id: TowerId | null): void {
    build = id;
    hud.selectBuild(id);
  }

  const towerAt = (col: number, row: number) => game.state.towers.find((t) => t.col === col && t.row === row);

  // ---- canvas input (hover is resolved per frame so it tracks camera pans)
  const onMove = (e: PointerEvent): void => void (pointer = { x: e.clientX, y: e.clientY });
  const onLeave = (): void => void (pointer = null);
  const onDown = (e: PointerEvent): void => {
    if (e.button === 2) {
      if (build !== null) setBuild(null);
      else selectTower(null);
      return;
    }
    if (e.button !== 0) return;
    const tile = renderer.pickTile(e.clientX, e.clientY);
    const tower = tile && towerAt(tile.col, tile.row);
    if (build !== null && tile && !tower) {
      const r = game.dispatch({ type: 'build', defId: build, col: tile.col, row: tile.row });
      if (!r.ok) hud.flash(r.error);
      else if (!e.shiftKey) setBuild(null); // Shift keeps build mode for repeat placement
      return;
    }
    selectTower(tower ? tower.id : null);
  };
  const onContext = (e: Event): void => e.preventDefault();
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('contextmenu', onContext);

  const onVisibility = (): void => {
    if (document.hidden && game.state.status === 'playing') game.dispatch({ type: 'pause' });
  };
  document.addEventListener('visibilitychange', onVisibility);

  // Top bar (+ boss bar) and bottom console cover the canvas; let the camera scroll the edge rows clear of them.
  const topEl = ui.querySelector<HTMLElement>('.hud-top');
  const consoleEl = ui.querySelector<HTMLElement>('.hud-console');
  const ro = new ResizeObserver(() => renderer.setInsets(topEl?.offsetHeight ?? 0, consoleEl?.offsetHeight ?? 0));
  for (const el of [topEl, consoleEl]) if (el) ro.observe(el);

  function updateOverlays(): void {
    const s = game.state;
    const tile = pointer && renderer.pickTile(pointer.x, pointer.y);
    const tower = tile && towerAt(tile.col, tile.row);
    if (build !== null) {
      const def = TOWERS[build];
      const valid = !!tile && game.canBuild(tile.col, tile.row) && s.cash >= def.levels[0].cost;
      renderer.setHover(tile, valid);
      renderer.setRangePreview(tile ? { x: tile.col + 0.5, y: tile.row + 0.5, rangeTiles: def.levels[0].range } : null);
      return;
    }
    renderer.setHover(tower ? tile : null, true);
    const sel = selected === null ? undefined : s.towers.find((t) => t.id === selected);
    renderer.setRangePreview(sel ? { x: sel.col + 0.5, y: sel.row + 0.5, rangeTiles: TOWERS[sel.defId].levels[sel.level - 1]!.range } : null);
  }

  function react(events: readonly SimEvent[]): void {
    for (const ev of events) {
      switch (ev.type) {
        case 'death': {
          const p = renderer.worldToScreen(ev.x, ev.y, 0.6);
          hud.floatText(p.x, p.y, `+${ev.bounty}`, 'cash');
          break;
        }
        case 'hit': {
          if (!DAMAGE_FLOATS || ev.damage < 1) break;
          const p = renderer.worldToScreen(ev.x, ev.y, 0.5);
          hud.floatText(p.x, p.y, String(Math.round(ev.damage)), 'damage');
          break;
        }
        case 'leak':
          hud.leak();
          break;
        case 'waveStart': {
          const n = ev.index + 1;
          const bonus = ev.earlyBonus > 0 ? ` · early bonus +${ev.earlyBonus}` : '';
          if (ev.boss === 'final') hud.flash(`Warning · final assault · massive signature · wave ${n}${bonus}`);
          else if (ev.boss === 'mid') hud.flash(`Warning · massive signature · wave ${n}${bonus}`);
          else hud.flash(`Wave ${n} incoming${bonus}`);
          break;
        }
        case 'waveClear':
          if (game.state.status === 'playing') hud.flash(`Wave ${ev.index + 1} cleared · +${ev.bonus} cr`);
          break;
      }
    }
  }

  let last = performance.now();
  let acc = 0;
  function frame(now: number): void {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(Math.max(0, (now - last) / 1000), 0.25); // first rAF stamp can precede `last`
    last = now;
    acc += dt * game.state.speed;
    while (acc >= FIXED_DT) {
      renderer.interp.capture(game.state);
      game.step();
      acc -= FIXED_DT;
    }
    renderer.interp.alpha = acc / FIXED_DT;
    const events = game.drainEvents();
    if (events.length) {
      fx.handle(events, game.state);
      sfx.play(events);
      react(events);
    }
    updateOverlays();
    fx.update(game.state.status === 'paused' ? 0 : dt * game.state.speed);
    renderer.render(game.state, dt);
    hud.update(game.state);
  }
  raf = requestAnimationFrame(frame);
  if (import.meta.env.DEV) Object.assign(window, { __game: game, __renderer: renderer });

  function stop(): void {
    cancelAnimationFrame(raf);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerleave', onLeave);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('contextmenu', onContext);
    document.removeEventListener('visibilitychange', onVisibility);
    ro.disconnect();
    hud.destroy();
    fx.dispose();
    renderer.dispose();
  }
}

home();
