import { ARMOR_FLOOR, IGNORES_ARMOR, SIZE_MULT } from '../data';
import type { DamageType, SizeClass } from '../data/types';

/** GDD §2 hit resolution: shields absorb first (no armor/size), then armor, size multiplier, floor. */
export function resolveHit(
  shield: number,
  armor: number,
  size: SizeClass,
  damage: number,
  type: DamageType,
  shieldMult: number,
): { shieldDamage: number; hpDamage: number } {
  let d = damage;
  let shieldDamage = 0;
  if (shield > 0) {
    const s = d * shieldMult;
    shieldDamage = Math.min(shield, s);
    d *= 1 - shieldDamage / s;
    if (d <= 0) return { shieldDamage, hpDamage: 0 };
  }
  const armorEff = IGNORES_ARMOR[type] ? 0 : armor;
  return { shieldDamage, hpDamage: Math.max(ARMOR_FLOOR, (d - armorEff) * SIZE_MULT[type][size]) };
}
