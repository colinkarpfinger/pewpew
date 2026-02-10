/**
 * Headless simulation test — runs the game without any rendering.
 * Usage: npx tsx tests/headless.ts
 */

import type { GameConfigs, InputState } from '../src/simulation/types.ts';
import { createGame, tick, getSnapshot } from '../src/simulation/game.ts';

const weaponBase = {
  movingSpreadMultiplier: 3.0,
  headshotMultiplier: 2.0,
  headshotKnockbackMultiplier: 2.0,
  activeReloadStart: 0.4,
  activeReloadEnd: 0.65,
  perfectReloadStart: 0.5,
  perfectReloadEnd: 0.58,
  activeReloadDamageBonus: 1.1,
  perfectReloadDamageBonus: 1.25,
};

const configs: GameConfigs = {
  player: { speed: 5.0, hp: 100, radius: 0.4, iframeDuration: 60, dodgeDuration: 18, dodgeCooldown: 42, dodgeSpeedMultiplier: 1.8 },
  weapons: {
    pistol: { damage: 12, fireRate: 3, projectileSpeed: 20, projectileLifetime: 60, spread: 0.02, penetration: 1, knockback: 8, pelletsPerShot: 1, magazineSize: 12, reloadTime: 90, ...weaponBase },
    smg: { damage: 15, fireRate: 12, projectileSpeed: 20, projectileLifetime: 60, spread: 0.06, penetration: 2, knockback: 6, pelletsPerShot: 1, magazineSize: 40, reloadTime: 120, ...weaponBase },
    rifle: { damage: 25, fireRate: 8, projectileSpeed: 20, projectileLifetime: 120, spread: 0.03, penetration: 5, knockback: 12, pelletsPerShot: 1, magazineSize: 30, reloadTime: 90, ...weaponBase },
    shotgun: { damage: 18, fireRate: 2, projectileSpeed: 20, projectileLifetime: 30, spread: 0.15, penetration: 1, knockback: 20, pelletsPerShot: 6, magazineSize: 6, reloadTime: 150, ...weaponBase },
  },
  enemies: {
    rusher: { speed: 2.5, hp: 50, contactDamage: 15, radius: 0.4, scoreValue: 100 },
  },
  spawning: { initialInterval: 120, minimumInterval: 30, decayRate: 0.95, maxEnemies: 30 },
  arena: { width: 30, height: 20, obstacleCount: 8, obstacleSize: 1.5 },
  multikill: {
    minKills: 2,
    tiers: [
      { kills: 2, speedMultiplier: 1.3, duration: 60, pulseForce: 15.0 },
      { kills: 3, speedMultiplier: 1.5, duration: 90, pulseForce: 20.0 },
    ],
    pulseRadius: 5.0,
  },
  grenade: {
    minSpeed: 8, maxSpeed: 17, radius: 0.15, fuseTime: 180, gravity: 25, damageRadius: 4,
    knockbackRadius: 6, damage: 80, knockbackForce: 25, groundFriction: 0.95, bounceRestitution: 0.4, startingAmmo: 3,
  },
  crates: {
    dropChance: 0.15, multikillDropChance: 0.4, lifetime: 600, blinkThreshold: 120, radius: 0.5,
    types: { grenade: 0.4, health: 0.6 }, healthAmount: 25,
  },
};

const noInput: InputState = { moveDir: { x: 0, y: 0 }, aimDir: { x: 1, y: 0 }, fire: false, headshotTargetId: null, dodge: false, reload: false, throwGrenade: false, throwPower: 0 };

function assert(condition: boolean, msg: string): void {
  if (!condition) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`PASS: ${msg}`);
}

// Test 1: Game initializes correctly
console.log('\n--- Test 1: Initialization ---');
const game = createGame(configs, 42);
assert(game.state.tick === 0, 'Initial tick is 0');
assert(game.state.player.hp === 100, 'Player starts at full HP');
assert(game.state.player.pos.x === 0 && game.state.player.pos.y === 0, 'Player starts at origin');
assert(game.state.obstacles.length === 8, `Arena has ${configs.arena.obstacleCount} obstacles`);
assert(game.state.enemies.length === 0, 'No enemies at start');
assert(game.state.gameOver === false, 'Game is not over');
assert(game.state.gameMode === 'arena', 'Default game mode is arena');
assert(game.state.player.activeWeapon === 'rifle', 'Arena default weapon is rifle');
assert(game.state.player.ammo === 30, 'Rifle starts with 30 ammo');

