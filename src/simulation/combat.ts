import type { GameState, InputState, WeaponsConfig, WeaponConfig, Projectile, PlayerConfig, EnemiesConfig } from './types.ts';
import { TICK_RATE } from './types.ts';
import { circleCircle, circleAABB, isOutOfBounds, pointToLineDist, normalize } from './collision.ts';
import type { SeededRNG } from './rng.ts';
import { interruptHeal } from './bandage.ts';

const ENEMY_PROJ_RADIUS = 0.15;

function getWeapon(state: GameState, weapons: WeaponsConfig): WeaponConfig {
  return weapons[state.player.activeWeapon];
}

export function tryFire(state: GameState, input: InputState, weapons: WeaponsConfig, rng: SeededRNG): void {
  if (state.player.dodgeTimer > 0) return;
  if (state.player.healTimer > 0) return; // can't fire while healing
  if (!input.fire) return;
  if (state.player.fireCooldown > 0) return;
  if (state.player.reloadTimer > 0) return; // can't fire while reloading
  if (state.player.ammo <= 0) return; // no ammo

  const weapon = getWeapon(state, weapons);
  const cooldownTicks = Math.ceil(TICK_RATE / weapon.fireRate);
  state.player.fireCooldown = cooldownTicks;
  state.player.ammo--;

  const isMoving = input.moveDir.x !== 0 || input.moveDir.y !== 0;
  const effectiveSpread = weapon.spread * (isMoving ? weapon.movingSpreadMultiplier : 1.0);
  const baseAngle = Math.atan2(state.player.aimDir.y, state.player.aimDir.x);

  const pelletCount = weapon.pelletsPerShot ?? 1;
  for (let i = 0; i < pelletCount; i++) {
    const angle = baseAngle + (rng.next() * 2 - 1) * effectiveSpread;

    const projectile: Projectile = {
      id: state.nextEntityId++,
      pos: { x: state.player.pos.x, y: state.player.pos.y },
      vel: {
        x: Math.cos(angle) * weapon.projectileSpeed,
        y: Math.sin(angle) * weapon.projectileSpeed,
      },
      damage: weapon.damage * state.player.damageBonusMultiplier,
      lifetime: weapon.projectileLifetime,
      headshotTargetId: input.headshotTargetId,
      penetrationLeft: weapon.penetration,
      hitEnemyIds: [],
      killCount: 0,
      weaponType: state.player.activeWeapon,
    };

    state.projectiles.push(projectile);
    state.events.push({
      tick: state.tick,
      type: 'projectile_fired',
      data: { projectileId: projectile.id, x: state.player.pos.x, y: state.player.pos.y, angle },
    });
  }

  // Auto-reload when magazine is empty
  if (state.player.ammo <= 0) {
    startReload(state, weapons);
  }
}

function startReload(state: GameState, weapons: WeaponsConfig): void {
  if (state.player.reloadTimer > 0) return; // already reloading
  const weapon = getWeapon(state, weapons);
  if (state.player.ammo >= weapon.magazineSize) return; // full mag
  state.player.reloadTimer = 1;
  state.player.reloadFumbled = false;
  state.player.damageBonusMultiplier = 1.0; // reset bonus on reload start
  state.events.push({
    tick: state.tick,
    type: 'reload_start',
    data: {},
  });
}

function completeReload(state: GameState, weapons: WeaponsConfig, reloadType: 'normal' | 'active' | 'perfect'): void {
  const weapon = getWeapon(state, weapons);
  state.player.ammo = weapon.magazineSize;
  state.player.reloadTimer = 0;
  state.player.reloadFumbled = false;

  if (reloadType === 'perfect') {
    state.player.damageBonusMultiplier = weapon.perfectReloadDamageBonus;
  } else if (reloadType === 'active') {
    state.player.damageBonusMultiplier = weapon.activeReloadDamageBonus;
  }

  state.events.push({
    tick: state.tick,
    type: 'reload_complete',
    data: { reloadType },
  });
}

