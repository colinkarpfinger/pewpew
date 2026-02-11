import type { WeaponConfig, WeaponUpgradeConfig } from './types.ts';

/**
 * Apply cumulative upgrade bonuses up to the given level.
 * Returns a new WeaponConfig with bonuses applied additively across levels.
 * The simulation never sees the upgrade system — just the final effective stats.
 */
export function getEffectiveWeaponConfig(base: WeaponConfig, upgradeLevel: number, upgradeConfig: WeaponUpgradeConfig): WeaponConfig {
  if (upgradeLevel <= 0) return base;

  let totalDamageBonus = 0;
  let totalFireRateBonus = 0;
  let totalMagazineSizeBonus = 0;
  let totalReloadTimeReduction = 0;

  const levelsToApply = Math.min(upgradeLevel, upgradeConfig.maxLevel);
  for (let i = 0; i < levelsToApply; i++) {
    const level = upgradeConfig.levels[i];
    totalDamageBonus += level.damageBonus;
    totalFireRateBonus += level.fireRateBonus;
    totalMagazineSizeBonus += level.magazineSizeBonus;
    totalReloadTimeReduction += level.reloadTimeReduction;
  }

  return {
    ...base,
    damage: base.damage + totalDamageBonus,
    fireRate: base.fireRate + totalFireRateBonus,
    magazineSize: base.magazineSize + totalMagazineSizeBonus,
    reloadTime: Math.max(30, base.reloadTime - totalReloadTimeReduction),
  };
}
