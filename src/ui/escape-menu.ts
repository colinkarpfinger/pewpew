const el = () => document.getElementById('escape-menu')!;

export interface EscapeMenuCallbacks {
  onResume: () => void;
  onSaveFull: () => Promise<string>;
  onSaveRing: () => Promise<string>;
  onLoadReplay: () => void;
  onQuit: () => void;
}

export function showEscapeMenu(): void {
  el().classList.remove('hidden');
}

export function hideEscapeMenu(): void {
  el().classList.add('hidden');
}

const buttonTimers = new WeakMap<HTMLButtonElement, number>();
const buttonLabels = new WeakMap<HTMLButtonElement, string>();

function flashButton(btn: HTMLButtonElement, text: string, duration = 2000): void {
  // Save the original label only on the first call
  if (!buttonLabels.has(btn)) {
    buttonLabels.set(btn, btn.textContent ?? '');
  }
  // Clear any pending restore timer
  const prev = buttonTimers.get(btn);
  if (prev) clearTimeout(prev);

  btn.textContent = text;
  btn.disabled = true;
  const timer = window.setTimeout(() => {
    btn.textContent = buttonLabels.get(btn) ?? '';
    btn.disabled = false;
    buttonLabels.delete(btn);
    buttonTimers.delete(btn);
  }, duration);
  buttonTimers.set(btn, timer);
}

function handleSave(btn: HTMLButtonElement, saveFn: () => Promise<string>): void {
  flashButton(btn, 'Saving...', 30000); // long timeout, will be replaced
  saveFn().then((filename) => {
    flashButton(btn, `Saved: ${filename}`);
  }).catch((err) => {
    console.error('Save failed:', err);
    flashButton(btn, 'Save failed!');
  });
}

export function setupEscapeMenu(callbacks: EscapeMenuCallbacks): void {
  const buttons = el().querySelectorAll<HTMLButtonElement>('.menu-btn[data-action]');
  for (const btn of buttons) {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      switch (action) {
        case 'resume': callbacks.onResume(); break;
        case 'save-full': handleSave(btn, callbacks.onSaveFull); break;
        case 'save-ring': handleSave(btn, callbacks.onSaveRing); break;
        case 'load-replay': callbacks.onLoadReplay(); break;
        case 'quit': callbacks.onQuit(); break;
      }
    });
  }
}
