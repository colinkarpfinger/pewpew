import type { WeaponType } from './simulation/types.ts';

const SAVE_KEY = 'tss-save';

export interface ExtractionSave {
  cashStash: number;
  ownedWeapons: WeaponType[];
}

function defaults(): ExtractionSave {
  return { cashStash: 0, ownedWeapons: ['pistol'] };
}

export function loadSave(): ExtractionSave {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw) as Partial<ExtractionSave>;
    return {
      cashStash: parsed.cashStash ?? 0,
      ownedWeapons: parsed.ownedWeapons ?? ['pistol'],
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
