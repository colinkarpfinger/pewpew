import type { SeededRNG } from './rng.ts';
import type { ItemInstance } from './items.ts';

export interface LootEntry {
  defId: string;
  minQty: number;
  maxQty: number;
  weight: number;
}

export interface LootTable {
  entries: LootEntry[];
  emptyWeight: number; // weight for an empty slot
}

const LOOT_TABLES: Record<string, LootTable> = {
  enemy_sprinter: {
    emptyWeight: 40,
    entries: [
      { defId: 'cash_stack', minQty: 10, maxQty: 50, weight: 25 },
      { defId: 'bandage_small', minQty: 1, maxQty: 1, weight: 10 },
      { defId: '9mm', minQty: 10, maxQty: 30, weight: 10 },
      { defId: 'bolt', minQty: 1, maxQty: 3, weight: 8 },
      { defId: 'nut', minQty: 1, maxQty: 3, weight: 7 },
    ],
  },
  enemy_gunner: {
    emptyWeight: 25,
    entries: [
      { defId: 'cash_stack', minQty: 30, maxQty: 100, weight: 20 },
      { defId: '9mm', minQty: 15, maxQty: 40, weight: 12 },
      { defId: '556', minQty: 10, maxQty: 30, weight: 10 },
      { defId: 'bandage_small', minQty: 1, maxQty: 2, weight: 8 },
      { defId: 'bandage_large', minQty: 1, maxQty: 1, weight: 4 },
      { defId: 'light_armor', minQty: 1, maxQty: 1, weight: 3 },
      { defId: 'bolt', minQty: 1, maxQty: 5, weight: 6 },
      { defId: 'duct_tape', minQty: 1, maxQty: 1, weight: 4 },
      { defId: 'circuit_board', minQty: 1, maxQty: 1, weight: 3 },
    ],
  },
  enemy_shotgunner: {
    emptyWeight: 20,
    entries: [
      { defId: 'cash_stack', minQty: 40, maxQty: 120, weight: 18 },
      { defId: '12gauge', minQty: 6, maxQty: 18, weight: 15 },
      { defId: 'bandage_small', minQty: 1, maxQty: 2, weight: 8 },
      { defId: 'bandage_large', minQty: 1, maxQty: 1, weight: 5 },
      { defId: 'light_armor', minQty: 1, maxQty: 1, weight: 5 },
      { defId: 'medium_armor', minQty: 1, maxQty: 1, weight: 3 },
      { defId: 'metal_plate', minQty: 1, maxQty: 2, weight: 6 },
      { defId: 'gold_chain', minQty: 1, maxQty: 1, weight: 4 },
      { defId: 'duct_tape', minQty: 1, maxQty: 2, weight: 5 },
    ],
  },
  enemy_sniper: {
    emptyWeight: 15,
    entries: [
      { defId: 'cash_stack', minQty: 60, maxQty: 200, weight: 15 },
      { defId: '556', minQty: 15, maxQty: 45, weight: 12 },
      { defId: 'bandage_large', minQty: 1, maxQty: 1, weight: 8 },
      { defId: 'medkit', minQty: 1, maxQty: 1, weight: 3 },
      { defId: 'medium_armor', minQty: 1, maxQty: 1, weight: 5 },
      { defId: 'heavy_armor', minQty: 1, maxQty: 1, weight: 2 },
      { defId: 'gold_chain', minQty: 1, maxQty: 1, weight: 6 },
      { defId: 'circuit_board', minQty: 1, maxQty: 2, weight: 6 },
      { defId: 'metal_plate', minQty: 1, maxQty: 3, weight: 5 },
      { defId: 'frag_grenade', minQty: 1, maxQty: 1, weight: 4 },
    ],
  },
  crate_tier1: {
    emptyWeight: 35,
    entries: [
      { defId: 'cash_stack', minQty: 10, maxQty: 40, weight: 25 },
      { defId: 'bolt', minQty: 1, maxQty: 3, weight: 15 },
      { defId: 'nut', minQty: 1, maxQty: 3, weight: 15 },
      { defId: 'bandage_small', minQty: 1, maxQty: 1, weight: 10 },
    ],
  },
  crate_tier2: {
    emptyWeight: 25,
    entries: [
      { defId: 'cash_stack', minQty: 20, maxQty: 80, weight: 20 },
      { defId: '9mm', minQty: 15, maxQty: 30, weight: 12 },
      { defId: '556', minQty: 10, maxQty: 20, weight: 10 },
      { defId: 'bandage_small', minQty: 1, maxQty: 2, weight: 10 },
      { defId: 'bolt', minQty: 1, maxQty: 5, weight: 8 },
      { defId: 'duct_tape', minQty: 1, maxQty: 1, weight: 5 },
    ],
  },
  crate_tier3: {
    emptyWeight: 15,
    entries: [
      { defId: 'cash_stack', minQty: 40, maxQty: 150, weight: 18 },
      { defId: '556', minQty: 15, maxQty: 40, weight: 12 },
      { defId: '12gauge', minQty: 6, maxQty: 12, weight: 10 },
      { defId: 'bandage_large', minQty: 1, maxQty: 1, weight: 8 },
      { defId: 'medkit', minQty: 1, maxQty: 1, weight: 3 },
      { defId: 'light_armor', minQty: 1, maxQty: 1, weight: 5 },
      { defId: 'gold_chain', minQty: 1, maxQty: 1, weight: 5 },
      { defId: 'circuit_board', minQty: 1, maxQty: 1, weight: 5 },
      { defId: 'metal_plate', minQty: 1, maxQty: 2, weight: 6 },
    ],
  },
  crate_tier4: {
    emptyWeight: 10,
    entries: [
      { defId: 'cash_stack', minQty: 80, maxQty: 250, weight: 15 },
      { defId: '556', minQty: 20, maxQty: 50, weight: 10 },
      { defId: '12gauge', minQty: 8, maxQty: 18, weight: 8 },
      { defId: '762', minQty: 30, maxQty: 80, weight: 8 },
      { defId: 'medkit', minQty: 1, maxQty: 1, weight: 5 },
      { defId: 'bandage_large', minQty: 1, maxQty: 2, weight: 8 },
      { defId: 'medium_armor', minQty: 1, maxQty: 1, weight: 5 },
      { defId: 'heavy_armor', minQty: 1, maxQty: 1, weight: 3 },
      { defId: 'frag_grenade', minQty: 1, maxQty: 2, weight: 5 },
      { defId: 'gold_chain', minQty: 1, maxQty: 2, weight: 6 },
      { defId: 'circuit_board', minQty: 1, maxQty: 2, weight: 6 },
      { defId: 'metal_plate', minQty: 1, maxQty: 3, weight: 5 },
    ],
  },
};

/** Generate loot items for a container */
export function generateLoot(tableId: string, capacity: number, rng: SeededRNG): (ItemInstance | null)[] {
  const table = LOOT_TABLES[tableId];
  if (!table) {
    return new Array(capacity).fill(null);
  }

  const totalWeight = table.emptyWeight + table.entries.reduce((s, e) => s + e.weight, 0);
  const result: (ItemInstance | null)[] = [];

  for (let i = 0; i < capacity; i++) {
    const roll = rng.range(0, totalWeight);
    let cumulative = 0;
    let picked: LootEntry | null = null;

    for (const entry of table.entries) {
      cumulative += entry.weight;
      if (roll < cumulative) {
        picked = entry;
        break;
      }
    }

    if (picked) {
      const qty = rng.int(picked.minQty, picked.maxQty);
      result.push({ defId: picked.defId, quantity: qty });
    } else {
      result.push(null);
    }
  }

  // Pack items to the front — no gaps between items
  const packed: (ItemInstance | null)[] = result.filter(item => item !== null);
  while (packed.length < capacity) packed.push(null);
  return packed;
}
