import { DIFFICULTIES } from '../data/difficulty';
import { WAVE_COUNTDOWN } from '../data/economy';
import { ENEMIES } from '../data/enemies';
import { MAPS } from '../data/maps';
import { TOWERS, TOWER_LIST } from '../data/towers';
import type { EnemyId, TargetingMode, TowerDef, TowerId, TowerLevel } from '../data/types';
import { earlyCallBonus } from '../sim';
import type { Command, CommandResult, GameState, GameStatus, TowerState } from '../sim/types';
import { cap, dlRows, fmtInt, h, setAttr, setText } from './dom';
import { ICON_COMMS, ICON_CREDITS, ICON_LIVES, ICON_MUTED, ICON_PAUSE, ICON_PLAY, ICON_SOUND, TOWER_ICONS } from './icons';

export interface HudOptions {
  dispatch(cmd: Command): CommandResult;
  onBuildSelect(defId: TowerId | null): void;
  onTowerSelect(towerId: number | null): void;
  onExitToMenu(): void;
  /** Returns the new muted state. */
  onToggleMute(): boolean;
  /** Audio is already muted (mute outlives a single game). */
  muted: boolean;
  /** Pause-menu Restart / end-screen Retry. */
  onRestart(): void;
}

export interface Hud {
  update(state: GameState): void;
  selectTower(towerId: number | null): void;
  selectBuild(defId: TowerId | null): void;
  floatText(screenX: number, screenY: number, text: string, kind: 'cash' | 'damage'): void;
  flash(message: string): void;
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
  const b = h('button', `btn ${cls}`, { type: 'button', 'aria-label': label, title: label }, ...children);
  // mouse clicks shouldn't leave focus on the button (Space would re-click it instead of calling the wave)
  b.addEventListener('pointerup', () => b.blur());
  return b;
}

function icon(svg: string, cls = 'ico'): HTMLSpanElement {
  const s = h('span', cls);
  s.innerHTML = svg;
  return s;
}

/** The sim leaves the countdown at exactly WAVE_COUNTDOWN while it holds for the field to clear. */
const held = (s: GameState): boolean => s.nextWaveIn === WAVE_COUNTDOWN && s.enemies.length > 0;

function row(label: string): [HTMLElement, HTMLElement] {
  const v = h('dd');
  return [h('div', 'stat', {}, h('dt', '', {}, label), v), v];
}

