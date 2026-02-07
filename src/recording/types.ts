import type { InputState, GameState } from '../simulation/types.ts';

export interface FullReplay {
  type: 'full';
  seed: number;
  configs: string; // JSON-stringified GameConfigs
  inputs: InputState[];
}

export interface RingReplay {
  type: 'ring';
  startTick: number;
  rngState: number;
  stateSnapshot: GameState;
  configs: string; // JSON-stringified GameConfigs
  inputs: InputState[];
}

export type Replay = FullReplay | RingReplay;

export interface ReplayFileInfo {
  filename: string;
  type: 'full' | 'ring';
  timestamp: string;
}
