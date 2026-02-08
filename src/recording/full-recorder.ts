import type { InputState } from '../simulation/types.ts';
import type { FullReplay } from './types.ts';

export class FullRecorder {
  private seed: number;
  private configsJson: string;
  private inputs: InputState[] = [];

  constructor(seed: number, configsJson: string) {
    this.seed = seed;
    this.configsJson = configsJson;
  }

  /** Call before each tick() with the input that will be fed to the simulation */
  recordTick(input: InputState): void {
    this.inputs.push({
      moveDir: { x: input.moveDir.x, y: input.moveDir.y },
      aimDir: { x: input.aimDir.x, y: input.aimDir.y },
      fire: input.fire,
      headshotTargetId: input.headshotTargetId,
      dodge: input.dodge,
      reload: input.reload,
    });
  }

  toReplay(): FullReplay {
    return {
      type: 'full',
      seed: this.seed,
      configs: this.configsJson,
      inputs: this.inputs,
    };
  }
}