export function updateReload(state: GameState, input: InputState, weapons: WeaponsConfig): void {
  const weapon = getWeapon(state, weapons);

  // R pressed while not reloading: start manual reload (cancel heal if active)
  if (input.reload && state.player.reloadTimer === 0) {
    if (state.player.healTimer > 0) {
      interruptHeal(state);
    }
    startReload(state, weapons);
    return;
  }

  // Can't advance reload while healing
  if (state.player.healTimer > 0) return;

  // Not reloading — nothing to do
  if (state.player.reloadTimer === 0) return;

  const progress = state.player.reloadTimer / weapon.reloadTime;

  // R pressed during reload: attempt active reload (ignored if already fumbled)
  if (input.reload && !state.player.reloadFumbled) {
    if (progress >= weapon.perfectReloadStart && progress <= weapon.perfectReloadEnd) {
      completeReload(state, weapons, 'perfect');
      return;
    } else if (progress >= weapon.activeReloadStart && progress <= weapon.activeReloadEnd) {
      completeReload(state, weapons, 'active');
      return;
    }
    // Missed the window — lock out further attempts for this reload cycle
    state.player.reloadFumbled = true;
    state.events.push({
      tick: state.tick,
      type: 'reload_fumbled',
      data: {},
    });
  }

  // Advance reload timer
  state.player.reloadTimer++;

  // Reload finished naturally
  if (state.player.reloadTimer > weapon.reloadTime) {
    completeReload(state, weapons, 'normal');
  }
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

export function checkProjectileCollisions(state: GameState, weapons: WeaponsConfig, enemiesConfig?: EnemiesConfig): void {
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
        data: { projectileId: proj.id, reason: 'wall', x: proj.pos.x, y: proj.pos.y },
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
          data: { projectileId: proj.id, reason: 'obstacle', x: proj.pos.x, y: proj.pos.y },
        });
        hitObstacle = true;
        break;
      }
    }
    if (hitObstacle) continue;

    // Look up the weapon config for this projectile's weapon type
    const projWeapon = weapons[proj.weaponType];

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

      let damage = isHeadshot
        ? proj.damage * projWeapon.headshotMultiplier
        : proj.damage;

      // Enemy armor: reduce body shot damage
      if (enemy.hasArmor && !isHeadshot && enemiesConfig?.armorDamageReduction) {
        damage *= (1 - enemiesConfig.armorDamageReduction);
      }
      // Enemy helmet: reduce headshot multiplier effectiveness
      if (enemy.hasHelmet && isHeadshot && enemiesConfig?.helmetHeadshotReduction) {
        // Recalculate with reduced headshot multiplier
        const reducedMultiplier = projWeapon.headshotMultiplier * enemiesConfig.helmetHeadshotReduction;
        damage = proj.damage * reducedMultiplier;
      }

      enemy.hp -= damage;

      // Apply knockback along bullet direction
      const knockDir = normalize(proj.vel);
      const knockSpeed = projWeapon.knockback * (isHeadshot ? projWeapon.headshotKnockbackMultiplier : 1);
      enemy.knockbackVel.x += knockDir.x * knockSpeed;
      enemy.knockbackVel.y += knockDir.y * knockSpeed;

      proj.hitEnemyIds.push(enemy.id);
      proj.penetrationLeft--;

      state.events.push({
        tick: state.tick,
        type: 'enemy_hit',
        data: { enemyId: enemy.id, damage, headshot: isHeadshot, remainingHp: enemy.hp, x: proj.pos.x, y: proj.pos.y, isFirstHit },
      });

      if (enemy.hp <= 0) {
        deadEnemies.add(enemy.id);
        state.score += enemy.scoreValue;
        proj.killCount++;
        state.events.push({
          tick: state.tick,
          type: 'enemy_killed',
          data: { enemyId: enemy.id, enemyType: enemy.type, scoreValue: enemy.scoreValue, x: enemy.pos.x, y: enemy.pos.y, headshot: isHeadshot, bulletKillCount: proj.killCount },
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

export function updateEnemyProjectiles(state: GameState): void {
  const dt = 1 / TICK_RATE;

  for (const proj of state.enemyProjectiles) {
    proj.pos.x += proj.vel.x * dt;
    proj.pos.y += proj.vel.y * dt;
    proj.lifetime--;
  }

  // Remove expired or out-of-bounds
  state.enemyProjectiles = state.enemyProjectiles.filter(p => {
    if (p.lifetime <= 0) return false;
    if (isOutOfBounds(p.pos, ENEMY_PROJ_RADIUS, state.arena.width, state.arena.height)) return false;
    // Check obstacle collision
    for (const obs of state.obstacles) {
      if (circleAABB(p.pos, ENEMY_PROJ_RADIUS, obs)) return false;
    }
    return true;
  });
}

export function checkEnemyProjectileHits(state: GameState, playerConfig: PlayerConfig): void {
  if (state.player.dodgeTimer > 0) return;
  if (state.player.iframeTimer > 0) return;

  for (let i = state.enemyProjectiles.length - 1; i >= 0; i--) {
    const proj = state.enemyProjectiles[i];
    if (circleCircle(proj.pos, ENEMY_PROJ_RADIUS, state.player.pos, state.player.radius)) {
      const rawDamage = proj.damage;
      const damage = rawDamage * (1 - state.player.armorDamageReduction);
      state.player.hp -= damage;

      // Degrade player armor HP
      if (state.player.armorHp > 0 && state.player.armorDamageReduction > 0) {
        const absorbed = rawDamage - damage;
        state.player.armorHp = Math.max(0, state.player.armorHp - absorbed);
        if (state.player.armorHp <= 0) {
          state.player.armorDamageReduction = 0;
          state.events.push({ tick: state.tick, type: 'armor_broken', data: {} });
        }
      }

      state.player.iframeTimer = playerConfig.iframeDuration;
      interruptHeal(state);

      state.events.push({
        tick: state.tick,
        type: 'player_hit',
        data: { damage, remainingHp: state.player.hp, x: state.player.pos.x, y: state.player.pos.y, source: 'projectile' },
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

      state.enemyProjectiles.splice(i, 1);
      // Only take one projectile hit per tick
      return;
    }
  }
}
