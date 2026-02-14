import type { WeaponType, WeaponsConfig, ArmorType, ArmorConfig, WeaponUpgradesConfig } from '../simulation/types.ts';
import { getStashCash, getOwnedWeapons, addCashToStash, addWeapon, getOwnedArmor, addArmor, getBandages, addBandages, getAmmoStock, addAmmo, getWeaponUpgradeLevel, setWeaponUpgradeLevel, getArmorHp, setArmorHp, clearSave, loadPlayerInventory, savePlayerInventory } from '../persistence.ts';
import { WEAPON_AMMO_MAP, ITEM_DEFS } from '../simulation/items.ts';
import { countItemInBackpack, removeItemFromBackpack } from '../simulation/inventory.ts';

export interface HubCallbacks {
  onStartRun: (weapon: WeaponType, armor: ArmorType | null) => void;
  onBack: () => void;
  onManageStash: () => void;
}

type ShopPrices = Record<string, number>;

let selectedWeapon: WeaponType = 'pistol';
let selectedArmor: ArmorType | null = null;
let shopPrices: ShopPrices = {};
let armorPrices: ShopPrices = {};
let bandagePrices: ShopPrices = {};
let ammoPrices: ShopPrices = {};
let ammoPerPurchase: Record<string, number> = {};
let weaponsConfig: WeaponsConfig | null = null;
let armorConfig: ArmorConfig | null = null;
let weaponUpgradesConfig: WeaponUpgradesConfig | null = null;

const el = () => document.getElementById('hub-screen')!;
const stashEl = () => document.getElementById('hub-stash')!;
const shopItemsEl = () => document.getElementById('hub-shop-items')!;
const weaponListEl = () => document.getElementById('hub-weapon-list')!;
const armorShopItemsEl = () => document.getElementById('hub-armor-shop-items')!;
const armorListEl = () => document.getElementById('hub-armor-list')!;
const armorRepairEl = () => document.getElementById('hub-armor-repair')!;
const armorRepairItemsEl = () => document.getElementById('hub-armor-repair-items')!;
const bandageShopEl = () => document.getElementById('hub-bandage-shop-items')!;
const upgradeShopEl = () => document.getElementById('hub-upgrade-shop-items')!;

function formatStats(type: WeaponType, wc: WeaponsConfig): string {
  const w = wc[type];
  const pellets = w.pelletsPerShot && w.pelletsPerShot > 1 ? `\u00D7${w.pelletsPerShot}` : '';
  return `${w.damage}${pellets} DMG | ${w.fireRate} RPS | ${w.magazineSize} MAG`;
}

function formatArmorStats(type: ArmorType, ac: ArmorConfig): string {
  const pct = Math.round(ac[type].damageReduction * 100);
  return `${pct}% DMG Reduction`;
}

