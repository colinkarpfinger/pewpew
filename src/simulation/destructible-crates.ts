import type { GameState, DestructibleCrateConfig, ExtractionMapConfig, DestructibleCrate } from './types.ts';
import type { SeededRNG } from './rng.ts';
import { circleAABB } from './collision.ts';
import { getZoneIndex } from './extraction-map.ts';

/** Spawn hand-placed + procedural destructible crates at level start */
export function spawnInitialDestructibleCrates(
  state: GameState,
  map: ExtractionMapConfig,
  config: DestructibleCrateConfig,
  rng: SeededRNG,
): void {
  const halfW = map.width / 2;
  const margin = 2;

  // Hand-placed crates from map config
  if (map.destructibleCrates) {
    for (const pos of map.destructibleCrates) {
      const zoneIdx = getZoneIndex(map, pos.y);
      const lootTier = Math.max(1, Math.min(4, zoneIdx + 1));
      const crate: DestructibleCrate = {
        id: state.nextEntityId++,
        pos: { x: pos.x, y: pos.y },
        hp: config.hp,
        maxHp: config.hp,
        lootTier,
      };
      state.destructibleCrates.push(crate);
    }
  }

  // Procedural crates per zone
  for (let zi = 0; zi < map.zones.length; zi++) {
    const zone = map.zones[zi];
    const count = config.proceduralCountPerZone[zi] ?? 0;
    const lootTier = zi + 1;

    for (let i = 0; i < count; i++) {
      let x = 0, y = 0;
      let valid = false;
      for (let attempt = 0; attempt < 20; attempt++) {
        x = rng.range(-halfW + margin, halfW - margin);
        y = rng.range(zone.yMin + margin, zone.yMax - margin);

        // Don't place inside walls
        let insideWall = false;
        for (const wall of map.walls) {
          if (circleAABB({ x, y }, config.width / 2, wall)) {
            insideWall = true;
            break;
          }
        }
        if (insideWall) continue;

        // Don't place too close to player spawn
        const dx = x - map.playerSpawn.x;
        const dy = y - map.playerSpawn.y;
        if (Math.sqrt(dx * dx + dy * dy) < 5) continue;

        valid = true;
        break;
      }
      if (!valid) continue;

      const crate: DestructibleCrate = {
        id: state.nextEntityId++,
        pos: { x, y },
        hp: config.hp,
        maxHp: config.hp,
        lootTier,
      };
      state.destructibleCrates.push(crate);
    }
  }
}

/** Check projectiles against destructible crates; consume bullets, deal damage, spawn loot */
export function checkProjectileVsCrates(
  state: GameState,
  rng: SeededRNG,
  config: DestructibleCrateConfig,
): void {
  for (let pi = state.projectiles.length - 1; pi >= 0; pi--) {
    const proj = state.projectiles[pi];

    for (let ci = state.destructibleCrates.length - 1; ci >= 0; ci--) {
      const crate = state.destructibleCrates[ci];
      const syntheticObs = { pos: crate.pos, width: config.width, height: config.height };
      const overlap = circleAABB(proj.pos, 0.1, syntheticObs);
      if (!overlap) continue;

      // Hit the crate
      crate.hp -= proj.damage;

      if (crate.hp <= 0) {
        // Destroy crate
        state.events.push({
          tick: state.tick,
          type: 'destructible_crate_destroyed',
          data: { x: crate.pos.x, y: crate.pos.y, lootTier: crate.lootTier },
        });

        // Spawn loot
        spawnCrateLoot(state, crate, rng, config);

        state.destructibleCrates.splice(ci, 1);
      } else {
        state.events.push({
          tick: state.tick,
          type: 'destructible_crate_hit',
          data: { x: crate.pos.x, y: crate.pos.y, remainingHp: crate.hp },
        });
      }

      // Consume the projectile
      state.projectiles.splice(pi, 1);
      state.events.push({
        tick: state.tick,
        type: 'projectile_destroyed',
        data: { x: proj.pos.x, y: proj.pos.y },
      });
      break; // this projectile is consumed, move to next
    }
  }
}

function spawnCrateLoot(
  state: GameState,
  crate: DestructibleCrate,
  rng: SeededRNG,
  config: DestructibleCrateConfig,
): void {
  const tableIdx = Math.max(0, Math.min(config.lootTables.length - 1, crate.lootTier - 1));
  const table = config.lootTables[tableIdx];

  // Always drop cash
  const cashAmount = Math.floor(rng.range(table.cashMin, table.cashMax + 1));
  state.cashPickups.push({
    id: state.nextEntityId++,
    pos: { x: crate.pos.x, y: crate.pos.y },
    amount: cashAmount,
  });
  state.events.push({
    tick: state.tick,
    type: 'cash_spawned',
    data: { x: crate.pos.x, y: crate.pos.y, amount: cashAmount },
  });

  // Roll for health drop
  if (rng.next() < table.healthChance) {
    state.crates.push({
      id: state.nextEntityId++,
      pos: { x: crate.pos.x + 0.5, y: crate.pos.y },
      crateType: 'health',
      lifetime: 600, // 10 seconds
    });
    state.events.push({
      tick: state.tick,
      type: 'crate_spawned',
      data: { x: crate.pos.x + 0.5, y: crate.pos.y, crateType: 'health' },
    });
  }

  // Roll for grenade drop
  if (rng.next() < table.grenadeChance) {
    state.crates.push({
      id: state.nextEntityId++,
      pos: { x: crate.pos.x - 0.5, y: crate.pos.y },
      crateType: 'grenade',
      lifetime: 600,
    });
    state.events.push({
      tick: state.tick,
      type: 'crate_spawned',
      data: { x: crate.pos.x - 0.5, y: crate.pos.y, crateType: 'grenade' },
    });
  }
}
