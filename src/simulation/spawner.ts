import type { GameState, SpawningConfig, EnemiesConfig, Enemy } from './types.ts';
import type { SeededRNG } from './rng.ts';

export function updateSpawner(
  state: GameState,
  spawning: SpawningConfig,
  enemies: EnemiesConfig,
  rng: SeededRNG,
): void {
  state.spawner.timer--;

  if (state.spawner.timer <= 0) {
    // Reset timer with decay
    state.spawner.currentInterval = Math.max(
      spawning.minimumInterval,
      state.spawner.currentInterval * spawning.decayRate,
    );
    state.spawner.timer = Math.ceil(state.spawner.currentInterval);

    // Don't exceed max enemies
    if (state.enemies.length >= spawning.maxEnemies) return;

    // Pick spawn position at arena edge
    const pos = getEdgeSpawnPosition(state, rng);
    const cfg = enemies.rusher;

    const enemy: Enemy = {
      id: state.nextEntityId++,
      type: 'rusher',
      pos,
      hp: cfg.hp,
      radius: cfg.radius,
      speed: cfg.speed,
      contactDamage: cfg.contactDamage,
      scoreValue: cfg.scoreValue,
      knockbackVel: { x: 0, y: 0 },
      visible: true,
    };

    state.enemies.push(enemy);
    state.events.push({
      tick: state.tick,
      type: 'enemy_spawned',
      data: { enemyId: enemy.id, pos: { ...pos } },
    });
  }
}

function getEdgeSpawnPosition(state: GameState, rng: SeededRNG): { x: number; y: number } {
  const halfW = state.arena.width / 2;
  const halfH = state.arena.height / 2;
  const margin = 1;

  // Pick a random edge (0=top, 1=right, 2=bottom, 3=left)
  const edge = rng.int(0, 3);

  switch (edge) {
    case 0: return { x: rng.range(-halfW + margin, halfW - margin), y: -halfH + margin };
    case 1: return { x: halfW - margin, y: rng.range(-halfH + margin, halfH - margin) };
    case 2: return { x: rng.range(-halfW + margin, halfW - margin), y: halfH - margin };
    case 3: return { x: -halfW + margin, y: rng.range(-halfH + margin, halfH - margin) };
    default: return { x: halfW - margin, y: 0 };
  }
}
