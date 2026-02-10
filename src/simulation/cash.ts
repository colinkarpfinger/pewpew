import type { GameState, CashConfig, EnemyType } from './types.ts';
import type { SeededRNG } from './rng.ts';

/** Scan enemy_killed events and spawn cash pickups (extraction mode only) */
export function spawnCash(state: GameState, config: CashConfig | undefined, rng: SeededRNG): void {
  if (!config) return;
  if (state.gameMode !== 'extraction') return;

  for (const ev of state.events) {
    if (ev.type !== 'enemy_killed') continue;
    const d = ev.data;
    if (!d || typeof d.x !== 'number' || typeof d.y !== 'number') continue;

    const enemyType = d.enemyType as EnemyType | undefined;
    let range = config.rusherAmount;
    if (enemyType === 'sprinter') range = config.sprinterAmount;
    else if (enemyType === 'gunner') range = config.gunnerAmount;
    const amount = rng.int(range[0], range[1]);

    const pickup = {
      id: state.nextEntityId++,
      pos: { x: d.x as number, y: d.y as number },
      amount,
    };
    state.cashPickups.push(pickup);
    state.events.push({
      tick: state.tick,
      type: 'cash_spawned',
      data: { x: pickup.pos.x, y: pickup.pos.y, amount },
    });
  }
}

/** Check player-cash circle collision, add to runCash on pickup */
export function checkCashPickups(state: GameState, config: CashConfig | undefined): void {
  if (!config) return;

  const p = state.player;
  for (let i = state.cashPickups.length - 1; i >= 0; i--) {
    const cash = state.cashPickups[i];
    const dx = p.pos.x - cash.pos.x;
    const dy = p.pos.y - cash.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > p.radius + config.pickupRadius) continue;

    state.runCash += cash.amount;

    state.events.push({
      tick: state.tick,
      type: 'cash_picked_up',
      data: { amount: cash.amount, totalRunCash: state.runCash, x: cash.pos.x, y: cash.pos.y },
    });

    state.cashPickups.splice(i, 1);
  }
}
