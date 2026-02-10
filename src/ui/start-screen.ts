import type { GameMode } from '../simulation/types.ts';

const el = () => document.getElementById('start-screen')!;

export function showStartScreen(): void {
  el().classList.remove('hidden');
}

export function hideStartScreen(): void {
  el().classList.add('hidden');
}

export function onStartGame(callback: (mode: GameMode) => void): void {
  const buttons = document.querySelectorAll('.mode-btn');
  for (const btn of buttons) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const mode = (btn as HTMLElement).dataset.mode as GameMode;
      callback(mode);
    });
  }
}
