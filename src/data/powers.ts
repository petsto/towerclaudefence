import type { MinePowerDef, PowerDef, PowerId, StrikePowerDef } from './types';

// Command powers, GDD §14. Free, infinite uses, gated by charge time (sim seconds, from wave 1 launch).

export const TREMOR_MINES: MinePowerDef = {
  id: 'tremor_mines',
  kind: 'mine',
  name: 'Tremor Mines',
  description: 'Seismic charges seeded in the lane. The first hostile across one shakes the ground to sludge.',
  hotkey: 'q',
  chargeTime: 30,
  maxCharges: 3,
  triggerRadius: 0.5,
  fieldRadius: 1.5,
  fieldDuration: 8,
  slow: 0.6,
  slowLinger: 0.5,
};

export const LANCE_STRIKE: StrikePowerDef = {
  id: 'lance_strike',
  kind: 'strike',
  name: 'Lance Strike',
  description: 'Orbital platform Meridian burns a column of light through whatever stands under the reticle.',
  hotkey: 'e',
  chargeTime: 150,
  maxCharges: 1,
  radius: 1.75,
  telegraph: 1.5,
  pulses: 6,
  pulseInterval: 0.5,
  pulseDamage: 150,
  damageType: 'plasma',
  shieldMult: 1,
  bossFraction: 0.2,
};

export const POWERS: { readonly tremor_mines: MinePowerDef; readonly lance_strike: StrikePowerDef } & Readonly<
  Record<PowerId, PowerDef>
> = {
  tremor_mines: TREMOR_MINES,
  lance_strike: LANCE_STRIKE,
};

/** Console order (left/top first). */
export const POWER_LIST: readonly PowerDef[] = [TREMOR_MINES, LANCE_STRIKE];