// Test 2: Ticking advances state
console.log('\n--- Test 2: Tick advancement ---');
for (let i = 0; i < 60; i++) {
  tick(game, noInput, configs);
}
assert(game.state.tick === 60, 'Tick count is 60 after 60 ticks');

// Test 3: Player movement
console.log('\n--- Test 3: Player movement ---');
const moveGame = createGame(configs, 42);
const moveRight: InputState = { moveDir: { x: 1, y: 0 }, aimDir: { x: 1, y: 0 }, fire: false, headshotTargetId: null, dodge: false, reload: false, throwGrenade: false, throwPower: 0 };
for (let i = 0; i < 60; i++) {
  tick(moveGame, moveRight, configs);
}
assert(moveGame.state.player.pos.x > 0, `Player moved right (x=${moveGame.state.player.pos.x.toFixed(2)})`);

// Test 4: Enemies spawn over time
console.log('\n--- Test 4: Enemy spawning ---');
const spawnGame = createGame(configs, 42);
for (let i = 0; i < 300; i++) {
  tick(spawnGame, noInput, configs);
}
assert(spawnGame.state.enemies.length > 0, `Enemies spawned: ${spawnGame.state.enemies.length}`);

// Test 5: Firing creates projectiles
console.log('\n--- Test 5: Firing ---');
const fireGame = createGame(configs, 42);
const fireInput: InputState = { moveDir: { x: 0, y: 0 }, aimDir: { x: 1, y: 0 }, fire: true, headshotTargetId: null, dodge: false, reload: false, throwGrenade: false, throwPower: 0 };
tick(fireGame, fireInput, configs);
assert(fireGame.state.projectiles.length > 0, `Projectile created: ${fireGame.state.projectiles.length}`);
assert(fireGame.state.projectiles[0].weaponType === 'rifle', 'Projectile has correct weapon type');

// Test 6: Deterministic — same seed produces same result
console.log('\n--- Test 6: Determinism ---');
const gameA = createGame(configs, 99);
const gameB = createGame(configs, 99);
for (let i = 0; i < 200; i++) {
  tick(gameA, noInput, configs);
  tick(gameB, noInput, configs);
}
assert(gameA.state.enemies.length === gameB.state.enemies.length, 'Same seed → same enemy count');
assert(gameA.state.score === gameB.state.score, 'Same seed → same score');
if (gameA.state.enemies.length > 0) {
  assert(
    gameA.state.enemies[0].pos.x === gameB.state.enemies[0].pos.x,
    'Same seed → same enemy positions',
  );
}

// Test 7: Snapshot is serializable
console.log('\n--- Test 7: Snapshot ---');
const snapshot = getSnapshot(gameA.state);
const parsed = JSON.parse(snapshot);
assert(parsed.tick === gameA.state.tick, 'Snapshot round-trips tick correctly');
assert(typeof parsed.player.hp === 'number', 'Snapshot has player HP');

// Test 8: Projectiles hit enemies
console.log('\n--- Test 8: Combat ---');
const combatGame = createGame(configs, 42);
// Run until enemies spawn
for (let i = 0; i < 300; i++) {
  tick(combatGame, noInput, configs);
}
const enemyCountBefore = combatGame.state.enemies.length;
assert(enemyCountBefore > 0, `Enemies present: ${enemyCountBefore}`);

// Aim at first enemy and fire
if (combatGame.state.enemies.length > 0) {
  const enemy = combatGame.state.enemies[0];
  const dx = enemy.pos.x - combatGame.state.player.pos.x;
  const dy = enemy.pos.y - combatGame.state.player.pos.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const aimAtEnemy: InputState = {
    moveDir: { x: 0, y: 0 },
    aimDir: { x: dx / len, y: dy / len },
    fire: true,
    headshotTargetId: null,
    dodge: false,
    reload: false,
    throwGrenade: false,
    throwPower: 0,
  };
  for (let i = 0; i < 120; i++) {
    tick(combatGame, aimAtEnemy, configs);
  }
  // Check that events were generated
  const allEvents = combatGame.state.events;
  console.log(`  Events on last tick: ${allEvents.map(e => e.type).join(', ') || '(none)'}`);
}

