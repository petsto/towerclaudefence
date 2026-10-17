import { DIFFICULTIES, DIFFICULTY_LIST } from '../data/difficulty';
import { MAPS, MAP_LIST } from '../data/maps';
import type { DifficultyDef, DifficultyId, MapDef, MapId } from '../data/types';
import { CUSTOM_WAVES_MAX, CUSTOM_WAVES_MIN, HEAVY_ONLY_FROM, clampWaveCount } from '../data/waves';
import type { SimConfig } from '../sim/types';
import { badge, cap, fmtInt, h, prefersReducedMotion, rankTone } from './dom';
import { ICON_MUTED, ICON_SOUND } from './icons';
import { drawMapThumbnail } from './thumbnail';

const GAME_SUBTITLE = 'Frontier Defense Command';
const MASCOT_SRC = `${import.meta.env.BASE_URL}favicon.svg`;

const LS_MAP = 'tower-claudefence.map';
const LS_DIFF = 'tower-claudefence.difficulty';
const LS_WAVE_MODE = 'tower-claudefence.waveMode';
const LS_WAVES = 'tower-claudefence.waves';

/** Pip rows are as long as the highest tier on offer (at least 4), so every card's row lines up. */
const MAX_TIER = Math.max(4, ...MAP_LIST.map((m) => m.tier));
/** Range thumb is 14px wide: its centre travels from 7px to (100% - 7px). Ticks and fill use the same mapping. */
const thumbPos = (v: number): string =>
  `calc(7px + (100% - 14px) * ${(v - CUSTOM_WAVES_MIN) / (CUSTOM_WAVES_MAX - CUSTOM_WAVES_MIN)})`;

const DIFF_FLAVOR: Readonly<Record<DifficultyId, string>> = {
  easy: 'Fresh crews, forgiving odds. Extra credits and a deep reserve of lives.',
  normal: 'The frontier as briefed. Hostile strength matches field intelligence.',
  hard: 'Hostiles hit harder and move faster. Supply drops run lean.',
  brutal: 'Command expects losses. Hardened carapace, thin margins, no second chances.',
};

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage blocked (private mode etc.): selection just isn't remembered
  }
}

const x = (n: number): string => `×${n.toFixed(2)}`;
function diffMods(d: DifficultyDef): string {
  const mods = [`HP ${x(d.hpMult)}`, `SPEED ${x(d.speedMult)}`, `BOUNTY ${x(d.cashMult)}`, `${d.lives} LIVES`];
  if (d.armorAdd) mods.splice(2, 0, `ARMOR +${d.armorAdd}`);
  return mods.join(' · ');
}

const pips = (tier: number): HTMLElement =>
  h('span', 'pips', { 'aria-hidden': 'true' }, ...Array.from({ length: MAX_TIER }, (_, i) => h('i', i < tier ? 'on' : '')));

const row = (k: string, ...v: (Node | string)[]): HTMLElement => h('div', 'row', {}, h('dt', '', {}, k), h('dd', '', {}, ...v));

/** Two-option segmented control (`.seg`); returns the group and its inputs. */
function seg<T extends string>(name: string, label: string, opts: readonly [T, string][], value: T, onPick: (v: T) => void) {
  const group = h('div', 'seg', { role: 'radiogroup', 'aria-label': label });
  const inputs = opts.map(([v, text]) => {
    const input = h('input', 'sr-only', { type: 'radio', name, value: v, checked: v === value });
    input.addEventListener('change', () => onPick(v));
    group.append(h('label', '', {}, input, h('span', '', {}, text)));
    return input;
  });
  return { group, inputs };
}

/** Same contract as the HUD's mute control; omit for no mute button (dev sandboxes). */
export interface HomeAudio {
  muted: boolean;
  /** Returns the new muted state. */
  onToggleMute(): boolean;
}

