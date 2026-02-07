# Twin-Stick Shooter — Spec

*A browser-based twin-stick shooter built with Three.js. Designed from the ground up for AI-assisted development using the principles in [AI-Friendly Game Architecture](./AI_ARCHITECTURE.md).*

---

## Overview

Top-down(ish) twin-stick shooter. Endless survival with a score. Played in the browser with mouse+keyboard or gamepad. Simple, tight, tunable.

The primary development goal, beyond making a fun game, is to structure this so AI (Claude) can be maximally effective as a co-developer: building features, generating content, testing headless, and iterating fast.

---

## Architecture

Follow the [AI-Friendly Game Architecture](./AI_ARCHITECTURE.md) pattern:

### Simulation Layer (no rendering dependencies)
- All game logic lives here: movement, combat, enemies, spawning, damage, scoring
- Runs on a fixed timestep, deterministic (seeded RNG)
- Can run headless in Node.js with no browser/Three.js dependency
- Exposes full state as serializable JSON at any tick
- Produces a structured event log

### Rendering Layer (Three.js)
- Consumes simulation state each frame and renders it
- Isometric-ish camera (angled down, not fully top-down — roughly 50-60 degrees)
- Has zero game logic — purely visual

### Data Layer (JSON configs)
- All tunable values live in config files, not in code
- Weapon definitions, enemy definitions, wave/spawn rules, player stats
- This is the mod surface — AI generates and validates these configs

---

## Controls

**Mouse + Keyboard:**
- WASD: Move player
- Mouse position: Aim direction (projected onto ground plane)
- Left click: Fire weapon

**Gamepad:**
- Left stick: Move player
- Right stick: Aim direction
- Right trigger: Fire weapon

---

## Player

- Shape: Capsule or cylinder primitive (for now)
- Movement: No inertia, no acceleration. Instant direction change. Character-controller style.
- Speed: Tunable (config)
- HP: Tunable (config), starts at 100
- Collision: Circle collider

---

## Camera

- Isometric-ish angle: ~50-60 degrees from horizontal, looking down at the player
- Follows the player smoothly
- Fixed rotation (no camera controls needed for v1)

---

## Weapon: Rifle (v1)

- Single shot, precise
- Small delay between shots (tunable fire rate)
- Projectile travels in aim direction
- Projectile has speed, range/lifetime, damage — all tunable
- Projectile-based (visible bullet, more satisfying, testable trajectory)

```json
{
  "name": "rifle",
  "damage": 25,
  "fireRate": 0.3,
  "projectileSpeed": 40,
  "projectileLifetime": 2.0,
  "spread": 0
}
```

---

## Enemies: Rusher (v1)

- Shape: Cube or sphere primitive, different color from player
- Behavior: Move directly toward player. Attack on contact.
- Speed: Tunable (config), slightly slower than player
- HP: Tunable (config)
- Contact damage: Tunable
- On death: Remove from simulation, increment score

```json
{
  "type": "rusher",
  "speed": 3.5,
  "hp": 50,
  "contactDamage": 10,
  "behavior": "move_toward_player"
}
```

---

## Arena

- Flat ground plane
- Walls around the perimeter (rectangular boundary)
- Random cubes placed as cover/obstacles inside the arena
- Arena size: Tunable
- Obstacle count and placement: Tunable (or seeded random)

---

## Spawning

- Enemies spawn at the edges of the arena, outside player's immediate view
- Wave-based with escalation: more enemies, faster, over time
- Spawn interval and count increase over time — tunable curve
- Spawn rules defined in config

```json
{
  "initialSpawnInterval": 3.0,
  "minSpawnInterval": 0.5,
  "spawnIntervalDecay": 0.95,
  "enemiesPerSpawn": 1,
  "maxEnemiesPerSpawn": 5,
  "spawnEscalationRate": 0.1
}
```

---

## Scoring

- Points per kill (tunable per enemy type)
- Survival time tracked
- High score displayed

---

## Damage & Health

- Player has HP, displayed on screen (simple bar or number)
- Enemies have HP
- Player takes damage on contact with enemies
- Brief invulnerability after being hit (tunable i-frames)
- Player death → game over screen with score, restart option

---

## Event Log

Every meaningful event gets logged with tick number:

```
[tick 0] game.started { seed: 12345 }
[tick 100] enemy.spawned { id: "e1", type: "rusher", position: [10, 0, -15] }
[tick 150] player.fired { weapon: "rifle", direction: [0.7, 0, -0.7] }
[tick 152] projectile.hit { target: "e1", damage: 25, target_hp_remaining: 25 }
[tick 200] enemy.killed { id: "e1", killer: "player", score_awarded: 10 }
[tick 350] player.damaged { source: "e2", damage: 10, hp_remaining: 90 }
```

---

## State Snapshot

Full game state serializable as JSON at any tick:

```json
{
  "tick": 500,
  "score": 120,
  "player": {
    "position": [0, 0, 2.5],
    "hp": 80,
    "aimDirection": [0.7, 0, -0.7]
  },
  "enemies": [
    { "id": "e5", "type": "rusher", "position": [8, 0, -3], "hp": 50 }
  ],
  "projectiles": [
    { "id": "p12", "position": [3, 0, 1], "direction": [0.7, 0, -0.7], "speed": 40 }
  ]
}
```

---

## Tech Stack

- **Language:** TypeScript
- **Rendering:** Three.js
- **Build:** Vite (for HMR — instant feedback loop)
- **Physics:** Custom (no physics engine — character controller, circle collisions, raycast/projectile math)
- **Testing:** Simulation runs headless in Node.js

---

## Project Structure

```
docs/
  SPEC.md               ← This file
  PROGRESS.md           ← Implementation tracking
  AI_ARCHITECTURE.md    ← AI-friendly game architecture principles
src/
  simulation/           ← All game logic. Zero rendering imports.
    game.ts             ← Game loop, tick, state management
    player.ts           ← Player logic
    enemies.ts          ← Enemy behaviors
    combat.ts           ← Damage, projectiles, hit detection
    spawner.ts          ← Wave/spawn logic
    types.ts            ← Shared types (state, events, configs)
  rendering/            ← Three.js rendering. Reads simulation state.
    renderer.ts         ← Main renderer, scene setup
    camera.ts           ← Isometric camera
    entities.ts         ← Visual representations of sim entities
  configs/              ← JSON config files (the mod surface)
    player.json
    weapons.json
    enemies.json
    spawning.json
    arena.json
  main.ts               ← Entry point, wires simulation + rendering
  input.ts              ← Input handling (keyboard, mouse, gamepad)
tests/
  headless.ts           ← Run simulation without rendering, verify behavior
```

---

## v2 Ideas (After v1 Works)

### Runtime Modifiers (Roguelike Upgrades)
- After surviving a wave (or every N kills), player picks from 3 random modifiers
- Modifiers are data: `{ "stat": "weapon.damage", "operation": "multiply", "value": 1.05 }`
- Examples: +5% damage, +7% move speed, -10% fire rate cooldown, +20 max HP, +1 projectile
- Modifier pool defined in config (moddable!)
- Stacking rules: multiplicative vs additive, caps
- AI can balance these by simulating runs with different modifier combos

### More Enemy Types
- Flanker: circles around player, attacks from side
- Sniper: keeps distance, fires slow projectiles
- Swarmer: weak, fast, spawns in groups
- Tank: slow, high HP, high damage

### Extraction Mode
- Survive waves, then reach extraction point before timer runs out

### Defend Mode
- Protect an objective from enemies pathfinding to it
