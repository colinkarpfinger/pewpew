import type { GameState, GameConfigs, InputState, MultiKillConfig, GameMode, WeaponType } from './types.ts';
import { SeededRNG } from './rng.ts';
import { createArena } from './arena.ts';
import { updatePlayer } from './player.ts';
import { tryFire, updateProjectiles, checkProjectileCollisions, updateReload, updateEnemyProjectiles, checkEnemyProjectileHits } from './combat.ts';
import { updateEnemies, checkContactDamage } from './enemies.ts';
import { updateSpawner } from './spawner.ts';
import { tryThrowGrenade, updateGrenades } from './grenade.ts';
import { spawnCrates, checkCratePickups, updateCrateLifetimes } from './crates.ts';
import { spawnCash, checkCashPickups } from './cash.ts';
import { createExtractionSpawner, updateExtractionSpawner, spawnInitialEnemies } from './extraction-spawner.ts';
import { updateVisibility } from './line-of-sight.ts';
import { isInAnyExtractionZone } from './extraction-map.ts';
import { spawnInitialDestructibleCrates, checkProjectileVsCrates } from './destructible-crates.ts';

export interface GameInstance {
  state: GameState;
  rng: SeededRNG;
}

export function createGame(configs: GameConfigs, seed: number = 12345, gameMode: GameMode = 'arena', activeWeapon?: WeaponType): GameInstance {
  const rng = new SeededRNG(seed);

  const weapon: WeaponType = activeWeapon ?? (gameMode === 'extraction' ? 'pistol' : 'rifle');

  const isExtraction = gameMode === 'extraction' && configs.extractionMap;
  const extractionMap = isExtraction ? configs.extractionMap! : null;

  // For extraction mode: use the map's walls as obstacles, set arena to map dimensions
  const arena = extractionMap
    ? { width: extractionMap.width, height: extractionMap.height, obstacleCount: 0, obstacleSize: 0 }
    : configs.arena;
  const obstacles = extractionMap
    ? [...extractionMap.walls]
    : createArena(configs.arena, rng);

  const playerSpawn = extractionMap
    ? { x: extractionMap.playerSpawn.x, y: extractionMap.playerSpawn.y }
    : { x: 0, y: 0 };

  const state: GameState = {
    tick: 0,
    gameMode,
    player: {
      pos: playerSpawn,
      hp: configs.player.hp,
      maxHp: configs.player.hp,
      radius: configs.player.radius,
      aimDir: { x: 0, y: 1 },
      iframeTimer: 0,
      fireCooldown: 0,
      dodgeTimer: 0,
      dodgeCooldown: 0,
      dodgeDir: { x: 0, y: 0 },
      ammo: configs.weapons[weapon].magazineSize,
      reloadTimer: 0,
      reloadFumbled: false,
      damageBonusMultiplier: 1.0,
      speedBoostTimer: 0,
      speedBoostMultiplier: 1.0,
      activeWeapon: weapon,
    },
    enemies: [],
    projectiles: [],
    enemyProjectiles: [],
    grenades: [],
    crates: [],
    cashPickups: [],
    destructibleCrates: [],
    obstacles,
    arena,
    grenadeAmmo: configs.grenade.startingAmmo,
    runCash: 0,
    score: 0,
    gameOver: false,
    nextEntityId: 1,
    spawner: {
      timer: configs.spawning.initialInterval,
      currentInterval: configs.spawning.initialInterval,
    },
    events: [],
    extractionMap,
    extractionSpawner: extractionMap ? createExtractionSpawner(extractionMap) : null,
    extracted: false,
  };

  // Arena mode: aim right by default
  if (!extractionMap) {
    state.player.aimDir = { x: 1, y: 0 };
  }

  // Extraction mode: pre-spawn enemies across the map
  if (extractionMap) {
    spawnInitialEnemies(state, extractionMap, configs.enemies, rng);
  }

  // Extraction mode: spawn destructible crates
  if (extractionMap && configs.destructibleCrates) {
    spawnInitialDestructibleCrates(state, extractionMap, configs.destructibleCrates, rng);
  }

  return { state, rng };
}

