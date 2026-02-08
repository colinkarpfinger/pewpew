import type { GameEvent } from '../simulation/types.ts';

const crosshairEl = () => document.getElementById('crosshair')!;
const hitmarkerEl = () => document.getElementById('hitmarker')!;

let hitmarkerTimeout: ReturnType<typeof setTimeout> | null = null;

// Dynamic crosshair state
const LINE_LENGTH = 6; // px length of each crosshair arm
const MIN_GAP = 3;     // px gap from center at minimum spread
const SPREAD_SCALE = 200; // px per radian of spread
const LERP_SPEED = 0.15;  // interpolation factor per frame

let currentGap = MIN_GAP;
let targetGap = MIN_GAP;

let lineUp: SVGLineElement;
let lineDown: SVGLineElement;
let lineLeft: SVGLineElement;
let lineRight: SVGLineElement;

export function initCrosshair(canvas: HTMLCanvasElement): void {
  const el = crosshairEl();

  // Cache line references
  lineUp = el.querySelector('[data-dir="up"]') as SVGLineElement;
  lineDown = el.querySelector('[data-dir="down"]') as SVGLineElement;
  lineLeft = el.querySelector('[data-dir="left"]') as SVGLineElement;
  lineRight = el.querySelector('[data-dir="right"]') as SVGLineElement;

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

/** Update the crosshair size to reflect current effective spread (radians). */
export function updateCrosshairSpread(spread: number): void {
  targetGap = MIN_GAP + spread * SPREAD_SCALE;
  currentGap += (targetGap - currentGap) * LERP_SPEED;

  const inner = currentGap;
  const outer = currentGap + LINE_LENGTH;

  lineUp.setAttribute('y1', String(-outer));
  lineUp.setAttribute('y2', String(-inner));
  lineDown.setAttribute('y1', String(inner));
  lineDown.setAttribute('y2', String(outer));
  lineLeft.setAttribute('x1', String(-outer));
  lineLeft.setAttribute('x2', String(-inner));
  lineRight.setAttribute('x1', String(inner));
  lineRight.setAttribute('x2', String(outer));
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
