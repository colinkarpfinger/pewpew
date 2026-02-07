import type { GameState } from './simulation/types.ts';

const scoreEl = () => document.getElementById('hud-score')!;
const hpBar = () => document.getElementById('hud-hp-bar')!;
const gameOverEl = () => document.getElementById('game-over')!;
const finalScoreEl = () => document.getElementById('final-score')!;
const restartBtn = () => document.getElementById('restart-btn')!;

export function updateHUD(state: GameState): void {
  scoreEl().textContent = `Score: ${state.score}`;
  const pct = Math.max(0, (state.player.hp / state.player.maxHp) * 100);
  hpBar().style.width = `${pct}%`;

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