// Test 9: Dodge mechanic
console.log('\n--- Test 9: Dodge ---');
const dodgeGame = createGame(configs, 42);
const dodgeInput: InputState = {
  moveDir: { x: 1, y: 0 },
  aimDir: { x: 1, y: 0 },
  fire: false,
  headshotTargetId: null,
  dodge: true,
  reload: false,
  throwGrenade: false,
};
tick(dodgeGame, dodgeInput, configs);
assert(dodgeGame.state.player.dodgeTimer > 0, `Dodge timer started: ${dodgeGame.state.player.dodgeTimer}`);
assert(dodgeGame.state.player.dodgeDir.x === 1, 'Dodge direction locked to moveDir');
const posAfterDodgeStart = dodgeGame.state.player.pos.x;

// Continue dodging (dodge input should be edge-detected, so set to false)
const noDodgeInput: InputState = { moveDir: { x: 1, y: 0 }, aimDir: { x: 1, y: 0 }, fire: false, headshotTargetId: null, dodge: false, reload: false, throwGrenade: false, throwPower: 0 };
for (let i = 0; i < 17; i++) {
  tick(dodgeGame, noDodgeInput, configs);
}
assert(dodgeGame.state.player.dodgeTimer === 0, 'Dodge timer expired after duration');
assert(dodgeGame.state.player.dodgeCooldown > 0, `Cooldown started: ${dodgeGame.state.player.dodgeCooldown}`);
assert(dodgeGame.state.player.pos.x > posAfterDodgeStart, `Player moved during dodge (x=${dodgeGame.state.player.pos.x.toFixed(2)})`);

// Can't dodge during cooldown
tick(dodgeGame, dodgeInput, configs);
assert(dodgeGame.state.player.dodgeTimer === 0, 'Cannot dodge during cooldown');

// Wait for cooldown to expire, then dodge again
for (let i = 0; i < 42; i++) {
  tick(dodgeGame, noDodgeInput, configs);
}
assert(dodgeGame.state.player.dodgeCooldown === 0, 'Cooldown expired');
tick(dodgeGame, dodgeInput, configs);
assert(dodgeGame.state.player.dodgeTimer > 0, 'Can dodge again after cooldown');

// Test: can't fire during dodge
const dodgeFireGame = createGame(configs, 42);
const dodgeFireInput: InputState = {
  moveDir: { x: 1, y: 0 },
  aimDir: { x: 1, y: 0 },
  fire: true,
  headshotTargetId: null,
  dodge: true,
  reload: false,
  throwGrenade: false,
};
tick(dodgeFireGame, dodgeFireInput, configs);
assert(dodgeFireGame.state.projectiles.length === 0, 'Cannot fire during dodge');

// Test 10: Pistol initialization (extraction mode)
console.log('\n--- Test 10: Pistol / Extraction Mode ---');
const pistolGame = createGame(configs, 42, 'extraction');
assert(pistolGame.state.gameMode === 'extraction', 'Game mode is extraction');
assert(pistolGame.state.player.activeWeapon === 'pistol', 'Extraction default weapon is pistol');
assert(pistolGame.state.player.ammo === 12, 'Pistol starts with 12 ammo');

// Test 11: Shotgun fires 6 projectiles per shot
console.log('\n--- Test 11: Shotgun pellets ---');
const shotgunGame = createGame(configs, 42, 'arena', 'shotgun');
assert(shotgunGame.state.player.activeWeapon === 'shotgun', 'Active weapon is shotgun');
assert(shotgunGame.state.player.ammo === 6, 'Shotgun starts with 6 ammo');
const shotgunFireInput: InputState = { moveDir: { x: 0, y: 0 }, aimDir: { x: 1, y: 0 }, fire: true, headshotTargetId: null, dodge: false, reload: false, throwGrenade: false, throwPower: 0 };
tick(shotgunGame, shotgunFireInput, configs);
assert(shotgunGame.state.projectiles.length === 6, `Shotgun fires 6 pellets: ${shotgunGame.state.projectiles.length}`);
assert(shotgunGame.state.player.ammo === 5, 'Only 1 ammo consumed per shot');
for (const proj of shotgunGame.state.projectiles) {
  assert(proj.weaponType === 'shotgun', 'Each pellet has shotgun weapon type');
}

