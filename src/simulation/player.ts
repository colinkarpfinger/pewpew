import type { GameState, InputState, PlayerConfig } from './types.ts';
import { TICK_DURATION } from './types.ts';
import { clampToArena } from './collision.ts';
import { interruptHeal } from './bandage.ts';
import { queryPushOut } from './physics.ts';
import type { PhysicsWorld } from './physics.ts';

export function updatePlayer(state: GameState, input: InputState, config: PlayerConfig, physics: PhysicsWorld): void {
  const player = state.player;
  const prevX = player.pos.x;
  const prevY = player.pos.y;

  // Start dodge if requested and able
  if (input.dodge && player.dodgeTimer === 0 && player.dodgeCooldown === 0) {
    // Dodging interrupts healing
    interruptHeal(state);
    player.dodgeTimer = config.dodgeDuration;
    // Lock direction: use moveDir if moving, otherwise aimDir
    if (input.moveDir.x !== 0 || input.moveDir.y !== 0) {
      player.dodgeDir = { x: input.moveDir.x, y: input.moveDir.y };
    } else {
      player.dodgeDir = { x: player.aimDir.x, y: player.aimDir.y };
    }
    state.events.push({
      tick: state.tick,
      type: 'player_dodge_start',
      data: { dirX: player.dodgeDir.x, dirY: player.dodgeDir.y },
    });
  }

  if (player.dodgeTimer > 0) {
    // Dodge movement: locked direction at boosted speed
    const dodgeSpeed = config.speed * config.dodgeSpeedMultiplier;
    player.pos.x += player.dodgeDir.x * dodgeSpeed * TICK_DURATION;
    player.pos.y += player.dodgeDir.y * dodgeSpeed * TICK_DURATION;
    player.dodgeTimer--;
    if (player.dodgeTimer === 0) {
      player.dodgeCooldown = config.dodgeCooldown;
    }
  } else {
    // Normal movement (instant, no inertia)
    if (input.moveDir.x !== 0 || input.moveDir.y !== 0) {
      const speed = config.speed * player.speedBoostMultiplier * player.healSpeedMultiplier;
      player.pos.x += input.moveDir.x * speed * TICK_DURATION;
      player.pos.y += input.moveDir.y * speed * TICK_DURATION;
    }

    // Update aim direction
    if (input.aimDir.x !== 0 || input.aimDir.y !== 0) {
      player.aimDir = { ...input.aimDir };
    }
  }

  // Clamp to arena bounds (applies during dodge too)
  player.pos = clampToArena(player.pos, player.radius, state.arena.width, state.arena.height);

  // Collide with obstacles (applies during dodge too)
  const pushOut = queryPushOut(physics, player.pos, player.radius);
  if (pushOut) {
    player.pos.x += pushOut.x;
    player.pos.y += pushOut.y;
  }

  // Accumulate distance traveled
  const dx = player.pos.x - prevX;
  const dy = player.pos.y - prevY;
  if (dx !== 0 || dy !== 0) {
    state.runStats.distanceTraveled += Math.sqrt(dx * dx + dy * dy);
  }

  // Tick i-frame timer
  if (player.iframeTimer > 0) {
    player.iframeTimer--;
  }

  // Tick fire cooldown
  if (player.fireCooldown > 0) {
    player.fireCooldown--;
  }

  // Tick dodge cooldown
  if (player.dodgeCooldown > 0) {
    player.dodgeCooldown--;
  }

  // Tick speed boost
  if (player.speedBoostTimer > 0) {
    player.speedBoostTimer--;
    if (player.speedBoostTimer === 0) {
      player.speedBoostMultiplier = 1.0;
    }
  }
}
