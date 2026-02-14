import type { PlayerInventory, InventoryConfig } from '../simulation/types.ts';
import type { ItemInstance, ItemCategory } from '../simulation/items.ts';
import { ITEM_DEFS } from '../simulation/items.ts';

// ---- State ----

type SlotRegion = 'backpack' | 'equipment' | 'hotbar';

interface HeldItem {
  item: ItemInstance;
  source: { region: SlotRegion; slotIndex: number | string };
}

let heldItem: HeldItem | null = null;
let floatingEl: HTMLElement | null = null;
let inventoryRef: PlayerInventory | null = null;
let configRef: InventoryConfig | null = null;
let isOpen = false;
let onChangeCallback: (() => void) | null = null;
let isDragging = false;
let dragStarted = false; // true once mouse moves enough after mousedown

// ---- Category Colors ----

const CATEGORY_COLORS: Record<ItemCategory, string> = {
  weapon: '#e8a030',
  armor: '#5080d0',
  helmet: '#5080d0',
  ammo: '#a0a070',
  medical: '#50c060',
  grenade: '#d05050',
  valuable: '#ffd700',
  material: '#888888',
};

// ---- Public API ----

export function setupInventoryScreen(onChange?: () => void): void {
  onChangeCallback = onChange ?? null;
  // Create the overlay container once
  if (!document.getElementById('inventory-screen')) {
    const overlay = document.createElement('div');
    overlay.id = 'inventory-screen';
    overlay.className = 'hidden';
    document.getElementById('game-container')!.appendChild(overlay);
  }

  // Mouse move — update floating item + detect drag start
  window.addEventListener('mousemove', (e) => {
    if (floatingEl) {
      floatingEl.style.left = `${e.clientX}px`;
      floatingEl.style.top = `${e.clientY}px`;
    }
    if (isDragging && !dragStarted) {
      dragStarted = true;
    }
  });

  // Mouse up — drop item on whatever slot is under cursor
  window.addEventListener('mouseup', (e) => {
    if (!isDragging || !heldItem || !isOpen) return;
    if (e.button !== 0) return;
    isDragging = false;

    // Find the slot under the cursor
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const slotEl = target?.closest('[data-region]') as HTMLElement | null;

    if (slotEl) {
      const region = slotEl.dataset.region as SlotRegion;
      const slotIndex = slotEl.dataset.slot!;
      const idx = region === 'equipment' ? slotIndex : parseInt(slotIndex);
      placeHeld(region, idx);
    } else {
      // Dropped outside any slot — cancel
      cancelHeld();
    }
  });

  // Right-click to cancel held item
  window.addEventListener('contextmenu', (e) => {
    if (isOpen && heldItem) {
      e.preventDefault();
      cancelHeld();
    }
  });
}

export function openInventoryScreen(inventory: PlayerInventory, config: InventoryConfig): void {
  inventoryRef = inventory;
  configRef = config;
  isOpen = true;
  renderInventory();
  document.getElementById('inventory-screen')!.classList.remove('hidden');
}

export function closeInventoryScreen(): void {
  cancelHeld();
  isOpen = false;
  isDragging = false;
  dragStarted = false;
  document.getElementById('inventory-screen')!.classList.add('hidden');
}

export function isInventoryOpen(): boolean {
  return isOpen;
}

export function getHotbarAssignments(): (string | null)[] {
  return inventoryRef?.hotbar ?? [null, null, null, null, null];
}

// ---- Rendering ----

function renderInventory(): void {
  if (!inventoryRef || !configRef) return;
  const container = document.getElementById('inventory-screen')!;
  container.innerHTML = '';

  const inv = inventoryRef;
  const cols = configRef.backpackColumns;

  // Main panel
  const panel = document.createElement('div');
  panel.className = 'inv-panel';

  // Title
  const title = document.createElement('h2');
  title.className = 'inv-title';
  title.textContent = 'INVENTORY';
  panel.appendChild(title);

  // Equipment section
  const equipSection = document.createElement('div');
  equipSection.className = 'inv-equipment';

  const equipSlots: { key: keyof PlayerInventory['equipment']; label: string }[] = [
    { key: 'weapon1', label: 'WEAPON 1' },
    { key: 'weapon2', label: 'WEAPON 2' },
    { key: 'armor', label: 'ARMOR' },
    { key: 'helmet', label: 'HELMET' },
  ];

  for (const { key, label } of equipSlots) {
    const slot = createEquipmentSlot(inv.equipment[key], key, label);
    equipSection.appendChild(slot);
  }
  panel.appendChild(equipSection);

  // Backpack section
  const bpLabel = document.createElement('div');
  bpLabel.className = 'inv-section-label';
  bpLabel.textContent = 'BACKPACK';
  panel.appendChild(bpLabel);

  const backpackGrid = document.createElement('div');
  backpackGrid.className = 'inv-backpack-grid';
  backpackGrid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

  for (let i = 0; i < inv.backpack.length; i++) {
    const slot = createBackpackSlot(inv.backpack[i], i);
    backpackGrid.appendChild(slot);
  }
  panel.appendChild(backpackGrid);

  // Hotbar section
  const hbLabel = document.createElement('div');
  hbLabel.className = 'inv-section-label';
  hbLabel.textContent = 'HOTBAR';
  panel.appendChild(hbLabel);

  const hotbarRow = document.createElement('div');
  hotbarRow.className = 'inv-hotbar-row';

  for (let i = 0; i < configRef.hotbarSlots; i++) {
    const slot = createHotbarSlot(inv.hotbar[i], i);
    hotbarRow.appendChild(slot);
  }
  panel.appendChild(hotbarRow);

  container.appendChild(panel);
}