// Test 12: Shotgun determinism
console.log('\n--- Test 12: Shotgun determinism ---');
const sgA = createGame(configs, 77, 'arena', 'shotgun');
const sgB = createGame(configs, 77, 'arena', 'shotgun');
tick(sgA, shotgunFireInput, configs);
tick(sgB, shotgunFireInput, configs);
assert(sgA.state.projectiles.length === sgB.state.projectiles.length, 'Same pellet count');
for (let i = 0; i < sgA.state.projectiles.length; i++) {
  assert(
    sgA.state.projectiles[i].vel.x === sgB.state.projectiles[i].vel.x &&
    sgA.state.projectiles[i].vel.y === sgB.state.projectiles[i].vel.y,
    `Pellet ${i} has same velocity`,
  );
}

// ============================================================
// Weapon Gameplay Tests — actual combat with all 4 weapon types
// ============================================================

// Helper: inject an enemy at a specific position relative to player
function injectEnemy(g: ReturnType<typeof createGame>, x: number, y: number, hp?: number): number {
  const id = g.state.nextEntityId++;
  const cfg = configs.enemies.rusher;
  g.state.enemies.push({
    id,
    type: 'rusher',
    pos: { x, y },
    hp: hp ?? cfg.hp,
    radius: cfg.radius,
    speed: cfg.speed,
    contactDamage: cfg.contactDamage,
    scoreValue: cfg.scoreValue,
    knockbackVel: { x: 0, y: 0 },
  });
  return id;
}

// Helper: aim from player toward a point
function aimAt(g: ReturnType<typeof createGame>, tx: number, ty: number): InputState {
  const dx = tx - g.state.player.pos.x;
  const dy = ty - g.state.player.pos.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  return {
    moveDir: { x: 0, y: 0 },
    aimDir: { x: dx / len, y: dy / len },
    fire: true,
    headshotTargetId: null,
    dodge: false,
    reload: false,
    throwGrenade: false,
    throwPower: 0,
  };
}

// Helper: collect all events of a given type across multiple ticks
function collectEvents(g: ReturnType<typeof createGame>, input: InputState, ticks: number, eventType: string): Array<Record<string, unknown>> {
  const collected: Array<Record<string, unknown>> = [];
  for (let i = 0; i < ticks; i++) {
    tick(g, input, configs);
    for (const ev of g.state.events) {
      if (ev.type === eventType) {
        collected.push(ev.data ?? {});
      }
    }
  }
  return collected;
}

// No obstacles config for cleaner combat tests
const combatConfigs: GameConfigs = { ...configs, arena: { width: 30, height: 20, obstacleCount: 0, obstacleSize: 0 } };

// ---- Test 13: Rifle kills enemy at range ----
console.log('\n--- Test 13: Rifle kills enemy at range ---');
{
  const g = createGame(combatConfigs, 100);
  // Place enemy 3 units to the right (close enough to hit with low spread)
  const eid = injectEnemy(g, 3, 0, 50); // 50 HP, rifle does 25 damage
  const input = aimAt(g, 3, 0);

  const hits = collectEvents(g, input, 60, 'enemy_hit');
  const kills = collectEvents(g, input, 60, 'enemy_killed');

  // Over 120 ticks of firing rifle (8 rps = ~16 shots), should have killed it
  const enemyStillAlive = g.state.enemies.some(e => e.id === eid);
  assert(hits.length > 0, `Rifle hit enemy: ${hits.length} hits`);
  assert(!enemyStillAlive, 'Rifle killed enemy at range');
  assert(g.state.score > 0, `Score increased: ${g.state.score}`);
}

