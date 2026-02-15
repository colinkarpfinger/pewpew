import type { PlayerInventory, InventoryConfig, WeaponsConfig, ArmorConfig, WeaponType, WeaponUpgradesConfig } from '../simulation/types.ts';
import type { ItemInstance, ItemCategory } from '../simulation/items.ts';
import { ITEM_DEFS, ITEM_TO_ARMOR_TYPE } from '../simulation/items.ts';
import { addItemToBackpack } from '../simulation/inventory.ts';
import { getStashCash, addCashToStash, loadPlayerInventory, savePlayerInventory, setWeaponUpgradeLevel } from '../persistence.ts';
import {
  CATEGORY_COLORS,
  renderItemContent,
  showTooltip,
  hideTooltip,
} from './inventory-screen.ts';

// ---- Config refs ----
let shopPrices: Record<string, number> = {};
let armorPrices: Record<string, number> = {};
let bandagePrices: Record<string, number> = {};
let ammoPrices: Record<string, number> = {};
let ammoPerPurchase: Record<string, number> = {};
let weaponsConfig: WeaponsConfig | null = null;
let armorConfig: ArmorConfig | null = null;
let weaponUpgradesConfig: WeaponUpgradesConfig | null = null;
let inventoryConfigRef: InventoryConfig | null = null;

// ---- State ----
let inventoryRef: PlayerInventory | null = null;
let isOpen = false;

interface SelectedItem {
  source: 'inventory' | 'shop';
  item: ItemInstance;
  defId: string;
  equipSlot?: keyof PlayerInventory['equipment'];
  backpackIndex?: number;
}
let selectedItem: SelectedItem | null = null;

// ---- Shop Catalog ----

interface ShopEntry {
  defId: string;
  price: number;
  category: ItemCategory;
}

function buildShopCatalog(): ShopEntry[] {
  const catalog: ShopEntry[] = [];

  // Weapons
  const weaponTypes: WeaponType[] = ['smg', 'shotgun', 'rifle', 'machinegun'];
  for (const wt of weaponTypes) {
    catalog.push({ defId: wt, price: shopPrices[wt] ?? 0, category: 'weapon' });
  }

  // Armor
  for (const [armorType, price] of Object.entries(armorPrices)) {
    const defId = `${armorType}_armor`;
    if (ITEM_DEFS[defId]) {
      catalog.push({ defId, price, category: 'armor' });
    }
  }

  // Ammo
  for (const [ammoType, price] of Object.entries(ammoPrices)) {
    if (ITEM_DEFS[ammoType]) {
      catalog.push({ defId: ammoType, price, category: 'ammo' });
    }
  }

  // Medical
  for (const [key, price] of Object.entries(bandagePrices)) {
    const defId = key === 'small' ? 'bandage_small' : 'bandage_large';
    catalog.push({ defId, price, category: 'medical' });
  }

  // Grenades
  catalog.push({ defId: 'frag_grenade', price: 100, category: 'grenade' });

  return catalog;
}

// ---- Public API ----

export function setupShopScreen(
  prices: Record<string, number>,
  wc: WeaponsConfig,
  ap: Record<string, number>,
  ac: ArmorConfig,
  bp: Record<string, number>,
  wuc: WeaponUpgradesConfig,
  ammoP: Record<string, number>,
  ammoPP: Record<string, number>,
  invConfig: InventoryConfig,
): void {
  shopPrices = prices;
  weaponsConfig = wc;
  armorPrices = ap;
  armorConfig = ac;
  bandagePrices = bp;
  weaponUpgradesConfig = wuc;
  ammoPrices = ammoP;
  ammoPerPurchase = ammoPP;
  inventoryConfigRef = invConfig;
}

export function openShopScreen(): void {
  if (!inventoryConfigRef) return;
  inventoryRef = loadPlayerInventory(inventoryConfigRef.backpackSize);
  selectedItem = null;
  isOpen = true;
  renderShop();
  document.getElementById('shop-screen')!.classList.remove('hidden');
}

export function closeShopScreen(): void {
  if (inventoryRef) savePlayerInventory(inventoryRef);
  selectedItem = null;
  isOpen = false;
  hideTooltip();
  document.getElementById('shop-screen')!.classList.add('hidden');
}

export function isShopOpen(): boolean {
  return isOpen;
}

