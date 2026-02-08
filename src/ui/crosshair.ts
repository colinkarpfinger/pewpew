import type { GameEvent } from '../simulation/types.ts';

const crosshairEl = () => document.getElementById('crosshair')!;
const hitmarkerEl = () => document.getElementById('hitmarker')!;

let hitmarkerTimeout: ReturnType<typeof setTimeout> | null = null;

export function initCrosshair(canvas: HTMLCanvasElement): void {
  const el = crosshairEl();

  canvas.addEventListener('mousemove', (e) => {
    el.style.left = `${e.clientX}px`;
    el.style.top = `${e.clientY}px`;
  });

  canvas.addEventListener('mouseenter', () => {
    el.style.display = 'block';
  });

  canvas.addEventListener('mouseleave', () => {
    el.style.display = 'none';
  });
}

export function showCrosshair(): void {
  crosshairEl().style.display = 'block';
}

export function hideCrosshair(): void {
  crosshairEl().style.display = 'none';
}

export function processHitEvents(events: GameEvent[]): void {
  for (const event of events) {
    if (event.type === 'enemy_hit') {
      const isHeadshot = !!(event.data && event.data['headshot']);
      triggerHitmarker(isHeadshot);
    }
  }
}

function triggerHitmarker(headshot: boolean): void {
  const el = hitmarkerEl();

  // Clear any existing animation
  if (hitmarkerTimeout) {
    clearTimeout(hitmarkerTimeout);
  }
  el.classList.remove('hit', 'headshot');

  // Force reflow to restart animation
  void el.offsetWidth;

  el.classList.add('hit');
  if (headshot) {
    el.classList.add('headshot');
  }

  hitmarkerTimeout = setTimeout(() => {
    el.classList.remove('hit', 'headshot');
    hitmarkerTimeout = null;
  }, 250);
}
