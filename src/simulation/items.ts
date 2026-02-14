import type { WeaponType } from './types.ts';

// ---- Item Types ----

export type ItemCategory = 'weapon' | 'armor' | 'helmet' | 'ammo' | 'medical' | 'grenade' | 'valuable' | 'material';

export interface ItemDef {
  id: string;
  name: string;
  category: ItemCategory;
  stackable: boolean;
  maxStack: number;
  sellValue: number;
  description: string;
}

export interface ItemInstance {
  defId: string;
  quantity: number;
  currentAmmo?: number;     // weapons only — rounds in magazine
  upgradeLevel?: number;    // weapons only
  currentHp?: number;       // armor/helmets only
}

// ---- Item Registry ----

export const ITEM_DEFS: Record<string, ItemDef> = {
  // Weapons
  pistol:     { id: 'pistol',     name: 'Pistol',       category: 'weapon', stackable: false, maxStack: 1, sellValue: 0,    description: 'Standard sidearm. Reliable and accurate.' },
  smg:        { id: 'smg',        name: 'SMG',          category: 'weapon', stackable: false, maxStack: 1, sellValue: 150,  description: 'Rapid-fire submachine gun.' },
  rifle:      { id: 'rifle',      name: 'Rifle',        category: 'weapon', stackable: false, maxStack: 1, sellValue: 350,  description: 'Balanced assault rifle with penetration.' },
  shotgun:    { id: 'shotgun',    name: 'Shotgun',      category: 'weapon', stackable: false, maxStack: 1, sellValue: 300,  description: 'Devastating at close range.' },
  machinegun: { id: 'machinegun', name: 'Machine Gun',  category: 'weapon', stackable: false, maxStack: 1, sellValue: 2500, description: 'Heavy weapon with massive magazine.' },

  // Armor
  light_armor:  { id: 'light_armor',  name: 'Light Armor',  category: 'armor', stackable: false, maxStack: 1, sellValue: 100, description: '15% damage reduction.' },
  medium_armor: { id: 'medium_armor', name: 'Medium Armor', category: 'armor', stackable: false, maxStack: 1, sellValue: 200, description: '30% damage reduction.' },
  heavy_armor:  { id: 'heavy_armor',  name: 'Heavy Armor',  category: 'armor', stackable: false, maxStack: 1, sellValue: 350, description: '45% damage reduction.' },

  // Helmets
  basic_helmet:    { id: 'basic_helmet',    name: 'Basic Helmet',    category: 'helmet', stackable: false, maxStack: 1, sellValue: 75,  description: 'Basic head protection.' },
  military_helmet: { id: 'military_helmet', name: 'Military Helmet', category: 'helmet', stackable: false, maxStack: 1, sellValue: 200, description: 'Advanced head protection.' },

  // Ammo
  '9mm':     { id: '9mm',     name: '9mm Rounds',    category: 'ammo', stackable: true, maxStack: 120, sellValue: 1, description: 'Standard pistol and SMG ammo.' },
  '556':     { id: '556',     name: '5.56 Rounds',   category: 'ammo', stackable: true, maxStack: 90,  sellValue: 2, description: 'Rifle ammunition.' },
  '12gauge': { id: '12gauge', name: '12ga Shells',   category: 'ammo', stackable: true, maxStack: 36,  sellValue: 3, description: 'Shotgun shells.' },
  '762':     { id: '762',     name: '7.62 Rounds',   category: 'ammo', stackable: true, maxStack: 200, sellValue: 1, description: 'Machine gun ammunition.' },

  // Medical
  bandage_small: { id: 'bandage_small', name: 'Small Bandage', category: 'medical', stackable: true, maxStack: 5, sellValue: 35,  description: 'Heals 25 HP over time.' },
  bandage_large: { id: 'bandage_large', name: 'Large Bandage', category: 'medical', stackable: true, maxStack: 3, sellValue: 70,  description: 'Heals 50 HP over time.' },
  medkit:        { id: 'medkit',        name: 'Medkit',        category: 'medical', stackable: true, maxStack: 2, sellValue: 150, description: 'Fully restores HP.' },
  painkillers:   { id: 'painkillers',   name: 'Painkillers',   category: 'medical', stackable: true, maxStack: 3, sellValue: 60,  description: 'Gradual healing over time.' },

  // Grenades
  frag_grenade: { id: 'frag_grenade', name: 'Frag Grenade', category: 'grenade', stackable: true, maxStack: 4, sellValue: 50, description: 'Explosive fragmentation grenade.' },

  // Valuables
  cash_stack:    { id: 'cash_stack',    name: 'Cash Stack',    category: 'valuable', stackable: true, maxStack: 999, sellValue: 1,   description: 'Cold hard cash.' },
  gold_chain:    { id: 'gold_chain',    name: 'Gold Chain',    category: 'valuable', stackable: true, maxStack: 5,   sellValue: 200, description: 'A shiny gold chain. Sells well.' },
  circuit_board: { id: 'circuit_board', name: 'Circuit Board', category: 'valuable', stackable: true, maxStack: 5,   sellValue: 150, description: 'Salvaged electronics.' },

  // Materials
  metal_plate: { id: 'metal_plate', name: 'Metal Plate', category: 'material', stackable: true, maxStack: 10, sellValue: 25, description: 'Sturdy metal plate for repairs.' },
  bolt:        { id: 'bolt',        name: 'Bolt',        category: 'material', stackable: true, maxStack: 20, sellValue: 10, description: 'Common hardware component.' },
  nut:         { id: 'nut',         name: 'Nut',         category: 'material', stackable: true, maxStack: 20, sellValue: 10, description: 'Common hardware component.' },
  duct_tape:   { id: 'duct_tape',   name: 'Duct Tape',   category: 'material', stackable: true, maxStack: 5,  sellValue: 30, description: 'Fixes anything. Almost.' },
};

// ---- Weapon → Ammo Mapping ----

export const WEAPON_AMMO_MAP: Record<WeaponType, string> = {
  pistol: '9mm',
  smg: '9mm',
  rifle: '556',
  shotgun: '12gauge',
  machinegun: '762',
};

// ---- Armor type mapping ----

/** Maps ArmorType ('light'|'medium'|'heavy') to item defId */
export const ARMOR_TYPE_TO_ITEM: Record<string, string> = {
  light: 'light_armor',
  medium: 'medium_armor',
  heavy: 'heavy_armor',
};

export const ITEM_TO_ARMOR_TYPE: Record<string, string> = {
  light_armor: 'light',
  medium_armor: 'medium',
  heavy_armor: 'heavy',
};

// ---- Helpers ----

export function getItemDef(defId: string): ItemDef | undefined {
  return ITEM_DEFS[defId];
}

export function createItemInstance(defId: string, quantity: number = 1): ItemInstance | null {
  const def = ITEM_DEFS[defId];
  if (!def) return null;
  return { defId, quantity: Math.min(quantity, def.maxStack) };
}
