/**
 * Headless replay runner — replays a saved game without rendering.
 * Usage: npx tsx tests/replay.ts <path-to-replay.json>
 */

import fs from 'node:fs';
import type { GameConfigs } from '../src/simulation/types.ts';
import { createGame, restoreGame, tick } from '../src/simulation/game.ts';
import type { GameInstance } from '../src/simulation/game.ts';
import type { Replay } from '../src/recording/types.ts';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: npx tsx tests/replay.ts <path-to-replay.json>');
  process.exit(1);
}

const raw = fs.readFileSync(filePath, 'utf-8');
const replay: Replay = JSON.parse(raw);
const configs: GameConfigs = JSON.parse(replay.configs);

let game: GameInstance;
if (replay.type === 'full') {
  console.log(`Full replay: seed=${replay.seed}, ${replay.inputs.length} ticks`);
  game = createGame(configs, replay.seed);
} else {
  console.log(`Ring replay: startTick=${replay.startTick}, ${replay.inputs.length} ticks`);
  game = restoreGame(replay.stateSnapshot, replay.rngState);
}

let totalEvents = 0;
for (let i = 0; i < replay.inputs.length; i++) {
  tick(game, replay.inputs[i], configs);
  if (game.state.events.length > 0) {
    for (const ev of game.state.events) {
      console.log(`  [tick ${game.state.tick}] ${ev.type}${ev.data ? ' ' + JSON.stringify(ev.data) : ''}`);
    }
    totalEvents += game.state.events.length;
  }
}

console.log(`\n=== Replay complete ===`);
console.log(`  Final tick: ${game.state.tick}`);
console.log(`  Player HP: ${game.state.player.hp}`);
console.log(`  Player pos: (${game.state.player.pos.x.toFixed(2)}, ${game.state.player.pos.y.toFixed(2)})`);
console.log(`  Enemies: ${game.state.enemies.length}`);
console.log(`  Score: ${game.state.score}`);
console.log(`  Game over: ${game.state.gameOver}`);
console.log(`  Total events: ${totalEvents}`);
