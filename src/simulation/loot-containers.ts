import type { GameState, LootContainer, DestructibleCrate, DestructibleCrateConfig, ExtractionMapConfig, EnemyType, InventoryConfig } from './types.ts';
import type { SeededRNG } from './rng.ts';
import { generateLoot } from './loot-tables.ts';
import { getZoneIndex } from './extraction-map.ts';
import { createPhysicsWorld, queryPushOut, destroyPhysicsWorld } from './physics.ts';

const ENEMY_CAPACITY: Record<EnemyType, number> = {
  sprinter: 6,
  gunner: 8,
  shotgunner: 8,
  sniper: 10,
};

const CRATE_TIER_CAPACITY = [4, 6, 8, 10]; // tier 1-4

/** Scan enemy_killed events this tick and spawn loot containers at death positions */
export function spawnLootContainersFromKills(state: GameState, rng: SeededRNG, config: InventoryConfig): void {
  for (const ev of state.events) {
    if (ev.type !== 'enemy_killed') continue;
    const d = ev.data;
    if (!d || typeof d.x !== 'number' || typeof d.y !== 'number') continue;

    const enemyType = (d.enemyType as EnemyType) ?? 'sprinter';
    const capacity = ENEMY_CAPACITY[enemyType] ?? 6;
    const tableId = `enemy_${enemyType}`;
    const items = generateLoot(tableId, capacity, rng);

    const container: LootContainer = {
      id: state.nextEntityId++,
      pos: { x: d.x as number, y: d.y as number },
      containerType: 'body',
      items,
      capacity,
      searchProgress: 0,
      despawnTimer: config.bodyDespawnTime,
    };
    state.lootContainers.push(container);
  }
}

/** Spawn a loot container from a destroyed destructible crate */
export function spawnLootContainerFromCrate(
  state: GameState,
  crate: DestructibleCrate,
  rng: SeededRNG,
  _config: DestructibleCrateConfig,
): void {
  const tier = Math.max(1, Math.min(4, crate.lootTier));
  const capacity = CRATE_TIER_CAPACITY[tier - 1];
  const tableId = `crate_tier${tier}`;
  const items = generateLoot(tableId, capacity, rng);

  const container: LootContainer = {
    id: state.nextEntityId++,
    pos: { x: crate.pos.x, y: crate.pos.y },
    containerType: 'crate',
    items,
    capacity,
    searchProgress: 0,
    despawnTimer: -1, // crate containers never despawn
  };
  state.lootContainers.push(container);
}

/** Decrement despawn timers and remove expired containers */
export function updateLootContainerDespawn(state: GameState): void {
  for (let i = state.lootContainers.length - 1; i >= 0; i--) {
    const c = state.lootContainers[i];
    if (c.despawnTimer === -1) continue;
    c.despawnTimer--;
    if (c.despawnTimer <= 0) {
      state.lootContainers.splice(i, 1);
    }
  }
}

/** Spawn loot containers at level start (replaces destructible crates in extraction mode) */
export function spawnInitialLootContainers(
  state: GameState,
  map: ExtractionMapConfig,
  crateConfig: DestructibleCrateConfig,
  rng: SeededRNG,
): void {
  const halfW = map.width / 2;
  const margin = 2;

  // Hand-placed crate positions from map config
  if (map.destructibleCrates) {
    for (const pos of map.destructibleCrates) {
      const zoneIdx = getZoneIndex(map, pos.y);
      const tier = Math.max(1, Math.min(4, zoneIdx + 1));
      const capacity = CRATE_TIER_CAPACITY[tier - 1];
      const items = generateLoot(`crate_tier${tier}`, capacity, rng);

      state.lootContainers.push({
        id: state.nextEntityId++,
        pos: { x: pos.x, y: pos.y },
        containerType: 'crate',
        items,
        capacity,
        searchProgress: 0,
        despawnTimer: -1,
      });
    }
  }

  // Build a temporary physics world for spawn validation
  const pw = createPhysicsWorld(map.walls, { width: map.width, height: map.height, obstacleCount: 0, obstacleSize: 0 });

  // Procedural crates per zone
  for (let zi = 0; zi < map.zones.length; zi++) {
    const zone = map.zones[zi];
    const count = crateConfig.proceduralCountPerZone[zi] ?? 0;
    const tier = zi + 1;
    const capacity = CRATE_TIER_CAPACITY[Math.min(tier, 4) - 1];

    for (let i = 0; i < count; i++) {
      let x = 0, y = 0;
      let valid = false;
      for (let attempt = 0; attempt < 20; attempt++) {
        x = rng.range(-halfW + margin, halfW - margin);
        y = rng.range(zone.yMin + margin, zone.yMax - margin);

        // Don't place inside walls
        if (queryPushOut(pw, { x, y }, crateConfig.width / 2)) continue;

        // Don't place too close to player spawn
        const dx = x - map.playerSpawn.x;
        const dy = y - map.playerSpawn.y;
        if (Math.sqrt(dx * dx + dy * dy) < 5) continue;

        valid = true;
        break;
      }
      if (!valid) continue;

      const items = generateLoot(`crate_tier${Math.min(tier, 4)}`, capacity, rng);
      state.lootContainers.push({
        id: state.nextEntityId++,
        pos: { x, y },
        containerType: 'crate',
        items,
        capacity,
        searchProgress: 0,
        despawnTimer: -1,
      });
    }
  }

  destroyPhysicsWorld(pw);
}

/** Find the nearest loot container within interaction radius of the player */
export function findNearestLootContainer(state: GameState, radius: number): LootContainer | null {
  const px = state.player.pos.x;
  const py = state.player.pos.y;
  let best: LootContainer | null = null;
  let bestDist = radius + 1;

  for (const c of state.lootContainers) {
    const dx = c.pos.x - px;
    const dy = c.pos.y - py;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= radius && dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }

  return best;
}
