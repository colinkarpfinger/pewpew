import type { GameState, InputState, PlayerConfig } from './types.ts';
import { TICK_DURATION } from './types.ts';
import { clampToArena, circleAABB } from './collision.ts';

export function updatePlayer(state: GameState, input: InputState, config: PlayerConfig): void {
  const player = state.player;

  // Apply movement (instant, no inertia)
  if (input.moveDir.x !== 0 || input.moveDir.y !== 0) {
    player.pos.x += input.moveDir.x * config.speed * TICK_DURATION;
    player.pos.y += input.moveDir.y * config.speed * TICK_DURATION;
  }

  // Update aim direction
  if (input.aimDir.x !== 0 || input.aimDir.y !== 0) {
    player.aimDir = { ...input.aimDir };
  }

  // Clamp to arena bounds
  player.pos = clampToArena(player.pos, player.radius, state.arena.width, state.arena.height);

  // Collide with obstacles
  for (const obs of state.obstacles) {
    const pushOut = circleAABB(player.pos, player.radius, obs);
    if (pushOut) {
      player.pos.x += pushOut.x;
      player.pos.y += pushOut.y;
    }
  }

  // Tick i-frame timer
  if (player.iframeTimer > 0) {
    player.iframeTimer--;
  }

  // Tick fire cooldown
  if (player.fireCooldown > 0) {
    player.fireCooldown--;
  }
}
