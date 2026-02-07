const el = () => document.getElementById('start-screen')!;

export function showStartScreen(): void {
  el().classList.remove('hidden');
}

export function hideStartScreen(): void {
  el().classList.add('hidden');
}

export function onStartGame(callback: () => void): void {
  let started = false;
  const handler = (e: Event) => {
    // Ignore Escape key on start screen
    if (e instanceof KeyboardEvent && e.key === 'Escape') return;
    if (started) return;
    started = true;
    callback();
    // Re-arm after a delay so we can return to the start screen
    setTimeout(() => { started = false; }, 500);
  };

  window.addEventListener('keydown', handler);
  el().addEventListener('click', handler);
}
