import './style.css';
import * as THREE from 'three';
import type { GameConfigs, GameEvent } from './simulation/types.ts';
import { TICK_DURATION } from './simulation/types.ts';
import { createGame, tick } from './simulation/game.ts';
import type { GameInstance } from './simulation/game.ts';
import { Renderer } from './rendering/renderer.ts';
import { InputHandler } from './input.ts';
import type { IInputHandler } from './input-interface.ts';
import { TouchInputHandler } from './touch-input.ts';
import { isMobile } from './platform.ts';
import { updateHUD, showGameOver, hideGameOver, onRestart, setWeaponConfig } from './ui.ts';
import { FullRecorder } from './recording/full-recorder.ts';
import { RingRecorder } from './recording/ring-recorder.ts';
import { saveReplay, loadReplay } from './recording/api.ts';
import { ReplayViewer } from './replay/viewer.ts';
import { showStartScreen, hideStartScreen, onStartGame } from './ui/start-screen.ts';
import { showEscapeMenu, hideEscapeMenu, setupEscapeMenu } from './ui/escape-menu.ts';
import { showReplayBrowser } from './ui/replay-browser.ts';
import { showReplayControls, hideReplayControls, onReplayExit } from './ui/replay-controls.ts';
import { initCrosshair, showCrosshair, hideCrosshair, processHitEvents, updateCrosshairSpread, updateAmmoArc } from './ui/crosshair.ts';
import { initDevConsole, toggleDevConsole, isDevConsoleEnabled, setDevConsoleEnabled, isDevConsoleVisible, logToConsole, registerCommand } from './ui/dev-console.ts';

import { AudioSystem } from './audio/audio.ts';
import playerConfig from './configs/player.json';
import weaponsConfig from './configs/weapons.json';
import enemiesConfig from './configs/enemies.json';
import spawningConfig from './configs/spawning.json';
import arenaConfig from './configs/arena.json';
import multikillConfig from './configs/multikill.json';
import grenadeConfig from './configs/grenade.json';
import cratesConfig from './configs/crates.json';
import audioConfig from './configs/audio.json';

const configs: GameConfigs = {
  player: playerConfig,
  weapons: weaponsConfig,
  enemies: enemiesConfig,
  spawning: spawningConfig,
  arena: arenaConfig,
  multikill: multikillConfig,
  grenade: grenadeConfig,
  crates: cratesConfig,
};
const configsJson = JSON.stringify(configs);
setWeaponConfig(configs.weapons.rifle);

// ---- App State ----
type Screen = 'start' | 'playing' | 'paused' | 'gameOver' | 'replay';
let screen: Screen = 'start';

// ---- Core objects ----
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const mobile = isMobile();
const input: IInputHandler = mobile
  ? new TouchInputHandler(canvas)
  : new InputHandler(renderer.camera, canvas);
const audioSystem = new AudioSystem(audioConfig);

let game: GameInstance;
let fullRecorder: FullRecorder;
let ringRecorder: RingRecorder;
let replayViewer: ReplayViewer | null = null;

let accumulator = 0;
let lastTime = performance.now();
let gameOverShown = false;
let currentSeed = 0;

if (!mobile) initCrosshair(canvas);
initDevConsole();

// Register dev console commands
registerCommand('state', () => {
  if (!game) return 'No active game';
  const s = game.state;
  return `tick:${s.tick} hp:${s.player.hp.toFixed(0)}/${s.player.maxHp} score:${s.score} enemies:${s.enemies.length} grenades:${s.grenadeAmmo}`;
});

registerCommand('hp', (args) => {
  if (!game) return 'No active game';
  const val = parseInt(args);
  if (isNaN(val)) return `HP: ${game.state.player.hp.toFixed(0)}/${game.state.player.maxHp}`;
  game.state.player.hp = Math.min(val, game.state.player.maxHp);
  return `HP set to ${game.state.player.hp}`;
});

registerCommand('score', (args) => {
  if (!game) return 'No active game';
  const val = parseInt(args);
  if (isNaN(val)) return `Score: ${game.state.score}`;
  game.state.score = val;
  return `Score set to ${val}`;
});

registerCommand('grenades', (args) => {
  if (!game) return 'No active game';
  const val = parseInt(args);
  if (isNaN(val)) return `Grenades: ${game.state.grenadeAmmo}`;
  game.state.grenadeAmmo = val;
  return `Grenades set to ${val}`;
});

