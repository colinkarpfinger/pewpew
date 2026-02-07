# AI-Friendly Game Architecture

*Design patterns for building games where AI can be a genuine co-developer, not just a code suggestion tool.*

---

## The Core Problem

In most game engines (Unity, Unreal), the simulation and rendering are fused together. AI can't run the game, can't inspect state, can't verify behavior. It can only suggest code and hope you test it manually.

The fix isn't about genre -- it's about architecture. A shooter can be just as AI-testable as a simulation game if it's built right.

---

## The Five Pillars

### 1. Headless Simulation

The entire game must be runnable without rendering. Just logic ticking, producing state.

- Game loop runs independently of any display
- All game systems (physics, AI, damage, spawning) work without a renderer attached
- AI can start the game as a process, feed it inputs, and read outputs
- This is the single most important architectural decision

### 2. Event Log

Every meaningful game event gets logged as structured text.

```
Tick 100: drone.spotted_player { distance: 12.5 }
Tick 105: drone.fired { target: player, weapon: laser }
Tick 110: player.took_damage { amount: 15, source: drone, hp_remaining: 85 }
Tick 142: drone.destroyed { killer: player, weapon: rifle }
```

- AI reads the log and can verify behavior from text alone
- Events should include enough context to reconstruct what happened
- Useful for debugging, replay, and automated testing

### 3. State Snapshots

Dump full game state as JSON/text at any tick.

- Every entity's position, health, state, inventory -- all serializable
- AI can diff two snapshots to understand what changed
- Can inspect "what does the world look like right now?" without rendering
- Also enables save/load for free

### 4. Deterministic Replay

Record inputs, replay them, get the same result every time.

- Fixed timestep, seeded RNG
- Replay files are small (just inputs + seed)
- AI can set up scenarios and re-run them reliably
- Also enables multiplayer replay and debugging

**Implementation notes:**
- Use a fixed timestep (e.g., 60 ticks/sec) independent of frame rate
- Seed all RNG at game start; never use Math.random() directly
- Create a SeededRNG class that the simulation uses exclusively
- Store the seed in the game state so replays can recreate it
- All simulation logic must be purely functional on (state + input) → new state

### 5. Behavioral Assertions

Turn subjective "does it feel right?" into testable properties.

Instead of: *"Does the drone feel threatening?"*

Write assertions:
- "Drone maintains engagement distance of 10-15 units from player"
- "Drone fires when player is in line of sight and within range"
- "Drone retreats when HP drops below 20%"
- "Drone uses cover when available within 5 units"

These can be checked automatically against the event log or state snapshots. The design work is defining what "right" means in testable terms.

---

## What This Enables

With this architecture, AI can:

- **Spawn a test scenario** (drone + player in a room)
- **Run 500 ticks headless** (no rendering needed)
- **Read the event log** (what happened?)
- **Check behavioral assertions** (did the drone engage correctly?)
- **Iterate** (change the drone AI, re-run, compare)

All without seeing a single frame. The human handles "does it look and feel good." The AI handles "does it work correctly."

---

## Architectural Separation

```
┌─────────────────────────────────┐
│         Rendering Layer          │  ← Human verifies (visuals, feel, juice)
│  (Three.js, MonoGame, whatever)  │
├─────────────────────────────────┤
│        Simulation Layer          │  ← AI verifies (logic, behavior, balance)
│  (pure logic, no rendering deps) │
│  - Physics / movement            │
│  - Damage / health               │
│  - AI behavior                   │
│  - Spawning / waves              │
│  - Inventory / loot              │
│  - State machines                │
├─────────────────────────────────┤
│         Data Layer               │  ← AI generates & validates
│  (JSON/YAML configs, mod files)  │
│  - Weapon definitions            │
│  - Enemy definitions             │
│  - Map layouts                   │
│  - Wave sequences                │
│  - Mod content                   │
└─────────────────────────────────┘
```

The simulation layer should have **zero imports from the rendering layer.** If it does, something is coupled that shouldn't be.

---

## Practical Patterns

### Fixed Timestep Loop

```typescript
const TICK_RATE = 60; // ticks per second
const TICK_DURATION = 1 / TICK_RATE; // seconds per tick

// In browser: accumulate real time, step simulation in fixed increments
let accumulator = 0;
function frame(deltaTime: number) {
  accumulator += deltaTime;
  while (accumulator >= TICK_DURATION) {
    simulation.tick(inputs);
    accumulator -= TICK_DURATION;
  }
  renderer.render(simulation.getState());
}

// Headless: just tick as fast as possible
for (let i = 0; i < 1000; i++) {
  simulation.tick(scriptedInputs[i]);
}
```

### Seeded RNG

```typescript
// Never use Math.random() in simulation code
class SeededRNG {
  private seed: number;
  constructor(seed: number) { this.seed = seed; }
  next(): number {
    // mulberry32 or similar deterministic algorithm
    this.seed = (this.seed + 0x6D2B79F5) | 0;
    let t = Math.imul(this.seed ^ (this.seed >>> 15), 1 | this.seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}
```

### Config-Driven Everything

```typescript
// Bad: hardcoded values in simulation code
const damage = 25;
const speed = 3.5;

// Good: all values from config, loaded at startup
const weaponConfig = loadConfig('weapons.json');
const damage = weaponConfig.rifle.damage;
```

---

## Implications for Modding

This architecture naturally supports AI-friendly modding:

- Mods are data (JSON/YAML) that the simulation layer reads
- AI can generate mod files, run the simulation headless, and verify they work
- A CLI tool could let players describe a mod in natural language and get a working config
- Mod validation is automated: "does this weapon definition produce a balanced TTK?"

---

## Headless Testing In Practice

```bash
# Run a test scenario: spawn 10 rushers, simulate player standing still
npx ts-node tests/headless.ts --scenario rusher_swarm --ticks 600

# Output: event log + final state snapshot + assertion results
# [tick 0] game.started { seed: 42 }
# [tick 30] enemy.spawned { id: "e1", type: "rusher", ... }
# ...
# [tick 450] player.killed { score: 0 }
# ASSERTION PASS: all rushers reached player within 300 ticks
# ASSERTION PASS: contact damage applied correctly
```

This lets AI:
1. Write a new enemy behavior
2. Create a test scenario
3. Run it headless
4. Check the results
5. Iterate — all without a browser

---

## Framework Fit

| Framework | Headless? | Why |
|-----------|----------|-----|
| **Three.js** | Yes -- simulation in Node.js, rendering in browser | Natural separation |
| **C#/MonoGame** | Yes -- simulation as a library, game as a consumer | Clean architecture possible |
| **Rust/Bevy** | Possible -- ECS makes separation natural | Bevy's systems can run without rendering |
| **Unity** | Hard -- deeply coupled to MonoBehaviour lifecycle | This is why Cleared Hot is hard to test |
| **Godot** | Possible but not native | Scene tree assumes rendering |

---

## The Cleared Hot Lesson

Cleared Hot is hard for AI to test because:
- No headless mode
- Game logic lives inside MonoBehaviours tied to the scene graph
- No event log or state serialization
- Can't run scenarios programmatically
- Behavioral verification requires a human watching the game

This isn't because it's a shooter. It's because Unity's architecture fuses simulation and rendering. A new project built with these principles could be a shooter and still be fully AI-testable.

---

## Open Questions

- What's the right granularity for event logging? (Too much = noise, too little = blind spots)
- How to handle emergent behavior that's hard to define as assertions?
- Best patterns for deterministic physics in each framework?
- How to make the headless simulation fast enough for AI to run hundreds of test scenarios?
- What's the best way for AI to generate behavioral assertions from natural language descriptions?