export function createHud(root: HTMLElement, opts: HudOptions): Hud {
  let state: GameState | null = null;
  let selTower: number | null = null;
  let selBuild: TowerId | null = null;
  let hoverBuild: TowerId | null = null;
  let shownCash = -1;
  let lastFrame = performance.now();
  let lastStatus: GameStatus | null = null;
  let incomingKey = '';
  let portraitKey = '';
  let muted = opts.muted;

  // ---------- top bar
  const cashV = h('span', 'num');
  const livesV = h('span', 'num');
  const waveV = h('span', 'num');
  const nextV = h('span', 'num');
  const speedB = btn('btn-sq btn-speed', 'Game speed (F)');
  const pauseB = btn('btn-sq', 'Pause (P)');
  const muteB = btn('btn-sq', 'Mute');
  const livesBox = h('div', 'res res-lives', { title: 'Lives' }, icon(ICON_LIVES), livesV);
  const missionV = h('span');
  const top = h(
    'div',
    'hud-top',
    {},
    h('div', 'panel hud-mission', {}, missionV),
    h(
      'div',
      'panel hud-res',
      {},
      h('div', 'res res-cash', { title: 'Credits' }, icon(ICON_CREDITS), cashV),
      livesBox,
      h('div', 'res', {}, h('span', 'res-label', {}, 'WAVE'), waveV),
      h('div', 'res', {}, h('span', 'res-label', {}, 'NEXT'), nextV),
      h('div', 'res-btns', {}, speedB, pauseB, muteB),
    ),
  );

  // ---------- console: wave panel
  const waveTitle = h('div', 'wp-title');
  const waveStatus = h('div', 'wp-status');
  const incoming = h('div', 'wp-incoming');
  const callLabel = h('span', 'call-label');
  const callBonus = h('span', 'call-bonus');
  const callB = btn('btn-call', 'Call wave (Space)', callLabel, callBonus, h('kbd', '', {}, 'SPACE'));
  const wavePanel = h(
    'section',
    'screen scanlines con-wave',
    { 'aria-label': 'Wave status' },
    waveTitle,
    waveStatus,
    incoming,
    callB,
  );

  // ---------- console: portrait
  const portraitGlyph = h('div', 'portrait-glyph');
  const portraitCap = h('div', 'portrait-cap');
  const portrait = h('div', 'screen scanlines con-portrait', { 'aria-hidden': 'true' }, h('div', 'static'), portraitGlyph, portraitCap);

  // ---------- console: info panel (three mutually exclusive views)
  const idleView = h(
    'div',
    'info-idle',
    {},
    h('div', 'info-name', {}, 'No structure selected'),
    h('p', '', {}, 'Choose a structure from the command card [1–6], then deploy it on a build pad.'),
    h('p', 'dim', {}, 'Click a structure to inspect it. ESC cancels. P pauses.'),
  );

  const tName = h('div', 'info-name');
  const tPips = h('span', 'pips');
  const tType = h('span', 'dtype');
  const [rDmgRow, rDmg] = row('DMG');
  const [rRateRow, rRate] = row('RATE');
  const [rRngRow, rRng] = row('RANGE');
  const [rDealtRow, rDealt] = row('DEALT');
  const [rKillsRow, rKills] = row('KILLS');
  const tSpecial = h('div', 'info-special');
  const targetV = h('span', 'tgt-v');
  const targetB = btn('btn-act', 'Cycle targeting (Tab)', h('span', 'act-k', {}, 'TARGET'), targetV, h('kbd', '', {}, 'TAB'));
  const upCost = h('span', 'cost');
  const upDelta = h('span', 'delta');
  const upB = btn('btn-act btn-up', 'Upgrade (U)', h('span', 'act-k', {}, 'UPGRADE'), upCost, h('kbd', '', {}, 'U'));
  const sellV = h('span', 'cost refund');
  const sellB = btn('btn-act btn-sell', 'Sell (X)', h('span', 'act-k', {}, 'SELL'), sellV, h('kbd', '', {}, 'X'));
  const towerView = h(
    'div',
    'info-tower',
    {},
    h(
      'div',
      'info-main',
      {},
      h('div', 'info-head', {}, tName, tPips, tType),
      h('dl', 'stats', {}, rDmgRow, rRateRow, rRngRow, rDealtRow, rKillsRow),
      tSpecial,
      upDelta,
    ),
    h('div', 'info-actions', {}, targetB, upB, sellB),
  );

  const tipName = h('div', 'info-name');
  const tipCost = h('span', 'cost');
  const tipType = h('span', 'dtype');
  const tipKey = h('kbd');
  const tipDesc = h('p', 'tip-desc');
  const [tdRow, tdV] = row('DMG');
  const [trRow, trV] = row('RATE');
  const [tgRow, tgV] = row('RANGE');
  const tipSpecial = h('div', 'info-special');
  const tipHint = h('div', 'tip-hint');
  const tipView = h(
    'div',
    'info-tip',
    {},
    h('div', 'info-head', {}, tipName, tipCost, tipType, tipKey),
    tipDesc,
    h('dl', 'stats', {}, tdRow, trRow, tgRow),
    tipSpecial,
    tipHint,
  );

  const info = h('section', 'screen con-info', { 'aria-label': 'Selection', 'aria-live': 'polite' }, idleView, towerView, tipView);

  // ---------- console: command card
  const cards = new Map<TowerId, { b: HTMLButtonElement; def: TowerDef }>();
  const cardGrid = h('div', 'cmd-grid', { role: 'toolbar', 'aria-label': 'Build structures' });
  for (const def of TOWER_LIST) {
    const b = btn(
      'cmd',
      `${def.name}, ${def.levels[0].cost} credits (${def.hotkey})`,
      h('span', 'cmd-key', {}, def.hotkey),
      icon(TOWER_ICONS[def.id], 'cmd-ico'),
      h('span', 'cmd-cost', {}, String(def.levels[0].cost)),
    );
    b.addEventListener('click', () => clickBuild(def));
    const enter = (): void => void (hoverBuild = def.id);
    const leave = (): void => {
      if (hoverBuild === def.id) hoverBuild = null;
    };
    b.addEventListener('pointerenter', enter);
    b.addEventListener('pointerleave', leave);
    b.addEventListener('focus', enter);
    b.addEventListener('blur', () => b.matches(':hover') || leave());
    cards.set(def.id, { b, def });
    cardGrid.append(b);
  }
  const cmdCard = h('section', 'con-cmd', { 'aria-label': 'Command card' }, cardGrid);

  const consoleEl = h('div', 'panel hud-console', {}, wavePanel, portrait, info, cmdCard);

  // ---------- transient layers
  const flashEl = h('div', 'hud-flash', { role: 'status', 'aria-live': 'assertive' });
  const floatLayer = h('div', 'hud-floats', { 'aria-hidden': 'true' });
  const floats = Array.from({ length: FLOAT_POOL }, () => floatLayer.appendChild(h('span', 'float')));
  let floatNext = 0;
  const overlay = h('div', 'hud-overlay', { hidden: true });
  const vignette = h('div', 'hud-vignette', { 'aria-hidden': 'true' });

  // ---------- boss bar (top centre while a boss is alive)
  const bossName = h('span', 'boss-name');
  const bossNums = h('span', 'boss-nums');
  const bossHp = h('div', 'boss-fill boss-hp');
  const bossShield = h('div', 'boss-fill boss-shield');
  const bossBar = h(
    'div',
    'panel hud-boss',
    { hidden: true, role: 'status' },
    h('div', 'boss-head', {}, bossName, bossNums),
    h('div', 'boss-track', {}, bossHp),
    h('div', 'boss-track boss-track-shield', {}, bossShield),
  );

  const hud = h('div', 'sm-hud', {}, vignette, top, bossBar, floatLayer, flashEl, consoleEl, overlay);
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
    if (id !== null && selTower !== null) setTower(null);
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

  const callWave = (): void => void send({ type: 'callWave' });

  speedB.addEventListener('click', cycleSpeed);
  pauseB.addEventListener('click', togglePause);
  muteB.addEventListener('click', () => {
    muted = opts.onToggleMute();
    renderMute();
  });
  callB.addEventListener('click', callWave);
  targetB.addEventListener('click', cycleTargeting);
  upB.addEventListener('click', upgrade);
  sellB.addEventListener('click', sell);

  function renderMute(): void {
    muteB.innerHTML = muted ? ICON_MUTED : ICON_SOUND;
    setAttr(muteB, 'aria-pressed', String(muted));
    muteB.title = muted ? 'Unmute' : 'Mute';
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
    switch (key) {
      case 'escape':
        if (state.status === 'paused') togglePause();
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
  function renderTop(s: GameState, dt: number): void {
    if (shownCash < 0) shownCash = s.cash;
    const diff = s.cash - shownCash;
    // tick toward the real value instead of jumping
    shownCash = Math.abs(diff) < 1 ? s.cash : shownCash + Math.sign(diff) * Math.max(1, Math.abs(diff) * Math.min(1, dt * 8));
    setText(cashV, fmtInt(shownCash));
    setText(livesV, String(s.lives));
    livesBox.classList.toggle('low', s.lives <= 5);
    const w = String(Math.max(0, s.waveIndex + 1)).padStart(2, '0');
    setText(waveV, `${w}/${String(s.waveCount).padStart(2, '0')}`);
    setText(nextV, s.nextWaveIn === null ? '--' : held(s) ? 'HOLD' : `0:${String(Math.ceil(s.nextWaveIn)).padStart(2, '0')}`);
    setText(speedB, `${s.speed}×`);
    const paused = s.status === 'paused';
    if (pauseB.dataset.paused !== String(paused)) {
      pauseB.dataset.paused = String(paused);
      pauseB.innerHTML = paused ? ICON_PLAY : ICON_PAUSE;
      pauseB.title = paused ? 'Resume (P)' : 'Pause (P)';
      setAttr(pauseB, 'aria-label', pauseB.title);
    }
    setText(missionV, `${MAPS[s.mapId].name} · ${DIFFICULTIES[s.difficultyId].name}`);
  }

  function renderWave(s: GameState): void {
    const n = s.waveIndex + 1;
    setText(waveTitle, `WAVE ${String(Math.max(0, n)).padStart(2, '0')} / ${s.waveCount}`);
    const left = s.waveIndex + 1 >= s.waveCount;
    let status: string;
    if (s.waveIndex < 0) status = 'STANDING BY · BUILD DEFENSES';
    else if (s.waveActive) status = 'HOSTILES INBOUND';
    else if (s.nextWaveIn !== null && held(s)) status = 'NEXT WAVE ON HOLD · CLEAR THE FIELD';
    else if (s.nextWaveIn !== null) status = `NEXT WAVE  T-${Math.ceil(s.nextWaveIn)}s`;
    else if (left) status = 'FINAL WAVE · HOLD THE LINE';
    else status = 'AWAITING ORDERS';
    setText(waveStatus, status);

    const key = `${s.mapId}:${s.waveIndex}`;
    if (key !== incomingKey) {
      incomingKey = key;
      const next = MAPS[s.mapId].waves[s.waveIndex + 1];
      if (!next) incoming.replaceChildren(h('span', 'dim', {}, 'NO FURTHER CONTACTS'));
      else {
        const ids = [...new Set(next.groups.map((g) => g.enemyId))] as EnemyId[];
        incoming.replaceChildren(
          h('span', 'wp-next', {}, 'NEXT ▸'),
          ...ids.map((id) => {
            const e = ENEMIES[id];
            const count = next.groups.filter((g) => g.enemyId === id).reduce((a, g) => a + g.count, 0);
            return h(
              'span',
              `foe foe-${e.faction}${e.isBoss ? ' foe-boss' : ''}`,
              { title: `${e.name} · ${cap(e.size)}${e.shield ? ' · shielded' : ''}` },
              `${count}× ${e.name}`,
              h('em', '', {}, e.size[0]!.toUpperCase()),
            );
          }),
        );
      }
    }

    setText(callLabel, s.waveIndex < 0 ? 'BEGIN ASSAULT' : 'CALL WAVE');
    const bonus = earlyCallBonus(s.nextWaveIn, s.difficultyId);
    setText(callBonus, bonus > 0 ? `+${bonus} cr` : '');
    const disabled = left || s.status !== 'playing';
    if (callB.disabled !== disabled) callB.disabled = disabled;
  }

  function renderCards(s: GameState): void {
    for (const { b, def } of cards.values()) {
      const poor = s.cash < def.levels[0].cost;
      setAttr(b, 'aria-disabled', poor ? 'true' : null);
      setAttr(b, 'aria-pressed', String(selBuild === def.id));
    }
  }

  function renderTip(def: TowerDef, building: boolean, cash: number): void {
    const l = def.levels[0];
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
    setText(tName, def.name);
    setText(tPips, '◆'.repeat(t.level) + '◇'.repeat(3 - t.level));
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
    const tipDef = hoverBuild ? TOWERS[hoverBuild] : !t && selBuild ? TOWERS[selBuild] : null;
    const mode = tipDef ? 'tip' : t ? 'tower' : 'idle';
    if (idleView.hidden !== (mode !== 'idle')) idleView.hidden = mode !== 'idle';
    if (towerView.hidden !== (mode !== 'tower')) towerView.hidden = mode !== 'tower';
    if (tipView.hidden !== (mode !== 'tip')) tipView.hidden = mode !== 'tip';
    if (tipDef) renderTip(tipDef, !hoverBuild || hoverBuild === selBuild, s.cash);
    else if (t) renderTower(t, s.cash);

    const pDef = tipDef ?? (t ? TOWERS[t.defId] : null);
    const pk = pDef ? `${pDef.id}:${t?.level ?? 0}` : 'idle';
    if (pk !== portraitKey) {
      portraitKey = pk;
      portraitGlyph.innerHTML = pDef ? TOWER_ICONS[pDef.id] : ICON_COMMS;
      portrait.classList.toggle('idle', !pDef);
      portraitCap.textContent = pDef ? (t && !tipDef ? `MK ${'I'.repeat(t.level)}` : 'SCHEMATIC') : 'COMMS';
    }
  }

  function renderBoss(s: GameState): void {
    const b = s.enemies.find((e) => ENEMIES[e.defId].isBoss);
    if (bossBar.hidden !== !b) bossBar.hidden = !b;
    if (!b) return;
    setText(bossName, `${ENEMIES[b.defId].name}${b.midBoss ? ' · vanguard' : ''}`);
    setText(bossNums, b.maxShield > 0 ? `${fmtInt(b.hp)} HP · ${fmtInt(b.shield)} SH` : `${fmtInt(b.hp)} HP`);
    bossHp.style.width = `${(100 * Math.max(0, b.hp)) / b.maxHp}%`;
    const track = bossShield.parentElement!;
    if (track.hidden !== !(b.maxShield > 0)) track.hidden = !(b.maxShield > 0);
    if (b.maxShield > 0) bossShield.style.width = `${(100 * Math.max(0, b.shield)) / b.maxShield}%`;
  }

  function renderOverlay(s: GameState): void {
    if (s.status === lastStatus) return;
    lastStatus = s.status;
    if (s.status === 'playing') {
      overlay.hidden = true;
      overlay.replaceChildren();
      return;
    }
    const restart = (): void => opts.onRestart();
    let box: HTMLElement;
    if (s.status === 'paused') {
      const resume = btn('btn-wide', 'Resume', 'Resume');
      resume.addEventListener('click', togglePause);
      const rs = btn('btn-wide', 'Restart mission', 'Restart mission');
      rs.addEventListener('click', restart);
      const quit = btn('btn-wide btn-danger', 'Quit to menu', 'Quit to menu');
      quit.addEventListener('click', opts.onExitToMenu);
      box = h(
        'div',
        'panel ov-box',
        { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Paused' },
        h('h2', 'ov-title', {}, 'Paused'),
        h('p', 'ov-sub', {}, 'Tactical hold · all units standing by'),
        h('div', 'ov-btns', {}, resume, rs, quit),
      );
    } else {
      const win = s.status === 'victory';
      const kills = s.towers.reduce((a, t) => a + t.kills, 0);
      const dealt = s.towers.reduce((a, t) => a + t.totalDamage, 0);
      const mins = Math.floor(s.time / 60);
      const secs = String(Math.floor(s.time % 60)).padStart(2, '0');
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
      const retry = btn('btn-wide', 'Retry mission', 'Retry');
      retry.addEventListener('click', restart);
      const home = btn('btn-wide', 'Main menu', 'Main menu');
      home.addEventListener('click', opts.onExitToMenu);
      box = h(
        'div',
        `panel ov-box ov-end ${win ? 'ov-win' : 'ov-lose'}`,
        { role: 'dialog', 'aria-modal': 'true', 'aria-label': win ? 'Victory' : 'Defeat' },
        h('h2', 'ov-title', {}, win ? 'Victory' : 'Defeat'),
        h('p', 'ov-sub', {}, win ? 'Sector secured · the line held' : 'Core breached · outpost lost'),
        h('dl', 'screen scanlines ov-stats', {}, ...dlRows(stats)),
        h('div', 'ov-btns ov-btns-row', {}, retry, home),
      );
    }
    overlay.replaceChildren(box);
    overlay.hidden = false;
    // End screen: focus the dialog, not Retry, so a held Space/Enter can't restart before it's read.
    box.tabIndex = -1;
    (s.status === 'paused' ? box.querySelector('button') ?? box : box).focus({ preventScroll: true });
  }

  // ---------- transient feedback
  function flash(message: string): void {
    flashEl.textContent = message;
    flashEl.getAnimations().forEach((a) => a.cancel());
    flashEl.animate(
      [
        { opacity: 0, transform: 'translate(-50%, 6px)' },
        { opacity: 1, transform: 'translate(-50%, 0)', offset: 0.08 },
        { opacity: 1, transform: 'translate(-50%, 0)', offset: 0.8 },
        { opacity: 0, transform: 'translate(-50%, 0)' },
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
    // pop in, hang, drift up and fade
    el.animate(
      [
        { opacity: 0, transform: 'translate(-50%, 0) scale(0.5)' },
        { opacity: 1, transform: 'translate(-50%, -8px) scale(1.3)', offset: 0.12 },
        { opacity: 1, transform: 'translate(-50%, -14px) scale(1)', offset: 0.3 },
        { opacity: 1, transform: 'translate(-50%, -26px) scale(1)', offset: 0.7 },
        { opacity: 0, transform: 'translate(-50%, -40px) scale(0.95)' },
      ],
      { duration: kind === 'damage' ? 650 : 1100, easing: 'ease-out', fill: 'forwards' },
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
      renderTop(s, dt);
      renderWave(s);
      renderCards(s);
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
    floatText,
    flash,
    leak,
    destroy() {
      window.removeEventListener('keydown', onKey);
      hud.remove();
    },
  };
}
