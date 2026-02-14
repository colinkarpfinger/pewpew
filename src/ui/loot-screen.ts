import type { PlayerInventory, InventoryConfig, LootContainer } from '../simulation/types.ts';
import type { ItemInstance, ItemCategory } from '../simulation/items.ts';
import { ITEM_DEFS } from '../simulation/items.ts';
import {
  CATEGORY_COLORS,
  renderItemContent,
  showTooltip,
  hideTooltip,
} from './inventory-screen.ts';

// ---- State ----

type LootSlotRegion = 'backpack' | 'equipment' | 'hotbar' | 'loot';

interface HeldItem {
  item: ItemInstance;
  source: { region: LootSlotRegion; slotIndex: number | string };
}

let heldItem: HeldItem | null = null;
let floatingEl: HTMLElement | null = null;
let inventoryRef: PlayerInventory | null = null;
let containerRef: LootContainer | null = null;
let configRef: InventoryConfig | null = null;
let isOpen = false;
let onChangeCallback: (() => void) | null = null;
let isDragging = false;
let dragStarted = false;
let searchTimer = 0;
let hoveredSlot: { region: LootSlotRegion; slotIndex: number | string } | null = null;

// ---- Public API ----

export function setupLootScreen(onChange?: () => void): void {
  onChangeCallback = onChange ?? null;

  if (!document.getElementById('loot-screen')) {
    const overlay = document.createElement('div');
    overlay.id = 'loot-screen';
    overlay.className = 'hidden';
    document.getElementById('game-container')!.appendChild(overlay);
  }

  // Mouse move — update floating item
  window.addEventListener('mousemove', (e) => {
    if (!isOpen) return;
    if (floatingEl) {
      floatingEl.style.left = `${e.clientX}px`;
      floatingEl.style.top = `${e.clientY}px`;
    }
    if (isDragging && !dragStarted) {
      dragStarted = true;
    }
  });

  // Mouse up — drop item
  window.addEventListener('mouseup', (e) => {
    if (!isDragging || !heldItem || !isOpen) return;
    if (e.button !== 0) return;
    isDragging = false;

    const target = document.elementFromPoint(e.clientX, e.clientY);
    const slotEl = target?.closest('[data-region]') as HTMLElement | null;

    if (slotEl) {
      const region = slotEl.dataset.region as LootSlotRegion;
      const slotIndex = slotEl.dataset.slot!;
      const idx = region === 'equipment' ? slotIndex : parseInt(slotIndex);
      placeHeld(region, idx);
    } else {
      cancelHeld();
    }
  });

  // Track hovered slot (delegated for F-key quick transfer)
  const lootScreenEl = document.getElementById('loot-screen')!;
  lootScreenEl.addEventListener('mouseover', (e) => {
    const target = e.target as HTMLElement;
    const slotEl = target.closest('[data-region]') as HTMLElement | null;
    if (slotEl) {
      const region = slotEl.dataset.region as LootSlotRegion;
      const slotIndex = region === 'equipment' ? slotEl.dataset.slot! : parseInt(slotEl.dataset.slot!);
      hoveredSlot = { region, slotIndex };
    } else {
      hoveredSlot = null;
    }
  });
  lootScreenEl.addEventListener('mouseout', (e) => {
    const target = e.relatedTarget as HTMLElement | null;
    if (!target || !target.closest('#loot-screen [data-region]')) {
      hoveredSlot = null;
    }
  });

  // Double-click: quick transfer (delegated to survive re-renders)
  lootScreenEl.addEventListener('dblclick', (e) => {
    if (!isOpen) return;
    const target = e.target as HTMLElement;
    const slotEl = target.closest('[data-region]') as HTMLElement | null;
    if (!slotEl) return;
    e.preventDefault();
    hideTooltip();
    // Cancel any in-progress drag from the first click
    if (heldItem) cancelHeld();
    const region = slotEl.dataset.region as LootSlotRegion;
    const slotIndex = region === 'equipment' ? slotEl.dataset.slot! : parseInt(slotEl.dataset.slot!);
    quickTransfer(region, slotIndex);
  });

  // Right-click: cancel drag
  window.addEventListener('contextmenu', () => {
    if (!isOpen) return;
    if (heldItem) cancelHeld();
  });
}

