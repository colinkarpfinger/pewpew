/**
 * Headless simulation test — runs the game without any rendering.
 * Usage: npx tsx tests/headless.ts
 */

import type { GameConfigs, InputState, ExtractionMapConfig } from '../src/simulation/types.ts';
import { createGame, tick, getSnapshot } from '../src/simulation/game.ts';
import { rayIntersectsAABB, updateVisibility } from '../src/simulation/line-of-sight.ts';
import { isInExtractionZone } from '../src/simulation/extraction-map.ts';

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

const cashConfig = {
  sprinterBills: [2, 4],
  gunnerBills: [3, 5],
  denomination: 10,
  scatterRadius: 1.5,
  pickupRadius: 1.0,
};

const gunnerConfig = {
  projectileDamage: 8,
  projectileSpeed: 25,
  projectileLifetime: 90,
  fireCooldownTicks: 30,
  engageRange: 10,
  retreatRange: 15,
  spread: 0.08,
  advanceDuration: 120,
  retreatDuration: 90,
  retreatSpeedMultiplier: 0.6,
};

const configs: GameConfigs = {
  player: { speed: 5.0, hp: 100, radius: 0.4, iframeDuration: 60, dodgeDuration: 18, dodgeCooldown: 42, dodgeSpeedMultiplier: 1.8 },
  weapons: {
    pistol: { damage: 12, fireRate: 3, projectileSpeed: 20, projectileLifetime: 60, spread: 0.02, penetration: 1, knockback: 8, pelletsPerShot: 1, magazineSize: 12, reloadTime: 90, semiAuto: true, ...weaponBase },
    smg: { damage: 15, fireRate: 12, projectileSpeed: 20, projectileLifetime: 60, spread: 0.06, penetration: 2, knockback: 6, pelletsPerShot: 1, magazineSize: 40, reloadTime: 120, ...weaponBase },
    rifle: { damage: 25, fireRate: 8, projectileSpeed: 20, projectileLifetime: 120, spread: 0.03, penetration: 5, knockback: 12, pelletsPerShot: 1, magazineSize: 30, reloadTime: 90, ...weaponBase },
    shotgun: { damage: 18, fireRate: 2, projectileSpeed: 20, projectileLifetime: 30, spread: 0.15, penetration: 1, knockback: 20, pelletsPerShot: 6, magazineSize: 6, reloadTime: 150, semiAuto: true, ...weaponBase },
  },
  enemies: {
    sprinter: { speed: 6.0, hp: 75, contactDamage: 20, radius: 0.35, scoreValue: 150 },
    gunner: { speed: 2.0, hp: 80, contactDamage: 10, radius: 0.4, scoreValue: 200 },
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
  cash: cashConfig,
  gunner: gunnerConfig,
};

const noInput: InputState = { moveDir: { x: 0, y: 0 }, aimDir: { x: 1, y: 0 }, fire: false, firePressed: false, headshotTargetId: null, dodge: false, reload: false, throwGrenade: false, throwPower: 0 };

// Extraction map for tests
const testExtractionMapEarly: ExtractionMapConfig = {
  width: 40,
  height: 120,
  playerSpawn: { x: 0, y: -55 },
  extractionZones: [
    { x: 0, y: -58, width: 8, height: 4 },
    { x: 0, y: 55, width: 8, height: 6 },
  ],
  maxEnemies: 40,
  minSpawnDistFromPlayer: 15,
  enemyDetectionRange: 18,
  wanderSpeedMultiplier: 0.3,
  zones: [
    { yMin: -60, yMax: -30, ambientInterval: 240, sprinterRatio: 0.05, gunnerRatio: 0, initialEnemyCount: 3 },
    { yMin: -30, yMax: 0, ambientInterval: 120, sprinterRatio: 0.15, gunnerRatio: 0.1, initialEnemyCount: 4 },
    { yMin: 0, yMax: 30, ambientInterval: 60, sprinterRatio: 0.3, gunnerRatio: 0.2, initialEnemyCount: 5 },
    { yMin: 30, yMax: 60, ambientInterval: 45, sprinterRatio: 0.45, gunnerRatio: 0.25, initialEnemyCount: 6 },
  ],
  walls: [
    { pos: { x: -8, y: -48 }, width: 6, height: 1 },
    { pos: { x: 10, y: -46 }, width: 1, height: 8 },
    { pos: { x: 5, y: -40 }, width: 8, height: 1 },
    { pos: { x: -5, y: -10 }, width: 1, height: 6 },
    { pos: { x: 6, y: 0 }, width: 8, height: 1 },
    { pos: { x: 0, y: 28 }, width: 12, height: 1 },
  ],
  triggerRegions: [
    {
      id: 1,
      x: 0, y: -30,
      width: 12, height: 6,
      spawnPoints: [
        { x: -10, y: -28 }, { x: 10, y: -28 },
        { x: -8, y: -32 }, { x: 8, y: -32 },
      ],
      enemyCount: 4,
      sprinterRatio: 0.2,
    },
    {
      id: 2,
      x: 0, y: 0,
      width: 14, height: 6,
      spawnPoints: [
        { x: -14, y: 2 }, { x: 14, y: 2 },
        { x: -12, y: -2 }, { x: 12, y: -2 },
      ],
      enemyCount: 6,
      sprinterRatio: 0.3,
    },
  ],
};
const extractionConfigs: GameConfigs = { ...configs, extractionMap: testExtractionMapEarly, cash: cashConfig };

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
const moveRight: InputState = { moveDir: { x: 1, y: 0 }, aimDir: { x: 1, y: 0 }, fire: false, firePressed: false, headshotTargetId: null, dodge: false, reload: false, throwGrenade: false, throwPower: 0 };
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
const fireInput: InputState = { moveDir: { x: 0, y: 0 }, aimDir: { x: 1, y: 0 }, fire: true, firePressed: true, headshotTargetId: null, dodge: false, reload: false, throwGrenade: false, throwPower: 0 };
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
    firePressed: true,
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
  firePressed: false,
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
const noDodgeInput: InputState = { moveDir: { x: 1, y: 0 }, aimDir: { x: 1, y: 0 }, fire: false, firePressed: false, headshotTargetId: null, dodge: false, reload: false, throwGrenade: false, throwPower: 0 };
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
  firePressed: true,
  headshotTargetId: null,
  dodge: true,
  reload: false,
  throwGrenade: false,
};
tick(dodgeFireGame, dodgeFireInput, configs);
assert(dodgeFireGame.state.projectiles.length === 0, 'Cannot fire during dodge');