// ---- Rendering ----

function renderShop(): void {
  if (!inventoryRef || !inventoryConfigRef) return;
  const container = document.getElementById('shop-screen')!;
  container.innerHTML = '';

  const cash = getStashCash();

  // Header
  const header = document.createElement('div');
  header.className = 'shop-header-bar';
  header.textContent = `Stash: $${cash}`;
  container.appendChild(header);

  const wrapper = document.createElement('div');
  wrapper.className = 'shop-wrapper';

  // Left: player inventory
  wrapper.appendChild(renderInventoryPanel());

  // Center: detail
  wrapper.appendChild(renderDetailPanel(cash));

  // Right: shop catalog
  wrapper.appendChild(renderCatalogPanel());

  container.appendChild(wrapper);

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'menu-btn shop-close-btn';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', () => closeShopScreen());
  container.appendChild(closeBtn);
}

function renderInventoryPanel(): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'shop-panel shop-inv-panel';

  const title = document.createElement('h2');
  title.className = 'shop-panel-title';
  title.textContent = 'INVENTORY';
  panel.appendChild(title);

  const inv = inventoryRef!;
  const config = inventoryConfigRef!;

  // Equipment slots
  const equipSection = document.createElement('div');
  equipSection.className = 'inv-equipment';
  const equipSlots: { key: keyof PlayerInventory['equipment']; label: string }[] = [
    { key: 'weapon1', label: 'W1' },
    { key: 'weapon2', label: 'W2' },
    { key: 'armor', label: 'AR' },
    { key: 'helmet', label: 'HM' },
  ];
  for (const { key, label } of equipSlots) {
    const item = inv.equipment[key];
    const slot = createInvSlot(item, label);
    if (item) {
      slot.addEventListener('click', () => selectInventoryEquip(key, item));
    }
    equipSection.appendChild(slot);
  }
  panel.appendChild(equipSection);

  // Backpack
  const bpLabel = document.createElement('div');
  bpLabel.className = 'inv-section-label';
  bpLabel.textContent = 'BACKPACK';
  panel.appendChild(bpLabel);

  const bpGrid = document.createElement('div');
  bpGrid.className = 'inv-backpack-grid';
  bpGrid.style.gridTemplateColumns = `repeat(${config.backpackColumns}, 1fr)`;
  for (let i = 0; i < inv.backpack.length; i++) {
    const item = inv.backpack[i];
    const slot = createBackpackSlot(item, i);
    bpGrid.appendChild(slot);
  }
  panel.appendChild(bpGrid);

  // Hotbar
  const hbLabel = document.createElement('div');
  hbLabel.className = 'inv-section-label';
  hbLabel.textContent = 'HOTBAR';
  panel.appendChild(hbLabel);

  const hotbarRow = document.createElement('div');
  hotbarRow.className = 'inv-hotbar-row';
  for (let i = 0; i < config.hotbarSlots; i++) {
    const defId = inv.hotbar[i];
    const slot = document.createElement('div');
    slot.className = 'inv-slot inv-hotbar-slot';
    const keyLabel = document.createElement('div');
    keyLabel.className = 'inv-hotbar-key';
    keyLabel.textContent = String(i + 3);
    slot.appendChild(keyLabel);
    if (defId) {
      const def = ITEM_DEFS[defId];
      if (def) {
        slot.classList.add('occupied');
        const icon = document.createElement('div');
        icon.className = 'inv-item-icon';
        icon.style.background = CATEGORY_COLORS[def.category] ?? '#888';
        icon.textContent = def.name.charAt(0);
        slot.appendChild(icon);
      }
    }
    hotbarRow.appendChild(slot);
  }
  panel.appendChild(hotbarRow);

  return panel;
}

function createInvSlot(item: ItemInstance | null, label: string): HTMLElement {
  const slot = document.createElement('div');
  slot.className = 'inv-slot inv-equip-slot';
  const labelEl = document.createElement('div');
  labelEl.className = 'inv-equip-label';
  labelEl.textContent = label;
  slot.appendChild(labelEl);
  if (item) {
    slot.classList.add('occupied');
    renderItemContent(slot, item);
    addTooltipListeners(slot, item);
  }
  return slot;
}

