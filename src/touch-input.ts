import type { InputState, Vec2 } from './simulation/types.ts';
import type { IInputHandler, EnemyRef } from './input-interface.ts';
import { normalize } from './simulation/collision.ts';
import {
  createTouchOverlay,
  showJoystick,
  updateJoystickThumb,
  hideJoystick,
  setTouchOverlayVisible,
  setGrenadeCharging,
  resetGrenadeButton,
} from './ui/touch-controls.ts';

const DEADZONE = 0.15;
const MAX_RADIUS = 50; // px
const DOUBLE_TAP_MS = 250;
const AUTO_TARGET_CONE = (35 * Math.PI) / 180; // 35° half-cone in radians
const GRENADE_MAX_CHARGE_MS = 1000;

interface StickState {
  touchId: number | null;
  originX: number;
  originY: number;
  dx: number; // raw px offset
  dy: number;
}

export class TouchInputHandler implements IInputHandler {
  private leftStick: StickState = { touchId: null, originX: 0, originY: 0, dx: 0, dy: 0 };
  private rightStick: StickState = { touchId: null, originX: 0, originY: 0, dx: 0, dy: 0 };

  private playerPos: Vec2 = { x: 0, y: 0 };
  private enemies: EnemyRef[] = [];

  // Double-tap dodge
  private lastLeftReleaseTime = 0;
  private dodgeTriggered = false;

  // Grenade
  private grenadeTouchId: number | null = null;
  private grenadeChargeStart: number | null = null;
  private grenadeReleased = false;
  private grenadeReleasePower = 0;

  private pauseBtn: HTMLButtonElement;
  private grenadeBtn: HTMLDivElement;
  private onPause: (() => void) | null = null;

  private boundTouchStart: (e: TouchEvent) => void;
  private boundTouchMove: (e: TouchEvent) => void;
  private boundTouchEnd: (e: TouchEvent) => void;