export function openLootScreen(inventory: PlayerInventory, container: LootContainer, config: InventoryConfig): void {
  inventoryRef = inventory;
  containerRef = container;
  configRef = config;
  searchTimer = 0;
  isOpen = true;
  renderLoot();
  document.getElementById('loot-screen')!.classList.remove('hidden');
}

/** Try to quick-transfer the currently hovered item. Returns true if it did something. */
export function quickTransferHovered(): boolean {
  if (!isOpen || !hoveredSlot) return false;
  const { region, slotIndex } = hoveredSlot;

  // Check if slot actually has an item
  if (region === 'loot' && containerRef) {
    const idx = slotIndex as number;
    if (!containerRef.items[idx]) return false;
  } else if (region === 'backpack' && inventoryRef) {
    const idx = slotIndex as number;
    if (!inventoryRef.backpack[idx]) return false;
  } else if (region === 'equipment' && inventoryRef) {
    const key = slotIndex as keyof PlayerInventory['equipment'];
    if (!inventoryRef.equipment[key]) return false;
  } else {
    return false;
  }

  quickTransfer(region, slotIndex);
  return true;
}

export function closeLootScreen(): void {
  cancelHeld();
  hideTooltip();
  isOpen = false;
  isDragging = false;
  dragStarted = false;
  document.getElementById('loot-screen')!.classList.add('hidden');
  if (onChangeCallback) onChangeCallback();
}

export function isLootOpen(): boolean {
  return isOpen;
}

export function getLootContainer(): LootContainer | null {
  return isOpen ? containerRef : null;
}

/** Count how many item-bearing slots exist (packed to front, so it's the index of first null) */
function getItemCount(container: LootContainer): number {
  for (let i = 0; i < container.capacity; i++) {
    if (container.items[i] === null) return i;
  }
  return container.capacity;
}

/** Called each frame to advance the search timer and reveal slots */
export function updateLootSearch(tickDelta: number): void {
  if (!isOpen || !containerRef || !configRef) return;

  // Only search through slots that have items (packed to front)
  const itemCount = getItemCount(containerRef);
  if (containerRef.searchProgress >= itemCount) return;

  searchTimer += tickDelta;
  const timePerSlot = configRef.searchTimePerSlot;
  let revealed = false;

  while (searchTimer >= timePerSlot && containerRef.searchProgress < itemCount) {
    searchTimer -= timePerSlot;
    containerRef.searchProgress++;
    revealed = true;
  }

  if (revealed) {
    renderLoot();
  }
}

// ---- Rendering ----

