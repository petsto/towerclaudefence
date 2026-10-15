/** Sell refund as a fraction of total invested. */
export const SELL_REFUND = 0.7;
/** Refund for credits spent on a tower since the last enemy spawn (undo); older spend refunds at SELL_REFUND. */
export const UNDO_REFUND = 1;

/** Wave-clear bonus for wave number w (1-based): WAVE_CLEAR_BASE + WAVE_CLEAR_PER_WAVE * w. */
export const WAVE_CLEAR_BASE = 30;
export const WAVE_CLEAR_PER_WAVE = 6;
/** Boss waves ('mid' and 'final') multiply the clear bonus. */
export const BOSS_WAVE_CLEAR_MULT = 2;

/**
 * Countdown to the next auto-launch, set when a wave finishes spawning. It holds (does not tick) while
 * that wave still has enemies alive, for at most WAVE_MAX_HOLD s, so auto-launched waves never pile up.
 */
export const WAVE_COUNTDOWN = 15;
export const WAVE_MAX_HOLD = 40;
/** Early-call bonus: EARLY_CALL_PER_SECOND * floor(countdown left), capped at EARLY_CALL_MAX. */
export const EARLY_CALL_PER_SECOND = 4;
export const EARLY_CALL_MAX = 60;

/** Mid-map boss variant: HP/shield multiplier and flat bounty. */
export const MID_BOSS_HP_MULT = 0.55;
export const MID_BOSS_BOUNTY = 200;