function refreshHub(): void {
  if (!weaponsConfig || !armorConfig) return;
  const cash = getStashCash();
  const owned = getOwnedWeapons();
  const ownedArmors = getOwnedArmor();

  stashEl().textContent = `Stash: $${cash}`;

  // If selected weapon is no longer owned, default to pistol
  if (!owned.includes(selectedWeapon)) {
    selectedWeapon = 'pistol';
  }

  // If selected armor is no longer owned, default to none
  if (selectedArmor && !ownedArmors.includes(selectedArmor)) {
    selectedArmor = null;
  }

  // Weapon shop items
  const shopTypes: WeaponType[] = ['smg', 'shotgun', 'rifle', 'machinegun'];
  const shopContainer = shopItemsEl();
  shopContainer.innerHTML = '';

  for (const type of shopTypes) {
    const price = shopPrices[type] ?? 0;
    const isOwned = owned.includes(type);
    const canAfford = cash >= price;

    const item = document.createElement('div');
    item.className = 'shop-item';

    const info = document.createElement('div');
    info.className = 'shop-item-info';

    const name = document.createElement('div');
    name.className = 'shop-item-name';
    name.textContent = type;
    info.appendChild(name);

    const stats = document.createElement('div');
    stats.className = 'shop-item-stats';
    stats.textContent = formatStats(type, weaponsConfig);
    info.appendChild(stats);

    item.appendChild(info);

    const action = document.createElement('div');
    action.className = 'shop-item-action';

    if (isOwned) {
      const badge = document.createElement('span');
      badge.className = 'shop-item-owned';
      badge.textContent = 'OWNED';
      action.appendChild(badge);
    } else {
      const priceLabel = document.createElement('span');
      priceLabel.className = 'shop-item-price';
      priceLabel.textContent = `$${price}`;
      action.appendChild(priceLabel);

      const buyBtn = document.createElement('button');
      buyBtn.className = 'shop-buy-btn';
      buyBtn.textContent = 'BUY';
      buyBtn.disabled = !canAfford;
      buyBtn.addEventListener('click', () => {
        addCashToStash(-price);
        addWeapon(type);
        selectedWeapon = type;
        refreshHub();
      });
      action.appendChild(buyBtn);
    }

    item.appendChild(action);
    shopContainer.appendChild(item);
  }

  // Weapon loadout buttons
  const loadoutContainer = weaponListEl();
  loadoutContainer.innerHTML = '';

  for (const type of owned) {
    const btn = document.createElement('button');
    btn.className = 'loadout-btn';
    if (type === selectedWeapon) btn.classList.add('selected');

    const nameSpan = document.createElement('span');
    nameSpan.textContent = type;
    btn.appendChild(nameSpan);

    const statsSpan = document.createElement('span');
    statsSpan.className = 'loadout-btn-stats';
    statsSpan.textContent = formatStats(type, weaponsConfig);
    btn.appendChild(statsSpan);

    btn.addEventListener('click', () => {
      selectedWeapon = type;
      refreshHub();
    });

    loadoutContainer.appendChild(btn);
  }

  // Armor shop items
  const armorShopTypes: ArmorType[] = ['light', 'medium', 'heavy'];
  const armorShopContainer = armorShopItemsEl();
  armorShopContainer.innerHTML = '';

  for (const type of armorShopTypes) {
    const price = armorPrices[type] ?? 0;
    const isOwned = ownedArmors.includes(type);
    const canAfford = cash >= price;

    const item = document.createElement('div');
    item.className = 'shop-item';

    const info = document.createElement('div');
    info.className = 'shop-item-info';

    const name = document.createElement('div');
    name.className = 'shop-item-name';
    name.textContent = `${type} armor`;
    info.appendChild(name);

    const stats = document.createElement('div');
    stats.className = 'shop-item-stats';
    stats.textContent = formatArmorStats(type, armorConfig);
    info.appendChild(stats);

    item.appendChild(info);

    const action = document.createElement('div');
    action.className = 'shop-item-action';

    if (isOwned) {
      const badge = document.createElement('span');
      badge.className = 'shop-item-owned';
      badge.textContent = 'OWNED';
      action.appendChild(badge);
    } else {
      const priceLabel = document.createElement('span');
      priceLabel.className = 'shop-item-price';
      priceLabel.textContent = `$${price}`;
      action.appendChild(priceLabel);

      const buyBtn = document.createElement('button');
      buyBtn.className = 'shop-buy-btn';
      buyBtn.textContent = 'BUY';
      buyBtn.disabled = !canAfford;
      buyBtn.addEventListener('click', () => {
        addCashToStash(-price);
        addArmor(type);
        selectedArmor = type;
        refreshHub();
      });
      action.appendChild(buyBtn);
    }

    item.appendChild(action);
    armorShopContainer.appendChild(item);
  }

  // Bandage shop items
  const bandageContainer = bandageShopEl();
  bandageContainer.innerHTML = '';
  const bandages = getBandages();
  const bandageTypes: Array<{ key: 'small' | 'large'; label: string; count: number }> = [
    { key: 'small', label: 'Small Bandage (25hp)', count: bandages.small },
    { key: 'large', label: 'Large Bandage (50hp)', count: bandages.large },
  ];
  for (const bt of bandageTypes) {
    const price = bandagePrices[bt.key] ?? 0;
    const canAfford = cash >= price;

    const item = document.createElement('div');
    item.className = 'shop-item';

    const info = document.createElement('div');
    info.className = 'shop-item-info';

    const name = document.createElement('div');
    name.className = 'shop-item-name';
    name.textContent = bt.label;
    info.appendChild(name);

    const stats = document.createElement('div');
    stats.className = 'shop-item-stats';
    stats.textContent = `Owned: ${bt.count}`;
    info.appendChild(stats);

    item.appendChild(info);

    const action = document.createElement('div');
    action.className = 'shop-item-action';

    const priceLabel = document.createElement('span');
    priceLabel.className = 'shop-item-price';
    priceLabel.textContent = `$${price}`;
    action.appendChild(priceLabel);

    const buyBtn = document.createElement('button');
    buyBtn.className = 'shop-buy-btn';
    buyBtn.textContent = 'BUY';
    buyBtn.disabled = !canAfford;
    buyBtn.addEventListener('click', () => {
      addCashToStash(-price);
      addBandages(bt.key, 1);
      refreshHub();
    });
    action.appendChild(buyBtn);

    item.appendChild(action);
    bandageContainer.appendChild(item);
  }

  // Ammo shop items
  const ammoContainer = document.getElementById('hub-ammo-shop-items');
  if (ammoContainer) {
    ammoContainer.innerHTML = '';
    const ammoStock = getAmmoStock();
    // Show ammo types relevant to owned weapons
    const relevantAmmoTypes = new Set<string>();
    for (const wt of owned) {
      const ammoType = WEAPON_AMMO_MAP[wt];
      if (ammoType) relevantAmmoTypes.add(ammoType);
    }

    for (const ammoType of relevantAmmoTypes) {
      const price = ammoPrices[ammoType] ?? 0;
      const perPurchase = ammoPerPurchase[ammoType] ?? 30;
      const currentStock = ammoStock[ammoType] ?? 0;
      const canAfford = cash >= price;
      const def = ITEM_DEFS[ammoType];
      const displayName = def?.name ?? ammoType;

      const item = document.createElement('div');
      item.className = 'shop-item';

      const info = document.createElement('div');
      info.className = 'shop-item-info';

      const name = document.createElement('div');
      name.className = 'shop-item-name';
      name.textContent = `${displayName} (x${perPurchase})`;
      info.appendChild(name);

      const stats = document.createElement('div');
      stats.className = 'shop-item-stats';
      stats.textContent = `Owned: ${currentStock}`;
      info.appendChild(stats);

      item.appendChild(info);

      const action = document.createElement('div');
      action.className = 'shop-item-action';

      const priceLabel = document.createElement('span');
      priceLabel.className = 'shop-item-price';
      priceLabel.textContent = `$${price}`;
      action.appendChild(priceLabel);

      const buyBtn = document.createElement('button');
      buyBtn.className = 'shop-buy-btn';
      buyBtn.textContent = 'BUY';
      buyBtn.disabled = !canAfford;
      buyBtn.addEventListener('click', () => {
        addCashToStash(-price);
        addAmmo(ammoType, perPurchase);
        refreshHub();
      });
      action.appendChild(buyBtn);

      item.appendChild(action);
      ammoContainer.appendChild(item);
    }
  }

  // Weapon upgrades shop
  const upgradeContainer = upgradeShopEl();
  upgradeContainer.innerHTML = '';
  if (weaponUpgradesConfig) {
    for (const type of owned) {
      const upgradeCfg = weaponUpgradesConfig[type];
      if (!upgradeCfg) continue;
      const currentLevel = getWeaponUpgradeLevel(type);
      if (currentLevel >= upgradeCfg.maxLevel) {
        // MAX level display
        const item = document.createElement('div');
        item.className = 'shop-item';
        const info = document.createElement('div');
        info.className = 'shop-item-info';
        const nameEl = document.createElement('div');
        nameEl.className = 'shop-item-name';
        nameEl.textContent = `${type} Lv.${currentLevel}`;
        info.appendChild(nameEl);
        const statsEl = document.createElement('div');
        statsEl.className = 'shop-item-stats';
        statsEl.textContent = 'MAX';
        info.appendChild(statsEl);
        item.appendChild(info);
        const actionEl = document.createElement('div');
        actionEl.className = 'shop-item-action';
        const badge = document.createElement('span');
        badge.className = 'shop-item-owned';
        badge.textContent = 'MAX';
        actionEl.appendChild(badge);
        item.appendChild(actionEl);
        upgradeContainer.appendChild(item);
        continue;
      }
      const nextLevel = upgradeCfg.levels[currentLevel];
      const item = document.createElement('div');
      item.className = 'shop-item';
      const info = document.createElement('div');
      info.className = 'shop-item-info';
      const nameEl = document.createElement('div');
      nameEl.className = 'shop-item-name';
      nameEl.textContent = `${type} Lv.${currentLevel} → Lv.${currentLevel + 1}`;
      info.appendChild(nameEl);
      const statsEl = document.createElement('div');
      statsEl.className = 'shop-item-stats';
      statsEl.textContent = `+${nextLevel.damageBonus} DMG | +${nextLevel.fireRateBonus} RPS | +${nextLevel.magazineSizeBonus} MAG`;
      info.appendChild(statsEl);
      item.appendChild(info);
      const actionEl = document.createElement('div');
      actionEl.className = 'shop-item-action';
      const priceLabel = document.createElement('span');
      priceLabel.className = 'shop-item-price';
      priceLabel.textContent = `$${nextLevel.price}`;
      actionEl.appendChild(priceLabel);
      const buyBtn = document.createElement('button');
      buyBtn.className = 'shop-buy-btn';
      buyBtn.textContent = 'UPGRADE';
      buyBtn.disabled = cash < nextLevel.price;
      buyBtn.addEventListener('click', () => {
        addCashToStash(-nextLevel.price);
        setWeaponUpgradeLevel(type, currentLevel + 1);
        refreshHub();
      });
      actionEl.appendChild(buyBtn);
      item.appendChild(actionEl);
      upgradeContainer.appendChild(item);
    }
  }

  // Armor loadout buttons
  const armorLoadoutContainer = armorListEl();
  armorLoadoutContainer.innerHTML = '';

  // "None" option
  const noneBtn = document.createElement('button');
  noneBtn.className = 'loadout-btn';
  if (selectedArmor === null) noneBtn.classList.add('selected');
  const noneSpan = document.createElement('span');
  noneSpan.textContent = 'none';
  noneBtn.appendChild(noneSpan);
  noneBtn.addEventListener('click', () => {
    selectedArmor = null;
    refreshHub();
  });
  armorLoadoutContainer.appendChild(noneBtn);

  for (const type of ownedArmors) {
    const btn = document.createElement('button');
    btn.className = 'loadout-btn';
    if (type === selectedArmor) btn.classList.add('selected');

    const nameSpan = document.createElement('span');
    nameSpan.textContent = `${type} armor`;
    btn.appendChild(nameSpan);

    const statsSpan = document.createElement('span');
    statsSpan.className = 'loadout-btn-stats';
    statsSpan.textContent = formatArmorStats(type, armorConfig);
    btn.appendChild(statsSpan);

    btn.addEventListener('click', () => {
      selectedArmor = type;
      refreshHub();
    });

    armorLoadoutContainer.appendChild(btn);
  }

  // Armor repair section
  const repairContainer = armorRepairItemsEl();
  repairContainer.innerHTML = '';
  let hasRepairableArmor = false;

  for (const type of ownedArmors) {
    const tierConfig = armorConfig[type];
    const maxHp = tierConfig.maxHp;
    const savedHp = getArmorHp(type);
    const currentHp = savedHp ?? maxHp; // default to full if never saved

    if (currentHp >= maxHp) continue; // no repair needed
    hasRepairableArmor = true;

    const repairPrice = Math.ceil((armorPrices[type] ?? 0) * 0.5);
    const canAfford = cash >= repairPrice;

    const item = document.createElement('div');
    item.className = 'shop-item';

    const info = document.createElement('div');
    info.className = 'shop-item-info';

    const name = document.createElement('div');
    name.className = 'shop-item-name';
    name.textContent = `${type} armor`;
    info.appendChild(name);

    const stats = document.createElement('div');
    stats.className = 'shop-item-stats';
    stats.textContent = `${Math.ceil(currentHp)} / ${maxHp} HP`;
    info.appendChild(stats);

    item.appendChild(info);

    const action = document.createElement('div');
    action.className = 'shop-item-action';

    const priceLabel = document.createElement('span');
    priceLabel.className = 'shop-item-price';
    priceLabel.textContent = `$${repairPrice}`;
    action.appendChild(priceLabel);

    const repairBtn = document.createElement('button');
    repairBtn.className = 'shop-buy-btn';
    repairBtn.textContent = 'REPAIR';
    repairBtn.disabled = !canAfford;
    repairBtn.addEventListener('click', () => {
      addCashToStash(-repairPrice);
      setArmorHp(type, maxHp);
      refreshHub();
    });
    action.appendChild(repairBtn);

    item.appendChild(action);
    repairContainer.appendChild(item);
  }

  armorRepairEl().classList.toggle('hidden', !hasRepairableArmor);
}