function createBackpackSlot(item: ItemInstance | null, index: number): HTMLElement {
  const slot = document.createElement('div');
  slot.className = 'inv-slot';
  slot.dataset.region = 'backpack';
  slot.dataset.slot = String(index);
  if (item) {
    slot.classList.add('occupied');
    renderItemContent(slot, item);
  }

  slot.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    handleMouseDown('backpack', index);
  });
  return slot;
}

function createEquipmentSlot(item: ItemInstance | null, key: string, label: string): HTMLElement {
  const slot = document.createElement('div');
  slot.className = 'inv-slot inv-equip-slot';
  slot.dataset.region = 'equipment';
  slot.dataset.slot = key;

  const labelEl = document.createElement('div');
  labelEl.className = 'inv-equip-label';
  labelEl.textContent = label;
  slot.appendChild(labelEl);

  if (item) {
    slot.classList.add('occupied');
    renderItemContent(slot, item);
  }

  slot.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    handleMouseDown('equipment', key);
  });
  return slot;
}

function createHotbarSlot(defId: string | null, index: number): HTMLElement {
  const slot = document.createElement('div');
  slot.className = 'inv-slot inv-hotbar-slot';
  slot.dataset.region = 'hotbar';
  slot.dataset.slot = String(index);

  const keyLabel = document.createElement('div');
  keyLabel.className = 'inv-hotbar-key';
  keyLabel.textContent = String(index + 3); // Keys 3-7
  slot.appendChild(keyLabel);

  if (defId && inventoryRef) {
    const def = ITEM_DEFS[defId];
    if (def) {
      slot.classList.add('occupied');
      const icon = document.createElement('div');
      icon.className = 'inv-item-icon';
      icon.style.background = CATEGORY_COLORS[def.category] ?? '#888';
      icon.textContent = def.name.charAt(0);
      slot.appendChild(icon);

      const nameEl = document.createElement('div');
      nameEl.className = 'inv-item-name';
      nameEl.textContent = def.name;
      slot.appendChild(nameEl);

      // Count from backpack
      let count = 0;
      for (const s of inventoryRef.backpack) {
        if (s?.defId === defId) count += s.quantity;
      }
      const badge = document.createElement('div');
      badge.className = 'inv-item-qty';
      badge.textContent = String(count);
      if (count === 0) badge.classList.add('depleted');
      slot.appendChild(badge);
    }
  }

  slot.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    handleMouseDown('hotbar', index);
  });
  return slot;
}

function renderItemContent(slot: HTMLElement, item: ItemInstance): void {
  const def = ITEM_DEFS[item.defId];
  if (!def) return;

  const icon = document.createElement('div');
  icon.className = 'inv-item-icon';
  icon.style.background = CATEGORY_COLORS[def.category] ?? '#888';
  icon.textContent = def.name.substring(0, 2).toUpperCase();
  slot.appendChild(icon);

  const nameEl = document.createElement('div');
  nameEl.className = 'inv-item-name';
  nameEl.textContent = def.name;
  slot.appendChild(nameEl);

  if (def.stackable && item.quantity > 1) {
    const badge = document.createElement('div');
    badge.className = 'inv-item-qty';
    badge.textContent = String(item.quantity);
    slot.appendChild(badge);
  }
}

// ---- Interaction (mousedown to pick up, mouseup to drop) ----

function handleMouseDown(region: SlotRegion, slotIndex: number | string): void {
  if (!inventoryRef) return;

  // Pick up the item under cursor
  let item: ItemInstance | null = null;

  if (region === 'backpack') {
    const idx = slotIndex as number;
    item = inventoryRef.backpack[idx];
    if (item) inventoryRef.backpack[idx] = null;
  } else if (region === 'equipment') {
    const key = slotIndex as keyof PlayerInventory['equipment'];
    item = inventoryRef.equipment[key];
    if (item) inventoryRef.equipment[key] = null;
  } else if (region === 'hotbar') {
    // Hotbar stores defId references — clear assignment on drag
    const idx = slotIndex as number;
    if (inventoryRef.hotbar[idx]) {
      inventoryRef.hotbar[idx] = null;
      notifyChange();
      renderInventory();
    }
    return;
  }

  if (!item) return;

  heldItem = { item, source: { region, slotIndex } };
  isDragging = true;
  dragStarted = false;
  createFloating(item);
  notifyChange();
  renderInventory();
}

