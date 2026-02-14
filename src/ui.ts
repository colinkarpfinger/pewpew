import type { GameState, GameMode, WeaponConfig, RunStats, PlayerInventory } from './simulation/types.ts';
import type { ItemCategory } from './simulation/items.ts';
import { ITEM_DEFS, WEAPON_AMMO_MAP } from './simulation/items.ts';
import { countItemInBackpack } from './simulation/inventory.ts';

const scoreEl = () => document.getElementById('hud-score')!;
const hpBar = () => document.getElementById('hud-hp-bar')!;
const grenadeCounterEl = () => document.getElementById('grenade-counter')!;
const ammoCounterEl = () => document.getElementById('ammo-counter')!;
const armorContainer = () => document.getElementById('hud-armor-container')!;
const armorBar = () => document.getElementById('hud-armor-bar')!;
const cashCounterEl = () => document.getElementById('cash-counter')!;
const bandageCounterEl = () => document.getElementById('bandage-counter')!;
const weaponNameEl = () => document.getElementById('weapon-name')!;
const gameOverEl = () => document.getElementById('game-over')!;
const finalScoreEl = () => document.getElementById('final-score')!;
const finalCashEl = () => document.getElementById('final-cash')!;
const restartBtn = () => document.getElementById('restart-btn')!;

const HOTBAR_CATEGORY_COLORS: Record<ItemCategory, string> = {
  weapon: '#e8a030',
  armor: '#5080d0',
  helmet: '#5080d0',
  ammo: '#a0a070',
  medical: '#50c060',
  grenade: '#d05050',
  valuable: '#ffd700',
  material: '#888888',
};

let _weaponConfig: WeaponConfig | null = null;

export function setWeaponConfig(config: WeaponConfig): void {
  _weaponConfig = config;
}

export function setActiveWeaponName(name: string): void {
  weaponNameEl().textContent = name;
}

export function updateHUD(state: GameState): void {
  scoreEl().textContent = `Score: ${state.score}`;
  const pct = Math.max(0, (state.player.hp / state.player.maxHp) * 100);
  hpBar().style.width = `${pct}%`;

  // Armor bar
  if (state.player.armorMaxHp > 0 && state.player.armorHp > 0) {
    armorContainer().classList.remove('hidden');
    const armorPct = (state.player.armorHp / state.player.armorMaxHp) * 100;
    armorBar().style.width = `${armorPct}%`;
  } else {
    armorContainer().classList.add('hidden');
  }

  // Grenade counter: show backpack count in extraction mode
  if (state.gameMode === 'extraction') {
    const grenadeCount = countItemInBackpack(state.player.inventory, 'frag_grenade');
    grenadeCounterEl().textContent = `Grenades: ${grenadeCount}`;
  } else {
    grenadeCounterEl().textContent = `Grenades: ${state.grenadeAmmo}`;
  }

  // Ammo counter text (works on both desktop and mobile)
  const counter = ammoCounterEl();
  if (_weaponConfig) {
    if (state.player.weaponSwapTimer > 0) {
      counter.textContent = 'SWAPPING';
      counter.classList.add('reloading');
      counter.classList.remove('bonus-active', 'bonus-perfect');
    } else if (state.player.reloadTimer > 0) {
      counter.textContent = 'RELOADING';
      counter.classList.add('reloading');
      counter.classList.remove('bonus-active', 'bonus-perfect');
    } else {
      if (state.gameMode === 'extraction') {
        // Show currentAmmo / magSize | ammoType: reserve
        const weaponSlot = state.player.activeWeaponSlot === 1 ? 'weapon1' : 'weapon2';
        const weaponInst = state.player.inventory.equipment[weaponSlot];
        if (weaponInst) {
          const ammoType = WEAPON_AMMO_MAP[weaponInst.defId as keyof typeof WEAPON_AMMO_MAP];
          const reserve = ammoType ? countItemInBackpack(state.player.inventory, ammoType) : 0;
          const ammoLabel = ammoType ?? '';
          counter.textContent = `${state.player.ammo} / ${_weaponConfig.magazineSize} | ${ammoLabel}: ${reserve}`;
        } else {
          counter.textContent = `${state.player.ammo} / ${_weaponConfig.magazineSize}`;
        }
      } else {
        counter.textContent = `${state.player.ammo} / ${_weaponConfig.magazineSize}`;
      }
      counter.classList.remove('reloading');
      if (state.player.damageBonusMultiplier > 1.2) {
        counter.classList.add('bonus-perfect');
        counter.classList.remove('bonus-active');
      } else if (state.player.damageBonusMultiplier > 1.0) {
        counter.classList.add('bonus-active');
        counter.classList.remove('bonus-perfect');
      } else {
        counter.classList.remove('bonus-active', 'bonus-perfect');
      }
    }
  }

  // Cash counter (extraction mode only — shows backpack cash)
  const cashEl = cashCounterEl();
  if (state.gameMode === 'extraction') {
    const cashCount = countItemInBackpack(state.player.inventory, 'cash_stack');
    cashEl.classList.remove('hidden');
    cashEl.textContent = `$${cashCount}`;
  } else {
    cashEl.classList.add('hidden');
  }

  // Bandage counter (extraction mode only — now shows backpack counts)
  const bandageEl = bandageCounterEl();
  if (state.gameMode === 'extraction') {
    const small = countItemInBackpack(state.player.inventory, 'bandage_small');
    const large = countItemInBackpack(state.player.inventory, 'bandage_large');
    if (small > 0 || large > 0) {
      bandageEl.classList.remove('hidden');
      const parts: string[] = [];
      if (small > 0) parts.push(`Sm:${small}`);
      if (large > 0) parts.push(`Lg:${large}`);
      bandageEl.textContent = parts.join(' ');

      // Show HEALING state
      if (state.player.healTimer > 0) {
        bandageEl.textContent += ' HEALING';
      }
    } else {
      bandageEl.classList.add('hidden');
    }
  } else {
    bandageEl.classList.add('hidden');
  }

  // Change HP bar color based on health
  if (pct > 50) {
    hpBar().style.background = '#4f4';
  } else if (pct > 25) {
    hpBar().style.background = '#ff4';
  } else {
    hpBar().style.background = '#f44';
  }
}