registerCommand('kill', () => {
  if (!game) return 'No active game';
  const count = game.state.enemies.length;
  game.state.enemies = [];
  return `Killed ${count} enemies`;
});

// ---- Scene setup ----
function rebuildScene(): void {
  renderer.scene.clear();

  const ambient = new THREE.AmbientLight(0xffffff, 0.4);
  renderer.scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(10, 20, 10);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(1024, 1024);
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 60;
  dirLight.shadow.camera.left = -20;
  dirLight.shadow.camera.right = 20;
  dirLight.shadow.camera.top = 20;
  dirLight.shadow.camera.bottom = -20;
  renderer.scene.add(dirLight);
}

// ---- Game lifecycle ----
function startGame(): void {
  currentSeed = Date.now();
  game = createGame(configs, currentSeed);
  fullRecorder = new FullRecorder(currentSeed, configsJson);
  ringRecorder = new RingRecorder(game);

  rebuildScene();
  renderer.initArena(game.state);
  renderer.setDodgeDuration(configs.player.dodgeDuration);
  renderer.setWeaponConfig(configs.weapons.rifle);
  audioSystem.init();
  gameOverShown = false;
  hideGameOver();
  hideStartScreen();
  hideEscapeMenu();
  hideReplayControls();
  if (mobile) {
    (input as TouchInputHandler).setVisible(true);
  } else {
    showCrosshair();
  }
  accumulator = 0;
  lastTime = performance.now();
  screen = 'playing';
}

function enterReplay(viewer: ReplayViewer): void {
  replayViewer = viewer;
  rebuildScene();
  renderer.initArena(viewer.getState());
  hideGameOver();
  hideStartScreen();
  hideEscapeMenu();
  showReplayControls(viewer);
  accumulator = 0;
  lastTime = performance.now();
  screen = 'replay';
}

function exitReplay(): void {
  replayViewer = null;
  hideReplayControls();
  showStartScreen();
  screen = 'start';
}

function goToTitle(): void {
  hideGameOver();
  hideEscapeMenu();
  hideReplayControls();
  if (mobile) {
    (input as TouchInputHandler).setVisible(false);
  } else {
    hideCrosshair();
  }
  showStartScreen();
  screen = 'start';
}

// ---- Pause logic ----
function pauseGame(): void {
  if (screen === 'playing' || screen === 'gameOver') {
    showEscapeMenu();
    if (mobile) (input as TouchInputHandler).setVisible(false);
    screen = 'paused';
  }
}

function resumeGame(): void {
  hideEscapeMenu();
  const resumeToPlaying = !gameOverShown;
  if (mobile && resumeToPlaying) (input as TouchInputHandler).setVisible(true);
  screen = resumeToPlaying ? 'playing' : 'gameOver';
  lastTime = performance.now();
  accumulator = 0;
}

// Wire up mobile pause button
if (mobile) {
  (input as TouchInputHandler).setPauseHandler(pauseGame);
}

// ---- Escape key ----
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (screen === 'playing' || screen === 'gameOver') {
      pauseGame();
    } else if (screen === 'paused') {
      resumeGame();
    }
  }

  // Tilde toggles dev console
  if (e.key === '`') {
    toggleDevConsole();
    return;
  }

  // F8 quick-save ring buffer
  if (e.key === 'F8' && (screen === 'playing' || screen === 'paused' || screen === 'gameOver')) {
    const replay = ringRecorder.toReplay(configsJson);
    saveReplay(replay).then((filename) => {
      console.log(`Ring buffer saved: ${filename}`);
    }).catch(console.error);
  }
});

// ---- Escape menu callbacks ----
setupEscapeMenu({
  onResume: () => {
    resumeGame();
  },
  onSaveFull: () => {
    const replay = fullRecorder.toReplay();
    return saveReplay(replay);
  },
  onSaveRing: () => {
    const replay = ringRecorder.toReplay(configsJson);
    return saveReplay(replay);
  },
  onLoadReplay: () => {
    hideEscapeMenu();
    showReplayBrowser(
      (filename) => {
        loadReplay(filename).then((replay) => {
          const viewer = new ReplayViewer(replay, renderer);
          enterReplay(viewer);
        }).catch(console.error);
      },
      () => {
        // Back from browser — return to pause menu
        showEscapeMenu();
      },
    );
  },
  onToggleConsole: () => {
    const newState = !isDevConsoleEnabled();
    setDevConsoleEnabled(newState);
    return newState;
  },
  onQuit: () => {
    goToTitle();
  },
});

