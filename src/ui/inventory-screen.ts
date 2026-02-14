import type { PlayerInventory, InventoryConfig } from '../simulation/types.ts';
import type { ItemInstance, ItemCategory, ItemDef } from '../simulation/items.ts';
import { ITEM_DEFS } from '../simulation/items.ts';
import { equipItem, unequipItem, splitStack } from '../simulation/inventory.ts';

// ---- State ----

export type SlotRegion = 'backpack' | 'equipment' | 'hotbar';

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
let dragStarted = false;

// Context menu state
interface ContextMenuState {
  x: number;
  y: number;
  region: SlotRegion;
  slotIndex: number | string;
  item: ItemInstance;
}
let contextMenu: ContextMenuState | null = null;

// ---- Category Colors ----

export const CATEGORY_COLORS: Record<ItemCategory, string> = {
  weapon: '#e8a030',
  armor: '#5080d0',
  helmet: '#5080d0',
  ammo: '#a0a070',
  medical: '#50c060',
  grenade: '#d05050',
  valuable: '#ffd700',
  material: '#888888',
};

// ---- Tooltip ----

let tooltipEl: HTMLElement | null = null;

function ensureTooltip(): HTMLElement {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'inv-tooltip';
    tooltipEl.style.display = 'none';
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

export function createTooltipContent(item: ItemInstance): HTMLElement {
  const def = ITEM_DEFS[item.defId];
  const frag = document.createElement('div');
  if (!def) return frag;

  const nameEl = document.createElement('div');
  nameEl.className = 'inv-tooltip-name';
  nameEl.textContent = def.name;
  nameEl.style.color = CATEGORY_COLORS[def.category] ?? '#fff';
  frag.appendChild(nameEl);

  const catEl = document.createElement('div');
  catEl.className = 'inv-tooltip-category';
  catEl.textContent = def.category.toUpperCase();
  frag.appendChild(catEl);

  const descEl = document.createElement('div');
  descEl.className = 'inv-tooltip-desc';
  descEl.textContent = def.description;
  frag.appendChild(descEl);

  // Sell value
  const sellEl = document.createElement('div');
  sellEl.className = 'inv-tooltip-stat';
  sellEl.textContent = `Sell: $${def.sellValue * item.quantity}`;
  frag.appendChild(sellEl);

  // Conditional lines
  if (def.category === 'weapon' && item.upgradeLevel && item.upgradeLevel > 0) {
    const upEl = document.createElement('div');
    upEl.className = 'inv-tooltip-stat';
    upEl.textContent = `Upgrade Lv. ${item.upgradeLevel}`;
    frag.appendChild(upEl);
  }

  if ((def.category === 'armor' || def.category === 'helmet') && item.currentHp !== undefined) {
    const durEl = document.createElement('div');
    durEl.className = 'inv-tooltip-stat';
    durEl.textContent = `Durability: ${Math.ceil(item.currentHp)} HP`;
    frag.appendChild(durEl);
  }

  if (def.stackable && def.maxStack > 1) {
    const stackEl = document.createElement('div');
    stackEl.className = 'inv-tooltip-stat';
    stackEl.textContent = `Stack: ${item.quantity} / ${def.maxStack}`;
    frag.appendChild(stackEl);
  }

  return frag;
}

export function showTooltip(x: number, y: number, item: ItemInstance): void {
  const tip = ensureTooltip();
  tip.innerHTML = '';
  tip.appendChild(createTooltipContent(item));
  tip.style.display = 'block';

  // Position near cursor, offset right+down, clamp to viewport
  const offsetX = 16;
  const offsetY = 16;
  let left = x + offsetX;
  let top = y + offsetY;

  // Need to measure after display
  const rect = tip.getBoundingClientRect();
  if (left + rect.width > window.innerWidth) {
    left = x - rect.width - 8;
  }
  if (top + rect.height > window.innerHeight) {
    top = y - rect.height - 8;
  }
  tip.style.left = `${Math.max(0, left)}px`;
  tip.style.top = `${Math.max(0, top)}px`;
}

export function hideTooltip(): void {
  if (tooltipEl) tooltipEl.style.display = 'none';
}

// ---- Shared Rendering ----

export function renderItemContent(slot: HTMLElement, item: ItemInstance): void {
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

// ---- Context Menu ----

function dismissContextMenu(): void {
  const el = document.getElementById('inv-context-menu');
  if (el) el.remove();
  contextMenu = null;
}

function showContextMenu(x: number, y: number, region: SlotRegion, slotIndex: number | string, item: ItemInstance): void {
  dismissContextMenu();
  if (!inventoryRef) return;

  const def = ITEM_DEFS[item.defId];
  if (!def) return;

  contextMenu = { x, y, region, slotIndex, item };

  const menu = document.createElement('div');
  menu.id = 'inv-context-menu';
  menu.className = 'inv-context-menu';

  const actions = buildContextActions(region, slotIndex, item, def);

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
        notifyChange();
        renderInventory();
      });
    }
    menu.appendChild(row);
  }

  // Position
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  document.body.appendChild(menu);

  // Clamp to viewport
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = `${x - rect.width}px`;
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = `${y - rect.height}px`;
  }
}

interface ContextAction {
  label: string;
  handler: () => void;
  disabled?: boolean;
}

