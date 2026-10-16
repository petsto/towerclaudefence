// Tiny DOM helpers shared by the home screen and HUD.

type Attrs = Record<string, string | number | boolean | undefined>;

/** Create an element. `cls` is a space-separated class list; attrs with false/undefined are skipped. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = '',
  attrs: Attrs = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v === undefined) continue;
    el.setAttribute(k, v === true ? '' : String(v));
  }
  el.append(...children);
  return el;
}

/** Write text only when it changed (update() runs every frame). */
export function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export function setAttr(el: HTMLElement, name: string, value: string | null): void {
  if (el.getAttribute(name) === value) return;
  if (value === null) el.removeAttribute(name);
  else el.setAttribute(name, value);
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function fmtInt(n: number): string {
  return Math.floor(n).toLocaleString('en-US');
}

export const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** `<dt>`/`<dd>` pairs for a `<dl>`. */
export const dlRows = (rows: readonly [string, string][]): HTMLElement[] =>
  rows.flatMap(([k, v]) => [h('dt', '', {}, k), h('dd', '', {}, v)]);

export type BadgeTone = 'blue' | 'white' | 'gold' | 'violet';

/** Circular `.badge` (wave number, tower level, map tier). `size` in px sets `--size` (CSS default 28). */
export function badge(text: string, tone: BadgeTone = 'blue', size?: number): HTMLSpanElement {
  return h('span', tone === 'blue' ? 'badge' : `badge badge-${tone}`, { style: size ? `--size:${size}px` : undefined }, text);
}

/** Rank ladder shared by tower level and map tier: 1 blue, 2 white, 3 gold, 4+ violet. */
export const rankTone = (n: number): BadgeTone =>
  n >= 4 ? 'violet' : n === 3 ? 'gold' : n === 2 ? 'white' : 'blue';