function placeHeld(region: SlotRegion, slotIndex: number | string): void {
  if (!heldItem || !inventoryRef) return;

  const item = heldItem.item;
  const def = ITEM_DEFS[item.defId];
  if (!def) { cancelHeld(); return; }

  if (region === 'backpack') {
    const idx = slotIndex as number;
    const existing = inventoryRef.backpack[idx];

    // Merge if same stackable
    if (existing && existing.defId === item.defId && def.stackable) {
      const canAdd = def.maxStack - existing.quantity;
      if (canAdd >= item.quantity) {
        existing.quantity += item.quantity;
        clearHeld();
      } else {
        existing.quantity = def.maxStack;
        item.quantity -= canAdd;
        // Still holding remainder — put it back at source
        cancelHeld();
        return;
      }
    } else {
      // Swap
      inventoryRef.backpack[idx] = item;
      if (existing) {
        // Put swapped item back at original source
        returnItemToSlot(existing, heldItem.source);
      }
      clearHeld();
    }
  } else if (region === 'equipment') {
    const key = slotIndex as keyof PlayerInventory['equipment'];
    // Validate category
    const requiredCategory: Record<string, ItemCategory> = {
      weapon1: 'weapon', weapon2: 'weapon', armor: 'armor', helmet: 'helmet',
    };
    if (def.category !== requiredCategory[key]) {
      // Invalid — cancel, return to source
      cancelHeld();
      return;
    }
    const existing = inventoryRef.equipment[key];
    inventoryRef.equipment[key] = item;
    if (existing) {
      returnItemToSlot(existing, heldItem.source);
    }
    clearHeld();
  } else if (region === 'hotbar') {
    // Only consumables (medical, grenade) can be assigned to hotbar
    if (def.category !== 'medical' && def.category !== 'grenade') {
      cancelHeld();
      return;
    }
    // Hotbar stores defId — return the item to its source, assign the defId
    returnHeldToSource();
    const idx = slotIndex as number;
    inventoryRef.hotbar[idx] = item.defId;
    clearHeld();
  }

  notifyChange();
  renderInventory();
}

/** Put an item into a specific slot (used for swaps) */
function returnItemToSlot(item: ItemInstance, target: { region: SlotRegion; slotIndex: number | string }): void {
  if (!inventoryRef) return;

  if (target.region === 'backpack') {
    const idx = target.slotIndex as number;
    if (inventoryRef.backpack[idx] === null) {
      inventoryRef.backpack[idx] = item;
    } else {
      const empty = inventoryRef.backpack.indexOf(null);
      if (empty !== -1) inventoryRef.backpack[empty] = item;
    }
  } else if (target.region === 'equipment') {
    const key = target.slotIndex as keyof PlayerInventory['equipment'];
    if (inventoryRef.equipment[key] === null) {
      inventoryRef.equipment[key] = item;
    } else {
      const empty = inventoryRef.backpack.indexOf(null);
      if (empty !== -1) inventoryRef.backpack[empty] = item;
    }
  }
}

function cancelHeld(): void {
  if (!heldItem || !inventoryRef) { clearHeld(); return; }
  returnHeldToSource();
  clearHeld();
  notifyChange();
  renderInventory();
}

function returnHeldToSource(): void {
  if (!heldItem || !inventoryRef) return;
  returnItemToSlot(heldItem.item, heldItem.source);
}

function clearHeld(): void {
  heldItem = null;
  isDragging = false;
  dragStarted = false;
  destroyFloating();
}

function createFloating(item: ItemInstance): void {
  destroyFloating();
  const def = ITEM_DEFS[item.defId];
  if (!def) return;

  const el = document.createElement('div');
  el.className = 'inv-floating';
  el.style.background = CATEGORY_COLORS[def.category] ?? '#888';
  el.textContent = def.name.substring(0, 2).toUpperCase();
  if (def.stackable && item.quantity > 1) {
    const badge = document.createElement('span');
    badge.className = 'inv-floating-qty';
    badge.textContent = String(item.quantity);
    el.appendChild(badge);
  }
  document.body.appendChild(el);
  floatingEl = el;
}

function destroyFloating(): void {
  if (floatingEl) {
    floatingEl.remove();
    floatingEl = null;
  }
}

function notifyChange(): void {
  if (onChangeCallback) onChangeCallback();
}
