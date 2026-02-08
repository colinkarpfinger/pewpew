import type { GameState, InputState, WeaponsConfig, Projectile } from './types.ts';
import { TICK_RATE } from './types.ts';
import { circleCircle, circleAABB, isOutOfBounds, pointToLineDist } from './collision.ts';
import type { SeededRNG } from './rng.ts';

export function tryFire(state: GameState, input: InputState, weapons: WeaponsConfig, rng: SeededRNG): void {
  if (state.player.dodgeTimer > 0) return;
  if (!input.fire) return;
  if (state.player.fireCooldown > 0) return;

  const rifle = weapons.rifle;
  const cooldownTicks = Math.ceil(TICK_RATE / rifle.fireRate);
  state.player.fireCooldown = cooldownTicks;

  // Apply spread (wider when moving)
  const isMoving = input.moveDir.x !== 0 || input.moveDir.y !== 0;
  const effectiveSpread = rifle.spread * (isMoving ? rifle.movingSpreadMultiplier : 1.0);
  const baseAngle = Math.atan2(state.player.aimDir.y, state.player.aimDir.x);
  const angle = baseAngle + (rng.next() * 2 - 1) * effectiveSpread;

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
    penetrationLeft: rifle.penetration,
    hitEnemyIds: [],
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

    // Check vs enemies (with penetration)
    for (const enemy of state.enemies) {
      if (deadEnemies.has(enemy.id)) continue;
      if (proj.hitEnemyIds.includes(enemy.id)) continue;
      if (!circleCircle(proj.pos, 0.1, enemy.pos, enemy.radius)) continue;

      const isFirstHit = proj.hitEnemyIds.length === 0;
      let isHeadshot: boolean;

      if (isFirstHit) {
        // First hit: use cursor-based headshot targeting
        isHeadshot = proj.headshotTargetId === enemy.id;
      } else {
        // Penetration hit: check if bullet trajectory passes through head
        const headRadius = enemy.radius * 0.8;
        const perpDist = pointToLineDist(enemy.pos, proj.pos, proj.vel);
        isHeadshot = perpDist < headRadius;
      }

      const damage = isHeadshot
        ? proj.damage * weapons.rifle.headshotMultiplier
        : proj.damage;
      enemy.hp -= damage;

      proj.hitEnemyIds.push(enemy.id);
      proj.penetrationLeft--;

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

      // Penetration: only continue if player was aiming at a head
      if (isFirstHit && proj.headshotTargetId === null) {
        toRemove.add(proj.id);
        break;
      }

      // Stop if penetration limit reached
      if (proj.penetrationLeft <= 0) {
        toRemove.add(proj.id);
        break;
      }

      // Bullet continues — check more enemies this tick
    }
  }

  // Remove dead projectiles and enemies
  state.projectiles = state.projectiles.filter(p => !toRemove.has(p.id));
  state.enemies = state.enemies.filter(e => !deadEnemies.has(e.id));
}
