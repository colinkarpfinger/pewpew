import type { WeaponType, WeaponsConfig, ArmorType, ArmorConfig } from '../simulation/types.ts';
import { getStashCash, getOwnedWeapons, addCashToStash, addWeapon, getOwnedArmor, addArmor } from '../persistence.ts';

export interface HubCallbacks {
  onStartRun: (weapon: WeaponType, armor: ArmorType | null) => void;
  onBack: () => void;
}

type ShopPrices = Record<string, number>;

let selectedWeapon: WeaponType = 'pistol';
let selectedArmor: ArmorType | null = null;
let shopPrices: ShopPrices = {};
let armorPrices: ShopPrices = {};
let weaponsConfig: WeaponsConfig | null = null;
let armorConfig: ArmorConfig | null = null;

const el = () => document.getElementById('hub-screen')!;
const stashEl = () => document.getElementById('hub-stash')!;
const shopItemsEl = () => document.getElementById('hub-shop-items')!;
const weaponListEl = () => document.getElementById('hub-weapon-list')!;
const armorShopItemsEl = () => document.getElementById('hub-armor-shop-items')!;
const armorListEl = () => document.getElementById('hub-armor-list')!;

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
  const shopTypes: WeaponType[] = ['smg', 'shotgun', 'rifle'];
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
}

export function showHubScreen(): void {
  el().classList.remove('hidden');
  refreshHub();
}

export function hideHubScreen(): void {
  el().classList.add('hidden');
}

export function setupHubScreen(callbacks: HubCallbacks, prices: ShopPrices, wc: WeaponsConfig, ap: ShopPrices, ac: ArmorConfig): void {
  shopPrices = prices;
  weaponsConfig = wc;
  armorPrices = ap;
  armorConfig = ac;

  document.getElementById('hub-start-run')!.addEventListener('click', () => {
    callbacks.onStartRun(selectedWeapon, selectedArmor);
  });

  document.getElementById('hub-back')!.addEventListener('click', () => {
    callbacks.onBack();
  });
}
