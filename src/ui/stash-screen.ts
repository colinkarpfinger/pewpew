import type { PlayerInventory, InventoryConfig } from '../simulation/types.ts';
import type { ItemInstance, ItemCategory } from '../simulation/items.ts';
import { ITEM_DEFS } from '../simulation/items.ts';
import type { StashData } from '../persistence.ts';
import { loadStash, saveStash, loadPlayerInventory, savePlayerInventory } from '../persistence.ts';
import { equipItem, unequipItem, splitStack } from '../simulation/inventory.ts';
import {
  CATEGORY_COLORS,
  renderItemContent,
  showTooltip,
  hideTooltip,
} from './inventory-screen.ts';

// ---- State ----

type StashSlotRegion = 'backpack' | 'equipment' | 'hotbar' | 'stash';

interface HeldItem {
  item: ItemInstance;
  source: { region: StashSlotRegion; slotIndex: number | string };
}

let heldItem: HeldItem | null = null;
let floatingEl: HTMLElement | null = null;
let inventoryRef: PlayerInventory | null = null;
let configRef: InventoryConfig | null = null;
let stashRef: StashData | null = null;
let isOpen = false;
let onChangeCallback: (() => void) | null = null;
let isDragging = false;
let dragStarted = false;

// Context menu state
interface ContextMenuState {
  x: number;
  y: number;
  region: StashSlotRegion;
  slotIndex: number | string;
  item: ItemInstance;
}
let contextMenu: ContextMenuState | null = null;

// ---- Public API ----

export function setupStashScreen(onChange?: () => void): void {
  onChangeCallback = onChange ?? null;

  if (!document.getElementById('stash-screen')) {
    const overlay = document.createElement('div');
    overlay.id = 'stash-screen';
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
      const region = slotEl.dataset.region as StashSlotRegion;
      const slotIndex = slotEl.dataset.slot!;
      const idx = region === 'equipment' ? slotIndex : parseInt(slotIndex);
      placeHeld(region, idx);
    } else {
      cancelHeld();
    }
  });

  // Right-click: cancel drag OR show context menu
  window.addEventListener('contextmenu', (e) => {
    if (!isOpen) return;

    if (heldItem) {
      e.preventDefault();
      cancelHeld();
      return;
    }

    const target = document.elementFromPoint(e.clientX, e.clientY);
    const slotEl = target?.closest('[data-region]') as HTMLElement | null;
    if (slotEl && slotEl.classList.contains('occupied')) {
      e.preventDefault();
      const region = slotEl.dataset.region as StashSlotRegion;
      const slotIndex = slotEl.dataset.slot!;
      const parsedIndex = region === 'equipment' ? slotIndex : parseInt(slotIndex);
      const item = getItemAtSlot(region, parsedIndex);
      if (item) {
        showStashContextMenu(e.clientX, e.clientY, region, parsedIndex, item);
      }
    }
  });

  // Click anywhere to dismiss context menu
  window.addEventListener('mousedown', (e) => {
    if (!isOpen) return;
    if (contextMenu) {
      const target = e.target as HTMLElement;
      if (!target.closest('#stash-context-menu')) {
        dismissContextMenu();
      }
    }
  });
}

export function openStashScreen(config: InventoryConfig): void {
  configRef = config;
  inventoryRef = loadPlayerInventory(config.backpackSize);
  stashRef = loadStash(config.stashSize);
  isOpen = true;
  dismissContextMenu();
  renderStash();
  document.getElementById('stash-screen')!.classList.remove('hidden');
}

export function closeStashScreen(): void {
  cancelHeld();
  dismissContextMenu();
  hideTooltip();
  // Persist both sides
  if (inventoryRef) savePlayerInventory(inventoryRef);
  if (stashRef) saveStash(stashRef);
  isOpen = false;
  isDragging = false;
  dragStarted = false;
  document.getElementById('stash-screen')!.classList.add('hidden');
  if (onChangeCallback) onChangeCallback();
}

export function isStashOpen(): boolean {
  return isOpen;
}

// ---- Helpers ----

function getItemAtSlot(region: StashSlotRegion, slotIndex: number | string): ItemInstance | null {
  if (region === 'backpack' && inventoryRef) {
    return inventoryRef.backpack[slotIndex as number];
  } else if (region === 'equipment' && inventoryRef) {
    return inventoryRef.equipment[slotIndex as keyof PlayerInventory['equipment']];
  } else if (region === 'hotbar' && inventoryRef) {
    const defId = inventoryRef.hotbar[slotIndex as number];
    if (defId) return { defId, quantity: 1 };
  } else if (region === 'stash' && stashRef) {
    return stashRef.items[slotIndex as number];
  }
  return null;
}