function createBackpackSlot(item: ItemInstance | null, index: number): HTMLElement {
  const slot = document.createElement('div');
  slot.className = 'inv-slot';
  if (item) {
    slot.classList.add('occupied');
    renderItemContent(slot, item);
    addTooltipListeners(slot, item);
    slot.addEventListener('click', () => selectInventoryBackpack(index, item));
  }
  return slot;
}

function selectInventoryEquip(key: keyof PlayerInventory['equipment'], item: ItemInstance): void {
  selectedItem = { source: 'inventory', item, defId: item.defId, equipSlot: key };
  hideTooltip();
  renderShop();
}

function selectInventoryBackpack(index: number, item: ItemInstance): void {
  selectedItem = { source: 'inventory', item, defId: item.defId, backpackIndex: index };
  hideTooltip();
  renderShop();
}

function renderDetailPanel(cash: number): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'shop-panel shop-detail-panel';

  if (!selectedItem) {
    const hint = document.createElement('div');
    hint.className = 'shop-detail-hint';
    hint.textContent = 'Click an item to see details';
    panel.appendChild(hint);
    return panel;
  }

  const def = ITEM_DEFS[selectedItem.defId];
  if (!def) return panel;

  // Item name
  const nameEl = document.createElement('div');
  nameEl.className = 'shop-detail-name';
  nameEl.textContent = def.name;
  nameEl.style.color = CATEGORY_COLORS[def.category] ?? '#fff';
  panel.appendChild(nameEl);

  // Category
  const catEl = document.createElement('div');
  catEl.className = 'shop-detail-category';
  catEl.textContent = def.category.toUpperCase();
  panel.appendChild(catEl);

  // Description
  const descEl = document.createElement('div');
  descEl.className = 'shop-detail-desc';
  descEl.textContent = def.description;
  panel.appendChild(descEl);

  // Stats for weapons
  if (def.category === 'weapon' && weaponsConfig) {
    const wt = selectedItem.defId as WeaponType;
    const wc = weaponsConfig[wt];
    if (wc) {
      const pellets = wc.pelletsPerShot && wc.pelletsPerShot > 1 ? `\u00D7${wc.pelletsPerShot}` : '';
      addStatLine(panel, `${wc.damage}${pellets} DMG | ${wc.fireRate} RPS | ${wc.magazineSize} MAG`);
    }
  }

  // Stats for armor
  if (def.category === 'armor' && armorConfig) {
    const armorType = ITEM_TO_ARMOR_TYPE[selectedItem.defId];
    if (armorType && armorConfig[armorType as keyof ArmorConfig]) {
      const ac = armorConfig[armorType as keyof ArmorConfig];
      addStatLine(panel, `${Math.round(ac.damageReduction * 100)}% DMG Reduction | ${ac.maxHp} HP`);
    }
    // Show current HP if it's an inventory armor item
    if (selectedItem.source === 'inventory' && selectedItem.item.currentHp !== undefined) {
      addStatLine(panel, `Current HP: ${Math.ceil(selectedItem.item.currentHp)}`);
    }
  }

  // Upgrade level for weapons
  if (def.category === 'weapon' && selectedItem.item.upgradeLevel !== undefined && selectedItem.item.upgradeLevel > 0) {
    addStatLine(panel, `Upgrade Lv. ${selectedItem.item.upgradeLevel}`);
  }

  // Actions divider
  const divider = document.createElement('hr');
  divider.className = 'shop-detail-divider';
  panel.appendChild(divider);

  if (selectedItem.source === 'shop') {
    // Buy button
    const catalog = buildShopCatalog();
    const entry = catalog.find(e => e.defId === selectedItem!.defId);
    const price = entry?.price ?? 0;
    let displayPrice = price;
    // For ammo, price is per-purchase bundle
    if (def.category === 'ammo') {
      const perPurchase = ammoPerPurchase[selectedItem.defId] ?? 30;
      addStatLine(panel, `Bundle: x${perPurchase}`);
    }
    const canAfford = cash >= displayPrice;
    const buyBtn = document.createElement('button');
    buyBtn.className = 'shop-action-btn shop-buy-action';
    buyBtn.textContent = `Buy $${displayPrice}`;
    buyBtn.disabled = !canAfford;
    buyBtn.addEventListener('click', () => handleBuy(selectedItem!.defId, displayPrice));
    panel.appendChild(buyBtn);
  } else if (selectedItem.source === 'inventory') {
    // Sell button
    const sellValue = def.sellValue * selectedItem.item.quantity;
    if (sellValue > 0) {
      const sellBtn = document.createElement('button');
      sellBtn.className = 'shop-action-btn shop-sell-action';
      sellBtn.textContent = `Sell $${sellValue}`;
      sellBtn.addEventListener('click', () => handleSell());
      panel.appendChild(sellBtn);
    }

    // Upgrade button for weapons
    if (def.category === 'weapon' && weaponUpgradesConfig) {
      const wt = selectedItem.defId as WeaponType;
      const upgradeCfg = weaponUpgradesConfig[wt];
      if (upgradeCfg) {
        const currentLevel = selectedItem.item.upgradeLevel ?? 0;
        if (currentLevel < upgradeCfg.maxLevel) {
          const nextLevel = upgradeCfg.levels[currentLevel];
          const upgradeBtn = document.createElement('button');
          upgradeBtn.className = 'shop-action-btn shop-upgrade-action';
          upgradeBtn.textContent = `Upgrade Lv.${currentLevel + 1} $${nextLevel.price}`;
          upgradeBtn.disabled = cash < nextLevel.price;
          upgradeBtn.addEventListener('click', () => handleUpgrade(wt, currentLevel, nextLevel.price));
          panel.appendChild(upgradeBtn);

          addStatLine(panel, `+${nextLevel.damageBonus} DMG | +${nextLevel.fireRateBonus} RPS | +${nextLevel.magazineSizeBonus} MAG`);
        } else {
          addStatLine(panel, 'MAX UPGRADE');
        }
      }
    }

    // Repair button for damaged armor
    if (def.category === 'armor' && selectedItem.item.currentHp !== undefined && armorConfig) {
      const armorType = ITEM_TO_ARMOR_TYPE[selectedItem.defId];
      if (armorType && armorConfig[armorType as keyof ArmorConfig]) {
        const ac = armorConfig[armorType as keyof ArmorConfig];
        if (selectedItem.item.currentHp < ac.maxHp) {
          const repairPrice = Math.ceil((armorPrices[armorType] ?? 0) * 0.5);
          const repairBtn = document.createElement('button');
          repairBtn.className = 'shop-action-btn shop-repair-action';
          repairBtn.textContent = `Repair $${repairPrice}`;
          repairBtn.disabled = cash < repairPrice;
          repairBtn.addEventListener('click', () => handleRepair(repairPrice));
          panel.appendChild(repairBtn);
        }
      }
    }
  }

  return panel;
}

