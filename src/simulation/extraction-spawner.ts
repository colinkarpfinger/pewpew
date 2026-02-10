import type { GameState, ExtractionMapConfig, ExtractionSpawnerState, Enemy, EnemyType } from './types.ts';
import type { SeededRNG } from './rng.ts';
import type { EnemiesConfig } from './types.ts';
import { getZoneIndex, isInRegion } from './extraction-map.ts';
import { dist } from './collision.ts';

/** Create initial extraction spawner state from map config */
export function createExtractionSpawner(map: ExtractionMapConfig): ExtractionSpawnerState {
  return {
    ambientTimers: map.zones.map(z => z.ambientInterval),
    triggeredRegionIds: [],
  };
}

/** Update extraction spawner: handle trigger regions and ambient zone spawns */
export function updateExtractionSpawner(
  state: GameState,
  map: ExtractionMapConfig,
  enemies: EnemiesConfig,
  rng: SeededRNG,
): void {
  const spawner = state.extractionSpawner!;
  const playerPos = state.player.pos;

  // Check trigger regions
  for (const region of map.triggerRegions) {
    if (spawner.triggeredRegionIds.includes(region.id)) continue;
    if (!isInRegion(playerPos, region.x, region.y, region.width, region.height)) continue;

    // Trigger this region
    spawner.triggeredRegionIds.push(region.id);
    state.events.push({
      tick: state.tick,
      type: 'trigger_activated',
      data: { regionId: region.id },
    });

    // Spawn pack at designated spawn points
    for (let i = 0; i < region.enemyCount; i++) {
      if (state.enemies.length >= map.maxEnemies) break;

      const spawnPoint = region.spawnPoints[i % region.spawnPoints.length];
      const enemyType: EnemyType = rng.next() < region.sprinterRatio ? 'sprinter' : 'rusher';
      const enemy = createEnemy(state, spawnPoint.x, spawnPoint.y, enemyType, enemies);
      state.enemies.push(enemy);
      state.events.push({
        tick: state.tick,
        type: 'enemy_spawned',
        data: { enemyId: enemy.id, pos: { ...enemy.pos } },
      });
    }
  }

  // Ambient zone spawns
  const playerZoneIdx = getZoneIndex(map, playerPos.y);

  for (let i = 0; i < map.zones.length; i++) {
    spawner.ambientTimers[i]--;

    if (spawner.ambientTimers[i] <= 0) {
      const zone = map.zones[i];
      spawner.ambientTimers[i] = zone.ambientInterval;

      // Only spawn in zones within ±1 of player's current zone
      if (playerZoneIdx < 0 || Math.abs(i - playerZoneIdx) > 1) continue;
      if (state.enemies.length >= map.maxEnemies) continue;

      // Find a spawn position within this zone, at least minSpawnDist from player
      const spawnPos = findAmbientSpawnPos(map, zone, playerPos, rng);
      if (!spawnPos) continue;

      const enemyType: EnemyType = rng.next() < zone.sprinterRatio ? 'sprinter' : 'rusher';
      const enemy = createEnemy(state, spawnPos.x, spawnPos.y, enemyType, enemies);
      state.enemies.push(enemy);
      state.events.push({
        tick: state.tick,
        type: 'enemy_spawned',
        data: { enemyId: enemy.id, pos: { ...enemy.pos } },
      });
    }
  }
}

function findAmbientSpawnPos(
  map: ExtractionMapConfig,
  zone: { yMin: number; yMax: number },
  playerPos: { x: number; y: number },
  rng: SeededRNG,
): { x: number; y: number } | null {
  const halfW = map.width / 2;
  const margin = 2;

  for (let attempt = 0; attempt < 10; attempt++) {
    const x = rng.range(-halfW + margin, halfW - margin);
    const y = rng.range(zone.yMin + margin, zone.yMax - margin);
    const d = dist({ x, y }, playerPos);
    if (d >= map.minSpawnDistFromPlayer) {
      return { x, y };
    }
  }
  return null;
}

function createEnemy(
  state: GameState,
  x: number,
  y: number,
  enemyType: EnemyType,
  enemies: EnemiesConfig,
): Enemy {
  const cfg = enemies[enemyType];
  return {
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
  };
}
