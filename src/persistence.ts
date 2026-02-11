import type { WeaponType, ArmorType } from './simulation/types.ts';

const SAVE_KEY = 'tss-save';

export interface ExtractionSave {
  cashStash: number;
  ownedWeapons: WeaponType[];
  ownedArmor: ArmorType[];
  bandageSmall: number;
  bandageLarge: number;
  weaponUpgrades: Partial<Record<WeaponType, number>>;
  armorHpMap: Partial<Record<ArmorType, number>>;
}

function defaults(): ExtractionSave {
  return { cashStash: 0, ownedWeapons: ['pistol'], ownedArmor: [], bandageSmall: 0, bandageLarge: 0, weaponUpgrades: {}, armorHpMap: {} };
}

export function loadSave(): ExtractionSave {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw) as Partial<ExtractionSave>;
    return {
      cashStash: parsed.cashStash ?? 0,
      ownedWeapons: parsed.ownedWeapons ?? ['pistol'],
      ownedArmor: parsed.ownedArmor ?? [],
      bandageSmall: parsed.bandageSmall ?? 0,
      bandageLarge: parsed.bandageLarge ?? 0,
      weaponUpgrades: parsed.weaponUpgrades ?? {},
      armorHpMap: parsed.armorHpMap ?? {},
    };
  } catch {
    return defaults();
  }
}

export function writeSave(save: ExtractionSave): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}

export function addCashToStash(amount: number): void {
  const save = loadSave();
  save.cashStash += amount;
  writeSave(save);
}

export function getStashCash(): number {
  return loadSave().cashStash;
}

export function getOwnedWeapons(): WeaponType[] {
  return loadSave().ownedWeapons;
}

export function addWeapon(weapon: WeaponType): void {
  const save = loadSave();
  if (!save.ownedWeapons.includes(weapon)) {
    save.ownedWeapons.push(weapon);
    writeSave(save);
  }
}

export function removeWeapon(weapon: WeaponType): void {
  if (weapon === 'pistol') return; // pistol can never be removed
  const save = loadSave();
  save.ownedWeapons = save.ownedWeapons.filter(w => w !== weapon);
  if (save.ownedWeapons.length === 0) save.ownedWeapons = ['pistol'];
  writeSave(save);
}

export function getOwnedArmor(): ArmorType[] {
  return loadSave().ownedArmor;
}

export function addArmor(type: ArmorType): void {
  const save = loadSave();
  if (!save.ownedArmor.includes(type)) {
    save.ownedArmor.push(type);
    writeSave(save);
  }
}

export function removeArmor(type: ArmorType): void {
  const save = loadSave();
  save.ownedArmor = save.ownedArmor.filter(a => a !== type);
  writeSave(save);
}

export function getBandages(): { small: number; large: number } {
  const save = loadSave();
  return { small: save.bandageSmall, large: save.bandageLarge };
}

export function addBandages(type: 'small' | 'large', count: number): void {
  const save = loadSave();
  if (type === 'small') save.bandageSmall += count;
  else save.bandageLarge += count;
  writeSave(save);
}

export function getWeaponUpgradeLevel(weapon: WeaponType): number {
  return loadSave().weaponUpgrades[weapon] ?? 0;
}

export function setWeaponUpgradeLevel(weapon: WeaponType, level: number): void {
  const save = loadSave();
  save.weaponUpgrades[weapon] = level;
  writeSave(save);
}

export function getArmorHp(type: ArmorType): number | undefined {
  return loadSave().armorHpMap[type];
}

export function setArmorHp(type: ArmorType, hp: number): void {
  const save = loadSave();
  save.armorHpMap[type] = hp;
  writeSave(save);
}

export function clearArmorHp(type: ArmorType): void {
  const save = loadSave();
  delete save.armorHpMap[type];
  writeSave(save);
}