function renderLoot(): void {
  if (!inventoryRef || !configRef || !containerRef) return;
  const container = document.getElementById('loot-screen')!;
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'loot-wrapper';

  // Left panel: player inventory
  const leftPanel = document.createElement('div');
  leftPanel.className = 'stash-panel';

  const invTitle = document.createElement('h2');
  invTitle.className = 'stash-header';
  invTitle.textContent = 'INVENTORY';
  leftPanel.appendChild(invTitle);

  // Equipment
  const equipSection = document.createElement('div');
  equipSection.className = 'inv-equipment';
  const equipSlots: { key: keyof PlayerInventory['equipment']; label: string }[] = [
    { key: 'weapon1', label: 'W1' },
    { key: 'weapon2', label: 'W2' },
    { key: 'armor', label: 'AR' },
    { key: 'helmet', label: 'HM' },
  ];
  for (const { key, label } of equipSlots) {
    equipSection.appendChild(createEquipSlot(inventoryRef.equipment[key], key, label));
  }
  leftPanel.appendChild(equipSection);

  // Backpack
  const bpLabel = document.createElement('div');
  bpLabel.className = 'inv-section-label';
  bpLabel.textContent = 'BACKPACK';
  leftPanel.appendChild(bpLabel);

  const bpGrid = document.createElement('div');
  bpGrid.className = 'inv-backpack-grid';
  bpGrid.style.gridTemplateColumns = `repeat(${configRef.backpackColumns}, 1fr)`;
  for (let i = 0; i < inventoryRef.backpack.length; i++) {
    bpGrid.appendChild(createBpSlot(inventoryRef.backpack[i], i));
  }
  leftPanel.appendChild(bpGrid);

  wrapper.appendChild(leftPanel);

  // Right panel: loot container
  const rightPanel = document.createElement('div');
  rightPanel.className = 'stash-panel loot-panel';

  const lc = containerRef;
  const itemCount = getItemCount(lc);
  const lootTitle = document.createElement('h2');
  lootTitle.className = 'stash-header loot-header';
  lootTitle.textContent = `LOOT (${lc.searchProgress}/${itemCount})`;
  rightPanel.appendChild(lootTitle);

  // Search progress bar (relative to item count, not capacity)
  const progressBar = document.createElement('div');
  progressBar.className = 'loot-progress-bar';
  const progressFill = document.createElement('div');
  progressFill.className = 'loot-progress-fill';
  const progressPct = itemCount > 0 ? lc.searchProgress / itemCount : 1;
  progressFill.style.width = `${progressPct * 100}%`;
  progressBar.appendChild(progressFill);
  rightPanel.appendChild(progressBar);

  // Loot slots grid
  const lootGrid = document.createElement('div');
  lootGrid.className = 'stash-grid';
  lootGrid.style.gridTemplateColumns = `repeat(${configRef.lootColumns}, 1fr)`;

  for (let i = 0; i < lc.capacity; i++) {
    if (i < lc.searchProgress) {
      // Revealed slot (item was here, may have been taken)
      lootGrid.appendChild(createLootSlot(lc.items[i], i));
    } else if (i < itemCount) {
      // Unsearched item slot — show stripes / searching animation
      const isSearching = i === lc.searchProgress;
      lootGrid.appendChild(createUnsearchedSlot(isSearching));
    } else {
      // Trailing empty slot — plain empty, no animation
      lootGrid.appendChild(createEmptySlot(i));
    }
  }
  rightPanel.appendChild(lootGrid);

  wrapper.appendChild(rightPanel);
  container.appendChild(wrapper);
}

function createBpSlot(item: ItemInstance | null, index: number): HTMLElement {
  const slot = document.createElement('div');
  slot.className = 'inv-slot';
  slot.dataset.region = 'backpack';
  slot.dataset.slot = String(index);
  if (item) {
    slot.classList.add('occupied');
    renderItemContent(slot, item);
    addSlotTooltipListeners(slot, item);
  }
  slot.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    hideTooltip();
    if (e.ctrlKey || e.metaKey) { quickTransfer('backpack', index); return; }
    handleMouseDown('backpack', index);
  });
  return slot;
}

function createEquipSlot(item: ItemInstance | null, key: string, label: string): HTMLElement {
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
    addSlotTooltipListeners(slot, item);
  }
  slot.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    hideTooltip();
    if (e.ctrlKey || e.metaKey) { quickTransfer('equipment', key); return; }
    handleMouseDown('equipment', key);
  });
  return slot;
}

function createLootSlot(item: ItemInstance | null, index: number): HTMLElement {
  const slot = document.createElement('div');
  slot.className = 'inv-slot';
  slot.dataset.region = 'loot';
  slot.dataset.slot = String(index);
  if (item) {
    slot.classList.add('occupied');
    renderItemContent(slot, item);
    addSlotTooltipListeners(slot, item);
  }
  slot.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    hideTooltip();
    if (e.ctrlKey || e.metaKey) { quickTransfer('loot', index); return; }
    handleMouseDown('loot', index);
  });
  return slot;
}

