import type { InputState, GameState } from '../simulation/types.ts';
import type { GameInstance } from '../simulation/game.ts';
import { cloneState } from '../simulation/game.ts';
import type { RingReplay } from './types.ts';

const RING_SIZE = 600; // ~10 seconds at 60 ticks/sec

export class RingRecorder {
  private inputs: InputState[] = [];
  private snapshot: GameState;
  private rngState: number;
  private startTick: number;
  private ticksSinceCheckpoint = 0;

  constructor(game: GameInstance) {
    this.snapshot = cloneState(game.state);
    this.rngState = game.rng.getState();
    this.startTick = game.state.tick;
  }

  /** Call before each tick(). Checkpoints when the ring buffer is full. */
  recordTick(input: InputState, game: GameInstance): void {
    if (this.ticksSinceCheckpoint >= RING_SIZE) {
      // Checkpoint: save current state and reset buffer
      this.snapshot = cloneState(game.state);
      this.rngState = game.rng.getState();
      this.startTick = game.state.tick;
      this.inputs = [];
      this.ticksSinceCheckpoint = 0;
    }

    this.inputs.push({
      moveDir: { x: input.moveDir.x, y: input.moveDir.y },
      aimDir: { x: input.aimDir.x, y: input.aimDir.y },
      fire: input.fire,
      firePressed: input.firePressed,
      headshotTargetId: input.headshotTargetId,
      dodge: input.dodge,
      reload: input.reload,
      throwGrenade: input.throwGrenade,
      throwPower: input.throwPower,
      healSmall: input.healSmall,
      healLarge: input.healLarge,
      interact: input.interact,
    });
    this.ticksSinceCheckpoint++;
  }

  toReplay(configsJson: string): RingReplay {
    return {
      type: 'ring',
      startTick: this.startTick,
      rngState: this.rngState,
      stateSnapshot: this.snapshot,
      configs: configsJson,
      inputs: this.inputs,
    };
  }
}
