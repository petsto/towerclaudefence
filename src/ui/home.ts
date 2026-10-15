import { DIFFICULTIES, DIFFICULTY_LIST } from '../data/difficulty';
import { MAPS, MAP_LIST } from '../data/maps';
import type { DifficultyDef, DifficultyId, MapDef, MapId } from '../data/types';
import type { SimConfig } from '../sim/types';
import { cap, dlRows, fmtInt, h, prefersReducedMotion } from './dom';
import { CORE_COLOR, drawMapThumbnail, SPAWN_COLOR } from './thumbnail';

const GAME_TITLE = 'STEEL MERIDIAN';
const GAME_SUBTITLE = 'Frontier Defense Command';

const LS_MAP = 'steel-meridian.map';
const LS_DIFF = 'steel-meridian.difficulty';

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

const tierPips = (tier: number): string => '▮'.repeat(tier) + '▯'.repeat(Math.max(0, 3 - tier));

export function createHomeScreen(root: HTMLElement, onStart: (cfg: SimConfig) => void): { destroy(): void } {
  const savedMap = load(LS_MAP);
  const savedDiff = load(LS_DIFF);
  let mapId: MapId = savedMap && Object.hasOwn(MAPS, savedMap) ? (savedMap as MapId) : MAP_LIST[0]!.id;
  let diffId: DifficultyId = savedDiff && Object.hasOwn(DIFFICULTIES, savedDiff) ? (savedDiff as DifficultyId) : 'normal';

  // --- backdrop
  const stars = h('canvas', 'home-stars', { 'aria-hidden': 'true' });
  const planet = h('div', 'home-planet', { 'aria-hidden': 'true' });

  // --- map list
  const mapList = h('div', 'home-maplist', { role: 'radiogroup', 'aria-label': 'Theatre of operations' });
  for (const m of MAP_LIST) {
    const thumb = h('canvas', 'thumb');
    drawMapThumbnail(thumb, m, 8);
    const input = h('input', 'sr-only', { type: 'radio', name: 'sm-map', value: m.id, checked: m.id === mapId });
    input.addEventListener('change', () => selectMap(m.id));
    mapList.append(
      h(
        'label',
        'map-card',
        {},
        input,
        h(
          'span',
          'map-card-body panel',
          {},
          h('span', 'screen thumb-frame', {}, thumb),
          h(
            'span',
            'map-card-text',
            {},
            h('span', 'map-card-name', {}, m.name),
            h('span', 'map-card-meta', {}, `${cap(m.biome)} · ${m.waves.length} waves`),
            h('span', 'map-card-tier', { 'aria-label': `Threat tier ${m.tier}` }, `THREAT ${tierPips(m.tier)}`),
          ),
        ),
      ),
    );
  }

  const swatch = (color: string, label: string): HTMLElement =>
    h('li', '', {}, h('i', '', { style: `background:${color}` }), label);
  const legend = h(
    'ul',
    'map-legend',
    { 'aria-label': 'Map legend' },
    swatch(SPAWN_COLOR, 'Hostile spawn'),
    swatch(CORE_COLOR, 'Core'),
    swatch('#5a6470', 'Build pad'),
    swatch('#8a7458', 'Approach route'),
  );

  // --- briefing
  const briefTitle = h('h2', 'brief-map');
  const briefThumb = h('canvas', 'thumb');
  const intel = h('dl', 'brief-intel');
  const briefText = h('p', 'brief-text', { 'aria-hidden': 'true' });
  const briefSr = h('p', 'sr-only');
  const diffGroup = h('div', 'diff-switch', { role: 'radiogroup', 'aria-label': 'Difficulty' });
  for (const d of DIFFICULTY_LIST) {
    const input = h('input', 'sr-only', { type: 'radio', name: 'sm-diff', value: d.id, checked: d.id === diffId });
    input.addEventListener('change', () => selectDiff(d.id));
    diffGroup.append(h('label', 'diff-seg', {}, input, h('span', '', {}, d.name)));
  }
  const diffDesc = h('p', 'diff-desc');
  const diffMod = h('p', 'diff-mods');
  const launch = h('button', 'btn btn-launch', { type: 'button' }, 'Launch');
  launch.addEventListener('click', start);

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
      h('h1', '', {}, GAME_TITLE),
      h('p', '', {}, GAME_SUBTITLE),
    ),
    h(
      'main',
      'home-grid',
      {},
      h('section', 'panel home-maps', { 'aria-labelledby': 'sm-maps-h' }, h('h2', 'panel-h', { id: 'sm-maps-h' }, 'Select theatre'), mapList, legend),
      h(
        'section',
        'panel home-brief',
        { 'aria-label': 'Mission briefing' },
        h('div', 'panel-h', {}, 'Mission briefing'),
        briefTitle,
        h(
          'div',
          'brief-top',
          {},
          h('div', 'screen scanlines thumb-frame brief-thumb', {}, briefThumb),
          h('div', 'screen brief-intel-wrap', {}, intel),
        ),
        h('div', 'screen scanlines brief-text-wrap', {}, briefText, briefSr),
        h(
          'div',
          'brief-bottom',
          {},
          h('div', 'diff-block', {}, h('div', 'label', {}, 'Difficulty'), diffGroup, diffDesc, diffMod),
          launch,
        ),
      ),
    ),
    h('footer', 'home-hint', {}, 'TAB / ARROWS  select   ·   ENTER  launch'),
  );
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
    drawMapThumbnail(briefThumb, m, 20);
    typeBriefing(m);
    renderIntel();
  }

  function selectDiff(id: DifficultyId): void {
    diffId = id;
    save(LS_DIFF, id);
    const d = DIFFICULTIES[id];
    diffDesc.textContent = DIFF_FLAVOR[id];
    diffMod.textContent = diffMods(d);
    renderIntel();
  }

  function renderIntel(): void {
    const m = MAPS[mapId];
    const d = DIFFICULTIES[diffId];
    const rows: [string, string][] = [
      ['Biome', cap(m.biome)],
      ['Threat', `Tier ${m.tier}  ${tierPips(m.tier)}`],
      ['Waves', String(m.waves.length)],
      ['Approaches', String(m.paths.length)],
      ['Grid', `${m.cols}×${m.rows}`],
      ['Credits', `${fmtInt(m.startingCash * d.startCashMult)} cr`],
      ['Lives', String(d.lives)],
    ];
    intel.replaceChildren(...dlRows(rows));
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
    onStart({ mapId, difficultyId: diffId });
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
      ctx!.fillStyle = s.layer === 2 ? `rgba(200,240,255,${a})` : `rgba(180,200,220,${a})`;
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
