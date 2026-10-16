import { BOSS_SLOW_FACTOR } from '../data/damage';
import { DIFFICULTIES } from '../data/difficulty';
import { WAVE_COUNTDOWN } from '../data/economy';
import { ENEMIES } from '../data/enemies';
import { MAPS } from '../data/maps';
import { POWERS, POWER_LIST } from '../data/powers';
import { TOWERS, TOWER_LIST } from '../data/towers';
import type { EnemyId, PowerDef, PowerId, TargetingMode, TowerDef, TowerId, TowerLevel, WaveDef } from '../data/types';
import { buildWaves, HEAVY_ONLY_FROM, hpExponent } from '../data/waves';
import { earlyCallBonus } from '../sim';
import type { Command, CommandResult, GameState, GameStatus, PowerState, TowerState } from '../sim/types';
import { badge, cap, fmtInt, h, prefersReducedMotion, rankTone, setAttr, setText } from './dom';
import { ICON_CREDITS, ICON_LIVES, ICON_MUTED, ICON_PAUSE, ICON_PLAY, ICON_SOUND, POWER_ICONS, TOWER_ICONS } from './icons';

export interface HudOptions {
  dispatch(cmd: Command): CommandResult;
  onBuildSelect(defId: TowerId | null): void;
  onTowerSelect(towerId: number | null): void;
  /** Command power targeting armed (Q/E or its button) or cleared. Exclusive with build mode. */
  onPowerSelect(power: PowerId | null): void;
  onExitToMenu(): void;
  /** Returns the new muted state. */
  onToggleMute(): boolean;
  /** Audio is already muted (mute outlives a single game). */
  muted: boolean;
  /** Pause-menu Restart / end-screen Retry. */
  onRestart(): void;
}

export type FlashKind = 'info' | 'warn' | 'good';

export interface Hud {
  update(state: GameState): void;
  selectTower(towerId: number | null): void;
  selectBuild(defId: TowerId | null): void;
  selectPower(power: PowerId | null): void;
  floatText(screenX: number, screenY: number, text: string, kind: 'cash' | 'damage'): void;
  /** Toast: 'info' (default, gold), 'warn' (red: boss waves) or 'good' (green: wave cleared). */
  flash(message: string, kind?: FlashKind): void;
  /** Red screen-edge pulse (an enemy reached the core). */
  leak(): void;
  destroy(): void;
}

const TARGETING: readonly TargetingMode[] = ['first', 'last', 'strongest', 'weakest', 'closest'];
const FLOAT_POOL = 40;

function dmgText(l: TowerLevel): string {
  let s = String(l.damage);
  if (l.shots > 1) s += ` ×${l.shots}`;
  if (l.beamTargets > 1) s += ` ×${l.beamTargets}`;
  return s;
}

/** One-line specials for a level ("Splash 1.25 · Slow 35%/2s"). */
function specials(l: TowerLevel): string {
  const out: string[] = [];
  if (l.splashRadius) out.push(`Splash ${l.splashRadius}`);
  if (l.minRange) out.push(`Min ${l.minRange}`);
  if (l.slow) out.push(`Slow ${Math.round(l.slow * 100)}%/${l.slowDuration}s`);
  if (l.chainTargets) out.push(`Chain +${l.chainTargets}`);
  if (l.executeThreshold) out.push(`Execute ≤${Math.round(l.executeThreshold * 100)}%`);
  if (l.shieldMult !== 1) out.push(`Shield ×${l.shieldMult}`);
  return out.join(' · ');
}

/** What the next level changes, e.g. "DMG 6→9 · RNG 3.5→4". */
function upgradeDelta(a: TowerLevel, b: TowerLevel): string {
  const fields: [keyof TowerLevel, string, (v: number) => string][] = [
    ['damage', 'DMG', String],
    ['shots', 'SHOTS', String],
    ['cooldown', 'CD', (v) => `${v}s`],
    ['range', 'RNG', String],
    ['splashRadius', 'SPLASH', String],
    ['slow', 'SLOW', (v) => `${Math.round(v * 100)}%`],
    ['beamTargets', 'BEAMS', String],
    ['chainTargets', 'CHAIN', String],
    ['executeThreshold', 'EXEC', (v) => `${Math.round(v * 100)}%`],
    ['shieldMult', 'SHLD', (v) => `×${v}`],
  ];
  return fields
    .filter(([k]) => a[k] !== b[k])
    .map(([k, label, f]) => `${label} ${f(a[k])}→${f(b[k])}`)
    .join(' · ');
}

function btn(cls: string, label: string, ...children: (Node | string)[]): HTMLButtonElement {
  const b = h('button', cls, { type: 'button', 'aria-label': label, title: label }, ...children);
  // mouse clicks shouldn't leave focus on the button (Space would re-click it instead of calling the wave)
  b.addEventListener('pointerup', () => b.blur());
  return b;
}

function icon(svg: string, cls: string): HTMLSpanElement {
  const s = h('span', cls);
  s.innerHTML = svg;
  return s;
}

/** The sim leaves the countdown at exactly WAVE_COUNTDOWN while it holds for the field to clear. */
const held = (s: GameState): boolean => s.nextWaveIn === WAVE_COUNTDOWN && s.enemies.length > 0;

