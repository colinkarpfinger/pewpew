import type { GameEvent, GameState, GameEventType } from '../simulation/types.ts';

interface SoundEventConfig {
  files: string[];
  volume: number;
  pitchRange: number[];
  maxInstances: number;
  cooldown: number;
  spatial: boolean;
}

export interface AudioConfig {
  masterVolume: number;
  events: Record<string, SoundEventConfig>;
}

interface ActiveInstance {
  source: AudioBufferSourceNode;
  startTime: number;
}

const EVENT_MAP: Partial<Record<GameEventType, string>> = {
  projectile_fired: 'rifle_fire',
  enemy_hit: 'enemy_hit',
  enemy_killed: 'enemy_killed',
  player_hit: 'player_hit',
  reload_start: 'reload_start',
  reload_complete: 'reload_complete',
  reload_fumbled: 'reload_fumbled',
  player_dodge_start: 'dodge',
  grenade_thrown: 'grenade_throw',
  grenade_bounced: 'grenade_bounce',
  grenade_exploded: 'grenade_explode',
  crate_picked_up: 'crate_pickup',
  enemy_projectile_fired: 'enemy_fire',
};

export class AudioSystem {
  private config: AudioConfig;
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private instances = new Map<string, ActiveInstance[]>();
  private lastPlayTime = new Map<string, number>();
  private playerX = 0;
  private arenaHalfWidth = 15;
  private initialized = false;

  constructor(config: AudioConfig) {
    this.config = config;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.config.masterVolume;
    this.masterGain.connect(this.ctx.destination);

    // Collect unique file paths
    const uniqueFiles = new Set<string>();
    for (const ev of Object.values(this.config.events)) {
      for (const f of ev.files) uniqueFiles.add(f);
    }

    // Fetch and decode all audio files
    const entries = await Promise.all(
      [...uniqueFiles].map(async (file) => {
        try {
          const resp = await fetch(file);
          const arrayBuf = await resp.arrayBuffer();
          const audioBuf = await this.ctx!.decodeAudioData(arrayBuf);
          return [file, audioBuf] as const;
        } catch (e) {
          console.warn(`Failed to load audio file: ${file}`, e);
          return null;
        }
      }),
    );

    for (const entry of entries) {
      if (entry) this.buffers.set(entry[0], entry[1]);
    }
  }

  processEvents(events: GameEvent[], state: GameState): void {
    this.playerX = state.player.pos.x;
    this.arenaHalfWidth = state.arena.width / 2;

    for (const ev of events) {
      let audioEvent = EVENT_MAP[ev.type];
      if (!audioEvent) continue;

      const d = ev.data;

      // Route headshot hits to dedicated headshot sound
      if (ev.type === 'enemy_hit' && d?.headshot) {
        audioEvent = 'headshot';
      }

      const worldX = d && typeof d.x === 'number' ? d.x : undefined;
      this.playEvent(audioEvent, worldX);
    }
  }

  private playEvent(eventName: string, worldX?: number): void {
    if (!this.ctx || !this.masterGain) return;

    const cfg = this.config.events[eventName];
    if (!cfg) return;

    // Cooldown check
    const now = this.ctx.currentTime;
    const lastPlay = this.lastPlayTime.get(eventName) ?? 0;
    if (now - lastPlay < cfg.cooldown) return;

    // Get or create instance list
    let active = this.instances.get(eventName);
    if (!active) {
      active = [];
      this.instances.set(eventName, active);
    }

    // Prune finished instances
    active = active.filter((inst) => {
      try {
        // Source is still playing if its buffer duration hasn't elapsed
        const buf = inst.source.buffer;
        if (!buf) return false;
        const elapsed = now - inst.startTime;
        return elapsed < buf.duration / (inst.source.playbackRate.value || 1);
      } catch {
        return false;
      }
    });
    this.instances.set(eventName, active);

    // Evict oldest if at cap
    if (active.length >= cfg.maxInstances) {
      const oldest = active.shift()!;
      try { oldest.source.stop(); } catch { /* already stopped */ }
    }

    // Pick random file
    const file = cfg.files[Math.floor(Math.random() * cfg.files.length)];
    const buffer = this.buffers.get(file);
    if (!buffer) return;

    // Build node chain: source -> gain -> panner -> master
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const gain = this.ctx.createGain();
    gain.gain.value = cfg.volume;

    const panner = this.ctx.createStereoPanner();
    if (cfg.spatial && worldX !== undefined) {
      const pan = Math.max(-1, Math.min(1, (worldX - this.playerX) / this.arenaHalfWidth));
      panner.pan.value = pan;
    } else {
      panner.pan.value = 0;
    }

    source.connect(gain);
    gain.connect(panner);
    panner.connect(this.masterGain);

    // Pitch variation
    const [minPitch, maxPitch] = cfg.pitchRange;
    source.playbackRate.value = minPitch + Math.random() * (maxPitch - minPitch);

    source.start();
    active.push({ source, startTime: now });
    this.lastPlayTime.set(eventName, now);
  }

  setMasterVolume(volume: number): void {
    if (this.masterGain) {
      this.masterGain.gain.value = volume;
    }
  }

  dispose(): void {
    for (const active of this.instances.values()) {
      for (const inst of active) {
        try { inst.source.stop(); } catch { /* already stopped */ }
      }
    }
    this.instances.clear();
    this.lastPlayTime.clear();
    this.buffers.clear();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.masterGain = null;
    this.initialized = false;
  }
}
