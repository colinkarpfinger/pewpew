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
    let range = config.sprinterBills;
    if (enemyType === 'gunner') range = config.gunnerBills;
    const billCount = rng.int(range[0], range[1]);

    const cx = d.x as number;
    const cy = d.y as number;
    for (let i = 0; i < billCount; i++) {
      const angle = rng.range(0, Math.PI * 2);
      const dist = rng.range(0, config.scatterRadius);
      const pickup = {
        id: state.nextEntityId++,
        pos: { x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist },
        amount: config.denomination,
      };
      state.cashPickups.push(pickup);
      state.events.push({
        tick: state.tick,
        type: 'cash_spawned',
        data: { x: pickup.pos.x, y: pickup.pos.y, amount: config.denomination },
      });
    }
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
