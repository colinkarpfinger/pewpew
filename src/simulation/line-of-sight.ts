import type { Vec2, Enemy } from './types.ts';
import { queryRayBlocked } from './physics.ts';
import type { PhysicsWorld } from './physics.ts';

/**
 * Update visibility for all enemies based on line of sight from player.
 * An enemy is visible if no wall blocks the ray from player to enemy.
 */
export function updateVisibility(playerPos: Vec2, enemies: Enemy[], physics: PhysicsWorld): void {
  for (const enemy of enemies) {
    const dx = enemy.pos.x - playerPos.x;
    const dy = enemy.pos.y - playerPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.01) {
      enemy.visible = true;
      continue;
    }

    const dirX = dx / dist;
    const dirY = dy / dist;
    const dir: Vec2 = { x: dirX, y: dirY };

    enemy.visible = !queryRayBlocked(physics, playerPos, dir, dist);
  }
}