function buildContextActions(region: SlotRegion, slotIndex: number | string, item: ItemInstance, def: ItemDef): ContextAction[] {
  const actions: ContextAction[] = [];
  if (!inventoryRef) return actions;

  if (region === 'backpack') {
    const idx = slotIndex as number;

    // Equip — weapon, armor, helmet
    if (def.category === 'weapon') {
      actions.push({
        label: 'Equip',
        handler: () => { equipItem(inventoryRef!, idx, 'weapon1'); },
      });
    } else if (def.category === 'armor') {
      actions.push({
        label: 'Equip',
        handler: () => { equipItem(inventoryRef!, idx, 'armor'); },
      });
    } else if (def.category === 'helmet') {
      actions.push({
        label: 'Equip',
        handler: () => { equipItem(inventoryRef!, idx, 'helmet'); },
      });
    }

    // Use — medical/grenade (grayed out for now)
    if (def.category === 'medical' || def.category === 'grenade') {
      actions.push({ label: 'Use', handler: () => {}, disabled: true });
    }

    // Split Stack
    if (def.stackable && item.quantity > 1) {
      actions.push({
        label: 'Split Stack',
        handler: () => { splitStack(inventoryRef!, idx); },
      });
    }
  } else if (region === 'equipment') {
    // Unequip
    actions.push({
      label: 'Unequip',
      handler: () => {
        unequipItem(inventoryRef!, slotIndex as keyof PlayerInventory['equipment']);
      },
    });
  } else if (region === 'hotbar') {
    // Use — grayed out
    if (def.category === 'medical' || def.category === 'grenade') {
      actions.push({ label: 'Use', handler: () => {}, disabled: true });
    }
  }

  // Drop — always available
  actions.push({
    label: 'Drop',
    handler: () => {
      if (region === 'backpack') {
        inventoryRef!.backpack[slotIndex as number] = null;
      } else if (region === 'equipment') {
        inventoryRef!.equipment[slotIndex as keyof PlayerInventory['equipment']] = null;
      } else if (region === 'hotbar') {
        inventoryRef!.hotbar[slotIndex as number] = null;
      }
    },
  });

  return actions;
}

// ---- Public API ----

export function setupInventoryScreen(onChange?: () => void): void {
  onChangeCallback = onChange ?? null;
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

    const target = document.elementFromPoint(e.clientX, e.clientY);
    const slotEl = target?.closest('[data-region]') as HTMLElement | null;

    if (slotEl) {
      const region = slotEl.dataset.region as SlotRegion;
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

    // Check if right-clicked on an occupied slot
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const slotEl = target?.closest('[data-region]') as HTMLElement | null;
    if (slotEl && slotEl.classList.contains('occupied')) {
      e.preventDefault();
      const region = slotEl.dataset.region as SlotRegion;
      const slotIndex = slotEl.dataset.slot!;
      const item = getItemAtSlot(region, region === 'equipment' ? slotIndex : parseInt(slotIndex));
      if (item) {
        showContextMenu(e.clientX, e.clientY, region, region === 'equipment' ? slotIndex : parseInt(slotIndex), item);
      }
    }
  });

  // Click anywhere to dismiss context menu
  window.addEventListener('mousedown', (e) => {
    if (contextMenu) {
      const target = e.target as HTMLElement;
      if (!target.closest('#inv-context-menu')) {
        dismissContextMenu();
      }
    }
  });
}

function getItemAtSlot(region: SlotRegion, slotIndex: number | string): ItemInstance | null {
  if (!inventoryRef) return null;
  if (region === 'backpack') {
    return inventoryRef.backpack[slotIndex as number];
  } else if (region === 'equipment') {
    return inventoryRef.equipment[slotIndex as keyof PlayerInventory['equipment']];
  } else if (region === 'hotbar') {
    const defId = inventoryRef.hotbar[slotIndex as number];
    if (defId) {
      // Hotbar stores defId — return a synthetic item for tooltip/context
      return { defId, quantity: 1 };
    }
  }
  return null;
}

export function openInventoryScreen(inventory: PlayerInventory, config: InventoryConfig): void {
  inventoryRef = inventory;
  configRef = config;
  isOpen = true;
  dismissContextMenu();
  renderInventory();
  document.getElementById('inventory-screen')!.classList.remove('hidden');
}

export function closeInventoryScreen(): void {
  cancelHeld();
  dismissContextMenu();
  hideTooltip();
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

function renderInventory(): void {
  if (!inventoryRef || !configRef) return;
  const container = document.getElementById('inventory-screen')!;
  container.innerHTML = '';

  const inv = inventoryRef;
  const cols = configRef.backpackColumns;

  const panel = document.createElement('div');
  panel.className = 'inv-panel';

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

      // Tooltip for hotbar
      const syntheticItem: ItemInstance = { defId, quantity: count };
      addSlotTooltipListeners(slot, syntheticItem);
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

// ---- Interaction ----

function handleMouseDown(region: SlotRegion, slotIndex: number | string): void {
  if (!inventoryRef) return;

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
      if (existing) {
        returnItemToSlot(existing, heldItem.source);
      }
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
    if (existing) {
      returnItemToSlot(existing, heldItem.source);
    }
    clearHeld();
  } else if (region === 'hotbar') {
    if (def.category !== 'medical' && def.category !== 'grenade') {
      cancelHeld();
      return;
    }
    returnHeldToSource();
    const idx = slotIndex as number;
    inventoryRef.hotbar[idx] = item.defId;
    clearHeld();
  }

  notifyChange();
  renderInventory();
}

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