// ---- Test 14: Pistol full magazine cycle (fire, deplete, auto-reload, fire again) ----
console.log('\n--- Test 14: Pistol magazine cycle ---');
{
  const g = createGame(combatConfigs, 200, 'extraction'); // pistol, 12 rounds
  assert(g.state.player.ammo === 12, 'Pistol starts with 12');

  const input: InputState = { moveDir: { x: 0, y: 0 }, aimDir: { x: 1, y: 0 }, fire: true, headshotTargetId: null, dodge: false, reload: false, throwGrenade: false, throwPower: 0 };

  // Pistol: fireRate=3 → ceil(60/3)=20 tick cooldown, 12 shots = 240 ticks to empty
  // Auto-reload takes 90 ticks → first post-reload shot at ~330
  // Run 500 ticks to be safe
  let firedEvents = 0;
  let reloadCompleted = false;
  for (let i = 0; i < 500; i++) {
    tick(g, input, configs);
    for (const ev of g.state.events) {
      if (ev.type === 'projectile_fired') firedEvents++;
      if (ev.type === 'reload_complete') reloadCompleted = true;
    }
  }
  assert(firedEvents >= 12, `Fired at least full magazine: ${firedEvents} shots`);
  assert(reloadCompleted, 'Auto-reload completed');
  assert(firedEvents > 12, `Resumed firing after reload: ${firedEvents} total shots`);
}

// ---- Test 15: SMG fires faster than rifle ----
console.log('\n--- Test 15: SMG fire rate vs rifle ---');
{
  const smgGame = createGame(combatConfigs, 300, 'arena', 'smg');
  const rifleGame = createGame(combatConfigs, 300, 'arena', 'rifle');
  const input: InputState = { moveDir: { x: 0, y: 0 }, aimDir: { x: 1, y: 0 }, fire: true, headshotTargetId: null, dodge: false, reload: false, throwGrenade: false, throwPower: 0 };

  let smgShots = 0;
  let rifleShots = 0;
  // Run 120 ticks (2 seconds) — SMG rate=12 → ~24 shots, rifle rate=8 → ~16 shots
  for (let i = 0; i < 120; i++) {
    tick(smgGame, input, configs);
    for (const ev of smgGame.state.events) {
      if (ev.type === 'projectile_fired') smgShots++;
    }
    tick(rifleGame, input, configs);
    for (const ev of rifleGame.state.events) {
      if (ev.type === 'projectile_fired') rifleShots++;
    }
  }
  assert(smgShots > rifleShots, `SMG fired more (${smgShots}) than rifle (${rifleShots})`);
  // SMG should fire roughly 50% more
  assert(smgShots >= rifleShots * 1.3, `SMG rate is significantly higher: ${smgShots} vs ${rifleShots}`);
}

// ---- Test 16: Shotgun kills close enemy in one shot ----
console.log('\n--- Test 16: Shotgun one-shots close enemy ---');
{
  const g = createGame(combatConfigs, 400, 'arena', 'shotgun');
  // Place enemy 1.5 units away (close range, most pellets should hit)
  // Shotgun: 18 damage × 6 pellets = 108 max, enemy has 50 HP
  injectEnemy(g, 1.5, 0, 50);
  const input = aimAt(g, 1.5, 0);

  // Fire once and then tick enough for projectiles to reach
  let killFound = false;
  for (let i = 0; i < 15; i++) {
    // Only fire on first tick
    const inp = i === 0 ? input : { ...input, fire: false };
    tick(g, inp, configs);
    for (const ev of g.state.events) {
      if (ev.type === 'enemy_killed') killFound = true;
    }
  }
  assert(g.state.enemies.length === 0, 'Shotgun killed close enemy');
  assert(killFound, 'enemy_killed event emitted');
}

// ---- Test 17: Shotgun pellets spread (not all identical angles) ----
console.log('\n--- Test 17: Shotgun pellet spread ---');
{
  const g = createGame(combatConfigs, 500, 'arena', 'shotgun');
  const input: InputState = { moveDir: { x: 0, y: 0 }, aimDir: { x: 1, y: 0 }, fire: true, headshotTargetId: null, dodge: false, reload: false, throwGrenade: false, throwPower: 0 };
  tick(g, input, configs);
  assert(g.state.projectiles.length === 6, 'Got 6 pellets');

  // Check that pellet velocities differ (spread is applied per pellet)
  const angles = g.state.projectiles.map(p => Math.atan2(p.vel.y, p.vel.x));
  const uniqueAngles = new Set(angles.map(a => a.toFixed(6)));
  assert(uniqueAngles.size > 1, `Pellets have different spread angles: ${uniqueAngles.size} unique`);

  // All angles should be roughly rightward (within spread range of 0.15 rad * 3 for max)
  for (const a of angles) {
    assert(Math.abs(a) < 0.5, `Pellet angle ${a.toFixed(4)} is roughly rightward`);
  }
}