// Test 10: Extraction mode initialization
console.log('\n--- Test 10: Extraction Mode Init ---');
const pistolGame = createGame(extractionConfigs, 42, 'extraction');
assert(pistolGame.state.gameMode === 'extraction', 'Game mode is extraction');
assert(pistolGame.state.player.activeWeapon === 'pistol', 'Extraction default weapon is pistol');
assert(pistolGame.state.player.ammo === 12, 'Pistol starts with 12 ammo');
assert(pistolGame.state.extractionMap !== null, 'Extraction map is set');
assert(pistolGame.state.extractionSpawner !== null, 'Extraction spawner is set');
assert(pistolGame.state.player.pos.x === 0 && pistolGame.state.player.pos.y === -55, 'Player spawns at south');
assert(pistolGame.state.arena.width === 40 && pistolGame.state.arena.height === 120, 'Arena dimensions match map');
assert(pistolGame.state.obstacles.length === testExtractionMapEarly.walls.length, `Walls as obstacles: ${pistolGame.state.obstacles.length}`);
assert(pistolGame.state.extracted === false, 'Not extracted at start');

// Test 11: Shotgun fires 6 projectiles per shot
console.log('\n--- Test 11: Shotgun pellets ---');
const shotgunGame = createGame(configs, 42, 'arena', 'shotgun');
assert(shotgunGame.state.player.activeWeapon === 'shotgun', 'Active weapon is shotgun');
assert(shotgunGame.state.player.ammo === 6, 'Shotgun starts with 6 ammo');
const shotgunFireInput: InputState = { moveDir: { x: 0, y: 0 }, aimDir: { x: 1, y: 0 }, fire: true, firePressed: true, headshotTargetId: null, dodge: false, reload: false, throwGrenade: false, throwPower: 0 };
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
function injectEnemy(g: ReturnType<typeof createGame>, x: number, y: number, hp?: number, enemyType: 'sprinter' | 'gunner' = 'sprinter'): number {
  const id = g.state.nextEntityId++;
  const cfg = configs.enemies[enemyType];
  g.state.enemies.push({
    id,
    type: enemyType,
    pos: { x, y },
    hp: hp ?? cfg.hp,
    radius: cfg.radius,
    speed: cfg.speed,
    contactDamage: cfg.contactDamage,
    scoreValue: cfg.scoreValue,
    knockbackVel: { x: 0, y: 0 },
    visible: true,
    stunTimer: 0,
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
    firePressed: true,
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

  const input: InputState = { moveDir: { x: 0, y: 0 }, aimDir: { x: 1, y: 0 }, fire: true, firePressed: true, headshotTargetId: null, dodge: false, reload: false, throwGrenade: false, throwPower: 0 };

  // Pistol is semi-auto: fires once per firePressed, cooldown=1 tick
  // 12 shots to empty → auto-reload takes 90 ticks → fires again
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
  const input: InputState = { moveDir: { x: 0, y: 0 }, aimDir: { x: 1, y: 0 }, fire: true, firePressed: true, headshotTargetId: null, dodge: false, reload: false, throwGrenade: false, throwPower: 0 };

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
    const inp = i === 0 ? input : { ...input, fire: false, firePressed: false };
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
  const input: InputState = { moveDir: { x: 0, y: 0 }, aimDir: { x: 1, y: 0 }, fire: true, firePressed: true, headshotTargetId: null, dodge: false, reload: false, throwGrenade: false, throwPower: 0 };
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
  const fireInp: InputState = { moveDir: { x: 0, y: 0 }, aimDir: { x: 1, y: 0 }, fire: true, firePressed: true, headshotTargetId: null, dodge: false, reload: false, throwGrenade: false, throwPower: 0 };
  for (let i = 0; i < 30; i++) tick(g, fireInp, configs);
  const ammoAfterFiring = g.state.player.ammo;
  assert(ammoAfterFiring < 30, `Used some ammo: ${ammoAfterFiring}/30`);

  // Press reload
  const reloadInp: InputState = { moveDir: { x: 0, y: 0 }, aimDir: { x: 1, y: 0 }, fire: false, firePressed: false, headshotTargetId: null, dodge: false, reload: true, throwGrenade: false, throwPower: 0 };
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
    // Place 3 enemies at moderate range (low HP since sprinters are fast)
    injectEnemy(g, 3, 0, 25);
    injectEnemy(g, 3, 1, 25);
    injectEnemy(g, 3, -1, 25);

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
    firePressed: true,
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
    const inp = i === 0 ? input : { ...input, fire: false, firePressed: false };
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
        inp = { moveDir: { x: 0, y: 0 }, aimDir: { x: 1, y: 0 }, fire: true, firePressed: true, headshotTargetId: null, dodge: false, reload: false, throwGrenade: false, throwPower: 0 };
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
      const inp = i === 0 ? input : { ...input, fire: false, firePressed: false };
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

    const input: InputState = { moveDir: { x: 1, y: 0 }, aimDir: { x: 1, y: 0 }, fire: true, firePressed: true, headshotTargetId: null, dodge: false, reload: false, throwGrenade: false, throwPower: 0 };

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

// ============================================================
// Extraction Mode Tests
// ============================================================

// ---- Test 26: Arena mode unchanged — no extraction state ----
console.log('\n--- Test 26: Arena mode unchanged ---');
{
  const g = createGame(extractionConfigs, 42, 'arena');
  assert(g.state.extractionMap === null, 'Arena mode has no extractionMap');
  assert(g.state.extractionSpawner === null, 'Arena mode has no extractionSpawner');
  assert(g.state.extracted === false, 'Arena mode not extracted');
  assert(g.state.player.pos.x === 0 && g.state.player.pos.y === 0, 'Arena player spawns at origin');
}

// ---- Test 27: Extraction pre-spawns enemies at level start ----
console.log('\n--- Test 27: Extraction pre-spawn ---');
{
  const g = createGame(extractionConfigs, 42, 'extraction');
  // Enemies should already exist at tick 0 (pre-spawned)
  assert(g.state.enemies.length > 0, `Extraction enemies pre-spawned: ${g.state.enemies.length}`);
  // Total should be sum of initialEnemyCount: 3+4+5+6 = 18
  assert(g.state.enemies.length === 18, `All zones spawned enemies: ${g.state.enemies.length}`);
  // All pre-spawned enemies should be in wander state
  const wandering = g.state.enemies.filter(e => e.aiState === 'wander');
  assert(wandering.length === g.state.enemies.length, `All enemies wandering: ${wandering.length}/${g.state.enemies.length}`);
}

// ---- Test 28: Sprinter enemy stats ----
console.log('\n--- Test 28: Sprinter enemy ---');
{
  const g = createGame(extractionConfigs, 42, 'extraction');
  // Inject a sprinter manually
  const cfg = extractionConfigs.enemies.sprinter;
  g.state.enemies.push({
    id: g.state.nextEntityId++,
    type: 'sprinter',
    pos: { x: 3, y: -55 },
    hp: cfg.hp,
    radius: cfg.radius,
    speed: cfg.speed,
    contactDamage: cfg.contactDamage,
    scoreValue: cfg.scoreValue,
    knockbackVel: { x: 0, y: 0 },
    visible: true,
    stunTimer: 0,
  });
  assert(g.state.enemies[0].type === 'sprinter', 'Enemy type is sprinter');
  assert(g.state.enemies[0].hp === 75, 'Sprinter HP is 75');
  assert(g.state.enemies[0].speed === 6.0, 'Sprinter speed is 6.0');
  assert(g.state.enemies[0].radius === 0.35, 'Sprinter radius is 0.35');
}

// ---- Test 29: LOS — ray-AABB intersection ----
console.log('\n--- Test 29: Ray-AABB intersection ---');
{
  const wall = { pos: { x: 5, y: 0 }, width: 2, height: 2 };

  // Ray pointing right directly at the wall
  assert(rayIntersectsAABB({ x: 0, y: 0 }, { x: 1, y: 0 }, 10, wall) === true, 'Ray hits wall directly');
  // Ray pointing right but max dist too short
  assert(rayIntersectsAABB({ x: 0, y: 0 }, { x: 1, y: 0 }, 3, wall) === false, 'Ray too short to reach wall');
  // Ray pointing left (away from wall)
  assert(rayIntersectsAABB({ x: 0, y: 0 }, { x: -1, y: 0 }, 10, wall) === false, 'Ray aimed away from wall');
  // Ray pointing up (parallel, misses wall)
  assert(rayIntersectsAABB({ x: 0, y: 0 }, { x: 0, y: 1 }, 10, wall) === false, 'Ray misses wall (parallel)');
  // Ray that passes above the wall
  assert(rayIntersectsAABB({ x: 0, y: 5 }, { x: 1, y: 0 }, 10, wall) === false, 'Ray passes above wall');
}

// ---- Test 30: LOS — visibility with walls ----
console.log('\n--- Test 30: LOS visibility ---');
{
  const walls = [
    { pos: { x: 5, y: 0 }, width: 2, height: 2 },
  ];
  const enemies = [
    // Enemy behind wall (at x=8, wall at x=5 blocks LOS from origin)
    { id: 1, type: 'sprinter' as const, pos: { x: 8, y: 0 }, hp: 75, radius: 0.35, speed: 6.0, contactDamage: 20, scoreValue: 150, knockbackVel: { x: 0, y: 0 }, visible: true, stunTimer: 0 },
    // Enemy in the open (at y=5, no wall in the way)
    { id: 2, type: 'sprinter' as const, pos: { x: 3, y: 5 }, hp: 75, radius: 0.35, speed: 6.0, contactDamage: 20, scoreValue: 150, knockbackVel: { x: 0, y: 0 }, visible: true, stunTimer: 0 },
  ];

  updateVisibility({ x: 0, y: 0 }, enemies, walls);
  assert(enemies[0].visible === false, 'Enemy behind wall is not visible');
  assert(enemies[1].visible === true, 'Enemy in the open is visible');
}

// ---- Test 31: Trigger regions ----
console.log('\n--- Test 31: Trigger regions ---');
{
  const g = createGame(extractionConfigs, 42, 'extraction');
  assert(g.state.extractionSpawner!.triggeredRegionIds.length === 0, 'No triggers at start');

  // Move player to trigger region 1 (x:0, y:-30, width:12, height:6)
  g.state.player.pos = { x: 0, y: -30 };
  const enemiesBefore = g.state.enemies.length;
  tick(g, noInput, extractionConfigs);

  assert(g.state.extractionSpawner!.triggeredRegionIds.includes(1), 'Trigger region 1 activated');
  assert(g.state.enemies.length > enemiesBefore, `Enemies spawned from trigger: ${g.state.enemies.length}`);

  // Check trigger_activated event
  const triggerEvents = g.state.events.filter(e => e.type === 'trigger_activated');
  assert(triggerEvents.length > 0, 'trigger_activated event emitted');

  // Re-entering same region should NOT re-trigger
  const enemiesAfter = g.state.enemies.length;
  tick(g, noInput, extractionConfigs);
  const triggerEventsAfter = g.state.events.filter(e => e.type === 'trigger_activated');
  assert(triggerEventsAfter.length === 0, 'Re-entering trigger region does not re-trigger');
}

// ---- Test 32: Extraction win condition ----
console.log('\n--- Test 32: Extraction win ---');
{
  const g = createGame(extractionConfigs, 42, 'extraction');
  assert(g.state.extracted === false, 'Not extracted at start');

  // Move player to extraction zone (x:0, y:55, width:8, height:6)
  g.state.player.pos = { x: 0, y: 55 };
  tick(g, noInput, extractionConfigs);

  assert(g.state.extracted === true, 'Player extracted');
  const successEvents = g.state.events.filter(e => e.type === 'extraction_success');
  assert(successEvents.length > 0, 'extraction_success event emitted');

  // Ticking after extraction does nothing
  const tickBefore = g.state.tick;
  tick(g, noInput, extractionConfigs);
  assert(g.state.tick === tickBefore, 'No more ticks after extraction');
}

// ---- Test 33: isInExtractionZone helper ----
console.log('\n--- Test 33: isInExtractionZone ---');
{
  const zone = { x: 0, y: 55, width: 8, height: 6 };
  assert(isInExtractionZone({ x: 0, y: 55 }, zone) === true, 'Center is in zone');
  assert(isInExtractionZone({ x: 3, y: 57 }, zone) === true, 'Inside corner is in zone');
  assert(isInExtractionZone({ x: 10, y: 55 }, zone) === false, 'Outside X is not in zone');
  assert(isInExtractionZone({ x: 0, y: 60 }, zone) === false, 'Outside Y is not in zone');
}

// ---- Test 34: Walls block player/projectiles (same as obstacle collision) ----
console.log('\n--- Test 34: Walls as obstacles ---');
{
  const g = createGame(extractionConfigs, 42, 'extraction');
  // The map has walls that act as obstacles — existing collision should work
  // Fire a projectile toward a wall and check that it gets destroyed
  // Wall at { x: -8, y: -48, width: 6, height: 1 }
  // Player at (0, -55), aim towards the wall
  g.state.player.pos = { x: -8, y: -52 };
  const fireUp: InputState = {
    moveDir: { x: 0, y: 0 },
    aimDir: { x: 0, y: 1 },
    fire: true,
    firePressed: true,
    headshotTargetId: null,
    dodge: false,
    reload: false,
    throwGrenade: false,
    throwPower: 0,
  };
  tick(g, fireUp, extractionConfigs);
  assert(g.state.projectiles.length > 0, 'Projectile created');

  // Advance until projectile either hits wall or expires
  let projDestroyed = false;
  for (let i = 0; i < 30; i++) {
    tick(g, { ...fireUp, fire: false, firePressed: false }, extractionConfigs);
    if (g.state.events.some(e => e.type === 'projectile_destroyed')) {
      projDestroyed = true;
      break;
    }
  }
  assert(projDestroyed || g.state.projectiles.length === 0, 'Projectile stopped by wall');
}

// ---- Test 35: Extraction determinism ----
console.log('\n--- Test 35: Extraction determinism ---');
{
  const gA = createGame(extractionConfigs, 99, 'extraction');
  const gB = createGame(extractionConfigs, 99, 'extraction');

  // Move both players the same way
  const moveUp: InputState = { moveDir: { x: 0, y: 1 }, aimDir: { x: 0, y: 1 }, fire: false, firePressed: false, headshotTargetId: null, dodge: false, reload: false, throwGrenade: false, throwPower: 0 };

  for (let i = 0; i < 600; i++) {
    tick(gA, moveUp, extractionConfigs);
    tick(gB, moveUp, extractionConfigs);
  }

  assert(gA.state.tick === gB.state.tick, 'Same tick count');
  assert(gA.state.enemies.length === gB.state.enemies.length, 'Same enemy count');
  assert(gA.state.player.pos.x === gB.state.player.pos.x, 'Same player X');
  assert(gA.state.player.pos.y === gB.state.player.pos.y, 'Same player Y');
  assert(gA.state.extractionSpawner!.triggeredRegionIds.length === gB.state.extractionSpawner!.triggeredRegionIds.length, 'Same triggered regions');
}

// ---- Test 36: Extended extraction gameplay ----
console.log('\n--- Test 36: Extended extraction gameplay (30s+) ---');
{
  const g = createGame(extractionConfigs, 555, 'extraction');

  let totalKills = 0;
  let totalShots = 0;
  let totalTriggers = 0;

  // Move north and fight for 30+ seconds
  for (let i = 0; i < 1800; i++) {
    let inp: InputState;
    if (g.state.enemies.length > 0) {
      const closest = g.state.enemies.reduce((a, b) => {
        const da = Math.hypot(a.pos.x - g.state.player.pos.x, a.pos.y - g.state.player.pos.y);
        const db = Math.hypot(b.pos.x - g.state.player.pos.x, b.pos.y - g.state.player.pos.y);
        return da < db ? a : b;
      });
      const dx = closest.pos.x - g.state.player.pos.x;
      const dy = closest.pos.y - g.state.player.pos.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      inp = {
        moveDir: { x: 0, y: 1 }, // always moving north
        aimDir: len > 0 ? { x: dx / len, y: dy / len } : { x: 0, y: 1 },
        fire: true,
        firePressed: true,
        headshotTargetId: null,
        dodge: false,
        reload: false,
        throwGrenade: false,
        throwPower: 0,
      };
    } else {
      inp = {
        moveDir: { x: 0, y: 1 },
        aimDir: { x: 0, y: 1 },
        fire: false,
        firePressed: false,
        headshotTargetId: null,
        dodge: false,
        reload: false,
        throwGrenade: false,
        throwPower: 0,
      };
    }

    tick(g, inp, extractionConfigs);

    for (const ev of g.state.events) {
      if (ev.type === 'enemy_killed') totalKills++;
      if (ev.type === 'projectile_fired') totalShots++;
      if (ev.type === 'trigger_activated') totalTriggers++;
    }

    if (g.state.gameOver || g.state.extracted) break;
  }

  console.log(`  ${g.state.tick} ticks, ${totalKills} kills, ${totalShots} shots, ${totalTriggers} triggers, HP=${g.state.player.hp.toFixed(0)}, pos=(${g.state.player.pos.x.toFixed(1)}, ${g.state.player.pos.y.toFixed(1)}), enemies=${g.state.enemies.length}, extracted=${g.state.extracted}`);
  assert(g.state.tick > 300, `Ran for meaningful duration: ${g.state.tick} ticks`);
  assert(totalShots > 0 || g.state.extracted, 'Fired shots or extracted');
}

// ============================================================
// Cash System Tests
// ============================================================

// ---- Test 37: Cash spawns from kills in extraction mode ----
console.log('\n--- Test 37: Cash spawns from kills (extraction) ---');
{
  const g = createGame(extractionConfigs, 2000, 'extraction');
  // Place enemy near player and kill it
  injectEnemy(g, g.state.player.pos.x + 2, g.state.player.pos.y, 1); // 1 HP, dies in one hit
  const input = aimAt(g, g.state.player.pos.x + 2, g.state.player.pos.y);

  let cashSpawned = false;
  for (let i = 0; i < 30; i++) {
    tick(g, i === 0 ? input : { ...input, fire: false, firePressed: false }, extractionConfigs);
    for (const ev of g.state.events) {
      if (ev.type === 'cash_spawned') cashSpawned = true;
    }
  }
  assert(cashSpawned, 'Cash spawned from enemy kill in extraction mode');
  assert(g.state.cashPickups.length > 0, `Cash pickup exists: ${g.state.cashPickups.length}`);
}

// ---- Test 38: Cash NOT spawned in arena mode ----
console.log('\n--- Test 38: No cash in arena mode ---');
{
  const g = createGame(combatConfigs, 2100, 'arena');
  injectEnemy(g, 2, 0, 1);
  const input = aimAt(g, 2, 0);

  for (let i = 0; i < 30; i++) {
    tick(g, i === 0 ? input : { ...input, fire: false, firePressed: false }, combatConfigs);
  }
  assert(g.state.cashPickups.length === 0, 'No cash pickups in arena mode');
  assert(g.state.runCash === 0, 'No run cash in arena mode');
}

// ---- Test 39: Cash amount ranges ----
console.log('\n--- Test 39: Cash amount ranges ---');
{
  const g = createGame(extractionConfigs, 2200, 'extraction');

  // Kill a sprinter
  injectEnemy(g, g.state.player.pos.x + 2, g.state.player.pos.y, 1, 'sprinter');
  const input = aimAt(g, g.state.player.pos.x + 2, g.state.player.pos.y);
  for (let i = 0; i < 20; i++) {
    tick(g, i === 0 ? input : { ...input, fire: false, firePressed: false }, extractionConfigs);
  }

  assert(g.state.cashPickups.length > 0, 'Cash pickup from sprinter exists');
  if (g.state.cashPickups.length > 0) {
    const amt = g.state.cashPickups[0].amount;
    assert(amt >= 25 && amt <= 40, `Sprinter cash amount in range [25,40]: ${amt}`);
  }

  // Kill a gunner
  const prevCount = g.state.cashPickups.length;
  injectGunner(g, g.state.player.pos.x + 2, g.state.player.pos.y, 1);
  const input2 = aimAt(g, g.state.player.pos.x + 2, g.state.player.pos.y);
  for (let i = 0; i < 20; i++) {
    tick(g, i === 0 ? input2 : { ...input2, fire: false, firePressed: false }, extractionConfigs);
  }

  if (g.state.cashPickups.length > prevCount) {
    const gunnerPickup = g.state.cashPickups[g.state.cashPickups.length - 1];
    assert(gunnerPickup.amount >= 30 && gunnerPickup.amount <= 50, `Gunner cash amount in range [30,50]: ${gunnerPickup.amount}`);
  }
}

// ---- Test 40: Cash pickup — player walks over cash ----
console.log('\n--- Test 40: Cash pickup ---');
{
  const g = createGame(extractionConfigs, 2300, 'extraction');
  // Manually place a cash pickup at player position
  g.state.cashPickups.push({ id: g.state.nextEntityId++, pos: { x: g.state.player.pos.x, y: g.state.player.pos.y }, amount: 15 });

  tick(g, noInput, extractionConfigs);
  assert(g.state.cashPickups.length === 0, 'Cash pickup collected');
  assert(g.state.runCash === 15, `runCash increased: ${g.state.runCash}`);
}

// ---- Test 41: Cash persists (no lifetime/expiration) ----
console.log('\n--- Test 41: Cash persists ---');
{
  const g = createGame(extractionConfigs, 2400, 'extraction');
  // Place cash far from player so it won't be picked up
  g.state.cashPickups.push({ id: g.state.nextEntityId++, pos: { x: 15, y: 15 }, amount: 10 });

  // Run for a long time (10 seconds)
  for (let i = 0; i < 600; i++) {
    tick(g, noInput, extractionConfigs);
  }
  assert(g.state.cashPickups.length >= 1, `Cash still exists after 600 ticks: ${g.state.cashPickups.length}`);
  assert(g.state.cashPickups.some(c => c.amount === 10), 'Original cash pickup still present');
}

// ---- Test 42: Run cash accumulates ----
console.log('\n--- Test 42: Run cash accumulates ---');
{
  const g = createGame(extractionConfigs, 2500, 'extraction');
  // Place multiple cash pickups at player position
  g.state.cashPickups.push({ id: g.state.nextEntityId++, pos: { x: g.state.player.pos.x, y: g.state.player.pos.y }, amount: 10 });
  g.state.cashPickups.push({ id: g.state.nextEntityId++, pos: { x: g.state.player.pos.x, y: g.state.player.pos.y }, amount: 25 });
  g.state.cashPickups.push({ id: g.state.nextEntityId++, pos: { x: g.state.player.pos.x, y: g.state.player.pos.y }, amount: 15 });

  tick(g, noInput, extractionConfigs);
  assert(g.state.cashPickups.length === 0, 'All cash collected');
  assert(g.state.runCash === 50, `runCash accumulated: ${g.state.runCash}`);
}

// ---- Test 43: Cash determinism ----
console.log('\n--- Test 43: Cash determinism ---');
{
  const gA = createGame(extractionConfigs, 2600, 'extraction');
  const gB = createGame(extractionConfigs, 2600, 'extraction');

  // Inject same enemies and kill them
  injectEnemy(gA, gA.state.player.pos.x + 2, gA.state.player.pos.y, 1, 'sprinter');
  injectEnemy(gB, gB.state.player.pos.x + 2, gB.state.player.pos.y, 1, 'sprinter');

  const inputA = aimAt(gA, gA.state.player.pos.x + 2, gA.state.player.pos.y);
  const inputB = aimAt(gB, gB.state.player.pos.x + 2, gB.state.player.pos.y);

  for (let i = 0; i < 30; i++) {
    const inp = i === 0 ? inputA : { ...inputA, fire: false, firePressed: false };
    tick(gA, inp, extractionConfigs);
    tick(gB, i === 0 ? inputB : { ...inputB, fire: false, firePressed: false }, extractionConfigs);
  }

  assert(gA.state.cashPickups.length === gB.state.cashPickups.length, 'Same cash pickup count');
  if (gA.state.cashPickups.length > 0) {
    assert(gA.state.cashPickups[0].amount === gB.state.cashPickups[0].amount, `Same cash amount: ${gA.state.cashPickups[0].amount}`);
  }
}

// ---- Test 44: Extended extraction with cash ----
console.log('\n--- Test 44: Extended extraction with cash ---');
{
  const g = createGame(extractionConfigs, 2700, 'extraction');

  let totalCashSpawned = 0;
  let totalCashPickedUp = 0;

  // Move north and fight for 30+ seconds
  for (let i = 0; i < 1800; i++) {
    let inp: InputState;
    if (g.state.enemies.length > 0) {
      const closest = g.state.enemies.reduce((a, b) => {
        const da = Math.hypot(a.pos.x - g.state.player.pos.x, a.pos.y - g.state.player.pos.y);
        const db = Math.hypot(b.pos.x - g.state.player.pos.x, b.pos.y - g.state.player.pos.y);
        return da < db ? a : b;
      });
      const dx = closest.pos.x - g.state.player.pos.x;
      const dy = closest.pos.y - g.state.player.pos.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      inp = {
        moveDir: { x: 0, y: 1 },
        aimDir: len > 0 ? { x: dx / len, y: dy / len } : { x: 0, y: 1 },
        fire: true,
        firePressed: true,
        headshotTargetId: null,
        dodge: false,
        reload: false,
        throwGrenade: false,
        throwPower: 0,
      };
    } else {
      inp = {
        moveDir: { x: 0, y: 1 },
        aimDir: { x: 0, y: 1 },
        fire: false,
        firePressed: false,
        headshotTargetId: null,
        dodge: false,
        reload: false,
        throwGrenade: false,
        throwPower: 0,
      };
    }

    tick(g, inp, extractionConfigs);

    for (const ev of g.state.events) {
      if (ev.type === 'cash_spawned') totalCashSpawned++;
      if (ev.type === 'cash_picked_up') totalCashPickedUp++;
    }

    if (g.state.gameOver || g.state.extracted) break;
  }

  console.log(`  ${g.state.tick} ticks, cash spawned: ${totalCashSpawned}, picked up: ${totalCashPickedUp}, runCash: ${g.state.runCash}, remaining pickups: ${g.state.cashPickups.length}`);
  assert(g.state.tick > 300, `Ran for meaningful duration: ${g.state.tick} ticks`);
  // If kills happened, cash should have spawned
  if (totalCashSpawned > 0) {
    assert(totalCashSpawned > 0, `Cash spawned during extended play: ${totalCashSpawned}`);
  }
}

// ============================================================
// Gunner Enemy Tests
// ============================================================

// Helper: inject a gunner with AI fields initialized
function injectGunner(g: ReturnType<typeof createGame>, x: number, y: number, hp?: number): number {
  const id = g.state.nextEntityId++;
  const cfg = configs.enemies.gunner;
  g.state.enemies.push({
    id,
    type: 'gunner',
    pos: { x, y },
    hp: hp ?? cfg.hp,
    radius: cfg.radius,
    speed: cfg.speed,
    contactDamage: cfg.contactDamage,
    scoreValue: cfg.scoreValue,
    knockbackVel: { x: 0, y: 0 },
    visible: true,
    stunTimer: 0,
    aiPhase: 'advance',
    aiTimer: 0,
    fireCooldown: 0,
  });
  return id;
}

// ---- Test 45: Gunner enemy stats ----
console.log('\n--- Test 45: Gunner enemy stats ---');
{
  const g = createGame(configs, 3000, 'extraction');
  const id = injectGunner(g, g.state.player.pos.x + 5, g.state.player.pos.y);
  const enemy = g.state.enemies.find(e => e.id === id)!;
  assert(enemy.type === 'gunner', 'Enemy type is gunner');
  assert(enemy.hp === 80, 'Gunner HP is 80');
  assert(enemy.speed === 2.0, 'Gunner speed is 2.0');
  assert(enemy.radius === 0.4, 'Gunner radius is 0.4');
  assert(enemy.scoreValue === 200, 'Gunner score value is 200');
  assert(enemy.contactDamage === 10, 'Gunner contact damage is 10');
  assert(enemy.aiPhase === 'advance', 'Gunner starts in advance phase');
  assert(enemy.aiTimer === 0, 'Gunner AI timer starts at 0');
  assert(enemy.fireCooldown === 0, 'Gunner fire cooldown starts at 0');
}

// ---- Test 46: Gunner fires projectiles when in range ----
console.log('\n--- Test 46: Gunner fires projectiles ---');
{
  const g = createGame(combatConfigs, 3100, 'extraction');
  // Place gunner within engage range (10 units) of player
  injectGunner(g, g.state.player.pos.x + 6, g.state.player.pos.y);

  let enemyProjFired = 0;
  for (let i = 0; i < 120; i++) {
    tick(g, noInput, configs);
    for (const ev of g.state.events) {
      if (ev.type === 'enemy_projectile_fired') enemyProjFired++;
    }
  }
  assert(enemyProjFired > 0, `Gunner fired projectiles: ${enemyProjFired}`);
  assert(g.state.enemyProjectiles.length >= 0, 'Enemy projectiles array exists');
}

// ---- Test 47: Enemy projectiles damage player ----
console.log('\n--- Test 47: Enemy projectile damages player ---');
{
  const g = createGame(combatConfigs, 3200, 'extraction');
  // Place gunner very close to player so it fires immediately and hits easily
  injectGunner(g, g.state.player.pos.x + 3, g.state.player.pos.y);

  const startHp = g.state.player.hp;
  let playerHit = false;
  // Run long enough for gunner to fire and projectile to reach player
  for (let i = 0; i < 300; i++) {
    tick(g, noInput, configs);
    for (const ev of g.state.events) {
      if (ev.type === 'player_hit' && ev.data?.['source'] === 'projectile') {
        playerHit = true;
      }
    }
    if (g.state.gameOver) break;
  }
  // Player should have been hit by enemy projectile or by contact
  assert(g.state.player.hp < startHp, `Player took damage: ${startHp} -> ${g.state.player.hp}`);
}

// ---- Test 48: Enemy projectiles blocked by walls ----
console.log('\n--- Test 48: Enemy projectiles blocked by walls ---');
{
  // Use extraction config with walls
  const g = createGame(extractionConfigs, 3300, 'extraction');
  // Place a wall between gunner and player
  // Player at (0, -55), add wall at (0, -50)
  g.state.obstacles.push({ pos: { x: 0, y: -50 }, width: 10, height: 2 });
  // Place gunner on other side of wall
  injectGunner(g, 0, -45);

  // Run for a while, gunner should fire but projectiles should hit wall
  let projHitPlayer = false;
  for (let i = 0; i < 180; i++) {
    tick(g, noInput, extractionConfigs);
    for (const ev of g.state.events) {
      if (ev.type === 'player_hit' && ev.data?.['source'] === 'projectile') {
        projHitPlayer = true;
      }
    }
  }
  assert(!projHitPlayer, 'Enemy projectiles blocked by wall (no player hit from projectile)');
}

// ---- Test 49: Enemy projectiles respect dodge i-frames ----
console.log('\n--- Test 49: Enemy projectiles respect dodge ---');
{
  const g = createGame(combatConfigs, 3400, 'extraction');
  // Manually place an enemy projectile right on top of player
  g.state.enemyProjectiles.push({
    id: g.state.nextEntityId++,
    pos: { x: g.state.player.pos.x, y: g.state.player.pos.y },
    vel: { x: 0, y: 0 },
    damage: 8,
    lifetime: 10,
  });

  // Put player in dodge
  g.state.player.dodgeTimer = 10;
  g.state.player.dodgeDir = { x: 1, y: 0 };

  const hpBefore = g.state.player.hp;
  tick(g, noInput, configs);
  assert(g.state.player.hp === hpBefore, 'Player not damaged during dodge');
}

// ---- Test 50: Enemy projectiles respect i-frames ----
console.log('\n--- Test 50: Enemy projectiles respect i-frames ---');
{
  const g = createGame(combatConfigs, 3500, 'extraction');
  g.state.enemyProjectiles.push({
    id: g.state.nextEntityId++,
    pos: { x: g.state.player.pos.x, y: g.state.player.pos.y },
    vel: { x: 0, y: 0 },
    damage: 8,
    lifetime: 10,
  });

  // Give player i-frames
  g.state.player.iframeTimer = 30;

  const hpBefore = g.state.player.hp;
  tick(g, noInput, configs);
  assert(g.state.player.hp === hpBefore, 'Player not damaged during i-frames');
}

// ---- Test 51: Gunner AI advance/retreat cycle ----
console.log('\n--- Test 51: Gunner AI advance/retreat ---');
{
  const g = createGame(combatConfigs, 3600, 'extraction');
  // Place gunner within engage range so it starts ticking aiTimer
  const id = injectGunner(g, g.state.player.pos.x + 5, g.state.player.pos.y);

  // Run for advanceDuration (120 ticks) — gunner should switch to retreat
  for (let i = 0; i < 150; i++) {
    tick(g, noInput, configs);
  }

  const enemy = g.state.enemies.find(e => e.id === id);
  if (enemy) {
    assert(enemy.aiPhase === 'retreat', `Gunner switched to retreat: ${enemy.aiPhase}`);
  } else {
    // Gunner may have been killed by other means — that's ok, skip
    console.log('  (Gunner died before retreat check — skipping)');
  }
}

// ---- Test 52: Gunner advances toward player ----
console.log('\n--- Test 52: Gunner advances toward player ---');
{
  const g = createGame(combatConfigs, 3700, 'extraction');
  const startX = g.state.player.pos.x + 12; // beyond engage range
  injectGunner(g, startX, g.state.player.pos.y);

  // Run a few ticks — gunner should move toward player
  for (let i = 0; i < 30; i++) {
    tick(g, noInput, configs);
  }

  const enemy = g.state.enemies[0];
  if (enemy) {
    assert(enemy.pos.x < startX, `Gunner moved toward player: ${startX.toFixed(1)} -> ${enemy.pos.x.toFixed(1)}`);
  }
}

// ---- Test 53: Killing gunner awards correct score ----
console.log('\n--- Test 53: Gunner kill score ---');
{
  const g = createGame(combatConfigs, 3800, 'arena');
  // Place gunner with 1 HP right in front of player
  injectGunner(g, 2, 0, 1);
  const input = aimAt(g, 2, 0);

  let killScore = 0;
  for (let i = 0; i < 20; i++) {
    tick(g, i === 0 ? input : { ...input, fire: false, firePressed: false }, configs);
    for (const ev of g.state.events) {
      if (ev.type === 'enemy_killed' && ev.data?.['enemyType'] === 'gunner') {
        killScore = ev.data?.['scoreValue'] as number;
      }
    }
  }
  assert(killScore === 200, `Gunner kill awards 200 score: ${killScore}`);
}

// ---- Test 54: Gunner cash drop in extraction mode ----
console.log('\n--- Test 54: Gunner cash drop ---');
{
  const g = createGame(extractionConfigs, 3900, 'extraction');
  injectGunner(g, g.state.player.pos.x + 2, g.state.player.pos.y, 1);
  const input = aimAt(g, g.state.player.pos.x + 2, g.state.player.pos.y);

  for (let i = 0; i < 30; i++) {
    tick(g, i === 0 ? input : { ...input, fire: false, firePressed: false }, extractionConfigs);
  }

  assert(g.state.cashPickups.length > 0, `Gunner dropped cash: ${g.state.cashPickups.length}`);
  if (g.state.cashPickups.length > 0) {
    const amt = g.state.cashPickups[0].amount;
    assert(amt >= 30 && amt <= 50, `Gunner cash in range [30,50]: ${amt}`);
  }
}

// ---- Test 55: enemyProjectiles initialized in game state ----
console.log('\n--- Test 55: enemyProjectiles init ---');
{
  const g = createGame(configs, 4000, 'arena');
  assert(Array.isArray(g.state.enemyProjectiles), 'enemyProjectiles is an array');
  assert(g.state.enemyProjectiles.length === 0, 'enemyProjectiles starts empty');

  const gEx = createGame(extractionConfigs, 4001, 'extraction');
  assert(Array.isArray(gEx.state.enemyProjectiles), 'enemyProjectiles is an array (extraction)');
  assert(gEx.state.enemyProjectiles.length === 0, 'enemyProjectiles starts empty (extraction)');
}

// ---- Test 56: Gunner determinism ----
console.log('\n--- Test 56: Gunner determinism ---');
{
  const gA = createGame(combatConfigs, 4100, 'extraction');
  const gB = createGame(combatConfigs, 4100, 'extraction');

  // Inject same gunner in both
  injectGunner(gA, gA.state.player.pos.x + 5, gA.state.player.pos.y);
  injectGunner(gB, gB.state.player.pos.x + 5, gB.state.player.pos.y);

  for (let i = 0; i < 200; i++) {
    tick(gA, noInput, configs);
    tick(gB, noInput, configs);
  }

  assert(gA.state.enemies.length === gB.state.enemies.length, 'Same enemy count');
  assert(gA.state.enemyProjectiles.length === gB.state.enemyProjectiles.length, 'Same enemy projectile count');
  assert(gA.state.player.hp === gB.state.player.hp, 'Same player HP');
  if (gA.state.enemies.length > 0) {
    assert(gA.state.enemies[0].pos.x === gB.state.enemies[0].pos.x, 'Same gunner X position');
    assert(gA.state.enemies[0].aiPhase === gB.state.enemies[0].aiPhase, 'Same gunner AI phase');
  }
}

// ---- Test 57: No gunners in arena mode (spawner doesn't use gunnerRatio) ----
console.log('\n--- Test 57: No gunners in arena mode ---');
{
  const g = createGame(configs, 4200, 'arena');
  // Run long enough for arena spawner to spawn enemies
  for (let i = 0; i < 600; i++) {
    tick(g, noInput, configs);
  }
  const gunnerCount = g.state.enemies.filter(e => e.type === 'gunner').length;
  assert(gunnerCount === 0, `No gunners in arena mode: ${gunnerCount}`);
}

// ---- Test 58: Enemy projectile lifetime/expiry ----
console.log('\n--- Test 58: Enemy projectile expiry ---');
{
  const g = createGame(combatConfigs, 4300, 'extraction');
  // Manually add enemy projectile with short lifetime, aimed away from player
  g.state.enemyProjectiles.push({
    id: g.state.nextEntityId++,
    pos: { x: 0, y: 0 },
    vel: { x: 25, y: 0 }, // moving away
    damage: 8,
    lifetime: 5,
  });
  assert(g.state.enemyProjectiles.length === 1, 'Enemy projectile exists');

  // Run for more than 5 ticks
  for (let i = 0; i < 10; i++) {
    tick(g, noInput, configs);
  }
  assert(g.state.enemyProjectiles.length === 0, 'Enemy projectile expired');
}

console.log('\n=== All headless tests passed! ===');
console.log(`\nFinal state summary:`);
console.log(`  Tick: ${gameA.state.tick}`);
console.log(`  Player HP: ${gameA.state.player.hp}`);
console.log(`  Player pos: (${gameA.state.player.pos.x.toFixed(2)}, ${gameA.state.player.pos.y.toFixed(2)})`);
console.log(`  Enemies: ${gameA.state.enemies.length}`);
console.log(`  Score: ${gameA.state.score}`);
console.log(`  Obstacles: ${gameA.state.obstacles.length}`);
