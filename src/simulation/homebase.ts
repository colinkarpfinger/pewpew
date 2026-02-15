import type { Vec2, Obstacle, PlayerConfig, HomebaseMapConfig, HomebaseInteractable } from './types.ts';
import { TICK_DURATION } from './types.ts';
import { clampToArena } from './collision.ts';
import { createPhysicsWorld, destroyPhysicsWorld, queryPushOut } from './physics.ts';
import type { PhysicsWorld } from './physics.ts';
import type { InputState } from './types.ts';

export interface HomebaseState {
  playerPos: Vec2;
  playerAimDir: Vec2;
  playerRadius: number;
  arena: { width: number; height: number };
  obstacles: Obstacle[];
  interactables: HomebaseInteractable[];
  nearestInteractable: HomebaseInteractable | null;
}

export interface HomebaseInstance {
  state: HomebaseState;
  physics: PhysicsWorld;
}

export function createHomebase(config: HomebaseMapConfig, playerRadius: number): HomebaseInstance {
  const arena = { width: config.width, height: config.height, obstacleCount: 0, obstacleSize: 0 };
  const physics = createPhysicsWorld(config.walls, arena);
  const state: HomebaseState = {
    playerPos: { x: config.playerSpawn.x, y: config.playerSpawn.y },
    playerAimDir: { x: 0, y: 1 },
    playerRadius,
    arena: { width: config.width, height: config.height },
    obstacles: config.walls,
    interactables: config.interactables,
    nearestInteractable: null,
  };
  return { state, physics };
}

export function destroyHomebase(instance: HomebaseInstance): void {
  destroyPhysicsWorld(instance.physics);
}

export function homebaseTick(instance: HomebaseInstance, input: InputState, playerConfig: PlayerConfig): void {
  const { state, physics } = instance;

  // Movement
  const speed = playerConfig.speed * TICK_DURATION;
  if (input.moveDir.x !== 0 || input.moveDir.y !== 0) {
    state.playerPos.x += input.moveDir.x * speed;
    state.playerPos.y += input.moveDir.y * speed;
  }

  // Aim direction
  if (input.aimDir.x !== 0 || input.aimDir.y !== 0) {
    state.playerAimDir = { x: input.aimDir.x, y: input.aimDir.y };
  }

  // Arena clamp
  const clamped = clampToArena(state.playerPos, state.playerRadius, state.arena.width, state.arena.height);
  state.playerPos.x = clamped.x;
  state.playerPos.y = clamped.y;

  // Physics push-out (obstacles + walls)
  const pushOut = queryPushOut(physics, state.playerPos, state.playerRadius);
  if (pushOut) {
    state.playerPos.x += pushOut.x;
    state.playerPos.y += pushOut.y;
  }

  // Find nearest interactable
  state.nearestInteractable = findNearestInteractable(state.playerPos, state.interactables);
}

function findNearestInteractable(playerPos: Vec2, interactables: HomebaseInteractable[]): HomebaseInteractable | null {
  let best: HomebaseInteractable | null = null;
  let bestDist = Infinity;

  for (const ia of interactables) {
    if (ia.type === 'raid' && ia.width !== undefined && ia.height !== undefined) {
      // AABB zone check
      const halfW = ia.width / 2;
      const halfH = ia.height / 2;
      if (
        playerPos.x >= ia.pos.x - halfW &&
        playerPos.x <= ia.pos.x + halfW &&
        playerPos.y >= ia.pos.y - halfH &&
        playerPos.y <= ia.pos.y + halfH
      ) {
        // Inside zone — distance is 0, always wins
        return ia;
      }
    } else {
      // Radius check
      const r = ia.radius ?? 2.0;
      const dx = playerPos.x - ia.pos.x;
      const dy = playerPos.y - ia.pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= r && dist < bestDist) {
        bestDist = dist;
        best = ia;
      }
    }
  }

  return best;
}