function addStatLine(panel: HTMLElement, text: string): void {
  const el = document.createElement('div');
  el.className = 'shop-detail-stat';
  el.textContent = text;
  panel.appendChild(el);
}

function renderCatalogPanel(): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'shop-panel shop-catalog-panel';

  const title = document.createElement('h2');
  title.className = 'shop-panel-title';
  title.textContent = 'SHOP';
  panel.appendChild(title);

  const catalog = buildShopCatalog();
  const categories: ItemCategory[] = ['weapon', 'armor', 'ammo', 'medical', 'grenade'];

  for (const cat of categories) {
    const entries = catalog.filter(e => e.category === cat);
    if (entries.length === 0) continue;

    const header = document.createElement('div');
    header.className = 'shop-catalog-header';
    header.textContent = cat.toUpperCase();
    panel.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'shop-catalog-grid';
    for (const entry of entries) {
      const def = ITEM_DEFS[entry.defId];
      if (!def) continue;

      const slot = document.createElement('div');
      slot.className = 'inv-slot shop-catalog-slot';
      slot.classList.add('occupied');

      const icon = document.createElement('div');
      icon.className = 'inv-item-icon';
      icon.style.background = CATEGORY_COLORS[def.category] ?? '#888';
      icon.textContent = def.name.substring(0, 2).toUpperCase();
      slot.appendChild(icon);

      const nameEl = document.createElement('div');
      nameEl.className = 'inv-item-name';
      nameEl.textContent = def.name;
      slot.appendChild(nameEl);

      const priceEl = document.createElement('div');
      priceEl.className = 'shop-catalog-price';
      priceEl.textContent = `$${entry.price}`;
      slot.appendChild(priceEl);

      // Highlight selected
      if (selectedItem?.source === 'shop' && selectedItem.defId === entry.defId) {
        slot.classList.add('shop-selected');
      }

      slot.addEventListener('click', () => {
        // Construct an item instance for display
        const quantity = def.category === 'ammo' ? (ammoPerPurchase[entry.defId] ?? 30) : 1;
        selectedItem = { source: 'shop', item: { defId: entry.defId, quantity }, defId: entry.defId };
        hideTooltip();
        renderShop();
      });

      addTooltipListeners(slot, { defId: entry.defId, quantity: 1 });
      grid.appendChild(slot);
    }
    panel.appendChild(grid);
  }

  return panel;
}