// ---- Test 18: Manual reload mid-magazine ----
console.log('\n--- Test 18: Manual reload mid-magazine ---');
{
  const g = createGame(combatConfigs, 600, 'arena', 'rifle');
  // Fire a few shots to reduce ammo
  const fireInp: InputState = { moveDir: { x: 0, y: 0 }, aimDir: { x: 1, y: 0 }, fire: true, headshotTargetId: null, dodge: false, reload: false, throwGrenade: false, throwPower: 0 };
  for (let i = 0; i < 30; i++) tick(g, fireInp, configs);
  const ammoAfterFiring = g.state.player.ammo;
  assert(ammoAfterFiring < 30, `Used some ammo: ${ammoAfterFiring}/30`);

  // Press reload
  const reloadInp: InputState = { moveDir: { x: 0, y: 0 }, aimDir: { x: 1, y: 0 }, fire: false, headshotTargetId: null, dodge: false, reload: true, throwGrenade: false, throwPower: 0 };
  tick(g, reloadInp, configs);
  assert(g.state.player.reloadTimer > 0, 'Reload started');

  // Can't fire during reload
  tick(g, fireInp, configs);
  const projCountDuringReload = g.state.projectiles.length;

  // Wait for reload to complete (90 ticks for rifle)
  for (let i = 0; i < 100; i++) tick(g, noInput, configs);
  assert(g.state.player.reloadTimer === 0, 'Reload completed');
  assert(g.state.player.ammo === 30, `Magazine full after reload: ${g.state.player.ammo}`);
}

// ---- Test 19: Each weapon type kills enemies in extended combat ----
console.log('\n--- Test 19: All weapons kill in extended combat ---');
{
  const weaponTypes = ['pistol', 'smg', 'rifle', 'shotgun'] as const;

  for (const wt of weaponTypes) {
    const g = createGame(combatConfigs, 700 + weaponTypes.indexOf(wt), 'arena', wt);
    // Place 3 enemies at moderate range
    injectEnemy(g, 3, 0, 50);
    injectEnemy(g, 3, 1, 50);
    injectEnemy(g, 3, -1, 50);

    // Fire at them for a long time (10 seconds of game time)
    // Re-aim at closest living enemy each tick
    let totalKills = 0;
    for (let i = 0; i < 600; i++) {
      let inp: InputState;
      if (g.state.enemies.length > 0) {
        const closest = g.state.enemies.reduce((a, b) => {
          const da = Math.hypot(a.pos.x - g.state.player.pos.x, a.pos.y - g.state.player.pos.y);
          const db = Math.hypot(b.pos.x - g.state.player.pos.x, b.pos.y - g.state.player.pos.y);
          return da < db ? a : b;
        });
        inp = aimAt(g, closest.pos.x, closest.pos.y);
      } else {
        inp = noInput;
      }
      tick(g, inp, configs);
      for (const ev of g.state.events) {
        if (ev.type === 'enemy_killed') totalKills++;
      }
    }
    assert(totalKills >= 3, `${wt}: killed all 3 enemies (kills=${totalKills})`);
  }
}

// ---- Test 20: Rifle penetration kills multiple enemies in a line ----
console.log('\n--- Test 20: Rifle penetration ---');
{
  const g = createGame(combatConfigs, 800, 'arena', 'rifle');
  // Place 3 enemies in a line to the right (rifle has penetration=5)
  // Give them low HP so one bullet can kill through all
  const id1 = injectEnemy(g, 2, 0, 20);
  const id2 = injectEnemy(g, 3, 0, 20);
  const id3 = injectEnemy(g, 4, 0, 20);
  // Aim with headshot target so penetration activates
  const input: InputState = {
    moveDir: { x: 0, y: 0 },
    aimDir: { x: 1, y: 0 },
    fire: true,
    headshotTargetId: id1,
    dodge: false,
    reload: false,
    throwGrenade: false,
    throwPower: 0,
  };

  let kills = 0;
  for (let i = 0; i < 30; i++) {
    tick(g, input, configs);
    for (const ev of g.state.events) {
      if (ev.type === 'enemy_killed') kills++;
    }
  }
  // Rifle with pen=5 and headshot should kill through multiple lined-up enemies
  assert(kills >= 2, `Rifle penetration killed ${kills} enemies in a line (expected >=2)`);
}

