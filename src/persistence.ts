import type { WeaponType, ArmorType } from './simulation/types.ts';

const SAVE_KEY = 'tss-save';

export interface ExtractionSave {
  cashStash: number;
  ownedWeapons: WeaponType[];
  ownedArmor: ArmorType[];
}

function defaults(): ExtractionSave {
  return { cashStash: 0, ownedWeapons: ['pistol'], ownedArmor: [] };
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
