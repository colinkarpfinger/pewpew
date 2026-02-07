import type { GameState, GameConfigs, InputState } from './types.ts';
import { SeededRNG } from './rng.ts';
import { createArena } from './arena.ts';
import { updatePlayer } from './player.ts';
import { tryFire, updateProjectiles, checkProjectileCollisions } from './combat.ts';
import { updateEnemies, checkContactDamage } from './enemies.ts';
import { updateSpawner } from './spawner.ts';

export interface GameInstance {
  state: GameState;
  rng: SeededRNG;
}

export function createGame(configs: GameConfigs, seed: number = 12345): GameInstance {
  const rng = new SeededRNG(seed);
  const obstacles = createArena(configs.arena, rng);

  const state: GameState = {
    tick: 0,
    player: {
      pos: { x: 0, y: 0 },
      hp: configs.player.hp,
      maxHp: configs.player.hp,
      radius: configs.player.radius,
      aimDir: { x: 1, y: 0 },
      iframeTimer: 0,
      fireCooldown: 0,
    },
    enemies: [],
    projectiles: [],
    obstacles,
    arena: configs.arena,
    score: 0,
    gameOver: false,
    nextEntityId: 1,
    spawner: {
      timer: configs.spawning.initialInterval,
      currentInterval: configs.spawning.initialInterval,
    },
    events: [],
  };

  return { state, rng };
}

export function tick(game: GameInstance, input: InputState, configs: GameConfigs): void {
  const { state, rng } = game;
  if (state.gameOver) return;

  // Clear per-tick events
  state.events = [];
  state.tick++;

  // 1. Player movement
  updatePlayer(state, input, configs.player);

  // 2. Fire weapon
  tryFire(state, input, configs.weapons, rng);

  // 3. Update projectiles
  updateProjectiles(state);

  // 4. Projectile collisions (vs enemies, walls, obstacles)
  checkProjectileCollisions(state);

  // 5. Enemy AI
  updateEnemies(state, configs.enemies);

  // 6. Contact damage
  const savedIframe = state.player.iframeTimer;
  checkContactDamage(state, configs.enemies);
  if (state.player.iframeTimer > 0 && savedIframe === 0) {
    state.player.iframeTimer = configs.player.iframeDuration;
  }

  // 7. Spawner
  updateSpawner(state, configs.spawning, configs.enemies, rng);
}

/** Deep clone a GameState via JSON round-trip */
export function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state));
}

/** Reconstruct a GameInstance from a serialized snapshot + RNG state */
export function restoreGame(stateSnapshot: GameState, rngState: number): GameInstance {
  const state = cloneState(stateSnapshot);
  const rng = new SeededRNG(0);
  rng.setState(rngState);
  return { state, rng };
}

/** Get a serializable snapshot of the entire game state */
export function getSnapshot(state: GameState): string {
  return JSON.stringify(state, null, 2);
}