// ---- Actions ----

function handleBuy(defId: string, price: number): void {
  if (!inventoryRef) return;
  const def = ITEM_DEFS[defId];
  if (!def) return;

  const cash = getStashCash();
  if (cash < price) return;

  const quantity = def.category === 'ammo' ? (ammoPerPurchase[defId] ?? 30) : 1;
  const newItem: ItemInstance = { defId, quantity };

  if (addItemToBackpack(inventoryRef, newItem)) {
    addCashToStash(-price);
    savePlayerInventory(inventoryRef);
    renderShop();
  }
}

function handleSell(): void {
  if (!inventoryRef || !selectedItem || selectedItem.source !== 'inventory') return;
  const def = ITEM_DEFS[selectedItem.defId];
  if (!def) return;

  const sellValue = def.sellValue * selectedItem.item.quantity;

  if (selectedItem.equipSlot) {
    inventoryRef.equipment[selectedItem.equipSlot] = null;
  } else if (selectedItem.backpackIndex !== undefined) {
    inventoryRef.backpack[selectedItem.backpackIndex] = null;
  }

  addCashToStash(sellValue);
  savePlayerInventory(inventoryRef);
  selectedItem = null;
  renderShop();
}

function handleUpgrade(weaponType: WeaponType, currentLevel: number, price: number): void {
  if (!inventoryRef || !selectedItem || selectedItem.source !== 'inventory') return;
  const cash = getStashCash();
  if (cash < price) return;

  addCashToStash(-price);
  const newLevel = currentLevel + 1;
  setWeaponUpgradeLevel(weaponType, newLevel);

  // Update the item instance's upgradeLevel
  selectedItem.item.upgradeLevel = newLevel;

  // Update the actual item in inventory
  if (selectedItem.equipSlot) {
    const item = inventoryRef.equipment[selectedItem.equipSlot];
    if (item) item.upgradeLevel = newLevel;
  } else if (selectedItem.backpackIndex !== undefined) {
    const item = inventoryRef.backpack[selectedItem.backpackIndex];
    if (item) item.upgradeLevel = newLevel;
  }

  savePlayerInventory(inventoryRef);
  renderShop();
}

function handleRepair(price: number): void {
  if (!inventoryRef || !selectedItem || selectedItem.source !== 'inventory') return;
  if (!armorConfig) return;
  const cash = getStashCash();
  if (cash < price) return;

  const armorType = ITEM_TO_ARMOR_TYPE[selectedItem.defId];
  if (!armorType || !armorConfig[armorType as keyof ArmorConfig]) return;
  const maxHp = armorConfig[armorType as keyof ArmorConfig].maxHp;

  addCashToStash(-price);
  selectedItem.item.currentHp = maxHp;

  // Update the actual item in inventory
  if (selectedItem.equipSlot) {
    const item = inventoryRef.equipment[selectedItem.equipSlot];
    if (item) item.currentHp = maxHp;
  } else if (selectedItem.backpackIndex !== undefined) {
    const item = inventoryRef.backpack[selectedItem.backpackIndex];
    if (item) item.currentHp = maxHp;
  }

  savePlayerInventory(inventoryRef);
  renderShop();
}

// ---- Tooltip helpers ----

function addTooltipListeners(slot: HTMLElement, item: ItemInstance): void {
  slot.addEventListener('mouseenter', (e) => {
    showTooltip(e.clientX, e.clientY, item);
  });
  slot.addEventListener('mousemove', (e) => {
    showTooltip(e.clientX, e.clientY, item);
  });
  slot.addEventListener('mouseleave', () => {
    hideTooltip();
  });
}
