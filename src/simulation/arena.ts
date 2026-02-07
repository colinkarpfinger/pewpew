import type { ArenaConfig, Obstacle } from './types.ts';
import type { SeededRNG } from './rng.ts';

/** Create arena obstacles at seeded random positions, avoiding center spawn area */
export function createArena(config: ArenaConfig, rng: SeededRNG): Obstacle[] {
  const obstacles: Obstacle[] = [];
  const halfW = config.width / 2;
  const halfH = config.height / 2;
  const safeRadius = 4; // keep center clear for player spawn

  for (let i = 0; i < config.obstacleCount; i++) {
    let pos;
    let attempts = 0;
    do {
      pos = {
        x: rng.range(-halfW + config.obstacleSize, halfW - config.obstacleSize),
        y: rng.range(-halfH + config.obstacleSize, halfH - config.obstacleSize),
      };
      attempts++;
    } while (
      Math.abs(pos.x) < safeRadius &&
      Math.abs(pos.y) < safeRadius &&
      attempts < 20
    );

    obstacles.push({
      pos,
      width: config.obstacleSize,
      height: config.obstacleSize,
    });
  }

  return obstacles;
}
