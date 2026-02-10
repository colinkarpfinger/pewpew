import type { GameState, InputState, GrenadeConfig, Grenade } from './types.ts';
import { TICK_DURATION } from './types.ts';
import { circleAABB, normalize } from './collision.ts';

const OBSTACLE_HEIGHT = 1.5;
const BOUNCE_VEL_THRESHOLD = 1.5; // min vertical speed to emit ground bounce sound
const WALL_BOUNCE_THRESHOLD = 0.5; // min speed to emit wall/obstacle bounce sound

export function tryThrowGrenade(state: GameState, input: InputState, config: GrenadeConfig): void {
  if (state.player.dodgeTimer > 0) return;
  if (!input.throwGrenade) return;
  if (state.grenadeAmmo <= 0) return;

  state.grenadeAmmo--;

  // Interpolate launch speed based on charge power
  const launchSpeed = config.minSpeed + (config.maxSpeed - config.minSpeed) * input.throwPower;

  // 45-degree launch: split speed equally between horizontal and vertical
  const cos45 = Math.SQRT1_2;
  const horizontalSpeed = launchSpeed * cos45;
  const verticalSpeed = launchSpeed * cos45;

  const grenade: Grenade = {
    id: state.nextEntityId++,
    pos: { x: state.player.pos.x, y: state.player.pos.y },
    vel: {
      x: state.player.aimDir.x * horizontalSpeed,
      y: state.player.aimDir.y * horizontalSpeed,
    },
    height: 0.3, // thrown from roughly waist height
    verticalVel: verticalSpeed,
    fuseTimer: config.fuseTime,
  };

  state.grenades.push(grenade);
  state.events.push({
    tick: state.tick,
    type: 'grenade_thrown',
    data: { x: state.player.pos.x, y: state.player.pos.y },
  });
}

export function updateGrenades(state: GameState, config: GrenadeConfig): void {
  const toExplode: Grenade[] = [];

  for (const grenade of state.grenades) {
    const isOnGround = grenade.height <= 0 && Math.abs(grenade.verticalVel) < BOUNCE_VEL_THRESHOLD;

    // Ground friction only when rolling on the ground
    if (isOnGround) {
      grenade.vel.x *= config.groundFriction;
      grenade.vel.y *= config.groundFriction;
    }

    // Gravity
    grenade.verticalVel -= config.gravity * TICK_DURATION;

    // Move horizontally
    grenade.pos.x += grenade.vel.x * TICK_DURATION;
    grenade.pos.y += grenade.vel.y * TICK_DURATION;

    // Move vertically
    grenade.height += grenade.verticalVel * TICK_DURATION;

    // Ground bounce
    if (grenade.height <= 0) {
      grenade.height = 0;

      if (Math.abs(grenade.verticalVel) > BOUNCE_VEL_THRESHOLD) {
        // Significant impact — bounce and emit sound
        grenade.verticalVel = -grenade.verticalVel * config.bounceRestitution;
        // Reduce horizontal speed on ground impact too
        grenade.vel.x *= config.bounceRestitution;
        grenade.vel.y *= config.bounceRestitution;

        state.events.push({
          tick: state.tick,
          type: 'grenade_bounced',
          data: { x: grenade.pos.x, y: grenade.pos.y },
        });
      } else {
        // Tiny bounce — snap to ground
        grenade.verticalVel = 0;
      }
    }

    // Bounce off arena walls (always, regardless of height)
    const halfW = state.arena.width / 2;
    const halfH = state.arena.height / 2;

    if (grenade.pos.x - config.radius < -halfW) {
      grenade.pos.x = -halfW + config.radius;
      grenade.vel.x = Math.abs(grenade.vel.x) * config.bounceRestitution;
      if (Math.abs(grenade.vel.x) > WALL_BOUNCE_THRESHOLD) {
        state.events.push({ tick: state.tick, type: 'grenade_bounced', data: { x: grenade.pos.x, y: grenade.pos.y } });
      }
    } else if (grenade.pos.x + config.radius > halfW) {
      grenade.pos.x = halfW - config.radius;
      grenade.vel.x = -Math.abs(grenade.vel.x) * config.bounceRestitution;
      if (Math.abs(grenade.vel.x) > WALL_BOUNCE_THRESHOLD) {
        state.events.push({ tick: state.tick, type: 'grenade_bounced', data: { x: grenade.pos.x, y: grenade.pos.y } });
      }
    }

    if (grenade.pos.y - config.radius < -halfH) {
      grenade.pos.y = -halfH + config.radius;
      grenade.vel.y = Math.abs(grenade.vel.y) * config.bounceRestitution;
      if (Math.abs(grenade.vel.y) > WALL_BOUNCE_THRESHOLD) {
        state.events.push({ tick: state.tick, type: 'grenade_bounced', data: { x: grenade.pos.x, y: grenade.pos.y } });
      }
    } else if (grenade.pos.y + config.radius > halfH) {
      grenade.pos.y = halfH - config.radius;
      grenade.vel.y = -Math.abs(grenade.vel.y) * config.bounceRestitution;
      if (Math.abs(grenade.vel.y) > WALL_BOUNCE_THRESHOLD) {
        state.events.push({ tick: state.tick, type: 'grenade_bounced', data: { x: grenade.pos.x, y: grenade.pos.y } });
      }
    }

    // Bounce off obstacles (only when below obstacle height — flies over them otherwise)
    if (grenade.height < OBSTACLE_HEIGHT) {
      for (const obs of state.obstacles) {
        const pushOut = circleAABB(grenade.pos, config.radius, obs);
        if (pushOut) {
          grenade.pos.x += pushOut.x;
          grenade.pos.y += pushOut.y;

          // Reflect velocity along push-out normal
          const len = Math.sqrt(pushOut.x * pushOut.x + pushOut.y * pushOut.y);
          if (len > 0) {
            const nx = pushOut.x / len;
            const ny = pushOut.y / len;
            const dot = grenade.vel.x * nx + grenade.vel.y * ny;
            // Proper reflection with restitution on normal component only
            grenade.vel.x -= (1 + config.bounceRestitution) * dot * nx;
            grenade.vel.y -= (1 + config.bounceRestitution) * dot * ny;
          }

          const speed = Math.sqrt(grenade.vel.x * grenade.vel.x + grenade.vel.y * grenade.vel.y);
          if (speed > WALL_BOUNCE_THRESHOLD) {
            state.events.push({ tick: state.tick, type: 'grenade_bounced', data: { x: grenade.pos.x, y: grenade.pos.y } });
          }
        }
      }
    }

    // Decrement fuse
    grenade.fuseTimer--;
    if (grenade.fuseTimer <= 0) {
      toExplode.push(grenade);
    }
  }

  // Process explosions
  for (const grenade of toExplode) {
    explodeGrenade(state, grenade, config);
  }

  // Remove exploded grenades
  if (toExplode.length > 0) {
    const explodedIds = new Set(toExplode.map(g => g.id));
    state.grenades = state.grenades.filter(g => !explodedIds.has(g.id));
  }
}

