// Inline SVG glyphs (original, line-art). All draw with currentColor on a 24x24 grid.
import type { PowerId, TowerId } from '../data/types';

const svg = (body: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const TOWER_ICONS: Readonly<Record<TowerId, string>> = {
  // twin barrels on a squat turret
  picket: svg('<rect x="5" y="13" width="14" height="7"/><rect x="8" y="9" width="8" height="5"/><path d="M10 9V3M14 9V3"/>'),
  // stubby tube on a baseplate with lob arc
  thumper: svg('<path d="M4 20h16"/><path d="M8 20l2-8h4l2 8"/><path d="M10 12l-1-5h6l-1 5"/><path d="M15 6c2-3 5-3 6 0" stroke-dasharray="2 1.5"/>'),
  // emitter dish with concentric field rings
  stasis: svg('<circle cx="12" cy="12" r="2.5"/><circle cx="12" cy="12" r="6" stroke-dasharray="3 2"/><circle cx="12" cy="12" r="9.5" stroke-dasharray="2 3"/>'),
  // long rail on a tall gantry
  longshot: svg('<path d="M3 8h18M3 11h18"/><path d="M7 11v9M17 11v9M7 16h10"/><path d="M21 9.5h2"/>'),
  // 2x2 missile pod
  breacher: svg('<rect x="4" y="6" width="16" height="13"/><circle cx="9" cy="10.5" r="2"/><circle cx="15" cy="10.5" r="2"/><circle cx="9" cy="15.5" r="2"/><circle cx="15" cy="15.5" r="2"/>'),
  // capacitor stack with a forked bolt
  arc_coil: svg('<path d="M8 21h8M9 21v-3h6v3"/><path d="M8 15h8M8 12h8M9 9h6"/><path d="M12 9l-2-3 3-1-1-3"/>'),
};

export const POWER_ICONS: Readonly<Record<PowerId, string>> = {
  // pronged disc seated in the ground, tremor arcs either side
  tremor_mines: svg('<path d="M2 19h20"/><path d="M7 19v-2.5h10V19"/><path d="M9 16.5L8 13M12 16.5V12.5M15 16.5l1-3.5"/><path d="M4.5 15c1-1.2 1-2.8 0-4M19.5 15c-1-1.2-1-2.8 0-4" stroke-dasharray="2 1.5"/>'),
  // column from orbit onto a closing triangular reticle
  lance_strike: svg('<path d="M9.5 1.5h5L13.2 16h-2.4z" fill="currentColor" fill-opacity=".3"/><ellipse cx="12" cy="16.5" rx="5" ry="2"/><path d="M5 12.5l2.5 1.5M19 12.5L16.5 14M2.5 22l2.5-4M2.5 22h5M21.5 22l-2.5-4M21.5 22h-5"/>'),
};

export const ICON_CREDITS = svg('<path d="M12 2l8 5v10l-8 5-8-5V7z" fill="currentColor" fill-opacity=".25"/><path d="M12 2v20M4 7l16 10M20 7L4 17" stroke-opacity=".5"/>');
export const ICON_LIVES = svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/>');
export const ICON_PAUSE = svg('<path d="M8 5v14M16 5v14" stroke-width="3"/>');
export const ICON_PLAY = svg('<path d="M7 4l13 8-13 8z" fill="currentColor"/>');
export const ICON_SOUND = svg('<path d="M3 9h4l5-4v14l-5-4H3z" fill="currentColor" fill-opacity=".3"/><path d="M16 8c2 2 2 6 0 8M19 5c4 4 4 10 0 14"/>');
export const ICON_MUTED = svg('<path d="M3 9h4l5-4v14l-5-4H3z" fill="currentColor" fill-opacity=".3"/><path d="M16 9l6 6M22 9l-6 6"/>');