export function createHomeScreen(root: HTMLElement, onStart: (cfg: SimConfig) => void, audio?: HomeAudio): { destroy(): void } {
  const savedMap = load(LS_MAP);
  const savedDiff = load(LS_DIFF);
  const savedWaves = Number(load(LS_WAVES));
  let mapId: MapId = savedMap && Object.hasOwn(MAPS, savedMap) ? (savedMap as MapId) : MAP_LIST[0]!.id;
  let diffId: DifficultyId = savedDiff && Object.hasOwn(DIFFICULTIES, savedDiff) ? (savedDiff as DifficultyId) : 'normal';
  let custom = load(LS_WAVE_MODE) === 'custom';
  // first Custom value: the remembered one, else the selected map's campaign length
  let waves = clampWaveCount(savedWaves > 0 ? savedWaves : MAPS[mapId].waves.length);

  // --- backdrop
  const stars = h('canvas', 'home-stars', { 'aria-hidden': 'true' });
  const planet = h('div', 'home-planet', { 'aria-hidden': 'true' });

  // --- map list
  const px = window.devicePixelRatio >= 2 ? 16 : 12;
  const mapList = h('div', 'home-maplist', { role: 'radiogroup', 'aria-label': 'Theatre of operations' });
  for (const m of MAP_LIST) {
    const thumb = h('canvas', 'thumb');
    drawMapThumbnail(thumb, m, px);
    const input = h('input', 'sr-only', {
      type: 'radio',
      name: 'sm-map',
      value: m.id,
      checked: m.id === mapId,
      'aria-label': `${m.name}, ${cap(m.biome)}, threat tier ${m.tier}, ${m.waves.length} waves`,
    });
    input.addEventListener('change', () => selectMap(m.id));
    mapList.append(
      h(
        'label',
        'map-card',
        {},
        input,
        h(
          'span',
          'tile',
          {},
          h('span', 'tile-art well', {}, thumb, badge(String(m.tier), rankTone(m.tier), 24)),
          h('span', 'map-name', {}, m.name),
          h('span', 'map-meta', {}, h('span', '', {}, `${cap(m.biome)} · ${m.waves.length} waves`), pips(m.tier)),
        ),
      ),
    );
  }

  // --- briefing
  const briefTitle = h('h2', 'brief-map');
  const briefBadge = h('span');
  const intel = h('dl', 'rows brief-intel');
  const briefText = h('p', 'brief-text', { 'aria-hidden': 'true' });
  const briefSr = h('p', 'sr-only');

  const diff = seg('sm-diff', 'Difficulty', DIFFICULTY_LIST.map((d) => [d.id, d.name] as [DifficultyId, string]), diffId, selectDiff);
  const diffDesc = h('p', 'diff-desc');
  const diffMod = h('p', 'diff-mods');

  // --- wave count (GDD §15, spec §3.3)
  const mode = seg('sm-waves', 'Wave count', [['campaign', 'Campaign'], ['custom', 'Custom']], custom ? 'custom' : 'campaign', (v) => {
    custom = v === 'custom';
    // never picked a custom length yet: start from this map's campaign length
    if (custom && load(LS_WAVES) === null) waves = clampWaveCount(MAPS[mapId].waves.length);
    save(LS_WAVE_MODE, v);
    renderWaves();
  });
  const campaignLabel = mode.group.querySelector('span')!;
  const minus = h('button', 'btn btn-secondary btn-icon', { type: 'button', 'aria-label': 'Fewer waves', title: 'Fewer waves' }, '−');
  const plus = h('button', 'btn btn-secondary btn-icon', { type: 'button', 'aria-label': 'More waves', title: 'More waves' }, '+');
  const out = h('output', 'well wave-out', { 'aria-hidden': 'true' });
  const heavyBadge = badge('!', 'violet', 22);
  heavyBadge.title = `Waves ${HEAVY_ONLY_FROM}+: bosses and heavies only`;
  const range = h('input', 'range', {
    type: 'range',
    min: CUSTOM_WAVES_MIN,
    max: CUSTOM_WAVES_MAX,
    step: 1,
    'aria-label': 'Custom wave count',
  });
  range.style.setProperty('--zone', thumbPos(HEAVY_ONLY_FROM));
  const tickValues = [CUSTOM_WAVES_MIN, HEAVY_ONLY_FROM, CUSTOM_WAVES_MAX];
  for (let t = Math.ceil((CUSTOM_WAVES_MIN + 1) / 10) * 10; t < CUSTOM_WAVES_MAX; t += 10)
    if (Math.abs(t - HEAVY_ONLY_FROM) > 2) tickValues.push(t);
  const ticks = h(
    'div',
    'ticks',
    { 'aria-hidden': 'true' },
    ...tickValues.map((t) => h('span', t === HEAVY_ONLY_FROM ? 'heavy' : '', { style: `left:${thumbPos(t)}` }, String(t))),
  );
  const note = h('p', 'zone-note');
  const customBox = h(
    'div',
    'wave-custom',
    {},
    h('div', 'stepper', {}, minus, h('div', 'wave-range', {}, range, ticks), plus, out, heavyBadge),
    note,
  );
  minus.addEventListener('click', () => setWaves(waves - 1));
  plus.addEventListener('click', () => setWaves(waves + 1));
  range.addEventListener('input', () => setWaves(range.valueAsNumber));

  const launch = h('button', 'btn btn-primary btn-lg btn-chevron is-pulsing', { type: 'button' }, 'Begin operation');
  launch.addEventListener('click', start);

  const label = (text: string): HTMLElement => h('div', 'ctl-label', {}, text);

  const screen = h(
    'div',
    'sm-home',
    {},
    stars,
    planet,
    h(
      'header',
      'home-title',
      {},
      h(
        'div',
        'home-brand',
        {},
        h('img', 'home-mascot', { src: MASCOT_SRC, alt: '', width: 48, height: 48 }),
        h('h1', '', {}, 'TOWER ', h('span', 'clau', {}, 'CLAU'), 'DEFENCE'),
      ),
      h('p', '', {}, GAME_SUBTITLE),
    ),
    h(
      'main',
      'home-grid',
      {},
      h(
        'section',
        'panel home-maps',
        { 'aria-labelledby': 'sm-maps-h' },
        h('h2', 'panel-h', { id: 'sm-maps-h' }, 'Select theatre', h('span', 'panel-count', {}, `${MAP_LIST.length} theatres`)),
        mapList,
      ),
      h(
        'section',
        'panel home-brief',
        { 'aria-label': 'Mission briefing' },
        h('div', 'panel-h', {}, 'Mission briefing'),
        h('div', 'brief-head', {}, briefTitle, briefBadge),
        intel,
        h('div', 'well brief-text-wrap', {}, briefText, briefSr),
        h('div', 'ctl', {}, label('Difficulty'), diff.group, diffDesc, diffMod),
        h('div', 'ctl', {}, h('div', 'ctl-inline', {}, label('Waves'), mode.group), customBox),
      ),
      h('div', 'home-start', {}, launch),
    ),
    h(
      'footer',
      'home-hint',
      {},
      h('kbd', '', {}, 'Tab'),
      ' / ',
      h('kbd', '', {}, '← →'),
      ' select   ·   ',
      h('kbd', '', {}, 'Enter'),
      ' launch',
    ),
  );
  if (audio) {
    const muteB = h('button', 'btn btn-secondary btn-icon home-mute', { type: 'button' });
    const renderMute = (m: boolean): void => {
      muteB.innerHTML = m ? ICON_MUTED : ICON_SOUND;
      muteB.title = m ? 'Unmute' : 'Mute';
      muteB.setAttribute('aria-label', muteB.title);
      muteB.setAttribute('aria-pressed', String(m));
    };
    muteB.addEventListener('click', () => renderMute(audio.onToggleMute()));
    renderMute(audio.muted);
    screen.append(muteB);
  }
  root.append(screen);

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      start();
    }
  }
  screen.addEventListener('keydown', onKey);

  let typer = 0;
  function selectMap(id: MapId): void {
    mapId = id;
    save(LS_MAP, id);
    const m = MAPS[id];
    briefTitle.textContent = m.name;
    briefBadge.replaceChildren(badge(String(m.tier), rankTone(m.tier), 28));
    briefBadge.title = `Threat tier ${m.tier}`;
    typeBriefing(m);
    renderWaves();
  }

  function selectDiff(id: DifficultyId): void {
    diffId = id;
    save(LS_DIFF, id);
    diffDesc.textContent = DIFF_FLAVOR[id];
    diffMod.textContent = diffMods(DIFFICULTIES[id]);
    renderIntel();
  }

  function setWaves(v: number): void {
    waves = clampWaveCount(v);
    save(LS_WAVES, String(waves));
    renderWaves();
  }

  function renderWaves(): void {
    const heavy = waves >= HEAVY_ONLY_FROM;
    campaignLabel.textContent = `Campaign · ${MAPS[mapId].waves.length}`;
    customBox.hidden = !custom;
    out.textContent = String(waves);
    range.value = String(waves);
    range.style.setProperty('--val', thumbPos(waves));
    range.setAttribute('aria-valuetext', `${waves} waves${heavy ? ', heavy assault' : ''}`);
    minus.disabled = waves <= CUSTOM_WAVES_MIN;
    plus.disabled = waves >= CUSTOM_WAVES_MAX;
    // a focused ± that just hit its bound would drop focus to <body>; hand it to the range instead
    if ((minus.disabled && document.activeElement === minus) || (plus.disabled && document.activeElement === plus)) range.focus();
    heavyBadge.hidden = !heavy;
    note.classList.toggle('is-heavy', heavy);
    const span = waves === HEAVY_ONLY_FROM ? `Wave ${waves}` : `Waves ${HEAVY_ONLY_FROM}–${waves}`;
    note.textContent = heavy ? `${span}: bosses and heavies only` : `From wave ${HEAVY_ONLY_FROM}: bosses and heavies only`;
    renderIntel();
  }

  function renderIntel(): void {
    const m = MAPS[mapId];
    const d = DIFFICULTIES[diffId];
    const n = custom ? waves : m.waves.length;
    intel.replaceChildren(
      row('Biome', cap(m.biome)),
      row('Threat', pips(m.tier), h('span', 'sr-only', {}, `Tier ${m.tier}`)),
      row('Waves', custom && n >= HEAVY_ONLY_FROM ? `${n} · ${HEAVY_ONLY_FROM}+ heavy` : String(n)),
      row('Approaches', String(m.paths.length)),
      row('Grid', `${m.cols}×${m.rows}`),
      row('Credits', `${fmtInt(m.startingCash * d.startCashMult)} cr`),
      row('Lives', String(d.lives)),
    );
  }

  function typeBriefing(m: MapDef): void {
    clearInterval(typer);
    briefSr.textContent = m.briefing;
    if (prefersReducedMotion()) {
      briefText.textContent = m.briefing;
      return;
    }
    let i = 0;
    briefText.textContent = '';
    typer = window.setInterval(() => {
      i = Math.min(m.briefing.length, i + 2);
      briefText.textContent = m.briefing.slice(0, i);
      if (i >= m.briefing.length) clearInterval(typer);
    }, 14);
  }

  function start(): void {
    onStart({ mapId, difficultyId: diffId, waveCount: custom ? waves : undefined });
  }

  selectMap(mapId);
  selectDiff(diffId);
  const stopStars = runStarfield(stars);
  // focus the selected map so keyboard users land in the list
  screen.querySelector<HTMLInputElement>(`input[name="sm-map"][value="${mapId}"]`)?.focus({ preventScroll: true });

  return {
    destroy() {
      clearInterval(typer);
      stopStars();
      screen.removeEventListener('keydown', onKey);
      screen.remove();
    },
  };
}

