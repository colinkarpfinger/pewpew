import './style.css';
import * as THREE from 'three';
import type { GameConfigs } from './simulation/types.ts';
import { TICK_DURATION } from './simulation/types.ts';
import { createGame, tick } from './simulation/game.ts';
import type { GameInstance } from './simulation/game.ts';
import { Renderer } from './rendering/renderer.ts';
import { InputHandler } from './input.ts';
import { updateHUD, showGameOver, hideGameOver, onRestart } from './ui.ts';

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

let game: GameInstance = createGame(configs);
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
renderer.initArena(game.state);

const input = new InputHandler(renderer.camera, canvas);

let accumulator = 0;
let lastTime = performance.now();
let gameOverShown = false;

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

function startGame(): void {
  game = createGame(configs, Date.now());
  rebuildScene();
  renderer.initArena(game.state);
  gameOverShown = false;
  hideGameOver();
  accumulator = 0;
  lastTime = performance.now();
}

function gameLoop(now: number): void {
  const dt = Math.min((now - lastTime) / 1000, 0.1); // cap at 100ms
  lastTime = now;
  accumulator += dt;

  const state = game.state;

  // Update input with current player position
  input.setPlayerPos(state.player.pos);
  const currentInput = input.getInput();

  // Fixed timestep simulation
  while (accumulator >= TICK_DURATION) {
    tick(game, currentInput, configs);
    accumulator -= TICK_DURATION;
  }

  // Check game over
  if (state.gameOver && !gameOverShown) {
    gameOverShown = true;
    showGameOver(state.score);
  }

  // Render
  renderer.syncState(state);
  renderer.render();

  // Update HUD
  updateHUD(state);

  requestAnimationFrame(gameLoop);
}

onRestart(() => startGame());
requestAnimationFrame(gameLoop);