  constructor(canvas: HTMLCanvasElement) {
    canvas.classList.add('touch-active');

    const ui = createTouchOverlay();
    this.pauseBtn = ui.pauseBtn;
    this.grenadeBtn = ui.grenadeBtn;

    this.boundTouchStart = this.handleTouchStart.bind(this);
    this.boundTouchMove = this.handleTouchMove.bind(this);
    this.boundTouchEnd = this.handleTouchEnd.bind(this);

    canvas.addEventListener('touchstart', this.boundTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this.boundTouchMove, { passive: false });
    canvas.addEventListener('touchend', this.boundTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', this.boundTouchEnd, { passive: false });

    // Grenade button has its own touch handling
    this.grenadeBtn.addEventListener('touchstart', this.handleGrenadeStart.bind(this), { passive: false });
    this.grenadeBtn.addEventListener('touchend', this.handleGrenadeEnd.bind(this), { passive: false });
    this.grenadeBtn.addEventListener('touchcancel', this.handleGrenadeEnd.bind(this), { passive: false });

    this.pauseBtn.addEventListener('click', () => {
      if (this.onPause) this.onPause();
    });
  }

  setPauseHandler(handler: () => void): void {
    this.onPause = handler;
  }

  setPlayerPos(pos: Vec2): void {
    this.playerPos = pos;
  }

  setEnemies(enemies: EnemyRef[]): void {
    this.enemies = enemies;
  }

  setVisible(visible: boolean): void {
    setTouchOverlayVisible(visible);
  }

  consumeEdgeInputs(): void {
    this.dodgeTriggered = false;
    if (this.grenadeReleased) {
      this.grenadeReleased = false;
      this.grenadeReleasePower = 0;
    }
  }

  getInput(): InputState {
    // Update grenade charge visual
    if (this.grenadeChargeStart !== null) {
      const elapsed = performance.now() - this.grenadeChargeStart;
      setGrenadeCharging(Math.min(1, elapsed / GRENADE_MAX_CHARGE_MS));
    }

    // Left stick → moveDir
    const moveDir = this.stickToDir(this.leftStick);

    // Right stick → aimDir + fire
    const rightActive = this.rightStick.touchId !== null;
    let aimDir = this.stickToDir(this.rightStick);
    const rightPastDeadzone = this.stickMagnitude(this.rightStick) > DEADZONE;
    let fire = rightActive && rightPastDeadzone;

    // Auto-targeting: snap aim to nearest enemy within cone
    if (rightPastDeadzone && aimDir.x !== 0 || aimDir.y !== 0) {
      const snapped = this.autoTarget(aimDir);
      if (snapped) aimDir = snapped;
    }

    // Default aim direction if right stick is not active
    if (!rightPastDeadzone) {
      // Keep last aim or default right
      if (aimDir.x === 0 && aimDir.y === 0) aimDir = { x: 1, y: 0 };
      fire = false;
    }

    // Read edge-detected inputs (consumed separately via consumeEdgeInputs)
    const dodge = this.dodgeTriggered;
    const throwGrenade = this.grenadeReleased;
    const throwPower = this.grenadeReleasePower;

    return {
      moveDir,
      aimDir,
      fire,
      headshotTargetId: null,
      dodge,
      reload: false,
      throwGrenade,
      throwPower,
      healSmall: false,
      healLarge: false,
    };
  }

  dispose(): void {
    const overlay = document.getElementById('touch-overlay');
    if (overlay) overlay.remove();
  }

  // ---- Private ----

  private handleTouchStart(e: TouchEvent): void {
    e.preventDefault();
    const midX = window.innerWidth / 2;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];

      if (t.clientX < midX && this.leftStick.touchId === null) {
        // Left side → movement stick
        // Double-tap detection
        const now = performance.now();
        if (now - this.lastLeftReleaseTime < DOUBLE_TAP_MS) {
          this.dodgeTriggered = true;
        }

        this.leftStick.touchId = t.identifier;
        this.leftStick.originX = t.clientX;
        this.leftStick.originY = t.clientY;
        this.leftStick.dx = 0;
        this.leftStick.dy = 0;
        showJoystick('left', t.clientX, t.clientY);
      } else if (t.clientX >= midX && this.rightStick.touchId === null) {
        // Right side → aim stick
        this.rightStick.touchId = t.identifier;
        this.rightStick.originX = t.clientX;
        this.rightStick.originY = t.clientY;
        this.rightStick.dx = 0;
        this.rightStick.dy = 0;
        showJoystick('right', t.clientX, t.clientY);
      }
    }
  }

  private handleTouchMove(e: TouchEvent): void {
    e.preventDefault();

    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];

      if (t.identifier === this.leftStick.touchId) {
        this.updateStick(this.leftStick, t, 'left');
      } else if (t.identifier === this.rightStick.touchId) {
        this.updateStick(this.rightStick, t, 'right');
      }
    }
  }

  private handleTouchEnd(e: TouchEvent): void {
    e.preventDefault();

    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];

      if (t.identifier === this.leftStick.touchId) {
        this.leftStick.touchId = null;
        this.leftStick.dx = 0;
        this.leftStick.dy = 0;
        this.lastLeftReleaseTime = performance.now();
        hideJoystick('left');
      } else if (t.identifier === this.rightStick.touchId) {
        this.rightStick.touchId = null;
        this.rightStick.dx = 0;
        this.rightStick.dy = 0;
        hideJoystick('right');
      }
    }
  }

  private handleGrenadeStart(e: TouchEvent): void {
    e.preventDefault();
    e.stopPropagation();
    if (this.grenadeTouchId !== null) return;
    this.grenadeTouchId = e.changedTouches[0].identifier;
    this.grenadeChargeStart = performance.now();
  }

  private handleGrenadeEnd(e: TouchEvent): void {
    e.preventDefault();
    e.stopPropagation();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this.grenadeTouchId) {
        if (this.grenadeChargeStart !== null) {
          const holdMs = performance.now() - this.grenadeChargeStart;
          this.grenadeReleasePower = Math.min(1, holdMs / GRENADE_MAX_CHARGE_MS);
          this.grenadeReleased = true;
          this.grenadeChargeStart = null;
        }
        this.grenadeTouchId = null;
        resetGrenadeButton();
        break;
      }
    }
  }

  private updateStick(stick: StickState, touch: Touch, side: 'left' | 'right'): void {
    const rawDx = touch.clientX - stick.originX;
    const rawDy = touch.clientY - stick.originY;
    const dist = Math.sqrt(rawDx * rawDx + rawDy * rawDy);

    if (dist > MAX_RADIUS) {
      const scale = MAX_RADIUS / dist;
      stick.dx = rawDx * scale;
      stick.dy = rawDy * scale;
    } else {
      stick.dx = rawDx;
      stick.dy = rawDy;
    }

    updateJoystickThumb(side, stick.dx, stick.dy);
  }

  private stickMagnitude(stick: StickState): number {
    return Math.sqrt(stick.dx * stick.dx + stick.dy * stick.dy) / MAX_RADIUS;
  }

  private stickToDir(stick: StickState): Vec2 {
    const mag = this.stickMagnitude(stick);
    if (mag < DEADZONE) return { x: 0, y: 0 };
    // Screen coordinates: right = +dx = +simX, down = +dy = +simY
    return normalize({ x: stick.dx, y: stick.dy });
  }

  private autoTarget(aimDir: Vec2): Vec2 | null {
    const px = this.playerPos.x;
    const py = this.playerPos.y;
    let bestDist = Infinity;
    let bestDir: Vec2 | null = null;

    for (const enemy of this.enemies) {
      const dx = enemy.pos.x - px;
      const dy = enemy.pos.y - py;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.1) continue;

      // Angle between aim direction and direction to enemy
      const toEnemy = normalize({ x: dx, y: dy });
      const dot = aimDir.x * toEnemy.x + aimDir.y * toEnemy.y;
      const angle = Math.acos(Math.min(1, Math.max(-1, dot)));

      if (angle < AUTO_TARGET_CONE && dist < bestDist) {
        bestDist = dist;
        bestDir = toEnemy;
      }
    }

    return bestDir;
  }
}
