import type { WeaponType, ArmorType, PlayerInventory } from './simulation/types.ts';
import type { ItemInstance } from './simulation/items.ts';
import { ARMOR_TYPE_TO_ITEM } from './simulation/items.ts';
import { createEmptyInventory, addItemToBackpack } from './simulation/inventory.ts';

const SAVE_KEY = 'tss-save';

export interface StashData {
  items: (ItemInstance | null)[];
  capacity: number;
}

export interface ExtractionSave {
  cashStash: number;
  ownedWeapons: WeaponType[];
  ownedArmor: ArmorType[];
  bandageSmall: number;
  bandageLarge: number;
  ammoStock: Record<string, number>;
  weaponUpgrades: Partial<Record<WeaponType, number>>;
  armorHpMap: Partial<Record<ArmorType, number>>;
  playerInventory?: PlayerInventory;
  stash?: StashData;
}

function defaults(): ExtractionSave {
  return { cashStash: 0, ownedWeapons: ['pistol'], ownedArmor: [], bandageSmall: 0, bandageLarge: 0, ammoStock: {}, weaponUpgrades: {}, armorHpMap: {} };
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
      ammoStock: parsed.ammoStock ?? {},
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

export function getAmmoStock(): Record<string, number> {
  return loadSave().ammoStock;
}

export function addAmmo(ammoType: string, count: number): void {
  const save = loadSave();
  save.ammoStock[ammoType] = (save.ammoStock[ammoType] ?? 0) + count;
  writeSave(save);
}

export function clearAmmoStock(): void {
  const save = loadSave();
  save.ammoStock = {};
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

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY);
}

// ---- Inventory Persistence ----

/** Migrate old save format into a PlayerInventory. Called when playerInventory is missing. */
export function migrateToInventory(save: ExtractionSave, backpackSize: number = 20): PlayerInventory {
  const inv = createEmptyInventory(backpackSize);

  // Equip first owned weapon
  if (save.ownedWeapons.length > 0) {
    const w = save.ownedWeapons[0];
    inv.equipment.weapon1 = {
      defId: w,
      quantity: 1,
      upgradeLevel: save.weaponUpgrades[w] ?? 0,
    };
  }
  // Second weapon slot
  if (save.ownedWeapons.length > 1) {
    const w = save.ownedWeapons[1];
    inv.equipment.weapon2 = {
      defId: w,
      quantity: 1,
      upgradeLevel: save.weaponUpgrades[w] ?? 0,
    };
  }
  // Extra weapons go to backpack
  for (let i = 2; i < save.ownedWeapons.length; i++) {
    const w = save.ownedWeapons[i];
    addItemToBackpack(inv, {
      defId: w,
      quantity: 1,
      upgradeLevel: save.weaponUpgrades[w] ?? 0,
    });
  }

  // Equip first armor
  if (save.ownedArmor.length > 0) {
    const a = save.ownedArmor[0];
    const itemId = ARMOR_TYPE_TO_ITEM[a] ?? `${a}_armor`;
    inv.equipment.armor = {
      defId: itemId,
      quantity: 1,
      currentHp: save.armorHpMap[a],
    };
  }
  // Extra armor to backpack
  for (let i = 1; i < save.ownedArmor.length; i++) {
    const a = save.ownedArmor[i];
    const itemId = ARMOR_TYPE_TO_ITEM[a] ?? `${a}_armor`;
    addItemToBackpack(inv, {
      defId: itemId,
      quantity: 1,
      currentHp: save.armorHpMap[a],
    });
  }

  // Bandages to backpack
  if (save.bandageSmall > 0) {
    addItemToBackpack(inv, { defId: 'bandage_small', quantity: save.bandageSmall });
  }
  if (save.bandageLarge > 0) {
    addItemToBackpack(inv, { defId: 'bandage_large', quantity: save.bandageLarge });
  }

  return inv;
}

export function savePlayerInventory(inv: PlayerInventory): void {
  const save = loadSave();
  save.playerInventory = inv;
  writeSave(save);
}

export function loadPlayerInventory(backpackSize: number = 20): PlayerInventory {
  const save = loadSave();
  if (save.playerInventory) return save.playerInventory;
  return migrateToInventory(save, backpackSize);
}

export function saveStash(stash: StashData): void {
  const save = loadSave();
  save.stash = stash;
  writeSave(save);
}

export function loadStash(capacity: number = 50): StashData {
  const save = loadSave();
  if (save.stash) return save.stash;
  // Default empty stash
  const items: (ItemInstance | null)[] = [];
  for (let i = 0; i < capacity; i++) items.push(null);
  return { items, capacity };
}
