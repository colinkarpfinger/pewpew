import type { Vec2, Obstacle } from './types.ts';

/** Check if two circles overlap */
export function circleCircle(
  aPos: Vec2, aRadius: number,
  bPos: Vec2, bRadius: number,
): boolean {
  const dx = aPos.x - bPos.x;
  const dy = aPos.y - bPos.y;
  const distSq = dx * dx + dy * dy;
  const radSum = aRadius + bRadius;
  return distSq < radSum * radSum;
}

/** Get distance squared between two points */
export function distSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** Get distance between two points */
export function dist(a: Vec2, b: Vec2): number {
  return Math.sqrt(distSq(a, b));
}

/** Normalize a vector, returns zero vector if length is 0 */
export function normalize(v: Vec2): Vec2 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

/** Get length of a vector */
export function vecLen(v: Vec2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

/**
 * Circle vs AABB overlap test.
 * Returns the push-out vector to move the circle out of the AABB,
 * or null if no overlap.
 * Obstacle pos is center, width/height are full extents.
 */
export function circleAABB(
  circlePos: Vec2, circleRadius: number,
  obstacle: Obstacle,
): Vec2 | null {
  const halfW = obstacle.width / 2;
  const halfH = obstacle.height / 2;

  // Closest point on AABB to circle center
  const closestX = Math.max(obstacle.pos.x - halfW, Math.min(circlePos.x, obstacle.pos.x + halfW));
  const closestY = Math.max(obstacle.pos.y - halfH, Math.min(circlePos.y, obstacle.pos.y + halfH));

  const dx = circlePos.x - closestX;
  const dy = circlePos.y - closestY;
  const dSq = dx * dx + dy * dy;

  if (dSq >= circleRadius * circleRadius) return null;

  // Circle overlaps AABB — compute push-out
  if (dSq === 0) {
    // Circle center is inside AABB, push out along shortest axis
    const overlapX = halfW + circleRadius - Math.abs(circlePos.x - obstacle.pos.x);
    const overlapY = halfH + circleRadius - Math.abs(circlePos.y - obstacle.pos.y);
    if (overlapX < overlapY) {
      const sign = circlePos.x >= obstacle.pos.x ? 1 : -1;
      return { x: sign * overlapX, y: 0 };
    } else {
      const sign = circlePos.y >= obstacle.pos.y ? 1 : -1;
      return { x: 0, y: sign * overlapY };
    }
  }

  const d = Math.sqrt(dSq);
  const overlap = circleRadius - d;
  return { x: (dx / d) * overlap, y: (dy / d) * overlap };
}

/**
 * Perpendicular distance from a point to an infinite line.
 * Line defined by a point on the line and a direction vector.
 */
export function pointToLineDist(
  point: Vec2,
  linePoint: Vec2,
  lineDir: Vec2,
): number {
  const len = vecLen(lineDir);
  if (len === 0) return Math.sqrt(distSq(point, linePoint));
  // |cross product| / |dir|
  const dx = point.x - linePoint.x;
  const dy = point.y - linePoint.y;
  return Math.abs(dx * lineDir.y - dy * lineDir.x) / len;
}

/** Clamp a circle position within arena bounds */
export function clampToArena(pos: Vec2, radius: number, arenaWidth: number, arenaHeight: number): Vec2 {
  const halfW = arenaWidth / 2;
  const halfH = arenaHeight / 2;
  return {
    x: Math.max(-halfW + radius, Math.min(halfW - radius, pos.x)),
    y: Math.max(-halfH + radius, Math.min(halfH - radius, pos.y)),
  };
}

/** Check if a circle is outside arena bounds */
export function isOutOfBounds(pos: Vec2, radius: number, arenaWidth: number, arenaHeight: number): boolean {
  const halfW = arenaWidth / 2;
  const halfH = arenaHeight / 2;
  return (
    pos.x - radius < -halfW ||
    pos.x + radius > halfW ||
    pos.y - radius < -halfH ||
    pos.y + radius > halfH
  );
}