function createUnsearchedSlot(isSearching: boolean): HTMLElement {
  const slot = document.createElement('div');
  slot.className = `inv-slot ${isSearching ? 'loot-slot-searching' : 'loot-slot-unsearched'}`;
  if (isSearching) {
    const icon = document.createElement('div');
    icon.className = 'loot-search-icon';
    icon.textContent = '?';
    slot.appendChild(icon);
  }
  return slot;
}

function createEmptySlot(index: number): HTMLElement {
  const slot = document.createElement('div');
  slot.className = 'inv-slot';
  slot.dataset.region = 'loot';
  slot.dataset.slot = String(index);
  return slot;
}

// ---- Tooltip helpers ----

function addSlotTooltipListeners(slot: HTMLElement, item: ItemInstance): void {
  slot.addEventListener('mouseenter', (e) => {
    if (isDragging) return;
    showTooltip(e.clientX, e.clientY, item);
  });
  slot.addEventListener('mousemove', (e) => {
    if (isDragging) { hideTooltip(); return; }
    showTooltip(e.clientX, e.clientY, item);
  });
  slot.addEventListener('mouseleave', () => {
    hideTooltip();
  });
}

// ---- Quick transfer (double-click / ctrl+click) ----

function quickTransfer(region: LootSlotRegion, slotIndex: number | string): void {
  if (!inventoryRef || !containerRef) return;

  if (region === 'loot') {
    // Loot → backpack: find first stackable match, then first empty slot
    const idx = slotIndex as number;
    const item = containerRef.items[idx];
    if (!item) return;
    const def = ITEM_DEFS[item.defId];
    if (!def) return;

    // Try stacking first
    if (def.stackable) {
      for (let i = 0; i < inventoryRef.backpack.length; i++) {
        const bp = inventoryRef.backpack[i];
        if (bp && bp.defId === item.defId) {
          const canAdd = def.maxStack - bp.quantity;
          if (canAdd >= item.quantity) {
            bp.quantity += item.quantity;
            containerRef.items[idx] = null;
            if (onChangeCallback) onChangeCallback();
            renderLoot();
            return;
          } else if (canAdd > 0) {
            bp.quantity = def.maxStack;
            item.quantity -= canAdd;
            // Keep going — remaining quantity needs a new slot
          }
        }
      }
    }

    // Find first empty backpack slot
    const empty = inventoryRef.backpack.indexOf(null);
    if (empty === -1) return; // backpack full
    inventoryRef.backpack[empty] = item;
    containerRef.items[idx] = null;
  } else if (region === 'backpack') {
    // Backpack → loot: find first empty revealed loot slot
    const idx = slotIndex as number;
    const item = inventoryRef.backpack[idx];
    if (!item) return;
    const def = ITEM_DEFS[item.defId];
    if (!def) return;

    // Try stacking in loot first
    if (def.stackable) {
      for (let i = 0; i < containerRef.searchProgress; i++) {
        const loot = containerRef.items[i];
        if (loot && loot.defId === item.defId) {
          const canAdd = def.maxStack - loot.quantity;
          if (canAdd >= item.quantity) {
            loot.quantity += item.quantity;
            inventoryRef.backpack[idx] = null;
            if (onChangeCallback) onChangeCallback();
            renderLoot();
            return;
          } else if (canAdd > 0) {
            loot.quantity = def.maxStack;
            item.quantity -= canAdd;
          }
        }
      }
    }

    // Find first empty revealed loot slot
    for (let i = 0; i < containerRef.searchProgress; i++) {
      if (containerRef.items[i] === null) {
        containerRef.items[i] = item;
        inventoryRef.backpack[idx] = null;
        break;
      }
    }
  } else if (region === 'equipment') {
    // Equipment → backpack: find first empty backpack slot
    const key = slotIndex as keyof PlayerInventory['equipment'];
    const item = inventoryRef.equipment[key];
    if (!item) return;

    const empty = inventoryRef.backpack.indexOf(null);
    if (empty === -1) return;
    inventoryRef.backpack[empty] = item;
    inventoryRef.equipment[key] = null;
  }

  if (onChangeCallback) onChangeCallback();
  renderLoot();
}

