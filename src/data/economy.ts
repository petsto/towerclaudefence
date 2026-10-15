/** Sell refund as a fraction of total invested. */
export const SELL_REFUND = 0.7;
/** Full refund if no enemy has spawned since the tower was bought or last upgraded. */
export const UNDO_REFUND = 1;

/** Wave-clear bonus for wave number w (1-based): WAVE_CLEAR_BASE + WAVE_CLEAR_PER_WAVE * w. */
export const WAVE_CLEAR_BASE = 20;
export const WAVE_CLEAR_PER_WAVE = 5;
/** Boss waves ('mid' and 'final') multiply the clear bonus. */
export const BOSS_WAVE_CLEAR_MULT = 2;

/** Seconds between a wave finishing spawning and the next auto-launch. */
export const WAVE_COUNTDOWN = 20;
/** Early-call bonus: EARLY_CALL_PER_SECOND * floor(countdown left), capped at EARLY_CALL_MAX. */
export const EARLY_CALL_PER_SECOND = 3;
export const EARLY_CALL_MAX = 60;

/** Mid-map boss variant: HP/shield multiplier and flat bounty. */
export const MID_BOSS_HP_MULT = 0.5;
export const MID_BOSS_BOUNTY = 200;
