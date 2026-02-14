import type { GameState, ExtractionMapConfig, ExtractionSpawnerState, Enemy, EnemyType } from './types.ts';
import type { SeededRNG } from './rng.ts';
import type { EnemiesConfig } from './types.ts';
import { createPhysicsWorld, queryPushOut, destroyPhysicsWorld } from './physics.ts';

/** Create initial extraction spawner state from map config */
export function createExtractionSpawner(map: ExtractionMapConfig): ExtractionSpawnerState {
  return {
    ambientTimers: map.zones.map(z => z.ambientInterval),
    triggeredRegionIds: [],
  };
}

/** Spawn initial enemies across all zones at level start */
export function spawnInitialEnemies(
  state: GameState,
  map: ExtractionMapConfig,
  enemies: EnemiesConfig,
  rng: SeededRNG,
): void {
  const halfW = map.width / 2;
  const margin = 2;

  // Build a temporary physics world for spawn validation
  const pw = createPhysicsWorld(map.walls, { width: map.width, height: map.height, obstacleCount: 0, obstacleSize: 0 });

  for (const zone of map.zones) {
    const count = zone.initialEnemyCount ?? 0;

    for (let i = 0; i < count; i++) {
      if (state.enemies.length >= map.maxEnemies) {
        destroyPhysicsWorld(pw);
        return;
      }

      // Find a valid spawn position not overlapping walls or player spawn
      let x = 0, y = 0;
      let valid = false;
      for (let attempt = 0; attempt < 20; attempt++) {
        x = rng.range(-halfW + margin, halfW - margin);
        y = rng.range(zone.yMin + margin, zone.yMax - margin);

        // Don't spawn too close to player start
        const dx = x - map.playerSpawn.x;
        const dy = y - map.playerSpawn.y;
        if (Math.sqrt(dx * dx + dy * dy) < map.minSpawnDistFromPlayer) continue;

        // Don't spawn inside walls
        if (queryPushOut(pw, { x, y }, 0.5)) continue;

        valid = true;
        break;
      }
      if (!valid) continue;

      const enemyType: EnemyType = pickEnemyType(rng, zone.sprinterRatio, zone.gunnerRatio ?? 0, zone.shotgunnerRatio ?? 0, zone.sniperRatio ?? 0);
      const enemy = createEnemy(state, x, y, enemyType, enemies, rng);
      // All pre-spawned enemies start wandering
      enemy.aiState = 'wander';
      const angle = rng.next() * Math.PI * 2;
      enemy.wanderDir = { x: Math.cos(angle), y: Math.sin(angle) };
      enemy.wanderTimer = Math.floor(rng.range(60, 180));
      state.enemies.push(enemy);
    }
  }

  destroyPhysicsWorld(pw);
}

/** Update extraction spawner (trigger regions removed — all enemies pre-populated) */
export function updateExtractionSpawner(
  _state: GameState,
  _map: ExtractionMapConfig,
  _enemies: EnemiesConfig,
  _rng: SeededRNG,
): void {
  // No-op: trigger regions removed. All enemies are pre-spawned via spawnInitialEnemies().
}

function pickEnemyType(rng: SeededRNG, _sprinterRatio: number, gunnerRatio: number, shotgunnerRatio: number, sniperRatio: number): EnemyType {
  const roll = rng.next();
  if (roll < sniperRatio) return 'sniper';
  if (roll < sniperRatio + shotgunnerRatio) return 'shotgunner';
  if (roll < sniperRatio + shotgunnerRatio + gunnerRatio) return 'gunner';
  return 'sprinter';
}

function createEnemy(
  state: GameState,
  x: number,
  y: number,
  enemyType: EnemyType,
  enemies: EnemiesConfig,
  rng: SeededRNG,
): Enemy {
  const cfg = enemies[enemyType];
  const enemy: Enemy = {
    id: state.nextEntityId++,
    type: enemyType,
    pos: { x, y },
    hp: cfg.hp,
    radius: cfg.radius,
    speed: cfg.speed,
    contactDamage: cfg.contactDamage,
    scoreValue: cfg.scoreValue,
    knockbackVel: { x: 0, y: 0 },
    visible: true,
    facingDir: { x: 1, y: 0 },
    stunTimer: 0,
    hasArmor: rng.next() < (enemies.armorChance ?? 0),
    hasHelmet: rng.next() < (enemies.helmetChance ?? 0),
  };

  // Initialize ranged AI fields for all ranged types
  if (enemyType === 'gunner' || enemyType === 'shotgunner' || enemyType === 'sniper') {
    enemy.aiPhase = 'advance';
    enemy.aiTimer = 0;
    enemy.fireCooldown = 0;
  }

  return enemy;
}