export function tick(game: GameInstance, input: InputState, configs: GameConfigs): void {
  const { state, rng } = game;
  if (state.gameOver || state.extracted) return;

  // Clear per-tick events
  state.events = [];
  state.tick++;

  // 1. Player movement
  updatePlayer(state, input, configs.player);

  // 2. Reload
  updateReload(state, input, configs.weapons);

  // 3. Fire weapon
  tryFire(state, input, configs.weapons, rng);

  // 3b. Throw grenade
  tryThrowGrenade(state, input, configs.grenade);

  // 3c. Update grenades (movement, bouncing, explosions)
  const preGrenadeIframe = state.player.iframeTimer;
  updateGrenades(state, configs.grenade);
  if (state.player.iframeTimer === 0 && preGrenadeIframe === 0) {
    // Check if grenade self-damage occurred (player_hit event with selfDamage flag)
    for (const ev of state.events) {
      if (ev.type === 'player_hit' && ev.data?.['selfDamage']) {
        state.player.iframeTimer = configs.player.iframeDuration;
        break;
      }
    }
  }

  // 4. Update projectiles
  updateProjectiles(state);

  // 5. Projectile collisions (vs enemies, walls, obstacles)
  checkProjectileCollisions(state, configs.weapons);

  // 5a. Projectile vs destructible crates
  if (configs.destructibleCrates) {
    checkProjectileVsCrates(state, rng, configs.destructibleCrates);
  }

  // 5b. Multi-kill detection
  if (configs.multikill) {
    detectMultiKills(state, configs.multikill);
  }

  // 5c. Crate drops from killed enemies
  spawnCrates(state, configs.crates, rng);

  // 5d. Crate pickups (player collision)
  checkCratePickups(state, configs.crates);

  // 5e. Crate lifetime expiration
  updateCrateLifetimes(state);

  // 5f. Cash drops from killed enemies (extraction mode only)
  spawnCash(state, configs.cash, rng);

  // 5g. Cash pickups (player collision)
  checkCashPickups(state, configs.cash);

  // 6. Line of sight (extraction mode only — arena enemies always visible)
  if (state.extractionMap) {
    updateVisibility(state.player.pos, state.enemies, state.obstacles);
  }

  // 7. Enemy AI
  updateEnemies(state, configs.enemies, configs.gunner, rng);

  // 7b. Enemy projectiles
  updateEnemyProjectiles(state);
  checkEnemyProjectileHits(state, configs.player);

  // 8. Contact damage
  const savedIframe = state.player.iframeTimer;
  checkContactDamage(state, configs.enemies);
  if (state.player.iframeTimer > 0 && savedIframe === 0) {
    state.player.iframeTimer = configs.player.iframeDuration;
  }

  // 9. Spawner
  if (state.extractionMap && state.extractionSpawner) {
    updateExtractionSpawner(state, state.extractionMap, configs.enemies, rng);
  } else {
    updateSpawner(state, configs.spawning, configs.enemies, rng);
  }

  // 10. Extraction win condition
  if (state.extractionMap && isInAnyExtractionZone(state.player.pos, state.extractionMap.extractionZones)) {
    state.extracted = true;
    state.events.push({
      tick: state.tick,
      type: 'extraction_success',
    });
  }
}

function detectMultiKills(state: GameState, config: MultiKillConfig): void {
  // Find the highest kill count from any single source this tick:
  // - bulletKillCount: penetrating bullet kills (per bullet)
  // - grenade_exploded killCount: AoE kills (per explosion)
  let killCount = 0;
  for (const e of state.events) {
    if (e.type === 'enemy_killed') {
      const bkc = (e.data?.['bulletKillCount'] as number) ?? 0;
      if (bkc > killCount) killCount = bkc;
    } else if (e.type === 'grenade_exploded') {
      const gkc = (e.data?.['killCount'] as number) ?? 0;
      if (gkc > killCount) killCount = gkc;
    }
  }
  if (killCount < config.minKills) return;

  // Find highest matching tier (tiers sorted by kills ascending)
  let tier = config.tiers[0];
  for (const t of config.tiers) {
    if (t.kills <= killCount) tier = t;
  }

  // Apply speed boost (overwrite, not stack)
  state.player.speedBoostTimer = tier.duration;
  state.player.speedBoostMultiplier = tier.speedMultiplier;

  // Knockback pulse: push nearby enemies away from player
  const px = state.player.pos.x;
  const py = state.player.pos.y;
  for (const enemy of state.enemies) {
    const dx = enemy.pos.x - px;
    const dy = enemy.pos.y - py;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0 && dist <= config.pulseRadius) {
      const nx = dx / dist;
      const ny = dy / dist;
      enemy.knockbackVel.x += nx * tier.pulseForce;
      enemy.knockbackVel.y += ny * tier.pulseForce;
    }
  }

  // Emit multikill event
  state.events.push({
    tick: state.tick,
    type: 'multikill',
    data: { killCount },
  });
}

/** Deep clone a GameState via JSON round-trip */
export function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state));
}

/** Reconstruct a GameInstance from a serialized snapshot + RNG state */
export function restoreGame(stateSnapshot: GameState, rngState: number): GameInstance {
  const state = cloneState(stateSnapshot);
  // Backward-compat defaults for dodge fields
  state.player.dodgeTimer ??= 0;
  state.player.dodgeCooldown ??= 0;
  state.player.dodgeDir ??= { x: 0, y: 0 };
  state.player.ammo ??= 30;
  state.player.reloadTimer ??= 0;
  state.player.damageBonusMultiplier ??= 1.0;
  state.player.speedBoostTimer ??= 0;
  state.player.speedBoostMultiplier ??= 1.0;
  state.player.activeWeapon ??= 'rifle';
  state.gameMode ??= 'arena';
  state.grenades ??= [];
  state.crates ??= [];
  state.cashPickups ??= [];
  state.grenadeAmmo ??= 3;
  state.runCash ??= 0;
  state.destructibleCrates ??= [];
  // Backward-compat: old projectiles missing weaponType
  for (const proj of state.projectiles) {
    proj.weaponType ??= 'rifle';
  }
  // Backward-compat: enemy projectiles
  state.enemyProjectiles ??= [];
  // Backward-compat: extraction fields
  state.extractionMap ??= null;
  state.extractionSpawner ??= null;
  state.extracted ??= false;
  // Migrate old extractionZone → extractionZones
  if (state.extractionMap) {
    const em = state.extractionMap as unknown as Record<string, unknown>;
    if (!em.extractionZones && em.extractionZone) {
      em.extractionZones = [em.extractionZone];
      delete em.extractionZone;
    }
  }
  // Backward-compat: enemy visible field
  for (const enemy of state.enemies) {
    enemy.visible ??= true;
  }
  const rng = new SeededRNG(0);
  rng.setState(rngState);
  return { state, rng };
}

/** Get a serializable snapshot of the entire game state */
export function getSnapshot(state: GameState): string {
  return JSON.stringify(state, null, 2);
}