/** ~300 stars in 3 parallax layers drifting left. Returns a stop function. */
function runStarfield(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  const stars = Array.from({ length: 300 }, (_, i) => ({
    x: Math.random(),
    y: Math.random(),
    layer: i % 3,
    tw: Math.random() * Math.PI * 2,
  }));
  const SPEED = [0.002, 0.005, 0.011]; // screen widths per second
  const SIZE = [1, 1, 2];
  const ALPHA = [0.35, 0.6, 0.9];
  let w = 0;
  let hgt = 0;
  function resize(): void {
    const dpr = window.devicePixelRatio || 1;
    w = canvas.clientWidth;
    hgt = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (still) raf = requestAnimationFrame(frame); // redraw the static field at the new size
  }
  const still = prefersReducedMotion();
  let raf = 0;
  let last = performance.now();
  function frame(now: number): void {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    ctx!.clearRect(0, 0, w, hgt);
    for (const s of stars) {
      if (!still) {
        s.x -= SPEED[s.layer]! * dt;
        if (s.x < 0) s.x += 1;
        s.tw += dt * 2;
      }
      const a = ALPHA[s.layer]! * (0.75 + 0.25 * Math.sin(s.tw));
      ctx!.fillStyle = `rgba(200,225,255,${a})`;
      const sz = SIZE[s.layer]!;
      ctx!.fillRect(Math.round(s.x * w), Math.round(s.y * hgt), sz, sz);
    }
    if (!still) raf = requestAnimationFrame(frame);
  }
  resize();
  window.addEventListener('resize', resize);
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
  };
}
