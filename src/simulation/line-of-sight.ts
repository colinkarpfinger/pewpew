import type { Vec2, Enemy, Obstacle } from './types.ts';

/**
 * Ray-AABB intersection test using the slab method.
 * Returns true if a ray from origin in direction dir (normalized)
 * intersects the AABB within maxDist.
 */
export function rayIntersectsAABB(
  origin: Vec2,
  dir: Vec2,
  maxDist: number,
  obstacle: Obstacle,
): boolean {
  const halfW = obstacle.width / 2;
  const halfH = obstacle.height / 2;
  const minX = obstacle.pos.x - halfW;
  const maxX = obstacle.pos.x + halfW;
  const minY = obstacle.pos.y - halfH;
  const maxY = obstacle.pos.y + halfH;

  let tMin = 0;
  let tMax = maxDist;

  // X slab
  if (Math.abs(dir.x) < 1e-10) {
    // Ray is parallel to X slab
    if (origin.x < minX || origin.x > maxX) return false;
  } else {
    const invD = 1 / dir.x;
    let t1 = (minX - origin.x) * invD;
    let t2 = (maxX - origin.x) * invD;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }

  // Y slab
  if (Math.abs(dir.y) < 1e-10) {
    if (origin.y < minY || origin.y > maxY) return false;
  } else {
    const invD = 1 / dir.y;
    let t1 = (minY - origin.y) * invD;
    let t2 = (maxY - origin.y) * invD;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }

  return true;
}

/**
 * Update visibility for all enemies based on line of sight from player.
 * An enemy is visible if no wall blocks the ray from player to enemy.
 */
export function updateVisibility(playerPos: Vec2, enemies: Enemy[], walls: Obstacle[]): void {
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

    let blocked = false;
    for (const wall of walls) {
      if (rayIntersectsAABB(playerPos, dir, dist, wall)) {
        blocked = true;
        break;
      }
    }

    enemy.visible = !blocked;
  }
}
