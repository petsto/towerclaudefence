import type { DifficultyDef, DifficultyId } from './types';

export const DIFFICULTIES: Readonly<Record<DifficultyId, DifficultyDef>> = {
  easy: { id: 'easy', name: 'Recruit', hpMult: 0.75, growthAdd: -0.01, speedMult: 0.9, armorAdd: 0, cashMult: 1.25, startCashMult: 1.3, lives: 30 },
  normal: { id: 'normal', name: 'Veteran', hpMult: 1, growthAdd: 0, speedMult: 1, armorAdd: 0, cashMult: 1, startCashMult: 1, lives: 20 },
  hard: { id: 'hard', name: 'Elite', hpMult: 1.25, growthAdd: 0.01, speedMult: 1.1, armorAdd: 0, cashMult: 0.9, startCashMult: 0.9, lives: 15 },
  brutal: { id: 'brutal', name: 'Brutal', hpMult: 1.5, growthAdd: 0.015, speedMult: 1.15, armorAdd: 1, cashMult: 0.8, startCashMult: 0.8, lives: 10 },
};

export const DIFFICULTY_LIST: readonly DifficultyDef[] = [
  DIFFICULTIES.easy,
  DIFFICULTIES.normal,
  DIFFICULTIES.hard,
  DIFFICULTIES.brutal,
];
