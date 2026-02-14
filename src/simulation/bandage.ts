import type { GameState, InputState, BandageConfig, BandageType } from './types.ts';
import { removeItemFromBackpack, countItemInBackpack } from './inventory.ts';

const DEF_ID_TO_BANDAGE_TYPE: Record<string, BandageType> = {
  bandage_small: 'small',
  bandage_large: 'large',
};

export function updateHeal(state: GameState, input: InputState, config: BandageConfig): void {
  const player = state.player;

  // If not healing, check for heal start input
  if (player.healTimer === 0) {
    if (state.gameMode === 'extraction') {
      // Extraction mode: use hotbar system
      if (input.hotbarUse !== null && player.dodgeTimer === 0 && player.weaponSwapTimer === 0) {
        const defId = player.inventory.hotbar[input.hotbarUse];
        if (defId) {
          const bandageType = DEF_ID_TO_BANDAGE_TYPE[defId];
          if (bandageType && countItemInBackpack(player.inventory, defId) > 0) {
            if (player.reloadTimer > 0) {
              player.reloadTimer = 0;
              player.reloadFumbled = false;
            }
            startHealExtraction(state, config, bandageType, defId);
          }
        }
      }
      return;
    }

    // Arena mode: legacy inputs
    if (input.healSmall && player.bandageSmallCount > 0 && player.dodgeTimer === 0) {
      // Cancel reload if in progress
      if (player.reloadTimer > 0) {
        player.reloadTimer = 0;
        player.reloadFumbled = false;
      }
      startHeal(state, config, 'small');
    } else if (input.healLarge && player.bandageLargeCount > 0 && player.dodgeTimer === 0) {
      if (player.reloadTimer > 0) {
        player.reloadTimer = 0;
        player.reloadFumbled = false;
      }
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
  // In extraction mode, any hotbar press during healing counts as the active heal input
  const healInput = state.gameMode === 'extraction'
    ? input.hotbarUse !== null
    : (healType === 'small' ? input.healSmall : input.healLarge);
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

function startHealExtraction(state: GameState, config: BandageConfig, type: BandageType, defId: string): void {
  const player = state.player;

  // Consume from backpack immediately (risk/reward: consumed even if interrupted)
  removeItemFromBackpack(player.inventory, defId, 1);
  // Sync legacy counts
  player.bandageSmallCount = countItemInBackpack(player.inventory, 'bandage_small');
  player.bandageLargeCount = countItemInBackpack(player.inventory, 'bandage_large');

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
