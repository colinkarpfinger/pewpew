import type { GameState, InputState, WeaponsConfig, Projectile } from './types.ts';
import { TICK_RATE } from './types.ts';
import { circleCircle, circleAABB, isOutOfBounds } from './collision.ts';
import type { SeededRNG } from './rng.ts';

export function tryFire(state: GameState, input: InputState, weapons: WeaponsConfig, rng: SeededRNG): void {
  if (!input.fire) return;
  if (state.player.fireCooldown > 0) return;

  const rifle = weapons.rifle;
  const cooldownTicks = Math.ceil(TICK_RATE / rifle.fireRate);
  state.player.fireCooldown = cooldownTicks;

  // Apply spread
  const baseAngle = Math.atan2(state.player.aimDir.y, state.player.aimDir.x);
  const angle = baseAngle + (rng.next() * 2 - 1) * rifle.spread;

  const projectile: Projectile = {
    id: state.nextEntityId++,
    pos: { x: state.player.pos.x, y: state.player.pos.y },
    vel: {
      x: Math.cos(angle) * rifle.projectileSpeed,
      y: Math.sin(angle) * rifle.projectileSpeed,
    },
    damage: rifle.damage,
    lifetime: rifle.projectileLifetime,
    headshotTargetId: input.headshotTargetId,
  };

  state.projectiles.push(projectile);
  state.events.push({
    tick: state.tick,
    type: 'projectile_fired',
    data: { projectileId: projectile.id },
  });
}

export function updateProjectiles(state: GameState): void {
  const dt = 1 / TICK_RATE;

  for (const proj of state.projectiles) {
    proj.pos.x += proj.vel.x * dt;
    proj.pos.y += proj.vel.y * dt;
    proj.lifetime--;
  }

  // Remove expired
  state.projectiles = state.projectiles.filter(p => p.lifetime > 0);
}

export function checkProjectileCollisions(state: GameState, weapons: WeaponsConfig): void {
  const toRemove = new Set<number>();
  const deadEnemies = new Set<number>();

  for (const proj of state.projectiles) {
    if (toRemove.has(proj.id)) continue;

    // Check vs arena bounds
    if (isOutOfBounds(proj.pos, 0.1, state.arena.width, state.arena.height)) {
      toRemove.add(proj.id);
      state.events.push({
        tick: state.tick,
        type: 'projectile_destroyed',
        data: { projectileId: proj.id, reason: 'wall' },
      });
      continue;
    }

    // Check vs obstacles
    let hitObstacle = false;
    for (const obs of state.obstacles) {
      if (circleAABB(proj.pos, 0.1, obs)) {
        toRemove.add(proj.id);
        state.events.push({
          tick: state.tick,
          type: 'projectile_destroyed',
          data: { projectileId: proj.id, reason: 'obstacle' },
        });
        hitObstacle = true;
        break;
      }
    }
    if (hitObstacle) continue;

    // Check vs enemies
    for (const enemy of state.enemies) {
      if (deadEnemies.has(enemy.id)) continue;
      if (circleCircle(proj.pos, 0.1, enemy.pos, enemy.radius)) {
        toRemove.add(proj.id);
        const isHeadshot = proj.headshotTargetId === enemy.id;
        const damage = isHeadshot
          ? proj.damage * weapons.rifle.headshotMultiplier
          : proj.damage;
        enemy.hp -= damage;

        state.events.push({
          tick: state.tick,
          type: 'enemy_hit',
          data: { enemyId: enemy.id, damage, headshot: isHeadshot, remainingHp: enemy.hp },
        });

        if (enemy.hp <= 0) {
          deadEnemies.add(enemy.id);
          state.score += enemy.scoreValue;
          state.events.push({
            tick: state.tick,
            type: 'enemy_killed',
            data: { enemyId: enemy.id, scoreValue: enemy.scoreValue },
          });
        }
        break;
      }
    }
  }

  // Remove dead projectiles and enemies
  state.projectiles = state.projectiles.filter(p => !toRemove.has(p.id));
  state.enemies = state.enemies.filter(e => !deadEnemies.has(e.id));
}