function explodeGrenade(state: GameState, grenade: Grenade, config: GrenadeConfig): void {
  const deadEnemies = new Set<number>();

  for (const enemy of state.enemies) {
    const dx = enemy.pos.x - grenade.pos.x;
    const dy = enemy.pos.y - grenade.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Damage with distance falloff
    if (dist < config.damageRadius) {
      const falloff = 1 - (dist / config.damageRadius);
      const damage = config.damage * falloff;
      enemy.hp -= damage;

      state.events.push({
        tick: state.tick,
        type: 'enemy_hit',
        data: { enemyId: enemy.id, damage, headshot: false, remainingHp: enemy.hp, x: enemy.pos.x, y: enemy.pos.y },
      });

      if (enemy.hp <= 0) {
        deadEnemies.add(enemy.id);
        state.score += enemy.scoreValue;
        state.events.push({
          tick: state.tick,
          type: 'enemy_killed',
          data: { enemyId: enemy.id, enemyType: enemy.type, scoreValue: enemy.scoreValue, x: enemy.pos.x, y: enemy.pos.y, headshot: false, bulletKillCount: 0 },
        });
      }
    }

    // Knockback (larger radius)
    if (dist > 0 && dist < config.knockbackRadius) {
      const dir = normalize({ x: dx, y: dy });
      const knockFalloff = 1 - (dist / config.knockbackRadius);
      enemy.knockbackVel.x += dir.x * config.knockbackForce * knockFalloff;
      enemy.knockbackVel.y += dir.y * config.knockbackForce * knockFalloff;
    }
  }

  // Remove dead enemies
  if (deadEnemies.size > 0) {
    state.enemies = state.enemies.filter(e => !deadEnemies.has(e.id));
  }

  // Player self-damage (respects dodge and iframes)
  if (state.player.dodgeTimer === 0 && state.player.iframeTimer === 0) {
    const pdx = state.player.pos.x - grenade.pos.x;
    const pdy = state.player.pos.y - grenade.pos.y;
    const playerDist = Math.sqrt(pdx * pdx + pdy * pdy);

    if (playerDist < config.damageRadius) {
      const falloff = 1 - (playerDist / config.damageRadius);
      const damage = config.damage * falloff * config.selfDamageMultiplier * (1 - state.player.armorDamageReduction);
      state.player.hp -= damage;

      state.events.push({
        tick: state.tick,
        type: 'player_hit',
        data: { damage, remainingHp: state.player.hp, x: state.player.pos.x, y: state.player.pos.y, selfDamage: true },
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
    }
  }

  state.events.push({
    tick: state.tick,
    type: 'grenade_exploded',
    data: { x: grenade.pos.x, y: grenade.pos.y, radius: config.damageRadius, killCount: deadEnemies.size },
  });
}
