import type { GameState, WeaponConfig } from './simulation/types.ts';

const scoreEl = () => document.getElementById('hud-score')!;
const hpBar = () => document.getElementById('hud-hp-bar')!;
const grenadeCounterEl = () => document.getElementById('grenade-counter')!;
const ammoCounterEl = () => document.getElementById('ammo-counter')!;
const weaponNameEl = () => document.getElementById('weapon-name')!;
const gameOverEl = () => document.getElementById('game-over')!;
const finalScoreEl = () => document.getElementById('final-score')!;
const restartBtn = () => document.getElementById('restart-btn')!;

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

  grenadeCounterEl().textContent = `Grenades: ${state.grenadeAmmo}`;

  // Ammo counter text (works on both desktop and mobile)
  const counter = ammoCounterEl();
  if (_weaponConfig) {
    if (state.player.reloadTimer > 0) {
      counter.textContent = 'RELOADING';
      counter.classList.add('reloading');
      counter.classList.remove('bonus-active', 'bonus-perfect');
    } else {
      counter.textContent = `${state.player.ammo} / ${_weaponConfig.magazineSize}`;
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

  // Change HP bar color based on health
  if (pct > 50) {
    hpBar().style.background = '#4f4';
  } else if (pct > 25) {
    hpBar().style.background = '#ff4';
  } else {
    hpBar().style.background = '#f44';
  }
}

export function showGameOver(score: number): void {
  finalScoreEl().textContent = `Score: ${score}`;
  gameOverEl().classList.remove('hidden');
}

export function hideGameOver(): void {
  gameOverEl().classList.add('hidden');
}

export function onRestart(callback: () => void): void {
  restartBtn().addEventListener('click', callback);
}
