import type { PlayerInventory, Player, GameConfigs, WeaponType, ArmorType } from './types.ts';
import type { ItemInstance, ItemCategory } from './items.ts';
import { ITEM_DEFS, ITEM_TO_ARMOR_TYPE } from './items.ts';

export function createEmptyInventory(backpackSize: number = 20): PlayerInventory {
  const backpack: (ItemInstance | null)[] = [];
  for (let i = 0; i < backpackSize; i++) backpack.push(null);
  return {
    equipment: {
      weapon1: null,
      weapon2: null,
      armor: null,
      helmet: null,
    },
    hotbar: [null, null, null, null, null],
    backpack,
    backpackSize,
  };
}

export function findItemInBackpack(inv: PlayerInventory, defId: string): number | null {
  for (let i = 0; i < inv.backpack.length; i++) {
    if (inv.backpack[i]?.defId === defId) return i;
  }
  return null;
}

export function countItemInBackpack(inv: PlayerInventory, defId: string): number {
  let total = 0;
  for (const slot of inv.backpack) {
    if (slot?.defId === defId) total += slot.quantity;
  }
  return total;
}

export function addItemToBackpack(inv: PlayerInventory, item: ItemInstance): boolean {
  const def = ITEM_DEFS[item.defId];
  if (!def) return false;

  let remaining = item.quantity;

  // Try to stack into existing slots first (if stackable)
  if (def.stackable) {
    for (let i = 0; i < inv.backpack.length && remaining > 0; i++) {
      const slot = inv.backpack[i];
      if (slot && slot.defId === item.defId) {
        const canAdd = def.maxStack - slot.quantity;
        if (canAdd > 0) {
          const adding = Math.min(canAdd, remaining);
          slot.quantity += adding;
          remaining -= adding;
        }
      }
    }
  }

  // Place remainder into empty slots
  while (remaining > 0) {
    const emptyIdx = inv.backpack.indexOf(null);
    if (emptyIdx === -1) return false; // backpack full
    const placeQty = def.stackable ? Math.min(remaining, def.maxStack) : 1;
    inv.backpack[emptyIdx] = { ...item, quantity: placeQty };
    remaining -= placeQty;
  }

  return true;
}

export function removeItemFromBackpack(inv: PlayerInventory, defId: string, quantity: number): boolean {
  if (countItemInBackpack(inv, defId) < quantity) return false;

  let remaining = quantity;
  for (let i = inv.backpack.length - 1; i >= 0 && remaining > 0; i--) {
    const slot = inv.backpack[i];
    if (slot?.defId === defId) {
      const removing = Math.min(slot.quantity, remaining);
      slot.quantity -= removing;
      remaining -= removing;
      if (slot.quantity <= 0) inv.backpack[i] = null;
    }
  }
  return true;
}

export function moveItem(inv: PlayerInventory, fromSlot: number, toSlot: number): void {
  if (fromSlot === toSlot) return;
  if (fromSlot < 0 || fromSlot >= inv.backpack.length) return;
  if (toSlot < 0 || toSlot >= inv.backpack.length) return;

  const from = inv.backpack[fromSlot];
  const to = inv.backpack[toSlot];

  // Merge if same stackable item
  if (from && to && from.defId === to.defId) {
    const def = ITEM_DEFS[from.defId];
    if (def?.stackable) {
      const canAdd = def.maxStack - to.quantity;
      if (canAdd >= from.quantity) {
        to.quantity += from.quantity;
        inv.backpack[fromSlot] = null;
      } else {
        to.quantity = def.maxStack;
        from.quantity -= canAdd;
      }
      return;
    }
  }

  // Swap
  inv.backpack[fromSlot] = to;
  inv.backpack[toSlot] = from;
}

const EQUIP_SLOT_CATEGORIES: Record<string, ItemCategory> = {
  weapon1: 'weapon',
  weapon2: 'weapon',
  armor: 'armor',
  helmet: 'helmet',
};

export function equipItem(inv: PlayerInventory, backpackSlot: number, equipSlot: keyof PlayerInventory['equipment']): boolean {
  const item = inv.backpack[backpackSlot];
  if (!item) return false;

  const def = ITEM_DEFS[item.defId];
  if (!def) return false;

  const requiredCategory = EQUIP_SLOT_CATEGORIES[equipSlot];
  if (def.category !== requiredCategory) return false;

  const existing = inv.equipment[equipSlot];
  inv.equipment[equipSlot] = item;
  inv.backpack[backpackSlot] = existing; // swap (null if empty)
  return true;
}

export function unequipItem(inv: PlayerInventory, equipSlot: keyof PlayerInventory['equipment']): boolean {
  const item = inv.equipment[equipSlot];
  if (!item) return false;

  const emptyIdx = inv.backpack.indexOf(null);
  if (emptyIdx === -1) return false; // backpack full

  inv.backpack[emptyIdx] = item;
  inv.equipment[equipSlot] = null;
  return true;
}

export function canFitItem(inv: PlayerInventory, item: ItemInstance): boolean {
  const def = ITEM_DEFS[item.defId];
  if (!def) return false;

  let remaining = item.quantity;

  // Check existing stacks
  if (def.stackable) {
    for (const slot of inv.backpack) {
      if (slot?.defId === item.defId) {
        remaining -= (def.maxStack - slot.quantity);
        if (remaining <= 0) return true;
      }
    }
  }

  // Check empty slots
  for (const slot of inv.backpack) {
    if (slot === null) {
      remaining -= (def.stackable ? def.maxStack : 1);
      if (remaining <= 0) return true;
    }
  }

  return remaining <= 0;
}

export function getBackpackFreeSlots(inv: PlayerInventory): number {
  let count = 0;
  for (const slot of inv.backpack) {
    if (slot === null) count++;
  }
  return count;
}

export function splitStack(inv: PlayerInventory, slotIndex: number): boolean {
  const item = inv.backpack[slotIndex];
  if (!item || item.quantity <= 1) return false;

  const emptyIdx = inv.backpack.indexOf(null);
  if (emptyIdx === -1) return false;

  const half = Math.floor(item.quantity / 2);
  const other = item.quantity - half; // ceil goes to new slot
  item.quantity = half;
  inv.backpack[emptyIdx] = { ...item, quantity: other };
  return true;
}

// ---- Bridge: Inventory → Legacy Player Fields ----

/**
 * Sync inventory state to legacy player fields so the existing simulation
 * (combat, healing, etc.) continues to work without changes.
 */
export function syncInventoryToPlayer(player: Player, configs: GameConfigs): void {
  const inv = player.inventory;

  // Active weapon — use weapon1 slot
  const w1 = inv.equipment.weapon1;
  if (w1) {
    const wt = w1.defId as WeaponType;
    player.activeWeapon = wt;
  }

  // Armor
  const armorItem = inv.equipment.armor;
  if (armorItem && configs.armor) {
    const armorType = ITEM_TO_ARMOR_TYPE[armorItem.defId] as ArmorType | undefined;
    if (armorType && configs.armor[armorType]) {
      player.equippedArmor = armorType;
      player.armorDamageReduction = configs.armor[armorType].damageReduction;
      player.armorMaxHp = configs.armor[armorType].maxHp;
      player.armorHp = armorItem.currentHp ?? configs.armor[armorType].maxHp;
    }
  } else {
    player.equippedArmor = null;
    player.armorDamageReduction = 0;
    player.armorHp = 0;
    player.armorMaxHp = 0;
  }

  // Bandage counts from backpack
  player.bandageSmallCount = countItemInBackpack(inv, 'bandage_small');
  player.bandageLargeCount = countItemInBackpack(inv, 'bandage_large');
}
