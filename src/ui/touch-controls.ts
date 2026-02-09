/** DOM elements for mobile touch controls overlay */

let overlay: HTMLDivElement;
let leftBase: HTMLDivElement;
let leftThumb: HTMLDivElement;
let rightBase: HTMLDivElement;
let rightThumb: HTMLDivElement;
let grenadeBtn: HTMLDivElement;
let pauseBtn: HTMLButtonElement;

export function createTouchOverlay(): {
  overlay: HTMLDivElement;
  grenadeBtn: HTMLDivElement;
  pauseBtn: HTMLButtonElement;
} {
  overlay = document.createElement('div');
  overlay.id = 'touch-overlay';

  // Left joystick
  leftBase = document.createElement('div');
  leftBase.className = 'joystick-base joystick-left';
  leftThumb = document.createElement('div');
  leftThumb.className = 'joystick-thumb';
  leftBase.appendChild(leftThumb);
  overlay.appendChild(leftBase);

  // Right joystick
  rightBase = document.createElement('div');
  rightBase.className = 'joystick-base joystick-right';
  rightThumb = document.createElement('div');
  rightThumb.className = 'joystick-thumb';
  rightBase.appendChild(rightThumb);
  overlay.appendChild(rightBase);

  // Grenade button
  grenadeBtn = document.createElement('div');
  grenadeBtn.id = 'grenade-btn';
  grenadeBtn.textContent = 'G';
  overlay.appendChild(grenadeBtn);

  // Pause button
  pauseBtn = document.createElement('button');
  pauseBtn.id = 'mobile-pause-btn';
  pauseBtn.textContent = '| |';
  overlay.appendChild(pauseBtn);

  document.getElementById('game-container')!.appendChild(overlay);

  // Start hidden
  leftBase.style.display = 'none';
  rightBase.style.display = 'none';

  return { overlay, grenadeBtn, pauseBtn };
}

export function showJoystick(side: 'left' | 'right', x: number, y: number): void {
  const base = side === 'left' ? leftBase : rightBase;
  const thumb = side === 'left' ? leftThumb : rightThumb;
  base.style.display = 'block';
  base.style.left = `${x - 60}px`;
  base.style.top = `${y - 60}px`;
  thumb.style.transform = 'translate(0px, 0px)';
}

export function updateJoystickThumb(side: 'left' | 'right', dx: number, dy: number): void {
  const thumb = side === 'left' ? leftThumb : rightThumb;
  thumb.style.transform = `translate(${dx}px, ${dy}px)`;
}

export function hideJoystick(side: 'left' | 'right'): void {
  const base = side === 'left' ? leftBase : rightBase;
  base.style.display = 'none';
}

export function setTouchOverlayVisible(visible: boolean): void {
  if (overlay) overlay.style.display = visible ? 'block' : 'none';
}

export function setGrenadeCharging(fraction: number): void {
  grenadeBtn.style.background = `conic-gradient(
    rgba(100, 255, 100, 0.6) ${fraction * 360}deg,
    rgba(34, 170, 34, 0.5) ${fraction * 360}deg
  )`;
}

export function resetGrenadeButton(): void {
  grenadeBtn.style.background = '';
}
