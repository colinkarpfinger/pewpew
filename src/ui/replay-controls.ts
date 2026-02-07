import type { ReplayViewer } from '../replay/viewer.ts';

const el = () => document.getElementById('replay-controls')!;
const playPauseBtn = () => document.getElementById('replay-play-pause')!;
const scrubBar = () => document.getElementById('replay-scrub') as HTMLInputElement;
const tickDisplay = () => document.getElementById('replay-tick-display')!;
const speedSelect = () => document.getElementById('replay-speed') as HTMLSelectElement;
const exitBtn = () => document.getElementById('replay-exit')!;

let exitCallback: (() => void) | null = null;

export function showReplayControls(viewer: ReplayViewer): void {
  el().classList.remove('hidden');

  const pp = playPauseBtn();
  const scrub = scrubBar();
  const display = tickDisplay();
  const speed = speedSelect();
  const exit = exitBtn();

  scrub.max = String(viewer.totalTicks);
  scrub.value = '0';
  speed.value = '1';
  pp.textContent = '\u23F8'; // pause symbol

  const updateDisplay = (tick: number, total: number) => {
    display.textContent = `${tick} / ${total}`;
    scrub.value = String(tick);
  };

  viewer.onTickUpdate(updateDisplay);
  viewer.onReplayFinish(() => {
    pp.textContent = '\u25B6'; // play symbol
  });

  pp.onclick = () => {
    const nowPlaying = !viewer.isPlaying();
    viewer.setPlaying(nowPlaying);
    pp.textContent = nowPlaying ? '\u23F8' : '\u25B6';
  };

  scrub.oninput = () => {
    viewer.setPlaying(false);
    pp.textContent = '\u25B6';
    viewer.scrubTo(parseInt(scrub.value, 10));
  };

  speed.onchange = () => {
    viewer.setSpeed(parseInt(speed.value, 10));
  };

  exit.onclick = () => {
    exitCallback?.();
  };
}

export function hideReplayControls(): void {
  el().classList.add('hidden');
}

export function onReplayExit(callback: () => void): void {
  exitCallback = callback;
}
