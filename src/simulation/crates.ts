import type { GameState, CrateConfig, CrateType } from './types.ts';
import type { SeededRNG } from './rng.ts';

/** Roll weighted random crate type from config weights */
function rollCrateType(types: Record<string, number>, rng: SeededRNG): CrateType {
  const entries = Object.entries(types);
  let total = 0;
  for (const [, w] of entries) total += w;
  let roll = rng.next() * total;
  for (const [name, w] of entries) {
    roll -= w;
    if (roll <= 0) return name as CrateType;
  }
  return entries[0][0] as CrateType;
}

/** Scan enemy_killed / multikill events and roll for crate drops */
export function spawnCrates(state: GameState, config: CrateConfig, rng: SeededRNG): void {
  // Check if a multikill happened this tick (upgrades drop chance)
  let hasMultikill = false;
  for (const ev of state.events) {
    if (ev.type === 'multikill') {
      hasMultikill = true;
      break;
    }
  }

  const chance = hasMultikill ? config.multikillDropChance : config.dropChance;

  for (const ev of state.events) {
    if (ev.type !== 'enemy_killed') continue;
    const d = ev.data;
    if (!d || typeof d.x !== 'number' || typeof d.y !== 'number') continue;

    if (rng.next() >= chance) continue;

    const crateType = rollCrateType(config.types, rng);
    const crate = {
      id: state.nextEntityId++,
      pos: { x: d.x as number, y: d.y as number },
      crateType,
      lifetime: config.lifetime,
    };
    state.crates.push(crate);
    state.events.push({
      tick: state.tick,
      type: 'crate_spawned',
      data: { x: crate.pos.x, y: crate.pos.y, crateType },
    });
  }
}

/** Check player-crate circle-circle collision, apply pickup effects */
export function checkCratePickups(state: GameState, config: CrateConfig): void {
  const p = state.player;
  for (let i = state.crates.length - 1; i >= 0; i--) {
    const crate = state.crates[i];
    const dx = p.pos.x - crate.pos.x;
    const dy = p.pos.y - crate.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > p.radius + config.radius) continue;

    // Apply effect
    if (crate.crateType === 'health') {
      p.hp = Math.min(p.hp + config.healthAmount, p.maxHp);
    } else if (crate.crateType === 'grenade') {
      state.grenadeAmmo++;
    }

    state.events.push({
      tick: state.tick,
      type: 'crate_picked_up',
      data: { x: crate.pos.x, y: crate.pos.y, crateType: crate.crateType },
    });

    state.crates.splice(i, 1);
  }
}

/** Decrement crate lifetimes and remove expired ones */
export function updateCrateLifetimes(state: GameState): void {
  for (let i = state.crates.length - 1; i >= 0; i--) {
    state.crates[i].lifetime--;
    if (state.crates[i].lifetime <= 0) {
      const crate = state.crates[i];
      state.events.push({
        tick: state.tick,
        type: 'crate_expired',
        data: { x: crate.pos.x, y: crate.pos.y, crateType: crate.crateType },
      });
      state.crates.splice(i, 1);
    }
  }
}
