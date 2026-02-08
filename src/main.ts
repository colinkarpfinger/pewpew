import './style.css';
import * as THREE from 'three';
import type { GameConfigs } from './simulation/types.ts';
import { TICK_DURATION } from './simulation/types.ts';
import { createGame, tick } from './simulation/game.ts';
import type { GameInstance } from './simulation/game.ts';
import { Renderer } from './rendering/renderer.ts';
import { InputHandler } from './input.ts';
import { updateHUD, showGameOver, hideGameOver, onRestart } from './ui.ts';
import { FullRecorder } from './recording/full-recorder.ts';
import { RingRecorder } from './recording/ring-recorder.ts';
import { saveReplay, loadReplay } from './recording/api.ts';
import { ReplayViewer } from './replay/viewer.ts';
import { showStartScreen, hideStartScreen, onStartGame } from './ui/start-screen.ts';
import { showEscapeMenu, hideEscapeMenu, setupEscapeMenu } from './ui/escape-menu.ts';
import { showReplayBrowser } from './ui/replay-browser.ts';
import { showReplayControls, hideReplayControls, onReplayExit } from './ui/replay-controls.ts';
import { initCrosshair, showCrosshair, hideCrosshair, processHitEvents, updateCrosshairSpread } from './ui/crosshair.ts';

import playerConfig from './configs/player.json';
import weaponsConfig from './configs/weapons.json';
import enemiesConfig from './configs/enemies.json';
import spawningConfig from './configs/spawning.json';
import arenaConfig from './configs/arena.json';

const configs: GameConfigs = {
  player: playerConfig,
  weapons: weaponsConfig,
  enemies: enemiesConfig,
  spawning: spawningConfig,
  arena: arenaConfig,
};
const configsJson = JSON.stringify(configs);

// ---- App State ----
type Screen = 'start' | 'playing' | 'paused' | 'gameOver' | 'replay';
let screen: Screen = 'start';

// ---- Core objects ----
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const input = new InputHandler(renderer.camera, canvas);

let game: GameInstance;
let fullRecorder: FullRecorder;
let ringRecorder: RingRecorder;
let replayViewer: ReplayViewer | null = null;

let accumulator = 0;
let lastTime = performance.now();
let gameOverShown = false;
let currentSeed = 0;

initCrosshair(canvas);

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
  gameOverShown = false;
  hideGameOver();
  hideStartScreen();
  hideEscapeMenu();
  hideReplayControls();
  showCrosshair();
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
  hideCrosshair();
  showStartScreen();
  screen = 'start';
}

// ---- Escape key ----
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (screen === 'playing' || screen === 'gameOver') {
      showEscapeMenu();
      screen = 'paused';
    } else if (screen === 'paused') {
      hideEscapeMenu();
      screen = gameOverShown ? 'gameOver' : 'playing';
      lastTime = performance.now();
      accumulator = 0;
    }
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
    hideEscapeMenu();
    screen = gameOverShown ? 'gameOver' : 'playing';
    lastTime = performance.now();
    accumulator = 0;
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
    input.setHeadMeshes(renderer.getEnemyHeadMeshes());
    const currentInput = input.getInput();

    // Update dynamic crosshair based on effective spread
    const isDodging = state.player.dodgeTimer > 0;
    const isMoving = currentInput.moveDir.x !== 0 || currentInput.moveDir.y !== 0;
    const rifle = configs.weapons.rifle;
    const effectiveSpread = isDodging
      ? rifle.spread * rifle.movingSpreadMultiplier * 3.0
      : rifle.spread * (isMoving ? rifle.movingSpreadMultiplier : 1.0);
    updateCrosshairSpread(effectiveSpread);

    while (accumulator >= TICK_DURATION) {
      fullRecorder.recordTick(currentInput);
      ringRecorder.recordTick(currentInput, game);
      tick(game, currentInput, configs);
      processHitEvents(state.events);
      accumulator -= TICK_DURATION;
    }

    if (state.gameOver && !gameOverShown) {
      gameOverShown = true;
      showGameOver(state.score);
      screen = 'gameOver';
    }

    renderer.syncState(state);
    renderer.render();
    updateHUD(state);
  } else if (screen === 'paused' || screen === 'gameOver') {
    // Still render the scene (visible behind overlay)
    renderer.syncState(game.state);
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
showStartScreen();
requestAnimationFrame(gameLoop);