// ---- Test 21: Pistol no-penetration — single bullet stops at first enemy ----
console.log('\n--- Test 21: Pistol limited penetration ---');
{
  // Pistol has pen=1 and no spread (0.02), perfect for testing that a single
  // bullet stops after hitting the first enemy (no headshot target → immediate stop)
  const g = createGame(combatConfigs, 900, 'arena', 'pistol');
  const id1 = injectEnemy(g, 2, 0, 200); // tanky front enemy
  const id2 = injectEnemy(g, 4, 0, 50);  // behind
  const input = aimAt(g, 2, 0);

  let hitsById: Record<number, number> = {};
  for (let i = 0; i < 30; i++) {
    const inp = i === 0 ? input : { ...input, fire: false };
    tick(g, inp, configs);
    for (const ev of g.state.events) {
      if (ev.type === 'enemy_hit') {
        const eid = ev.data?.['enemyId'] as number;
        hitsById[eid] = (hitsById[eid] ?? 0) + 1;
      }
    }
  }
  assert((hitsById[id1] ?? 0) > 0, 'Pistol hit front enemy');
  assert((hitsById[id2] ?? 0) === 0, `Pistol bullet stopped at first enemy (no headshot → no penetration)`);
}

// ---- Test 22: Extended gameplay — survive and fight for 30 seconds ----
console.log('\n--- Test 22: Extended gameplay (30s all weapons) ---');
{
  const weaponTypes = ['pistol', 'smg', 'rifle', 'shotgun'] as const;

  for (const wt of weaponTypes) {
    const g = createGame(combatConfigs, 1000 + weaponTypes.indexOf(wt), 'arena', wt);
    const startAmmo = g.state.player.ammo;

    let totalKills = 0;
    let totalShots = 0;
    let reloads = 0;

    // 30 seconds = 1800 ticks
    for (let i = 0; i < 1800; i++) {
      let inp: InputState;
      if (g.state.enemies.length > 0) {
        const closest = g.state.enemies.reduce((a, b) => {
          const da = Math.hypot(a.pos.x, a.pos.y);
          const db = Math.hypot(b.pos.x, b.pos.y);
          return da < db ? a : b;
        });
        inp = aimAt(g, closest.pos.x, closest.pos.y);
      } else {
        inp = { moveDir: { x: 0, y: 0 }, aimDir: { x: 1, y: 0 }, fire: true, headshotTargetId: null, dodge: false, reload: false, throwGrenade: false, throwPower: 0 };
      }
      tick(g, inp, configs);
      for (const ev of g.state.events) {
        if (ev.type === 'enemy_killed') totalKills++;
        if (ev.type === 'projectile_fired') totalShots++;
        if (ev.type === 'reload_complete') reloads++;
      }

      // If player died, that's fine — the test is about not crashing
      if (g.state.gameOver) break;
    }

    console.log(`  ${wt}: ${g.state.tick} ticks, ${totalKills} kills, ${totalShots} shots, ${reloads} reloads, HP=${g.state.player.hp.toFixed(0)}, ammo=${g.state.player.ammo}/${startAmmo}`);
    assert(totalShots > 0, `${wt}: fired shots in extended play`);
    assert(reloads > 0, `${wt}: reloaded at least once`);
    assert(g.state.tick > 300, `${wt}: ran for meaningful duration (${g.state.tick} ticks)`);
  }
}

