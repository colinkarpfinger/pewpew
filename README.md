# Twin-Stick Shooter

A browser-based twin-stick shooter built with Three.js and TypeScript. Endless survival, tight controls, and an architecture designed from the ground up for AI-assisted development.

## Motivation

Most game engines fuse simulation and rendering together, making it nearly impossible for AI to run the game, inspect state, or verify behavior. This project takes a different approach: a strict **simulation/rendering separation** that lets the entire game run headless in Node.js with no browser dependency. AI (Claude) can start the game, feed it inputs, read structured state, and verify behavior programmatically.

The goal is twofold: make a fun, polished shooter *and* prove out an architecture where AI can be a genuine co-developer — building features, tuning balance, and running tests — not just suggesting code.

See [AI-Friendly Game Architecture](docs/AI_ARCHITECTURE.md) for the full design philosophy.

## Playing

```bash
npm install
npm run dev
```

**Controls:**
- **WASD** — Move
- **Mouse** — Aim
- **Left Click** — Shoot
- **R** — Reload (with active reload timing window)
- **Space** — Dodge roll
- **G** — Charge and throw grenade (hold to throw farther)
- **Backtick (`)** — Dev console
- **Escape** — Pause

Gamepad is also supported (dual analog sticks, triggers).

## Architecture

```
src/
├── simulation/     # All game logic — zero Three.js imports
│   ├── game.ts     # createGame(), tick(), getSnapshot()
│   ├── types.ts    # Interfaces, constants (TICK_RATE=60)
│   ├── player.ts   # Movement, dodge, collision
│   ├── combat.ts   # Firing, projectiles, headshots, penetration
│   ├── enemies.ts  # Enemy AI, knockback, contact damage
│   ├── grenade.ts  # Charge-to-throw, arc physics, bouncing, explosions
│   ├── crates.ts   # Power-up drops and pickup
│   ├── spawner.ts  # Wave-based enemy spawning
│   ├── collision.ts # Circle/circle, circle/AABB math
│   ├── arena.ts    # Arena generation with obstacles
│   ├── rng.ts      # Seeded RNG (mulberry32)
│   └── events.ts   # Structured event log types
├── rendering/      # Three.js visualization — reads state, has no game logic
│   ├── renderer.ts # Scene setup, entity sync
│   ├── entities.ts # Mesh creation (player, enemies, projectiles, etc.)
│   ├── camera.ts   # Isometric camera following player
│   └── particles.ts # Particle effects
├── configs/        # All tunable values as JSON — no hardcoded balance numbers
│   ├── player.json
│   ├── weapons.json
│   ├── enemies.json
│   ├── grenade.json
│   ├── spawning.json
│   ├── arena.json
│   ├── crates.json
│   ├── multikill.json
│   └── audio.json
├── main.ts         # Entry point — wires simulation + rendering + input
├── input.ts        # Keyboard, mouse, and gamepad input
├── audio.ts        # Event-driven audio system
├── ui.ts           # HUD, menus, screens
└── recorder.ts     # Replay recording and playback
```

**Key principles:**
- **Simulation is pure logic.** Fixed timestep (60 ticks/sec), deterministic via seeded RNG, serializable state. No rendering, no browser APIs.
- **Rendering just reads state.** The Three.js layer consumes snapshots each frame and syncs visuals. Coordinate mapping: sim `(x, y)` maps to Three.js `(x, z)` with `y` as the vertical axis.
- **Config-driven balance.** Every tunable value lives in a JSON file under `configs/`. Change numbers, not code.
- **Deterministic replays.** Seeded RNG + recorded inputs = perfect replay reproduction.

## Features

**Combat:**
- Rifle with magazine, reload, and active reload timing (hit the window for bonus damage)
- Headshot system — crosshair placement on the enemy determines crits (2x damage, penetrates up to 5 enemies)
- Spread that increases while moving
- Knockback on hit

**Grenades:**
- Hold G to charge, release to throw in an arc
- Physics-based bouncing with gravity, friction, and restitution
- Area damage and knockback on detonation
- Self-damage at 50%

**Enemies:**
- Rusher type that chases the player
- Wave-based spawning with increasing difficulty
- Contact damage with player i-frames

**Progression:**
- Multi-kill detection with tiered speed boosts
- Power-up crates (health, grenade ammo) that drop from kills
- Higher drop rates during multi-kill streaks

**Systems:**
- Event-driven spatial audio with pitch variation
- Particle effects
- Replay recording and playback (full and ring-buffer modes)
- Dev console for debugging
- Headless test runner

## Testing

```bash
npx tsx tests/headless.ts
```

Runs the simulation in Node.js with no browser — tests initialization, movement, spawning, combat, and determinism. See also `tests/replay.ts` for replay verification.

## Building

```bash
npm run build    # TypeScript check + Vite production bundle
npm run preview  # Serve the production build locally
```

## Documentation

- [Game Spec](docs/SPEC.md) — Full feature specification and design decisions
- [AI-Friendly Game Architecture](docs/AI_ARCHITECTURE.md) — The architectural philosophy behind the project
- [Implementation Progress](docs/PROGRESS.md) — Checklist and decision log
- [Gunplay Research](docs/gunplay-research.md) — Research on combat mechanics from reference games
- [Headshot System Design](docs/headshots.md) — How the headshot/crosshair system works

## Current Status

The core game loop is playable: move, shoot, dodge, throw grenades, collect power-ups, survive waves. Audio, particles, replay recording, and a dev console are all functional. The main areas still open are additional enemy types, new weapon varieties, and visual/juice polish. See [PROGRESS.md](docs/PROGRESS.md) for the full breakdown.
