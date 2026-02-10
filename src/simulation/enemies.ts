import type { GameState, EnemiesConfig, GunnerConfig } from './types.ts';
import { TICK_DURATION } from './types.ts';
import { normalize, circleCircle, circleAABB, clampToArena, dist } from './collision.ts';
import { rayIntersectsAABB } from './line-of-sight.ts';
import type { SeededRNG } from './rng.ts';

export function updateEnemies(state: GameState, _configs: EnemiesConfig, gunnerConfig: GunnerConfig | undefined, rng: SeededRNG): void {
  const detectionRange = state.extractionMap?.enemyDetectionRange ?? 20;
  const wanderSpeedMult = state.extractionMap?.wanderSpeedMultiplier ?? 0.3;

  for (const enemy of state.enemies) {
    // Tick down stun timer
    if (enemy.stunTimer > 0) {
      enemy.stunTimer--;
    }

    if (enemy.stunTimer <= 0) {
      // Check if wandering enemy should aggro
      if (enemy.aiState === 'wander') {
        const d = dist(enemy.pos, state.player.pos);
        if (enemy.visible && d <= detectionRange) {
          enemy.aiState = 'chase';
        }
      }

      if (enemy.aiState === 'wander') {
        updateWander(enemy, wanderSpeedMult, rng);
      } else if (enemy.type === 'gunner' && gunnerConfig) {
        updateGunner(state, enemy, gunnerConfig, rng);
      } else {
        // Sprinter: move toward player
        const dir = normalize({
          x: state.player.pos.x - enemy.pos.x,
          y: state.player.pos.y - enemy.pos.y,
        });

        enemy.pos.x += dir.x * enemy.speed * TICK_DURATION;
        enemy.pos.y += dir.y * enemy.speed * TICK_DURATION;
      }
    }

    // Apply knockback velocity
    enemy.pos.x += enemy.knockbackVel.x * TICK_DURATION;
    enemy.pos.y += enemy.knockbackVel.y * TICK_DURATION;

    // Decay knockback (friction)
    enemy.knockbackVel.x *= 0.85;
    enemy.knockbackVel.y *= 0.85;

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

function updateWander(enemy: GameState['enemies'][0], speedMult: number, rng: SeededRNG): void {
  // Initialize wander direction if needed
  if (!enemy.wanderDir || !enemy.wanderTimer || enemy.wanderTimer <= 0) {
    const angle = rng.next() * Math.PI * 2;
    enemy.wanderDir = { x: Math.cos(angle), y: Math.sin(angle) };
    enemy.wanderTimer = Math.floor(rng.range(60, 180)); // 1-3 seconds
  }

  enemy.wanderTimer--;

  const speed = enemy.speed * speedMult * TICK_DURATION;
  enemy.pos.x += enemy.wanderDir.x * speed;
  enemy.pos.y += enemy.wanderDir.y * speed;
}

function updateGunner(state: GameState, enemy: GameState['enemies'][0], cfg: GunnerConfig, rng: SeededRNG): void {
  const d = dist(enemy.pos, state.player.pos);
  const dir = normalize({
    x: state.player.pos.x - enemy.pos.x,
    y: state.player.pos.y - enemy.pos.y,
  });

  // Initialize AI fields if missing
  enemy.aiPhase ??= 'advance';
  enemy.aiTimer ??= 0;
  enemy.fireCooldown ??= 0;

  // Movement based on phase
  if (enemy.aiPhase === 'advance') {
    // Move toward player
    enemy.pos.x += dir.x * enemy.speed * TICK_DURATION;
    enemy.pos.y += dir.y * enemy.speed * TICK_DURATION;

    // Once within engage range, tick the phase timer
    if (d <= cfg.engageRange) {
      enemy.aiTimer++;
      if (enemy.aiTimer >= cfg.advanceDuration) {
        enemy.aiPhase = 'retreat';
        enemy.aiTimer = 0;
      }
    }
  } else {
    // Retreat: move away from player at reduced speed
    enemy.pos.x -= dir.x * enemy.speed * cfg.retreatSpeedMultiplier * TICK_DURATION;
    enemy.pos.y -= dir.y * enemy.speed * cfg.retreatSpeedMultiplier * TICK_DURATION;

    enemy.aiTimer++;
    if (enemy.aiTimer >= cfg.retreatDuration || d > cfg.retreatRange) {
      enemy.aiPhase = 'advance';
      enemy.aiTimer = 0;
    }
  }

  // Firing: in both phases, if within engage range and has line of sight
  enemy.fireCooldown--;
  const hasLOS = !state.obstacles.some(wall =>
    rayIntersectsAABB(enemy.pos, dir, d, wall)
  );
  if (d <= cfg.engageRange && enemy.fireCooldown <= 0 && hasLOS) {
    // Fire a projectile at the player with spread
    const baseAngle = Math.atan2(dir.y, dir.x);
    const angle = baseAngle + (rng.next() * 2 - 1) * cfg.spread;

    state.enemyProjectiles.push({
      id: state.nextEntityId++,
      pos: { x: enemy.pos.x, y: enemy.pos.y },
      vel: {
        x: Math.cos(angle) * cfg.projectileSpeed,
        y: Math.sin(angle) * cfg.projectileSpeed,
      },
      damage: cfg.projectileDamage,
      lifetime: cfg.projectileLifetime,
    });

    state.events.push({
      tick: state.tick,
      type: 'enemy_projectile_fired',
      data: { enemyId: enemy.id, x: enemy.pos.x, y: enemy.pos.y, angle },
    });

    enemy.fireCooldown = cfg.fireCooldownTicks;
  }
}

export function checkContactDamage(state: GameState, _configs: EnemiesConfig): void {
  if (state.player.dodgeTimer > 0) return;
  if (state.player.iframeTimer > 0) return;

  for (const enemy of state.enemies) {
    if (circleCircle(state.player.pos, state.player.radius, enemy.pos, enemy.radius)) {
      state.player.hp -= enemy.contactDamage;
      state.player.iframeTimer = state.player.iframeTimer || 60; // will be set from config in game.ts
      enemy.stunTimer = 30; // 0.5 seconds stun after hitting player

      state.events.push({
        tick: state.tick,
        type: 'player_hit',
        data: { enemyId: enemy.id, damage: enemy.contactDamage, remainingHp: state.player.hp, x: state.player.pos.x, y: state.player.pos.y },
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
