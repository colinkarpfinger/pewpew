# Implementation Progress

*Track what's done, what's next, and decisions made along the way.*

---

## Current Status: Project Setup

Vite + TypeScript + Three.js scaffolded. Dependencies installed. Ready to build.

---

## v1 Checklist

### Foundation
- [x] Project setup (Vite + Three.js + TypeScript)
- [ ] Create project directory structure (simulation/, rendering/, configs/)
- [ ] Simulation layer with game loop (fixed timestep, seeded RNG)
- [ ] Types and interfaces (state, events, configs)
- [ ] Config loading system

### Player
- [ ] Player movement (WASD, no inertia)
- [ ] Aiming with mouse (project onto ground plane)
- [ ] Player collision with walls/obstacles

### Arena
- [ ] Arena with walls (rectangular boundary)
- [ ] Random cover cubes (seeded placement)
- [ ] Isometric camera following player

### Combat
- [ ] Rifle weapon (single shot, projectile with visible bullet)
- [ ] Projectile-enemy collision detection
- [ ] Projectile-wall/obstacle collision
- [ ] Damage system (HP for player and enemies)
- [ ] Enemy contact damage to player
- [ ] I-frames after player takes damage

### Enemies
- [ ] Rusher enemy (move toward player)
- [ ] Enemy-wall/obstacle collision (don't walk through things)
- [ ] Enemy spawning at arena edges (escalating over time)

### UI
- [ ] Score display
- [ ] Player HP display
- [ ] Game over screen with score
- [ ] Restart

### AI Infrastructure
- [ ] Event log capturing all events
- [ ] State snapshot capability
- [ ] Headless test runner (Node.js, no browser)

### Input
- [ ] Keyboard + mouse input
- [ ] Gamepad input (stretch goal for v1)

---

## Decisions Log

*Record architectural and design decisions here as we go.*

### 2026-02-07: Initial Design
- **Simulation/rendering separation**: All game logic in `src/simulation/` with zero Three.js imports. Rendering reads state and draws.
- **No physics engine**: Custom character controller, circle collisions, simple projectile math. Keeps headless testing clean.
- **Projectile-based weapon**: Not hitscan. Visible bullets, testable trajectories.
- **Contact damage only (v1)**: Enemies hurt player by touching. Ranged enemies are v2.
- **Deterministic simulation**: Fixed timestep + seeded RNG. Enables replay and headless testing.
- **Config-driven values**: All tunable stats in JSON files under `src/configs/`.

---

## Notes for Next Session

- Project is at `~/Code/twin-stick-shooter`
- Vite + TS + Three.js installed, default Vite template files still in place
- Need to: clear out template files, create directory structure, start building simulation layer
- Read `docs/SPEC.md` for full spec, `docs/AI_ARCHITECTURE.md` for architecture principles
- Build simulation layer FIRST (types, game loop, player movement), then rendering, then wire together