// ---- Interaction (drag & drop) ----

function handleMouseDown(region: LootSlotRegion, slotIndex: number | string): void {
  if (!inventoryRef || !containerRef) return;

  let item: ItemInstance | null = null;

  if (region === 'backpack') {
    const idx = slotIndex as number;
    item = inventoryRef.backpack[idx];
    if (item) inventoryRef.backpack[idx] = null;
  } else if (region === 'equipment') {
    const key = slotIndex as keyof PlayerInventory['equipment'];
    item = inventoryRef.equipment[key];
    if (item) inventoryRef.equipment[key] = null;
  } else if (region === 'loot') {
    const idx = slotIndex as number;
    if (idx >= containerRef.searchProgress) return; // can't pick unsearched
    item = containerRef.items[idx];
    if (item) containerRef.items[idx] = null;
  }

  if (!item) return;

  heldItem = { item, source: { region, slotIndex } };
  isDragging = true;
  dragStarted = false;
  createFloating(item);
  renderLoot();
}

function placeHeld(region: LootSlotRegion, slotIndex: number | string): void {
  if (!heldItem || !inventoryRef || !containerRef) return;

  const item = heldItem.item;
  const def = ITEM_DEFS[item.defId];
  if (!def) { cancelHeld(); return; }

  if (region === 'backpack') {
    const idx = slotIndex as number;
    const existing = inventoryRef.backpack[idx];

    if (existing && existing.defId === item.defId && def.stackable) {
      const canAdd = def.maxStack - existing.quantity;
      if (canAdd >= item.quantity) {
        existing.quantity += item.quantity;
        clearHeld();
      } else {
        existing.quantity = def.maxStack;
        item.quantity -= canAdd;
        cancelHeld();
        return;
      }
    } else {
      inventoryRef.backpack[idx] = item;
      if (existing) returnItemToSlot(existing, heldItem.source);
      clearHeld();
    }
  } else if (region === 'equipment') {
    const key = slotIndex as keyof PlayerInventory['equipment'];
    const requiredCategory: Record<string, ItemCategory> = {
      weapon1: 'weapon', weapon2: 'weapon', armor: 'armor', helmet: 'helmet',
    };
    if (def.category !== requiredCategory[key]) {
      cancelHeld();
      return;
    }
    const existing = inventoryRef.equipment[key];
    inventoryRef.equipment[key] = item;
    if (existing) returnItemToSlot(existing, heldItem.source);
    clearHeld();
  } else if (region === 'loot') {
    const idx = slotIndex as number;
    if (idx >= containerRef.searchProgress) {
      cancelHeld();
      return;
    }
    const existing = containerRef.items[idx];

    if (existing && existing.defId === item.defId && def.stackable) {
      const canAdd = def.maxStack - existing.quantity;
      if (canAdd >= item.quantity) {
        existing.quantity += item.quantity;
        clearHeld();
      } else {
        existing.quantity = def.maxStack;
        item.quantity -= canAdd;
        cancelHeld();
        return;
      }
    } else {
      containerRef.items[idx] = item;
      if (existing) returnItemToSlot(existing, heldItem.source);
      clearHeld();
    }
  }

  if (onChangeCallback) onChangeCallback();
  renderLoot();
}

function returnItemToSlot(item: ItemInstance, target: { region: LootSlotRegion; slotIndex: number | string }): void {
  if (!inventoryRef || !containerRef) return;

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
  } else if (target.region === 'loot') {
    const idx = target.slotIndex as number;
    if (containerRef.items[idx] === null) {
      containerRef.items[idx] = item;
    } else {
      // Try to find an empty revealed slot
      for (let i = 0; i < containerRef.searchProgress; i++) {
        if (containerRef.items[i] === null) {
          containerRef.items[i] = item;
          return;
        }
      }
    }
  }
}

function cancelHeld(): void {
  if (!heldItem) { clearHeld(); return; }
  returnHeldToSource();
  clearHeld();
  renderLoot();
}

function returnHeldToSource(): void {
  if (!heldItem) return;
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