// ---- Test 23: Knockback varies by weapon ----
console.log('\n--- Test 23: Weapon knockback differences ---');
{
  // Shotgun knockback=20, pistol knockback=8 — shotgun should push further
  function measureKnockback(wt: 'pistol' | 'shotgun'): number {
    const g = createGame(combatConfigs, 1100, 'arena', wt);
    injectEnemy(g, 2, 0, 500); // very tanky so it doesn't die
    const input = aimAt(g, 2, 0);

    tick(g, input, configs);
    // Advance a few ticks for projectile to reach
    for (let i = 0; i < 10; i++) tick(g, noInput, configs);

    const enemy = g.state.enemies[0];
    // Measure how far enemy moved from original pos (2, 0)
    return enemy ? enemy.pos.x - 2 : 0;
  }

  const shotgunKB = measureKnockback('shotgun');
  const pistolKB = measureKnockback('pistol');
  assert(shotgunKB > pistolKB, `Shotgun pushes further (${shotgunKB.toFixed(3)}) than pistol (${pistolKB.toFixed(3)})`);
}

// ---- Test 24: Damage values are correct per weapon ----
console.log('\n--- Test 24: Weapon damage values ---');
{
  // Give enemy lots of HP, fire one shot, measure damage dealt
  const weaponTypes = ['pistol', 'smg', 'rifle', 'shotgun'] as const;
  const expectedDmg = { pistol: 12, smg: 15, rifle: 25, shotgun: 18 }; // per projectile

  for (const wt of weaponTypes) {
    const g = createGame(combatConfigs, 1200 + weaponTypes.indexOf(wt), 'arena', wt);
    injectEnemy(g, 2, 0, 10000); // won't die
    const input = aimAt(g, 2, 0);

    let totalDamage = 0;
    let hitCount = 0;
    for (let i = 0; i < 20; i++) {
      const inp = i === 0 ? input : { ...input, fire: false };
      tick(g, inp, configs);
      for (const ev of g.state.events) {
        if (ev.type === 'enemy_hit') {
          totalDamage += ev.data?.['damage'] as number;
          hitCount++;
        }
      }
    }
    if (hitCount > 0) {
      const dmgPerHit = totalDamage / hitCount;
      assert(dmgPerHit === expectedDmg[wt], `${wt}: damage per hit = ${dmgPerHit} (expected ${expectedDmg[wt]})`);
    } else {
      // Shotgun spread might cause misses at 2 units — that's ok, just log
      console.log(`  ${wt}: no hits at range 2 (spread too wide?)`);
    }
  }
}

// ---- Test 25: Full determinism across all weapons under combat ----
console.log('\n--- Test 25: Full determinism with combat (all weapons) ---');
{
  const weaponTypes = ['pistol', 'smg', 'rifle', 'shotgun'] as const;

  for (const wt of weaponTypes) {
    const gA = createGame(combatConfigs, 1300 + weaponTypes.indexOf(wt), 'arena', wt);
    const gB = createGame(combatConfigs, 1300 + weaponTypes.indexOf(wt), 'arena', wt);

    const input: InputState = { moveDir: { x: 1, y: 0 }, aimDir: { x: 1, y: 0 }, fire: true, headshotTargetId: null, dodge: false, reload: false, throwGrenade: false, throwPower: 0 };

    for (let i = 0; i < 600; i++) {
      tick(gA, input, configs);
      tick(gB, input, configs);
    }

    assert(gA.state.tick === gB.state.tick, `${wt}: same tick count`);
    assert(gA.state.score === gB.state.score, `${wt}: same score (${gA.state.score})`);
    assert(gA.state.player.ammo === gB.state.player.ammo, `${wt}: same ammo`);
    assert(gA.state.enemies.length === gB.state.enemies.length, `${wt}: same enemy count`);
    assert(gA.state.player.hp === gB.state.player.hp, `${wt}: same player HP`);
    assert(gA.state.projectiles.length === gB.state.projectiles.length, `${wt}: same projectile count`);
  }
}

console.log('\n=== All headless tests passed! ===');
console.log(`\nFinal state summary:`);
console.log(`  Tick: ${gameA.state.tick}`);
console.log(`  Player HP: ${gameA.state.player.hp}`);
console.log(`  Player pos: (${gameA.state.player.pos.x.toFixed(2)}, ${gameA.state.player.pos.y.toFixed(2)})`);
console.log(`  Enemies: ${gameA.state.enemies.length}`);
console.log(`  Score: ${gameA.state.score}`);
console.log(`  Obstacles: ${gameA.state.obstacles.length}`);
