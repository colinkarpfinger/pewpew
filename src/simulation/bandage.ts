import type { GameState, InputState, BandageConfig, BandageType } from './types.ts';

export function updateHeal(state: GameState, input: InputState, config: BandageConfig): void {
  const player = state.player;

  // If not healing, check for heal start input
  if (player.healTimer === 0) {
    if (input.healSmall && player.bandageSmallCount > 0 && player.dodgeTimer === 0) {
      startHeal(state, config, 'small');
    } else if (input.healLarge && player.bandageLargeCount > 0 && player.dodgeTimer === 0) {
      startHeal(state, config, 'large');
    }
    return;
  }

  // Currently healing — check for interruption via dodge
  if (input.dodge) {
    interruptHeal(state);
    return;
  }

  const healType = player.healType!;
  const tierConfig = config[healType];
  const progress = player.healTimer / tierConfig.healTime;

  // Check for active/perfect heal attempt (same key as started with)
  const healInput = healType === 'small' ? input.healSmall : input.healLarge;
  if (healInput && !player.healFumbled) {
    if (progress >= tierConfig.perfectHealStart && progress <= tierConfig.perfectHealEnd) {
      completeHeal(state, config, healType, 'perfect');
      return;
    } else if (progress >= tierConfig.activeHealStart && progress <= tierConfig.activeHealEnd) {
      completeHeal(state, config, healType, 'active');
      return;
    }
    // Missed the window — fumble
    player.healFumbled = true;
    state.events.push({
      tick: state.tick,
      type: 'heal_fumbled',
      data: { healType },
    });
  }

  // Advance heal timer
  player.healTimer++;

  // Heal finished naturally
  if (player.healTimer > tierConfig.healTime) {
    completeHeal(state, config, healType, 'normal');
  }
}

function startHeal(state: GameState, config: BandageConfig, type: BandageType): void {
  const player = state.player;

  // Consume bandage immediately (risk/reward: consumed even if interrupted)
  if (type === 'small') {
    player.bandageSmallCount--;
  } else {
    player.bandageLargeCount--;
  }

  player.healTimer = 1;
  player.healType = type;
  player.healFumbled = false;
  player.healSpeedMultiplier = config[type].speedMultiplier;

  state.events.push({
    tick: state.tick,
    type: 'heal_start',
    data: { healType: type },
  });
}

function completeHeal(state: GameState, config: BandageConfig, healType: BandageType, quality: 'normal' | 'active' | 'perfect'): void {
  const player = state.player;
  const tierConfig = config[healType];

  let healAmount = tierConfig.healAmount;
  if (quality === 'perfect') {
    healAmount *= tierConfig.perfectHealBonus;
  } else if (quality === 'active') {
    healAmount *= tierConfig.activeHealBonus;
  }

  player.hp = Math.min(player.hp + healAmount, player.maxHp);
  player.healTimer = 0;
  player.healType = null;
  player.healFumbled = false;
  player.healSpeedMultiplier = 1.0;

  state.events.push({
    tick: state.tick,
    type: 'heal_complete',
    data: { healType, quality, healAmount },
  });
}

export function interruptHeal(state: GameState): void {
  const player = state.player;
  if (player.healTimer === 0) return;

  const healType = player.healType;
  player.healTimer = 0;
  player.healType = null;
  player.healFumbled = false;
  player.healSpeedMultiplier = 1.0;

  state.events.push({
    tick: state.tick,
    type: 'heal_interrupted',
    data: { healType },
  });
}
