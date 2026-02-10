import type { InputState, Vec2 } from './simulation/types.ts';

/** Lightweight enemy reference for auto-targeting (no Three.js dependency) */
export interface EnemyRef {
  id: number;
  pos: Vec2;
  radius: number;
}

/** Abstract input handler — implemented by desktop (InputHandler) and mobile (TouchInputHandler) */
export interface IInputHandler {
  setPlayerPos(pos: Vec2): void;
  setEnemies(enemies: EnemyRef[]): void;
  getInput(): InputState;
  /** Consume edge-detected inputs (dodge, reload, grenade). Call only after simulation ticks have processed them. */
  consumeEdgeInputs(): void;
  dispose(): void;
}
