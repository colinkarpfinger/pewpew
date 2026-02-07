import type { GameEvent, GameEventType } from './types.ts';

export class EventLog {
  private events: GameEvent[] = [];

  append(tick: number, type: GameEventType, data?: Record<string, unknown>): void {
    this.events.push({ tick, type, data });
  }

  getAll(): GameEvent[] {
    return this.events;
  }

  getByType(type: GameEventType): GameEvent[] {
    return this.events.filter(e => e.type === type);
  }

  getByTick(tick: number): GameEvent[] {
    return this.events.filter(e => e.tick === tick);
  }

  clear(): void {
    this.events = [];
  }
}
