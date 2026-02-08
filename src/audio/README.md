# Audio System

## Overview

The `AudioSystem` is a Web Audio API middleware that maps `GameEvent`s to sound playback. It follows the same pattern as `ParticleSystem` — a presentation-layer consumer of simulation events with no influence on game state.

## Architecture

### Audio Graph (per play instance)

```
AudioBufferSourceNode → GainNode → StereoPannerNode → masterGain → destination
```

- Each sound play creates this chain on the fly
- `masterGain` is shared across all sounds and set from `audio.json`'s `masterVolume`

### Files

| File | Purpose |
|------|---------|
| `src/audio/audio.ts` | `AudioSystem` class — all playback logic |
| `src/configs/audio.json` | Sound event definitions (files, volume, pitch, polyphony, cooldowns) |
| `assets/audio/` | Wav files organized by category |

### Integration in main.ts

```typescript
const audioSystem = new AudioSystem(audioConfig);

// In startGame() — must be called from user gesture (click) for browser AudioContext policy
audioSystem.init();

// In game loop, after updateParticles
audioSystem.processEvents(frameEvents, state);
```

## Event Routing

`processEvents()` maps `GameEventType` → audio event name via `EVENT_MAP`:

| GameEventType | Audio Event | Notes |
|---|---|---|
| `projectile_fired` | `rifle_fire` | Spatial, panned to fire position |
| `enemy_hit` | `enemy_hit` | Spatial; routed to `headshot` if `data.headshot` is true |
| `enemy_hit` (headshot) | `headshot` | Dedicated headshot impact sounds |
| `enemy_killed` | `enemy_killed` | Spatial, body hit sounds pitched slightly down |
| `player_hit` | `player_hit` | Non-spatial (centered) |
| `reload_start` | `reload_start` | Non-spatial |
| `reload_complete` | `reload_complete` | Non-spatial |
| `reload_fumbled` | `reload_fumbled` | Non-spatial |
| `player_dodge_start` | `dodge` | Non-spatial, placeholder (pitched M4 shot) |

Events without a mapping in `EVENT_MAP` are silently ignored.

## Sound Event Config (audio.json)

Each entry in `events` has:

```jsonc
{
  "files": ["assets/audio/..."],  // Pool of wav files — one chosen randomly per play
  "volume": 0.35,                 // Gain value (0-1)
  "pitchRange": [0.95, 1.05],    // Random playbackRate range
  "maxInstances": 4,              // Polyphony cap — oldest evicted when exceeded
  "cooldown": 0.05,               // Minimum seconds between plays of this event
  "spatial": true                 // If true, stereo-pans based on world X relative to player
}
```

## Stereo Panning

When `spatial: true`, panning is calculated as:

```
pan = clamp((worldX - playerX) / arenaHalfWidth, -1, 1)
```

`worldX` comes from `event.data.x`. Events without an `x` field play centered.

## Adding a New Sound Event

1. Add wav files to an appropriate folder under `assets/audio/`
2. Add an entry to `src/configs/audio.json` under `events`
3. If mapping from a new `GameEventType`, add it to `EVENT_MAP` in `audio.ts`
4. If routing needs special logic (like the headshot flag check), add it in the `processEvents()` loop

## Lifecycle

- **`constructor(config)`** — Stores config. No AudioContext created yet.
- **`init()`** — Idempotent. Creates AudioContext + masterGain, fetches and decodes all wav files. Must be called from a user gesture context (click/keypress) to satisfy browser autoplay policy. Called in `startGame()` which runs from a click handler.
- **`processEvents(events, state)`** — Call each frame with accumulated events. Updates player position for panning, then plays matching sounds.
- **`setMasterVolume(volume)`** — Adjusts master gain at runtime.
- **`dispose()`** — Stops all playing sources, closes AudioContext, resets state.

## Muzzle Flash (in renderer.ts, not audio.ts)

A related visual feature: `Renderer.updateMuzzleFlashes()` creates a `PointLight(0xff8c20, intensity=3, distance=8)` at the fire position on `projectile_fired` events. The light lasts 60-80ms with linear intensity fade. This is called from `updateParticles()` to avoid touching `main.ts`.
