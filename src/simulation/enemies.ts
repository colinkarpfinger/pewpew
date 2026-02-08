import type { GameState, EnemiesConfig } from './types.ts';
import { TICK_DURATION } from './types.ts';
import { normalize, circleCircle, circleAABB, clampToArena } from './collision.ts';

export function updateEnemies(state: GameState, _configs: EnemiesConfig): void {
  for (const enemy of state.enemies) {
    // Move toward player
    const dir = normalize({
      x: state.player.pos.x - enemy.pos.x,
      y: state.player.pos.y - enemy.pos.y,
    });

    enemy.pos.x += dir.x * enemy.speed * TICK_DURATION;
    enemy.pos.y += dir.y * enemy.speed * TICK_DURATION;

    // Clamp to arena bounds
    enemy.pos = clampToArena(enemy.pos, enemy.radius, state.arena.width, state.arena.height);

    // Collide with obstacles
    for (const obs of state.obstacles) {
      const pushOut = circleAABB(enemy.pos, enemy.radius, obs);
      if (pushOut) {
        enemy.pos.x += pushOut.x;
        enemy.pos.y += pushOut.y;
      }
    }
  }
}

export function checkContactDamage(state: GameState, _configs: EnemiesConfig): void {
  if (state.player.dodgeTimer > 0) return;
  if (state.player.iframeTimer > 0) return;

  for (const enemy of state.enemies) {
    if (circleCircle(state.player.pos, state.player.radius, enemy.pos, enemy.radius)) {
      state.player.hp -= enemy.contactDamage;
      state.player.iframeTimer = state.player.iframeTimer || 60; // will be set from config in game.ts

      state.events.push({
        tick: state.tick,
        type: 'player_hit',
        data: { enemyId: enemy.id, damage: enemy.contactDamage, remainingHp: state.player.hp },
      });

      if (state.player.hp <= 0) {
        state.player.hp = 0;
        state.gameOver = true;
        state.events.push({
          tick: state.tick,
          type: 'player_death',
          data: { finalScore: state.score },
        });
      }

      // Only take damage from one enemy per tick
      return;
    }
  }
}
