import type { GameEvent } from '../simulation/types.ts';

const crosshairEl = () => document.getElementById('crosshair')!;
const hitmarkerEl = () => document.getElementById('hitmarker')!;
const ammoCounterEl = () => document.getElementById('ammo-counter')!;

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

// Ammo arc elements
let arcFill: SVGCircleElement;
let arcActive: SVGCircleElement;
let arcPerfect: SVGCircleElement;
const ARC_RADIUS = 20;
const ARC_CIRCUMFERENCE = 2 * Math.PI * ARC_RADIUS;

export function initCrosshair(canvas: HTMLCanvasElement): void {
  const el = crosshairEl();

  // Cache line references
  lineUp = el.querySelector('[data-dir="up"]') as SVGLineElement;
  lineDown = el.querySelector('[data-dir="down"]') as SVGLineElement;
  lineLeft = el.querySelector('[data-dir="left"]') as SVGLineElement;
  lineRight = el.querySelector('[data-dir="right"]') as SVGLineElement;

  // Cache ammo arc references
  arcFill = el.querySelector('.ammo-arc-fill') as SVGCircleElement;
  arcActive = el.querySelector('.ammo-arc-active') as SVGCircleElement;
  arcPerfect = el.querySelector('.ammo-arc-perfect') as SVGCircleElement;

  // Initialize arcs with full dash
  const bg = el.querySelector('.ammo-arc-bg') as SVGCircleElement;
  bg.setAttribute('stroke-dasharray', `${ARC_CIRCUMFERENCE} ${ARC_CIRCUMFERENCE}`);
  bg.setAttribute('stroke-dashoffset', '0');

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

export interface AmmoArcState {
  ammo: number;
  maxAmmo: number;
  reloading: boolean;
  reloadProgress: number; // 0-1
  activeStart: number;
  activeEnd: number;
  perfectStart: number;
  perfectEnd: number;
  damageBonusMultiplier: number;
}

export function updateAmmoArc(s: AmmoArcState): void {
  const counter = ammoCounterEl();

  if (s.reloading) {
    // During reload: arc shows reload progress filling up
    const fillLen = s.reloadProgress * ARC_CIRCUMFERENCE;
    arcFill.setAttribute('stroke-dasharray', `${fillLen} ${ARC_CIRCUMFERENCE}`);
    arcFill.setAttribute('stroke-dashoffset', '0');
    arcFill.classList.remove('bonus-active', 'bonus-perfect');

    // Show active reload window
    const activeStartLen = s.activeStart * ARC_CIRCUMFERENCE;
    const activeLen = (s.activeEnd - s.activeStart) * ARC_CIRCUMFERENCE;
    arcActive.setAttribute('stroke-dasharray', `${activeLen} ${ARC_CIRCUMFERENCE}`);
    arcActive.setAttribute('stroke-dashoffset', String(-activeStartLen));

    // Show perfect reload window
    const perfectStartLen = s.perfectStart * ARC_CIRCUMFERENCE;
    const perfectLen = (s.perfectEnd - s.perfectStart) * ARC_CIRCUMFERENCE;
    arcPerfect.setAttribute('stroke-dasharray', `${perfectLen} ${ARC_CIRCUMFERENCE}`);
    arcPerfect.setAttribute('stroke-dashoffset', String(-perfectStartLen));

    counter.textContent = 'RELOADING';
    counter.classList.add('reloading');
    counter.classList.remove('bonus-active', 'bonus-perfect');
  } else {
    // Normal: arc shows ammo fraction
    const fraction = s.ammo / s.maxAmmo;
    const fillLen = fraction * ARC_CIRCUMFERENCE;
    arcFill.setAttribute('stroke-dasharray', `${fillLen} ${ARC_CIRCUMFERENCE}`);
    arcFill.setAttribute('stroke-dashoffset', '0');

    // Hide reload windows
    arcActive.setAttribute('stroke-dasharray', `0 ${ARC_CIRCUMFERENCE}`);
    arcPerfect.setAttribute('stroke-dasharray', `0 ${ARC_CIRCUMFERENCE}`);

    // Show damage bonus color
    if (s.damageBonusMultiplier > 1.2) {
      arcFill.classList.add('bonus-perfect');
      arcFill.classList.remove('bonus-active');
      counter.classList.add('bonus-perfect');
      counter.classList.remove('bonus-active', 'reloading');
    } else if (s.damageBonusMultiplier > 1.0) {
      arcFill.classList.add('bonus-active');
      arcFill.classList.remove('bonus-perfect');
      counter.classList.add('bonus-active');
      counter.classList.remove('bonus-perfect', 'reloading');
    } else {
      arcFill.classList.remove('bonus-active', 'bonus-perfect');
      counter.classList.remove('bonus-active', 'bonus-perfect', 'reloading');
    }

    counter.textContent = `${s.ammo} / ${s.maxAmmo}`;
  }
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

let reloadPopupTimeout: ReturnType<typeof setTimeout> | null = null;
let multikillPopupTimeout: ReturnType<typeof setTimeout> | null = null;

export function processHitEvents(events: GameEvent[]): void {
  for (const event of events) {
    if (event.type === 'enemy_hit') {
      const isHeadshot = !!(event.data && event.data['headshot']);
      triggerHitmarker(isHeadshot);
    } else if (event.type === 'reload_complete') {
      const reloadType = event.data?.['reloadType'] as string;
      if (reloadType === 'perfect') {
        showReloadPopup('perfect', 'Perfect Reload', '+25% Damage');
      } else if (reloadType === 'active') {
        showReloadPopup('active', 'Active Reload', '+10% Damage');
      }
    } else if (event.type === 'reload_fumbled') {
      showReloadPopup('fumbled', 'Fumbled', 'Reload delayed');
    } else if (event.type === 'multikill') {
      const killCount = event.data?.['killCount'] as number;
      showMultiKillPopup(killCount);
    } else if (event.type === 'crate_picked_up') {
      const crateType = event.data?.['crateType'] as string;
      if (crateType === 'health') {
        showReloadPopup('active', '+25 HP', 'Health Restored');
      } else {
        showReloadPopup('active', '+1 Grenade', 'Ammo Restored');
      }
    }
  }
}

function showReloadPopup(type: 'perfect' | 'active' | 'fumbled', title: string, detail: string): void {
  const popup = document.getElementById('reload-popup')!;
  const titleEl = document.getElementById('reload-popup-title')!;
  const detailEl = document.getElementById('reload-popup-detail')!;

  // Clear previous
  if (reloadPopupTimeout) clearTimeout(reloadPopupTimeout);
  popup.classList.remove('visible', 'perfect', 'active', 'fumbled', 'hidden');
  void popup.offsetWidth; // force reflow

  titleEl.textContent = title;
  detailEl.textContent = detail;
  popup.classList.add('visible', type);

  reloadPopupTimeout = setTimeout(() => {
    popup.classList.remove('visible', type);
    popup.classList.add('hidden');
    reloadPopupTimeout = null;
  }, 1500);
}

function showMultiKillPopup(killCount: number): void {
  const popup = document.getElementById('multikill-popup')!;

  // Clear previous
  if (multikillPopupTimeout) clearTimeout(multikillPopupTimeout);
  popup.classList.remove('visible', 'double', 'triple', 'quad', 'mega', 'hidden');
  void popup.offsetWidth; // force reflow

  const labels: Record<number, [string, string]> = {
    2: ['DOUBLE KILL', 'double'],
    3: ['TRIPLE KILL', 'triple'],
    4: ['QUAD KILL', 'quad'],
  };
  const [label, tier] = labels[killCount] ?? [`${killCount}x KILL`, 'mega'];

  popup.textContent = label;
  popup.classList.add('visible', tier);

  multikillPopupTimeout = setTimeout(() => {
    popup.classList.remove('visible', tier);
    popup.classList.add('hidden');
    multikillPopupTimeout = null;
  }, 2000);
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