function displayRunStats(stats: RunStats): void {
  const el = document.getElementById('run-stats')!;
  el.classList.remove('hidden');
  document.getElementById('stat-kills')!.textContent = String(stats.enemyKills);
  document.getElementById('stat-headshots')!.textContent = String(stats.headshotKills);
  const accuracy = stats.bulletsFired > 0
    ? Math.round((stats.bulletsHit / stats.bulletsFired) * 100)
    : 0;
  document.getElementById('stat-accuracy')!.textContent = `${accuracy}%`;
  document.getElementById('stat-bullets')!.textContent = String(stats.bulletsFired);
  document.getElementById('stat-hp-lost')!.textContent = String(Math.round(stats.hpLost));
  document.getElementById('stat-hp-healed')!.textContent = String(Math.round(stats.hpHealed));
  document.getElementById('stat-cash')!.textContent = `$${stats.cashEarned}`;
  document.getElementById('stat-distance')!.textContent = `${Math.round(stats.distanceTraveled)}m`;
}

export function showGameOver(score: number, gameMode: GameMode = 'arena', lostGear?: string, stats?: RunStats): void {
  const titleEl = gameOverEl().querySelector('h1');
  if (titleEl) titleEl.textContent = gameMode === 'extraction' ? 'KILLED IN ACTION' : 'GAME OVER';
  finalScoreEl().textContent = `Score: ${score}`;
  const cashEl = finalCashEl();
  if (lostGear) {
    cashEl.textContent = `${lostGear.toUpperCase()} lost`;
  } else {
    cashEl.textContent = '';
  }
  restartBtn().textContent = gameMode === 'extraction' ? 'Return to Hub' : 'Play Again';
  if (stats) {
    displayRunStats(stats);
  } else {
    document.getElementById('run-stats')!.classList.add('hidden');
  }
  gameOverEl().classList.remove('hidden');
}

export function showExtractionSuccess(score: number, runCash: number, stats?: RunStats): void {
  const titleEl = gameOverEl().querySelector('h1');
  if (titleEl) titleEl.textContent = 'EXTRACTED!';
  finalScoreEl().textContent = `Score: ${score}`;
  finalCashEl().textContent = `+$${runCash}`;
  restartBtn().textContent = 'Return to Hub';
  if (stats) {
    displayRunStats(stats);
  } else {
    document.getElementById('run-stats')!.classList.add('hidden');
  }
  gameOverEl().classList.remove('hidden');
}

export function hideGameOver(): void {
  gameOverEl().classList.add('hidden');
  document.getElementById('run-stats')!.classList.add('hidden');
}

export function onRestart(callback: () => void): void {
  restartBtn().addEventListener('click', callback);
}

// ---- HUD Hotbar ----

export function initHudHotbar(): void {
  if (document.getElementById('hud-hotbar')) return;
  const bar = document.createElement('div');
  bar.id = 'hud-hotbar';
  bar.className = 'hidden';
  document.getElementById('game-container')!.appendChild(bar);
}

export function updateHudHotbar(inventory: PlayerInventory): void {
  const bar = document.getElementById('hud-hotbar');
  if (!bar) return;

  bar.innerHTML = '';

  for (let i = 0; i < inventory.hotbar.length; i++) {
    const defId = inventory.hotbar[i];
    const slot = document.createElement('div');
    slot.className = 'hud-hotbar-slot';

    const key = document.createElement('div');
    key.className = 'hud-hotbar-key';
    key.textContent = String(i + 3);
    slot.appendChild(key);

    if (defId) {
      const def = ITEM_DEFS[defId];
      if (def) {
        const count = countItemInBackpack(inventory, defId);
        if (count === 0) {
          slot.classList.add('empty');
        }

        const icon = document.createElement('div');
        icon.className = 'hud-hotbar-icon';
        icon.style.background = HOTBAR_CATEGORY_COLORS[def.category] ?? '#888';
        icon.textContent = def.name.substring(0, 2).toUpperCase();
        slot.appendChild(icon);

        const countEl = document.createElement('div');
        countEl.className = 'hud-hotbar-count';
        countEl.textContent = String(count);
        slot.appendChild(countEl);
      } else {
        slot.classList.add('empty');
      }
    } else {
      slot.classList.add('empty');
    }

    bar.appendChild(slot);
  }
}

export function showHudHotbar(): void {
  document.getElementById('hud-hotbar')?.classList.remove('hidden');
}

export function hideHudHotbar(): void {
  document.getElementById('hud-hotbar')?.classList.add('hidden');
}