// ---- Context Menu ----

function dismissContextMenu(): void {
  const el = document.getElementById('stash-context-menu');
  if (el) el.remove();
  contextMenu = null;
}

interface ContextAction {
  label: string;
  handler: () => void;
  disabled?: boolean;
}

function showStashContextMenu(x: number, y: number, region: StashSlotRegion, slotIndex: number | string, item: ItemInstance): void {
  dismissContextMenu();

  const def = ITEM_DEFS[item.defId];
  if (!def) return;

  contextMenu = { x, y, region, slotIndex, item };

  const menu = document.createElement('div');
  menu.id = 'stash-context-menu';
  menu.className = 'inv-context-menu';

  const actions: ContextAction[] = [];

  if (region === 'backpack' && inventoryRef) {
    const idx = slotIndex as number;
    if (def.category === 'weapon') {
      actions.push({ label: 'Equip', handler: () => { equipItem(inventoryRef!, idx, 'weapon1'); } });
    } else if (def.category === 'armor') {
      actions.push({ label: 'Equip', handler: () => { equipItem(inventoryRef!, idx, 'armor'); } });
    } else if (def.category === 'helmet') {
      actions.push({ label: 'Equip', handler: () => { equipItem(inventoryRef!, idx, 'helmet'); } });
    }
    if (def.category === 'medical' || def.category === 'grenade') {
      actions.push({ label: 'Use', handler: () => {}, disabled: true });
    }
    if (def.stackable && item.quantity > 1) {
      actions.push({ label: 'Split Stack', handler: () => { splitStack(inventoryRef!, idx); } });
    }
  } else if (region === 'equipment' && inventoryRef) {
    actions.push({
      label: 'Unequip',
      handler: () => { unequipItem(inventoryRef!, slotIndex as keyof PlayerInventory['equipment']); },
    });
  } else if (region === 'stash' && stashRef) {
    // Stash items: only Split Stack and Drop
    if (def.stackable && item.quantity > 1) {
      const idx = slotIndex as number;
      actions.push({
        label: 'Split Stack',
        handler: () => {
          const stashItem = stashRef!.items[idx];
          if (!stashItem || stashItem.quantity <= 1) return;
          const emptyIdx = stashRef!.items.indexOf(null);
          if (emptyIdx === -1) return;
          const half = Math.floor(stashItem.quantity / 2);
          const other = stashItem.quantity - half;
          stashItem.quantity = half;
          stashRef!.items[emptyIdx] = { ...stashItem, quantity: other };
        },
      });
    }
  }

  // Drop — always available
  actions.push({
    label: 'Drop',
    handler: () => {
      if (region === 'backpack' && inventoryRef) {
        inventoryRef.backpack[slotIndex as number] = null;
      } else if (region === 'equipment' && inventoryRef) {
        inventoryRef.equipment[slotIndex as keyof PlayerInventory['equipment']] = null;
      } else if (region === 'hotbar' && inventoryRef) {
        inventoryRef.hotbar[slotIndex as number] = null;
      } else if (region === 'stash' && stashRef) {
        stashRef.items[slotIndex as number] = null;
      }
    },
  });

  for (const action of actions) {
    const row = document.createElement('div');
    row.className = 'inv-context-action';
    if (action.disabled) row.classList.add('disabled');
    row.textContent = action.label;
    if (!action.disabled) {
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        action.handler();
        dismissContextMenu();
        renderStash();
      });
    }
    menu.appendChild(row);
  }

  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  document.body.appendChild(menu);

  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = `${x - rect.width}px`;
  if (rect.bottom > window.innerHeight) menu.style.top = `${y - rect.height}px`;
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

// ---- Rendering ----