/** Label-over-value stat (`.stat-k` / `.stat-v`). Returns [stat, value, label]. */
function stat(label: string, cls = ''): [HTMLElement, HTMLElement, HTMLElement] {
  const k = h('dt', 'stat-k', {}, label);
  const v = h('dd', 'stat-v num');
  return [h('div', `stat ${cls}`, {}, k, v), v, k];
}

/** `<dl class="rows">` rows (end-screen stats). */
const rows = (pairs: readonly [string, string][]): HTMLElement =>
  h('dl', 'rows', {}, ...pairs.map(([k, v]) => h('div', 'row', {}, h('dt', '', {}, k), h('dd', '', {}, v))));

/** Info / tooltip on hover and focus; leave clears only if focus has gone too. */
function hoverable(b: HTMLButtonElement, set: (on: boolean) => void): void {
  b.addEventListener('pointerenter', () => set(true));
  b.addEventListener('pointerleave', () => set(false));
  b.addEventListener('focus', () => set(true));
  b.addEventListener('blur', () => b.matches(':hover') || set(false));
}

const secsLeft = (def: PowerDef, p: PowerState): number => Math.ceil(def.chargeTime - p.charge);
const two = (n: number): string => String(n).padStart(2, '0');

export function createHud(root: HTMLElement, opts: HudOptions): Hud {
  let state: GameState | null = null;
  let selTower: number | null = null;
  let selBuild: TowerId | null = null;
  let hoverBuild: TowerId | null = null;
  let selPower: PowerId | null = null;
  let hoverPower: PowerId | null = null;
  let shownCash = -1;
  let lastFrame = performance.now();
  let lastStatus: GameStatus | null = null;
  let incomingKey = '';
  let headKey = '';
  let muted = opts.muted;
  // the run's resolved wave list (GDD §15), rebuilt only if the run changes
  let wavesKey = '';
  let waves: readonly WaveDef[] = [];
  let tickEls: { el: HTMLElement; wave: number }[] = [];

  // ---------- top bar
  const missionV = h('span', 'res-label hud-mission');
  const waveNum = h('span', 'res-val num wave-num');
  const waveOf = h('span', 'res-label wave-of');
  const customTag = h('span', 'chip wave-custom', { hidden: true, title: 'Custom run length' }, 'Custom');
  const nextV = h('span', 'res-val num next-v');
  const waveStatus = h('span', 'sr-only', { role: 'status' });
  const waveFill = h('div', 'bar-fill');
  const waveBar = h('div', 'bar wave-bar', {}, waveFill);
  const wavePanel = h(
    'div',
    'panel hud-wave',
    {},
    h(
      'div',
      'wave-line',
      {},
      h('span', 'wave-id', {}, h('span', 'res-label', {}, 'Wave'), waveNum, waveOf, customTag),
      h('span', 'wave-next', {}, h('span', 'res-label', {}, 'Next'), nextV),
    ),
    waveBar,
    waveStatus,
  );

  const cashV = h('span', 'res-val num');
  const livesV = h('span', 'res-val num');
  const livesBox = h('div', 'res res-lives', { title: 'Lives' }, icon(ICON_LIVES, 'res-ico'), livesV);
  const speedB = btn('btn btn-secondary btn-icon btn-speed', 'Game speed (F)');
  const pauseB = btn('btn btn-secondary btn-icon', 'Pause menu (P)');
  const muteB = btn('btn btn-secondary btn-icon btn-mute', 'Mute');
  const resPanel = h(
    'div',
    'panel hud-res',
    {},
    h('div', 'res res-credits', { title: 'Credits' }, icon(ICON_CREDITS, 'res-ico'), cashV),
    livesBox,
    h('div', 'res-btns', {}, speedB, pauseB, muteB),
  );

  // boss bar: row 2 of the top bar while a boss is alive
  const bossName = h('span', 'boss-name');
  const bossNums = h('span', 'boss-nums num');
  const bossHp = h('div', 'bar-fill');
  const bossShield = h('div', 'bar-fill');
  const bossShieldBar = h('div', 'bar bar-shield', {}, bossShield);
  const bossBar = h(
    'div',
    'panel hud-boss',
    { hidden: true, role: 'status' },
    h('div', 'boss-head', {}, bossName, bossNums),
    h('div', 'bar bar-danger boss-hp', {}, bossHp),
    bossShieldBar,
  );

  const top = h('div', 'hud-top', {}, h('div', 'panel hud-left', {}, missionV), wavePanel, resPanel, bossBar);

  // ---------- console: incoming contacts + call wave
  const incoming = h('div', 'incoming');
  const waveWell = h(
    'section',
    'well con-wave',
    { 'aria-label': 'Next contacts' },
    h('div', 'res-label', {}, 'Next contacts'),
    incoming,
  );
  const callLabel = h('span', 'call-label');
  const callBonus = h('span', 'call-bonus num');
  const callB = btn('btn btn-primary con-call', 'Call wave (Space)', callLabel, callBonus, h('kbd', '', {}, 'SPACE'));

  // ---------- console: info panel (three mutually exclusive views)
  const idleView = h(
    'div',
    'info-idle',
    {},
    h('div', 'tip-title', {}, 'No structure selected'),
    h('p', 'hint-keys', {}, 'Choose a structure from the command card [1–6], then deploy it on a build pad.'),
    h('p', 'dim', {}, 'Q mines · E Lance strike. Click a structure to inspect it. ESC cancels. P pauses.'),
  );

  const tIcon = h('span', 'info-ico');
  const tLevel = badge('1', 'blue', 24);
  const tName = h('span', 'tip-title');
  const tType = h('span', 'chip');
  const [sDmg, rDmg] = stat('DMG');
  const [sRate, rRate] = stat('RATE');
  const [sRng, rRng] = stat('RANGE');
  const [sDealt, rDealt] = stat('DEALT', 'stat-extra');
  const [sKills, rKills] = stat('KILLS', 'stat-extra');
  const tSpecial = h('div', 'info-special');
  const upDelta = h('div', 'info-delta');
  const towerView = h(
    'div',
    'info-tower',
    {},
    h('div', 'info-head', {}, tIcon, tLevel, tName, tType),
    h('dl', 'stats', {}, sDmg, sRate, sRng, sDealt, sKills),
    tSpecial,
    upDelta,
  );

  const tipName = h('span', 'tip-title');
  const tipCost = h('span', 'tip-cost num');
  const tipType = h('span', 'chip');
  const tipKey = h('kbd');
  const tipDesc = h('p', 'tip-desc');
  const [tdRow, tdV, tdK] = stat('DMG');
  const [trRow, trV, trK] = stat('RATE');
  const [tgRow, tgV, tgK] = stat('RANGE');
  const tipSpecial = h('div', 'info-special');
  const tipHint = h('div', 'tip-hint');
  const tipView = h(
    'div',
    'info-tip',
    {},
    h('div', 'info-head', {}, tipName, tipCost, tipType, tipKey),
    tipDesc,
    h('div', 'tip-row', {}, h('dl', 'stats', {}, tdRow, trRow, tgRow), tipSpecial),
    tipHint,
  );

  const info = h('section', 'well con-info', { 'aria-label': 'Selection', 'aria-live': 'polite' }, idleView, towerView, tipView);

  // ---------- console: tower actions (visible only with a tower selected)
  const act = (label: string, value: HTMLElement, key: string): (Node | string)[] => [
    h('span', 'act-k', {}, label),
    value,
    h('kbd', '', {}, key),
  ];
  const targetV = h('span', 'act-v tgt-v');
  const targetB = btn('btn btn-secondary btn-act', 'Cycle targeting (Tab)', ...act('Target', targetV, 'TAB'));
  const upCost = h('span', 'act-v cost num');
  const upB = btn('btn btn-secondary btn-act', 'Upgrade (U)', ...act('Upgrade', upCost, 'U'));
  const sellV = h('span', 'act-v refund num');
  const sellB = btn('btn btn-secondary btn-danger btn-act', 'Sell (X)', ...act('Sell', sellV, 'X'));
  const actions = h('section', 'con-actions', { 'aria-label': 'Structure orders' }, targetB, upB, sellB);

  // ---------- console: build tray
  const cards = new Map<TowerId, { b: HTMLButtonElement; def: TowerDef }>();
  const cmdTray = h('section', 'well con-cmd', { role: 'toolbar', 'aria-label': 'Build structures' });
  for (const def of TOWER_LIST) {
    const b = btn(
      'tile cmd',
      `${def.name}, ${def.levels[0].cost} credits (${def.hotkey})`,
      h('span', 'cmd-key', {}, def.hotkey),
      icon(TOWER_ICONS[def.id], 'cmd-ico tile-art'),
      h('span', 'cmd-cost num', {}, String(def.levels[0].cost)),
    );
    b.addEventListener('click', () => clickBuild(def));
    hoverable(b, (on) => {
      if (on) hoverBuild = def.id;
      else if (hoverBuild === def.id) hoverBuild = null;
    });
    cards.set(def.id, { b, def });
    cmdTray.append(b);
  }

  // ---------- console: command powers (GDD §14), a 1×2 column joined to the build tray
  const powBtns = new Map<PowerId, { b: HTMLButtonElement; def: PowerDef; readyEl: HTMLElement; countEl: HTMLElement }>();
  const powTray = h('section', 'well con-pow', { role: 'toolbar', 'aria-label': 'Command powers' });
  for (const def of POWER_LIST) {
    const readyEl = h('span', 'pow-ready');
    const countEl = h('span', 'cmd-cost num pow-count');
    const key = def.hotkey.toUpperCase();
    const b = btn(
      'tile cmd pow',
      `${def.name} (${key})`,
      h('span', 'pow-sweep'),
      h('span', 'cmd-key', {}, key),
      icon(POWER_ICONS[def.id], 'cmd-ico tile-art'),
      readyEl,
      countEl,
    );
    b.addEventListener('click', () => clickPower(def));
    hoverable(b, (on) => {
      if (on) hoverPower = def.id;
      else if (hoverPower === def.id) hoverPower = null;
    });
    powBtns.set(def.id, { b, def, readyEl, countEl });
    powTray.append(b);
  }

  const consoleEl = h('div', 'panel hud-console', { 'data-mode': 'idle' }, waveWell, callB, info, actions, powTray, cmdTray);

  // ---------- transient layers
  const flashEl = h('div', 'hud-flash', { role: 'status', 'aria-live': 'assertive' });
  const floatLayer = h('div', 'hud-floats', { 'aria-hidden': 'true' });
  const floats = Array.from({ length: FLOAT_POOL }, () => floatLayer.appendChild(h('span', 'float')));
  let floatNext = 0;
  const overlay = h('div', 'modal-backdrop', { hidden: true });
  const vignette = h('div', 'hud-vignette', { 'aria-hidden': 'true' });

  const hud = h('div', 'sm-hud', {}, vignette, top, floatLayer, flashEl, consoleEl, overlay);
  root.append(hud);

  // ---------- actions
  function send(cmd: Command): boolean {
    const r = opts.dispatch(cmd);
    if (!r.ok) flash(r.error);
    return r.ok;
  }

  function setBuild(id: TowerId | null): void {
    if (selBuild === id) return;
    selBuild = id;
    opts.onBuildSelect(id);
    if (id !== null) setPower(null);
    if (id !== null && selTower !== null) setTower(null);
  }

  function setPower(id: PowerId | null): void {
    if (selPower === id) return;
    selPower = id;
    opts.onPowerSelect(id);
    if (id === null) return;
    setBuild(null);
    setTower(null);
  }

  function clickPower(def: PowerDef): void {
    if (selPower === def.id) return setPower(null);
    if (!state) return;
    const p = state.powers[def.id];
    if (state.waveIndex < 0) return flash('Charging begins with the assault');
    if (p.charges < 1) return flash(`${def.name} charging · ${secsLeft(def, p)}s`);
    setPower(def.id);
  }

  function setTower(id: number | null): void {
    if (selTower === id) return;
    selTower = id;
    opts.onTowerSelect(id);
  }

  function clickBuild(def: TowerDef): void {
    if (selBuild === def.id) return setBuild(null);
    if (state && state.cash < def.levels[0].cost) return flash('Not enough credits');
    setBuild(def.id);
  }

  const selected = (): TowerState | undefined =>
    selTower === null ? undefined : state?.towers.find((t) => t.id === selTower);

  function upgrade(): void {
    const t = selected();
    if (!t) return flash('No structure selected');
    send({ type: 'upgrade', towerId: t.id });
  }

  function sell(): void {
    const t = selected();
    if (!t) return flash('No structure selected');
    if (send({ type: 'sell', towerId: t.id })) setTower(null);
  }

  function cycleTargeting(): void {
    const t = selected();
    if (!t) return;
    const mode = TARGETING[(TARGETING.indexOf(t.targeting) + 1) % TARGETING.length]!;
    send({ type: 'setTargeting', towerId: t.id, mode });
  }

  function togglePause(): void {
    if (!state) return;
    send(state.status === 'paused' ? { type: 'resume' } : { type: 'pause' });
  }

  function cycleSpeed(): void {
    if (!state) return;
    send({ type: 'setSpeed', speed: state.speed === 3 ? 1 : ((state.speed + 1) as 2 | 3) });
  }

  function toggleMute(): void {
    muted = opts.onToggleMute();
    renderMute();
  }

  const callWave = (): void => void send({ type: 'callWave' });

  speedB.addEventListener('click', cycleSpeed);
  pauseB.addEventListener('click', togglePause);
  muteB.addEventListener('click', toggleMute);
  callB.addEventListener('click', callWave);
  targetB.addEventListener('click', cycleTargeting);
  upB.addEventListener('click', upgrade);
  sellB.addEventListener('click', sell);

  /** The pause modal's Sound checkbox, while the modal is open. */
  let soundBox: HTMLInputElement | null = null;
  function renderMute(): void {
    muteB.innerHTML = muted ? ICON_MUTED : ICON_SOUND;
    setAttr(muteB, 'aria-pressed', String(muted));
    muteB.title = muted ? 'Unmute' : 'Mute';
    setAttr(muteB, 'aria-label', muteB.title);
    if (soundBox) soundBox.checked = !muted;
  }
  renderMute();

  // ---------- hotkeys
  function onKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || !state) return;
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
    if (t instanceof HTMLElement && t.isContentEditable) return;
    // let a focused button handle its own activation keys
    if ((e.key === ' ' || e.key === 'Enter') && t instanceof HTMLButtonElement) return;
    if (state.status === 'victory' || state.status === 'defeat') return;
    const key = e.key.toLowerCase();
    if (state.status === 'paused' && key !== 'escape' && key !== 'p' && key !== 'f') return;
    // e.code too, so digit hotkeys work on AZERTY and similar layouts
    const def = TOWER_LIST.find((d) => d.hotkey === key || e.code === `Digit${d.hotkey}`);
    if (def) return clickBuild(def);
    const pow = POWER_LIST.find((d) => d.hotkey === key);
    if (pow) return clickPower(pow);
    switch (key) {
      case 'escape':
        if (state.status === 'paused') togglePause();
        else if (selPower !== null) setPower(null);
        else if (selBuild !== null) setBuild(null);
        else if (selTower !== null) setTower(null);
        else togglePause();
        break;
      case 'u':
        upgrade();
        break;
      case 'x':
        sell();
        break;
      case 'tab':
        if (selTower === null) return; // keep normal focus navigation
        cycleTargeting();
        break;
      case ' ':
        callWave();
        break;
      case 'p':
        togglePause();
        break;
      case 'f':
        cycleSpeed();
        break;
      default:
        return;
    }
    e.preventDefault();
  }
  window.addEventListener('keydown', onKey);

  // ---------- rendering
  /** Resolve the run's waves once per run and lay the boss / heavy ticks on the wave bar. */
  function syncWaves(s: GameState): void {
    const key = `${s.mapId}:${s.waveCount}`;
    if (key === wavesKey) return;
    wavesKey = key;
    const map = MAPS[s.mapId];
    waves = buildWaves(map, s.waveCount);
    const n = waves.length;
    // a tick after each boss wave, plus one where the heavy phase starts (unless a boss tick is already there)
    const marks = waves.flatMap((w, i) => (w.boss ? [i + 1] : []));
    if (n >= HEAVY_ONLY_FROM && !waves[HEAVY_ONLY_FROM - 2]?.boss) marks.push(HEAVY_ONLY_FROM - 1);
    for (const t of tickEls) t.el.remove();
    tickEls = marks.map((wave) => {
      const el = h('i', 'bar-tick', { style: `left:${((100 * wave) / n).toFixed(2)}%` });
      waveBar.append(el);
      return { el, wave };
    });
    setText(waveOf, `/ ${two(n)}`);
    customTag.hidden = n === map.waves.length; // ponytail: a custom run at the campaign length is the campaign
  }

  function renderTop(s: GameState, dt: number): void {
    if (shownCash < 0) shownCash = s.cash;
    const diff = s.cash - shownCash;
    // tick toward the real value instead of jumping
    shownCash = Math.abs(diff) < 1 ? s.cash : shownCash + Math.sign(diff) * Math.max(1, Math.abs(diff) * Math.min(1, dt * 8));
    setText(cashV, fmtInt(shownCash));
    setText(livesV, String(s.lives));
    livesBox.classList.toggle('is-low', s.lives <= 5);
    setText(speedB, `${s.speed}×`);
    const paused = s.status === 'paused';
    if (pauseB.dataset.paused !== String(paused)) {
      pauseB.dataset.paused = String(paused);
      pauseB.innerHTML = paused ? ICON_PLAY : ICON_PAUSE;
      pauseB.title = paused ? 'Resume (P)' : 'Pause menu (P)';
      setAttr(pauseB, 'aria-label', pauseB.title);
    }
    setText(missionV, `${MAPS[s.mapId].name} · ${DIFFICULTIES[s.difficultyId].name}`);

    // wave readout + bar
    const cur = waves[Math.max(0, s.waveIndex)];
    setText(waveNum, two(Math.max(0, s.waveIndex + 1)));
    const tone = s.waveIndex < 0 ? '' : s.waveIndex === s.waveCount - 1 ? 'final' : cur?.boss ? 'boss' : '';
    if (waveNum.dataset.tone !== tone) waveNum.dataset.tone = tone;
    const t = s.nextWaveIn;
    const hold = t !== null && held(s);
    setText(nextV, t === null ? '--' : hold ? 'HOLD' : `${Math.floor(Math.ceil(t) / 60)}:${two(Math.ceil(t) % 60)}`);
    nextV.classList.toggle('is-hold', hold);
    // cleared ≈ launched, minus the latest wave while it still spawns or has enemies up
    const cleared = s.status === 'victory' ? s.waveCount : Math.max(0, s.waveIndex + 1 - (s.waveActive || s.enemies.length ? 1 : 0));
    const w = `${((100 * cleared) / s.waveCount).toFixed(2)}%`;
    if (waveFill.style.width !== w) waveFill.style.width = w;
    for (const tk of tickEls) tk.el.classList.toggle('is-past', cleared >= tk.wave);

    let status: string;
    if (s.waveIndex < 0) status = 'Standing by · build defenses';
    else if (s.waveActive) status = 'Hostiles inbound';
    else if (hold) status = 'Next wave on hold · clear the field';
    else if (t !== null) status = `Next wave in ${Math.ceil(t)}s`;
    else if (s.waveIndex + 1 >= s.waveCount) status = 'Final wave · hold the line';
    else status = 'Awaiting orders';
    if (wavePanel.title !== status) {
      wavePanel.title = status;
      waveStatus.textContent = status;
    }
  }

  function renderWave(s: GameState): void {
    const key = `${wavesKey}:${s.waveIndex}`;
    if (key !== incomingKey) {
      incomingKey = key;
      const next = waves[s.waveIndex + 1];
      if (!next) incoming.replaceChildren(h('span', 'dim', {}, 'No further contacts'));
      else {
        const ids = [...new Set(next.groups.map((g) => g.enemyId))] as EnemyId[];
        incoming.replaceChildren(
          ...ids.map((id) => {
            const e = ENEMIES[id];
            const count = next.groups.filter((g) => g.enemyId === id).reduce((a, g) => a + g.count, 0);
            return h(
              'span',
              `chip foe foe-${e.faction}${e.isBoss ? ' foe-boss' : ''}`,
              { title: `${e.name} · ${cap(e.size)}${e.shield ? ' · shielded' : ''}` },
              `${count}× ${e.name}`,
              h('em', '', {}, e.size[0]!.toUpperCase()),
            );
          }),
        );
      }
    }

    const first = s.waveIndex < 0;
    setText(callLabel, first ? 'Begin assault' : 'Call wave');
    callB.classList.toggle('is-pulsing', first);
    const bonus = earlyCallBonus(s.nextWaveIn, s.difficultyId);
    setText(callBonus, bonus > 0 ? `+${bonus} cr` : '');
    const disabled = s.waveIndex + 1 >= s.waveCount || s.status !== 'playing';
    if (callB.disabled !== disabled) callB.disabled = disabled;
  }

  function renderCards(s: GameState): void {
    for (const { b, def } of cards.values()) {
      const poor = s.cash < def.levels[0].cost;
      setAttr(b, 'aria-disabled', poor ? 'true' : null);
      setAttr(b, 'aria-pressed', String(selBuild === def.id));
    }
  }

  function renderPowers(s: GameState): void {
    const standby = s.waveIndex < 0; // charging starts when wave 1 launches
    for (const { b, def, readyEl, countEl } of powBtns.values()) {
      const p = s.powers[def.id];
      const ready = p.charges > 0;
      if (selPower === def.id && !ready) setPower(null); // last charge spent (e.g. Shift-planting mines)
      const fill = `${p.charges >= def.maxCharges ? 100 : ((100 * p.charge) / def.chargeTime).toFixed(1)}%`;
      if (b.style.getPropertyValue('--fill') !== fill) b.style.setProperty('--fill', fill);
      setAttr(b, 'aria-disabled', standby ? 'true' : null);
      setAttr(b, 'aria-pressed', String(selPower === def.id));
      setAttr(b, 'data-ready', ready ? '' : null);
      setText(readyEl, ready ? 'READY' : '');
      let count = '';
      if (standby) count = 'STANDBY';
      else if (def.maxCharges > 1) count = `${p.charges}/${def.maxCharges}`;
      else if (!ready) count = `${secsLeft(def, p)}s`;
      setText(countEl, count);
    }
  }

  function renderPowerTip(def: PowerDef, armed: boolean, s: GameState): void {
    const p = s.powers[def.id];
    const standby = s.waveIndex < 0;
    setText(tipName, def.name);
    let status = `${secsLeft(def, p)}s`;
    if (standby) status = 'STANDBY';
    else if (p.charges > 0) status = def.maxCharges > 1 ? `READY ${p.charges}/${def.maxCharges}` : 'READY';
    setText(tipCost, status);
    tipCost.classList.remove('poor');
    setText(tipKey, def.hotkey.toUpperCase());
    setText(tipDesc, def.description);
    setText(tdK, 'CHARGE');
    setText(tdV, `${def.chargeTime}s`);
    if (def.kind === 'mine') {
      setText(tipType, 'Seismic');
      tipType.dataset.type = 'concussive';
      setText(trK, 'SLOW');
      setText(trV, `${Math.round(def.slow * 100)}%/${def.fieldDuration}s`);
      setText(tgK, 'FIELD');
      setText(tgV, String(def.fieldRadius));
      setText(tipSpecial, `Stores ${def.maxCharges} · lane tiles only · bosses slowed ${Math.round(def.slow * BOSS_SLOW_FACTOR * 100)}%`);
    } else {
      // pulse damage scales with the map's HP growth, like the enemies it hits (GDD §15: hpExponent past the authored waves)
      const map = MAPS[s.mapId];
      const dmg = Math.round(def.pulseDamage * map.hpGrowth ** hpExponent(Math.max(0, s.waveIndex), map.waves.length));
      setText(tipType, cap(def.damageType));
      tipType.dataset.type = def.damageType;
      setText(trK, 'DMG');
      setText(trV, `${dmg} ×${def.pulses}`);
      setText(tgK, 'RADIUS');
      setText(tgV, String(def.radius));
      setText(tipSpecial, `Ignores armor · ${def.telegraph}s warning · bosses lose ${Math.round(def.bossFraction * 100)}%`);
    }
    let hint = '';
    if (standby) hint = 'Charging begins with the assault';
    else if (armed && def.kind === 'mine') hint = 'TARGETING · click a lane tile · SHIFT plants more · ESC / right-click cancels';
    else if (armed) hint = 'TARGETING · click any tile · ESC / right-click cancels';
    setText(tipHint, hint);
  }

  function renderTip(def: TowerDef, building: boolean, cash: number): void {
    const l = def.levels[0];
    setText(tdK, 'DMG');
    setText(trK, 'RATE');
    setText(tgK, 'RANGE');
    setText(tipName, def.name);
    setText(tipCost, `${l.cost} cr`);
    tipCost.classList.toggle('poor', cash < l.cost);
    setText(tipType, cap(def.damageType));
    tipType.dataset.type = def.damageType;
    setText(tipKey, def.hotkey);
    setText(tipDesc, def.description);
    setText(tdV, dmgText(l));
    setText(trV, `${l.cooldown}s`);
    setText(tgV, String(l.range));
    setText(tipSpecial, specials(l));
    setText(tipHint, building ? 'BUILD MODE · click a pad to deploy · ESC / right-click cancels' : '');
  }

  function renderTower(t: TowerState, cash: number): void {
    const def = TOWERS[t.defId];
    const l = def.levels[t.level - 1]!;
    const next = def.levels[t.level as number];
    const hk = `${t.defId}:${t.level}`;
    if (hk !== headKey) {
      headKey = hk;
      tIcon.innerHTML = TOWER_ICONS[t.defId];
      const tone = rankTone(t.level);
      tLevel.className = tone === 'blue' ? 'badge' : `badge badge-${tone}`;
      tLevel.textContent = String(t.level);
      tLevel.title = `Level ${t.level}`;
    }
    setText(tName, def.name);
    setText(tType, cap(def.damageType));
    tType.dataset.type = def.damageType;
    setText(rDmg, dmgText(l));
    setText(rRate, `${l.cooldown}s`);
    setText(rRng, String(l.range));
    setText(rDealt, fmtInt(t.totalDamage));
    setText(rKills, String(t.kills));
    setText(tSpecial, specials(l));
    setText(targetV, cap(t.targeting));
    setText(upCost, next ? `${next.cost} cr` : 'MAX');
    upCost.classList.toggle('poor', !!next && cash < next.cost);
    setText(upDelta, next ? `NEXT ▸ ${upgradeDelta(l, next)}` : 'FULLY UPGRADED');
    if (upB.disabled !== !next) upB.disabled = !next;
    setText(sellV, `+${fmtInt(t.sellValue)} cr`);
  }

  function renderInfo(s: GameState): void {
    const t = selected();
    if (selTower !== null && !t) setTower(null); // sold or gone
    const tipDef = hoverBuild ? TOWERS[hoverBuild] : !hoverPower && !t && selBuild ? TOWERS[selBuild] : null;
    const powId = tipDef ? null : (hoverPower ?? selPower);
    const powDef = powId ? POWERS[powId] : null;
    const mode = tipDef || powDef ? 'tip' : t ? 'tower' : 'idle';
    if (consoleEl.dataset.mode !== mode) consoleEl.dataset.mode = mode;
    if (idleView.hidden !== (mode !== 'idle')) idleView.hidden = mode !== 'idle';
    if (towerView.hidden !== (mode !== 'tower')) towerView.hidden = mode !== 'tower';
    if (tipView.hidden !== (mode !== 'tip')) tipView.hidden = mode !== 'tip';
    info.classList.toggle('tip', mode === 'tip');
    if (tipDef) renderTip(tipDef, !hoverBuild || hoverBuild === selBuild, s.cash);
    else if (powDef) renderPowerTip(powDef, powDef.id === selPower, s);
    else if (t) renderTower(t, s.cash);
  }

  function renderBoss(s: GameState): void {
    const b = s.enemies.find((e) => ENEMIES[e.defId].isBoss);
    if (bossBar.hidden !== !b) bossBar.hidden = !b;
    if (!b) return;
    setText(bossName, `${ENEMIES[b.defId].name}${b.midBoss ? ' · vanguard' : ''}`);
    setText(bossNums, b.maxShield > 0 ? `${fmtInt(b.hp)} HP · ${fmtInt(b.shield)} SH` : `${fmtInt(b.hp)} HP`);
    bossHp.style.width = `${(100 * Math.max(0, b.hp)) / b.maxHp}%`;
    if (bossShieldBar.hidden !== !(b.maxShield > 0)) bossShieldBar.hidden = !(b.maxShield > 0);
    if (b.maxShield > 0) bossShield.style.width = `${(100 * Math.max(0, b.shield)) / b.maxShield}%`;
  }

  function renderOverlay(s: GameState): void {
    if (s.status === lastStatus) return;
    lastStatus = s.status;
    soundBox = null;
    if (s.status === 'playing') {
      overlay.hidden = true;
      overlay.replaceChildren();
      return;
    }
    const restart = (): void => opts.onRestart();
    let box: HTMLElement;
    if (s.status === 'paused') {
      const resume = btn('btn btn-primary', 'Resume', 'Resume');
      resume.addEventListener('click', togglePause);
      const rs = btn('btn btn-secondary', 'Restart mission', 'Restart mission');
      rs.addEventListener('click', restart);
      const quit = btn('btn btn-secondary btn-danger', 'Quit to menu', 'Quit to menu');
      quit.addEventListener('click', opts.onExitToMenu);
      soundBox = h('input', 'sr-only', { type: 'checkbox' });
      soundBox.checked = !muted;
      soundBox.addEventListener('change', toggleMute);
      box = h(
        'div',
        'panel modal',
        { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Paused' },
        h('h2', 'modal-title', {}, 'Paused'),
        h('p', 'modal-sub', {}, 'Tactical hold · all units standing by'),
        h('div', 'modal-actions', {}, resume, rs, quit),
        h('label', 'check modal-sound', {}, soundBox, h('span', 'check-box'), 'Sound'),
      );
    } else {
      const win = s.status === 'victory';
      const kills = s.towers.reduce((a, t) => a + t.kills, 0);
      const dealt = s.towers.reduce((a, t) => a + t.totalDamage, 0);
      const mins = Math.floor(s.time / 60);
      const secs = two(Math.floor(s.time % 60));
      const stats: [string, string][] = [
        ['Theatre', MAPS[s.mapId].name],
        ['Difficulty', DIFFICULTIES[s.difficultyId].name],
        ['Waves', `${Math.max(0, win ? s.waveCount : s.waveIndex)} / ${s.waveCount} cleared`],
        ['Lives remaining', String(Math.max(0, s.lives))],
        ['Credits banked', `${fmtInt(s.cash)} cr`],
        ['Hostiles destroyed', fmtInt(kills)],
        ['Damage dealt', fmtInt(dealt)],
        ['Mission time', `${mins}:${secs}`],
      ];
      const retry = btn(`btn ${win ? 'btn-secondary' : 'btn-primary'}`, 'Retry mission', 'Retry');
      retry.addEventListener('click', restart);
      const home = btn(`btn ${win ? 'btn-primary' : 'btn-secondary'}`, 'Main menu', 'Main menu');
      home.addEventListener('click', opts.onExitToMenu);
      box = h(
        'div',
        `panel modal modal-end ${win ? 'is-win' : 'is-lose'}`,
        { role: 'dialog', 'aria-modal': 'true', 'aria-label': win ? 'Victory' : 'Defeat' },
        h('h2', 'modal-title', {}, win ? 'Victory' : 'Defeat'),
        h('p', 'modal-sub', {}, win ? 'Sector secured · the line held' : 'Core breached · outpost lost'),
        rows(stats),
        // primary first: Main menu on victory, Retry on defeat
        h('div', 'modal-actions modal-actions-row', {}, ...(win ? [home, retry] : [retry, home])),
      );
    }
    overlay.replaceChildren(box);
    overlay.hidden = false;
    // End screen: focus the dialog, not Retry, so a held Space/Enter can't restart before it's read.
    box.tabIndex = -1;
    (s.status === 'paused' ? box.querySelector('button') ?? box : box).focus({ preventScroll: true });
  }

  // ---------- transient feedback (WAAPI ignores the CSS reduced-motion switch: opacity-only keyframes then)
  function flash(message: string, kind: FlashKind = 'info'): void {
    flashEl.textContent = message;
    flashEl.dataset.kind = kind;
    flashEl.getAnimations().forEach((a) => a.cancel());
    const still = prefersReducedMotion();
    const y = (px: number) => (still ? 'translate(-50%, 0)' : `translate(-50%, ${px}px)`);
    flashEl.animate(
      [
        { opacity: 0, transform: y(6) },
        { opacity: 1, transform: y(0), offset: 0.08 },
        { opacity: 1, transform: y(0), offset: 0.8 },
        { opacity: 0, transform: y(0) },
      ],
      { duration: 2000, fill: 'forwards' },
    );
  }

  function floatText(screenX: number, screenY: number, text: string, kind: 'cash' | 'damage'): void {
    const el = floats[floatNext]!;
    floatNext = (floatNext + 1) % FLOAT_POOL;
    el.textContent = text;
    el.className = `float float-${kind}`;
    el.style.left = `${screenX}px`;
    el.style.top = `${screenY}px`;
    el.getAnimations().forEach((a) => a.cancel());
    const timing = { duration: kind === 'damage' ? 650 : 1100, easing: 'ease-out', fill: 'forwards' } as const;
    if (prefersReducedMotion()) {
      el.style.transform = 'translate(-50%, -14px)';
      el.animate([{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], timing);
      return;
    }
    // pop in, hang, drift up and fade
    el.animate(
      [
        { opacity: 0, transform: 'translate(-50%, 0) scale(0.5)' },
        { opacity: 1, transform: 'translate(-50%, -8px) scale(1.3)', offset: 0.12 },
        { opacity: 1, transform: 'translate(-50%, -14px) scale(1)', offset: 0.3 },
        { opacity: 1, transform: 'translate(-50%, -26px) scale(1)', offset: 0.7 },
        { opacity: 0, transform: 'translate(-50%, -40px) scale(0.95)' },
      ],
      timing,
    );
  }

  function leak(): void {
    vignette.getAnimations().forEach((a) => a.cancel());
    vignette.animate([{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 0 }], { duration: 700, easing: 'ease-out' });
  }

  return {
    update(s) {
      state = s;
      const now = performance.now();
      const dt = (now - lastFrame) / 1000;
      lastFrame = now;
      syncWaves(s);
      renderTop(s, dt);
      renderWave(s);
      renderCards(s);
      renderPowers(s);
      renderInfo(s);
      renderBoss(s);
      renderOverlay(s);
    },
    selectTower(id) {
      selTower = id;
    },
    selectBuild(id) {
      selBuild = id;
    },
    selectPower(id) {
      selPower = id;
    },
    floatText,
    flash,
    leak,
    destroy() {
      window.removeEventListener('keydown', onKey);
      hud.remove();
    },
  };
}