export function showHubScreen(): void {
  // Drain any leftover cash_stack items from inventory into stash
  const inv = loadPlayerInventory();
  const leftoverCash = countItemInBackpack(inv, 'cash_stack');
  if (leftoverCash > 0) {
    addCashToStash(leftoverCash);
    removeItemFromBackpack(inv, 'cash_stack', leftoverCash);
    savePlayerInventory(inv);
  }

  el().classList.remove('hidden');
  refreshHub();
}

export function hideHubScreen(): void {
  el().classList.add('hidden');
}

export function setupHubScreen(callbacks: HubCallbacks, prices: ShopPrices, wc: WeaponsConfig, ap: ShopPrices, ac: ArmorConfig, bp?: ShopPrices, wuc?: WeaponUpgradesConfig, ammoP?: ShopPrices, ammoPP?: Record<string, number>): void {
  shopPrices = prices;
  weaponsConfig = wc;
  armorPrices = ap;
  armorConfig = ac;
  bandagePrices = bp ?? {};
  weaponUpgradesConfig = wuc ?? null;
  ammoPrices = ammoP ?? {};
  ammoPerPurchase = ammoPP ?? {};

  document.getElementById('hub-start-run')!.addEventListener('click', () => {
    callbacks.onStartRun(selectedWeapon, selectedArmor);
  });

  document.getElementById('hub-back')!.addEventListener('click', () => {
    callbacks.onBack();
  });

  document.getElementById('hub-manage-stash')!.addEventListener('click', () => {
    callbacks.onManageStash();
  });

  document.getElementById('hub-clear-save')!.addEventListener('click', () => {
    if (confirm('Reset all progress? This cannot be undone.')) {
      clearSave();
      selectedWeapon = 'pistol';
      selectedArmor = null;
      refreshHub();
    }
  });
}
