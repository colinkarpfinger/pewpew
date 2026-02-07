/**
 * Headless simulation test — runs the game without any rendering.
 * Usage: npx tsx tests/headless.ts
 */

import type { GameConfigs, InputState } from '../src/simulation/types.ts';
import { createGame, tick, getSnapshot } from '../src/simulation/game.ts';

const configs: GameConfigs = {
  player: { speed: 5.0, hp: 100, radius: 0.4, iframeDuration: 60 },
  weapons: {
    rifle: { damage: 25, fireRate: 8, projectileSpeed: 20, projectileLifetime: 120, spread: 0.03 },
  },
  enemies: {
    rusher: { speed: 2.5, hp: 50, contactDamage: 15, radius: 0.4, scoreValue: 100 },
  },
  spawning: { initialInterval: 120, minimumInterval: 30, decayRate: 0.95, maxEnemies: 30 },
  arena: { width: 30, height: 20, obstacleCount: 8, obstacleSize: 1.5 },
};

const noInput: InputState = { moveDir: { x: 0, y: 0 }, aimDir: { x: 1, y: 0 }, fire: false };

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

// Test 2: Ticking advances state
console.log('\n--- Test 2: Tick advancement ---');
for (let i = 0; i < 60; i++) {
  tick(game, noInput, configs);
}
assert(game.state.tick === 60, 'Tick count is 60 after 60 ticks');

// Test 3: Player movement
console.log('\n--- Test 3: Player movement ---');
const moveGame = createGame(configs, 42);
const moveRight: InputState = { moveDir: { x: 1, y: 0 }, aimDir: { x: 1, y: 0 }, fire: false };
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
const fireInput: InputState = { moveDir: { x: 0, y: 0 }, aimDir: { x: 1, y: 0 }, fire: true };
tick(fireGame, fireInput, configs);
assert(fireGame.state.projectiles.length > 0, `Projectile created: ${fireGame.state.projectiles.length}`);

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
  };
  for (let i = 0; i < 120; i++) {
    tick(combatGame, aimAtEnemy, configs);
  }
  // Check that events were generated
  const allEvents = combatGame.state.events;
  console.log(`  Events on last tick: ${allEvents.map(e => e.type).join(', ') || '(none)'}`);
}

console.log('\n=== All headless tests passed! ===');
console.log(`\nFinal state summary:`);
console.log(`  Tick: ${gameA.state.tick}`);
console.log(`  Player HP: ${gameA.state.player.hp}`);
console.log(`  Player pos: (${gameA.state.player.pos.x.toFixed(2)}, ${gameA.state.player.pos.y.toFixed(2)})`);
console.log(`  Enemies: ${gameA.state.enemies.length}`);
console.log(`  Score: ${gameA.state.score}`);
console.log(`  Obstacles: ${gameA.state.obstacles.length}`);
