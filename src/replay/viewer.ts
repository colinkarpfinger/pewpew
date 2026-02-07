import type { GameConfigs, GameState } from '../simulation/types.ts';
import { TICK_DURATION } from '../simulation/types.ts';
import { createGame, restoreGame, tick } from '../simulation/game.ts';
import type { GameInstance } from '../simulation/game.ts';
import type { Replay } from '../recording/types.ts';
import type { Renderer } from '../rendering/renderer.ts';

export class ReplayViewer {
  private replay: Replay;
  private configs: GameConfigs;
  private game: GameInstance;
  private renderer: Renderer;
  private currentTick = 0;
  private playing = true;
  private speed = 1;
  private accumulator = 0;
  private onTickUpdateFn: ((tick: number, total: number) => void) | null = null;
  private onFinishFn: (() => void) | null = null;

  readonly totalTicks: number;

  constructor(replay: Replay, renderer: Renderer) {
    this.replay = replay;
    this.configs = JSON.parse(replay.configs);
    this.renderer = renderer;
    this.totalTicks = replay.inputs.length;
    this.game = this.createInitialGame();
  }

  private createInitialGame(): GameInstance {
    if (this.replay.type === 'full') {
      return createGame(this.configs, this.replay.seed);
    } else {
      return restoreGame(this.replay.stateSnapshot, this.replay.rngState);
    }
  }

  /** Get current simulation state for rendering */
  getState(): GameState {
    return this.game.state;
  }

  /** Called from the main game loop with real dt */
  update(dt: number): void {
    if (!this.playing) return;

    this.accumulator += dt * this.speed;

    while (this.accumulator >= TICK_DURATION && this.currentTick < this.totalTicks) {
      const input = this.replay.inputs[this.currentTick];
      tick(this.game, input, this.configs);
      this.currentTick++;
      this.accumulator -= TICK_DURATION;
    }

    if (this.currentTick >= this.totalTicks) {
      this.playing = false;
      this.onFinishFn?.();
    }

    this.renderer.syncState(this.game.state);
    this.renderer.render();
    this.onTickUpdateFn?.(this.currentTick, this.totalTicks);
  }

  /** Render the current frame without advancing (for paused state) */
  renderFrame(): void {
    this.renderer.syncState(this.game.state);
    this.renderer.render();
  }

  /** Scrub to a specific tick by re-simulating from start/snapshot */
  scrubTo(targetTick: number): void {
    const clamped = Math.max(0, Math.min(targetTick, this.totalTicks));
    this.game = this.createInitialGame();
    for (let i = 0; i < clamped; i++) {
      tick(this.game, this.replay.inputs[i], this.configs);
    }
    this.currentTick = clamped;
    this.accumulator = 0;

    this.renderer.syncState(this.game.state);
    this.renderer.render();
    this.onTickUpdateFn?.(this.currentTick, this.totalTicks);
  }

  setPlaying(playing: boolean): void {
    this.playing = playing;
    // If we've finished and user hits play, restart
    if (playing && this.currentTick >= this.totalTicks) {
      this.scrubTo(0);
      this.playing = true;
    }
  }

  isPlaying(): boolean {
    return this.playing;
  }

  setSpeed(speed: number): void {
    this.speed = speed;
  }

  getCurrentTick(): number {
    return this.currentTick;
  }

  onTickUpdate(fn: (tick: number, total: number) => void): void {
    this.onTickUpdateFn = fn;
  }

  onReplayFinish(fn: () => void): void {
    this.onFinishFn = fn;
  }
}
