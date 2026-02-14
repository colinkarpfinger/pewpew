import RAPIER from '@dimforge/rapier2d-deterministic-compat';
import type { Obstacle, ArenaConfig, Vec2 } from './types.ts';

export interface PhysicsWorld {
  world: RAPIER.World;
  obstacleHandles: RAPIER.ColliderHandle[];
}

/** Build a Rapier world from obstacles + arena boundary walls. Gravity = (0,0). */
export function createPhysicsWorld(obstacles: Obstacle[], arena: ArenaConfig): PhysicsWorld {
  const world = new RAPIER.World({ x: 0, y: 0 });
  const obstacleHandles: RAPIER.ColliderHandle[] = [];

  for (const obs of obstacles) {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(obs.pos.x, obs.pos.y);
    if (obs.rotation) {
      bodyDesc.setRotation(obs.rotation);
    }
    const body = world.createRigidBody(bodyDesc);

    let colliderDesc: RAPIER.ColliderDesc;
    if (obs.shape === 'circle' && obs.radius !== undefined) {
      colliderDesc = RAPIER.ColliderDesc.ball(obs.radius);
    } else {
      // Rapier cuboid takes half-extents
      colliderDesc = RAPIER.ColliderDesc.cuboid(obs.width / 2, obs.height / 2);
    }

    const collider = world.createCollider(colliderDesc, body);
    obstacleHandles.push(collider.handle);
  }

  // Arena boundary walls (4 thin slabs outside the playable area)
  const halfW = arena.width / 2;
  const halfH = arena.height / 2;
  const wallThick = 1.0;

  addStaticBox(world, obstacleHandles, 0, -halfH - wallThick / 2, halfW + wallThick, wallThick / 2);
  addStaticBox(world, obstacleHandles, 0, halfH + wallThick / 2, halfW + wallThick, wallThick / 2);
  addStaticBox(world, obstacleHandles, -halfW - wallThick / 2, 0, wallThick / 2, halfH + wallThick);
  addStaticBox(world, obstacleHandles, halfW + wallThick / 2, 0, wallThick / 2, halfH + wallThick);

  // Step once to initialize the broad-phase / query pipeline
  world.step();

  return { world, obstacleHandles };
}

function addStaticBox(
  world: RAPIER.World,
  handles: RAPIER.ColliderHandle[],
  x: number, y: number,
  halfW: number, halfH: number,
): void {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(x, y),
  );
  const collider = world.createCollider(
    RAPIER.ColliderDesc.cuboid(halfW, halfH),
    body,
  );
  handles.push(collider.handle);
}

/** Clean up a physics world */
export function destroyPhysicsWorld(pw: PhysicsWorld): void {
  pw.world.free();
}

/**
 * Circle-vs-all-obstacles push-out.
 * Returns the displacement vector to resolve overlap, or null if no overlap.
 */
export function queryPushOut(
  pw: PhysicsWorld,
  pos: Vec2,
  radius: number,
): Vec2 | null {
  const ball = new RAPIER.Ball(radius);
  const shapePos = { x: pos.x, y: pos.y };
  const shapeRot = 0;

  let totalX = 0;
  let totalY = 0;
  let hadContact = false;

  pw.world.intersectionsWithShape(
    shapePos, shapeRot, ball,
    (collider: RAPIER.Collider) => {
      // Get detailed contact for push-out
      const contact = collider.contactShape(ball, shapePos, shapeRot, 0);
      if (contact && contact.distance < 0) {
        const depth = -contact.distance;
        // normal1 points away from the collider surface toward our shape
        // Actually: normal1 is normal on first shape (collider), normal2 on second (our ball)
        // For push-out, we need to push our ball along the normal pointing away from collider
        // contact.normal2 points outward from our ball at the contact — we want the opposite:
        // we want the direction to push our ball away from the obstacle.
        // Actually, for contactShape(shape2, shape2Pos, shape2Rot, prediction):
        //   shape1 = this collider, shape2 = our ball
        //   normal1 = on shape1 surface pointing outward from shape1
        //   normal2 = on shape2 surface pointing outward from shape2
        // To push our ball (shape2) out: move along normal1 (away from obstacle surface)
        totalX += contact.normal1.x * depth;
        totalY += contact.normal1.y * depth;
        hadContact = true;
      }
      return true; // continue iterating
    },
  );

  return hadContact ? { x: totalX, y: totalY } : null;
}

/**
 * Cast a ray and return hit distance + normal, or null if nothing hit.
 */
export function queryCastRay(
  pw: PhysicsWorld,
  origin: Vec2,
  dir: Vec2,
  maxDist: number,
): { distance: number; normal: Vec2 } | null {
  const ray = new RAPIER.Ray(origin, dir);
  const hit = pw.world.castRayAndGetNormal(ray, maxDist, true);
  if (!hit) return null;

  return {
    distance: hit.timeOfImpact,
    normal: { x: hit.normal.x, y: hit.normal.y },
  };
}

/**
 * LOS check: is any obstacle hit within maxDist?
 */
export function queryRayBlocked(
  pw: PhysicsWorld,
  origin: Vec2,
  dir: Vec2,
  maxDist: number,
): boolean {
  const ray = new RAPIER.Ray(origin, dir);
  const hit = pw.world.castRay(ray, maxDist, true);
  return hit !== null;
}