// ---- Replay exit ----
onReplayExit(() => {
  exitReplay();
});

// ---- Start screen ----
onStartGame(() => {
  if (screen === 'start') {
    startGame();
  }
});

// ---- Restart from game over ----
onRestart(() => {
  if (screen === 'gameOver') {
    startGame();
  }
});

// ---- Main loop ----
function gameLoop(now: number): void {
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  if (screen === 'playing') {
    accumulator += dt;
    const state = game.state;
    input.setPlayerPos(state.player.pos);
    input.setEnemies(state.enemies.map(e => ({ id: e.id, pos: e.pos, radius: e.radius })));
    if (!mobile) {
      (input as InputHandler).setHeadMeshes(renderer.getEnemyHeadMeshes());
    }
    const currentInput = input.getInput();

    // Suppress game input while dev console is focused
    if (isDevConsoleVisible()) {
      currentInput.moveDir = { x: 0, y: 0 };
      currentInput.fire = false;
      currentInput.dodge = false;
      currentInput.reload = false;
      currentInput.throwGrenade = false;
    }

    const frameEvents: GameEvent[] = [];

    if (!mobile) {
      // Update dynamic crosshair based on effective spread
      const isDodging = state.player.dodgeTimer > 0;
      const isMoving = currentInput.moveDir.x !== 0 || currentInput.moveDir.y !== 0;
      const rifle = configs.weapons.rifle;
      const effectiveSpread = isDodging
        ? rifle.spread * rifle.movingSpreadMultiplier * 3.0
        : rifle.spread * (isMoving ? rifle.movingSpreadMultiplier : 1.0);
      updateCrosshairSpread(effectiveSpread);

      // Update ammo arc
      const isReloading = state.player.reloadTimer > 0;
      updateAmmoArc({
        ammo: state.player.ammo,
        maxAmmo: rifle.magazineSize,
        reloading: isReloading,
        reloadProgress: isReloading ? state.player.reloadTimer / rifle.reloadTime : 0,
        activeStart: rifle.activeReloadStart,
        activeEnd: rifle.activeReloadEnd,
        perfectStart: rifle.perfectReloadStart,
        perfectEnd: rifle.perfectReloadEnd,
        damageBonusMultiplier: state.player.damageBonusMultiplier,
      });
    }

    while (accumulator >= TICK_DURATION) {
      fullRecorder.recordTick(currentInput);
      ringRecorder.recordTick(currentInput, game);
      tick(game, currentInput, configs);
      if (!mobile) processHitEvents(state.events);
      frameEvents.push(...state.events);
      accumulator -= TICK_DURATION;
    }

    // Log events to dev console
    if (isDevConsoleVisible() && frameEvents.length > 0) {
      for (const ev of frameEvents) {
        if (ev.type === 'enemy_spawned') continue; // too noisy
        const data = ev.data ? ' ' + JSON.stringify(ev.data) : '';
        logToConsole(`[${ev.tick}] ${ev.type}${data}`);
      }
    }

    if (state.gameOver && !gameOverShown) {
      gameOverShown = true;
      showGameOver(state.score);
      if (mobile) (input as TouchInputHandler).setVisible(false);
      screen = 'gameOver';
    }

    renderer.syncState(state);
    renderer.updateParticles(dt, frameEvents, state);
    audioSystem.processEvents(frameEvents, state);
    renderer.render();
    updateHUD(state);
  } else if (screen === 'paused' || screen === 'gameOver') {
    // Still render the scene (visible behind overlay)
    renderer.syncState(game.state);
    renderer.updateParticles(dt, [], game.state);
    renderer.render();
    updateHUD(game.state);
  } else if (screen === 'replay') {
    if (replayViewer) {
      replayViewer.update(dt);
      updateHUD(replayViewer.getState());
    }
  }

  requestAnimationFrame(gameLoop);
}

// ---- Boot ----
if (mobile) {
  const prompt = document.getElementById('start-prompt');
  if (prompt) prompt.textContent = 'Tap to start';
}

// Fullscreen button on start screen
const fullscreenBtn = document.getElementById('fullscreen-btn');
if (fullscreenBtn) {
  fullscreenBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Don't trigger start game
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  });
}

showStartScreen();
requestAnimationFrame(gameLoop);