function renderStash(): void {
  if (!inventoryRef || !configRef || !stashRef) return;
  const container = document.getElementById('stash-screen')!;
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'stash-wrapper';

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
    const slot = createEquipSlot(inventoryRef.equipment[key], key, label);
    equipSection.appendChild(slot);
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

  // Hotbar
  const hbLabel = document.createElement('div');
  hbLabel.className = 'inv-section-label';
  hbLabel.textContent = 'HOTBAR';
  leftPanel.appendChild(hbLabel);

  const hotbarRow = document.createElement('div');
  hotbarRow.className = 'inv-hotbar-row';
  for (let i = 0; i < configRef.hotbarSlots; i++) {
    hotbarRow.appendChild(createHotbarSlot(inventoryRef.hotbar[i], i));
  }
  leftPanel.appendChild(hotbarRow);

  wrapper.appendChild(leftPanel);

  // Right panel: stash
  const rightPanel = document.createElement('div');
  rightPanel.className = 'stash-panel';

  const usedSlots = stashRef.items.filter(s => s !== null).length;
  const stashTitle = document.createElement('h2');
  stashTitle.className = 'stash-header';
  stashTitle.textContent = `STASH (${usedSlots}/${stashRef.capacity})`;
  rightPanel.appendChild(stashTitle);

  const stashGrid = document.createElement('div');
  stashGrid.className = 'stash-grid';
  stashGrid.style.gridTemplateColumns = `repeat(${configRef.stashColumns}, 1fr)`;
  for (let i = 0; i < stashRef.items.length; i++) {
    stashGrid.appendChild(createStashSlot(stashRef.items[i], i));
  }
  rightPanel.appendChild(stashGrid);

  wrapper.appendChild(rightPanel);
  container.appendChild(wrapper);

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'menu-btn stash-close-btn';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', () => closeStashScreen());
  container.appendChild(closeBtn);
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
    dismissContextMenu();
    hideTooltip();
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
    dismissContextMenu();
    hideTooltip();
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
  keyLabel.textContent = String(index + 3);
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

      let count = 0;
      for (const s of inventoryRef.backpack) {
        if (s?.defId === defId) count += s.quantity;
      }
      const badge = document.createElement('div');
      badge.className = 'inv-item-qty';
      badge.textContent = String(count);
      if (count === 0) badge.classList.add('depleted');
      slot.appendChild(badge);

      addSlotTooltipListeners(slot, { defId, quantity: count });
    }
  }

  slot.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dismissContextMenu();
    hideTooltip();
    handleMouseDown('hotbar', index);
  });
  return slot;
}

function createStashSlot(item: ItemInstance | null, index: number): HTMLElement {
  const slot = document.createElement('div');
  slot.className = 'inv-slot';
  slot.dataset.region = 'stash';
  slot.dataset.slot = String(index);
  if (item) {
    slot.classList.add('occupied');
    renderItemContent(slot, item);
    addSlotTooltipListeners(slot, item);
  }
  slot.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dismissContextMenu();
    hideTooltip();
    handleMouseDown('stash', index);
  });
  return slot;
}

// ---- Interaction ----

function handleMouseDown(region: StashSlotRegion, slotIndex: number | string): void {
  if (!inventoryRef || !stashRef) return;

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
    const idx = slotIndex as number;
    if (inventoryRef.hotbar[idx]) {
      inventoryRef.hotbar[idx] = null;
      renderStash();
    }
    return;
  } else if (region === 'stash') {
    const idx = slotIndex as number;
    item = stashRef.items[idx];
    if (item) stashRef.items[idx] = null;
  }

  if (!item) return;

  heldItem = { item, source: { region, slotIndex } };
  isDragging = true;
  dragStarted = false;
  createFloating(item);
  renderStash();
}

function placeHeld(region: StashSlotRegion, slotIndex: number | string): void {
  if (!heldItem || !inventoryRef || !stashRef) return;

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
  } else if (region === 'hotbar') {
    if (def.category !== 'medical' && def.category !== 'grenade') {
      cancelHeld();
      return;
    }
    returnHeldToSource();
    inventoryRef.hotbar[slotIndex as number] = item.defId;
    clearHeld();
  } else if (region === 'stash') {
    const idx = slotIndex as number;
    const existing = stashRef.items[idx];

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
      stashRef.items[idx] = item;
      if (existing) returnItemToSlot(existing, heldItem.source);
      clearHeld();
    }
  }

  renderStash();
}

function returnItemToSlot(item: ItemInstance, target: { region: StashSlotRegion; slotIndex: number | string }): void {
  if (!inventoryRef || !stashRef) return;

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
  } else if (target.region === 'stash') {
    const idx = target.slotIndex as number;
    if (stashRef.items[idx] === null) {
      stashRef.items[idx] = item;
    } else {
      const empty = stashRef.items.indexOf(null);
      if (empty !== -1) stashRef.items[empty] = item;
    }
  }
}

function cancelHeld(): void {
  if (!heldItem) { clearHeld(); return; }
  returnHeldToSource();
  clearHeld();
  renderStash();
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
