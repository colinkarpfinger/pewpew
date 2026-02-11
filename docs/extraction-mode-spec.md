# Extraction Mode Spec

## Overview

Add an extraction shooter game mode alongside the existing arena survival mode. The player starts in a safe zone, traverses a linear map full of enemies, and reaches an extraction point at the far end. Enemies drop cash. Surviving = keep your cash and weapon. Dying = lose your weapon and all cash from that run. Between runs, spend cash at a shop to buy weapons.

## Game Modes

Main menu presents two modes:
- **Arena Survival** — the existing game, unchanged
- **Extraction** — the new mode described below

---

## The Extraction Loop

```
Hub (safe) ──► Enter Run ──► Traverse Map ──► Reach Extraction ──► Back to Hub
                                  │
                                  ▼
                              Death = lose weapon + run cash
                              Back to Hub with default pistol
```

### Hub Screen
- Shows: cash stash, owned weapons, current loadout
- **Shop**: buy weapons with cash
- **Loadout**: pick one weapon to bring (always have default pistol as fallback)
- **Start Run**: enter the extraction map

### During a Run
- Player spawns at south end of the map
- Extraction zone is at the north end
- Enemies spawn throughout the map (ambient + triggered packs)
- Enemies drop cash on death
- Health and grenade crates still drop (same system as arena)
- HUD shows: current cash earned this run, HP, ammo, minimap/compass arrow to extraction
- Reaching the extraction zone = success. Cash goes to stash, weapon is kept.

### On Death
- Equipped weapon is lost (removed from inventory, must re-buy)
- All cash earned during the run is lost
- Default pistol is never lost
- Player returns to hub

### Persistence
- **localStorage** stores: cash stash, list of owned weapons
- Simple JSON blob, no server needed

---

## Map Design

### Dimensions
- Current arena: 30 x 20 units (600 sq units)
- Extraction map: **40 wide x 120 long** (~4800 sq units, ~8x arena)
- Linear north-south orientation
- Player traversal time (just running, no combat): ~24 seconds at player speed 5.0

### Layout: Linear Path with Zones
The map is divided into ~4 zones along its length, each 40x30:

1. **Spawn Zone** (y: 0–30) — Safe-ish. Very few enemies. Lets player get bearings.
2. **Outer Zone** (y: 30–60) — Light ambient spawns. A few triggered packs near chokepoints.
3. **Hot Zone** (y: 60–90) — Dense ambient spawns. More triggered packs. Higher cash drops.
4. **Extraction Zone** (y: 90–120) — Heavy resistance. Extraction point at the far end (y ~115). A triggered pack guards it.

### Walls/Obstacles
- Flat ground plane (same visual style as arena)
- Box-shaped walls placed throughout to create chokepoints, cover, and sight-line breaks
- Walls are axis-aligned rectangles of varying sizes (2x1, 3x1, 2x2, etc.)
- ~30-40 wall segments total, hand-placed per zone (defined in a config/map file)
- Walls block player movement, enemy movement, and projectiles

### Camera
- Same top-down camera, follows player as they move through the map
- Edges of the map are bounded (player can't leave)

### Line of Sight
- Enemies behind walls are **not visible** to the player (not rendered)
- Per-enemy raycast from player position to enemy position each tick
- If the ray intersects any wall (AABB check) before reaching the enemy, mark it as not visible
- Enemies pop in/out when entering/leaving line of sight (can add a quick fade later for polish)
- **Only enemies are occluded** — projectiles, cash pickups, crates, and the extraction zone are always visible (keeps gameplay readable)
- Visibility is a simulation-level flag (`visible: boolean` on each enemy) so it's available to the renderer
- Wall geometry is axis-aligned boxes, so raycasts are cheap

---

## Enemy Spawning (Extraction Mode)

### Ambient Spawns
- Enemies spawn outside camera view (at least 15 units from player), within the map bounds
- Spawn rate varies by zone:
  - Spawn zone: 1 enemy every ~4 sec
  - Outer zone: 1 enemy every ~2 sec
  - Hot zone: 1 enemy every ~1 sec
  - Extraction zone: 1 enemy every ~0.75 sec
- Max concurrent enemies on map: 40
- Enemies wander toward player once spawned (same rusher AI)

### Triggered Packs
- Invisible trigger regions placed at key chokepoints (defined in map config)
- When player enters a trigger region for the first time, a pack of 5-8 enemies spawns nearby
- ~6-8 trigger regions across the map, more concentrated in Hot Zone and Extraction Zone
- Triggered enemies spawn at designated spawn points near the trigger

### Enemy Types

**Rusher (existing)**
- 50 HP, speed 2.5, 15 contact damage
- Cash drop: $10-20

**Sprinter (new)**
- 75 HP, speed 4.0, 20 contact damage, radius 0.35
- Faster and tougher, slightly smaller hitbox
- Cash drop: $25-40
- Spawn ratio: ~30% sprinters, ~70% rushers (shifts toward more sprinters in deeper zones)

---

## Weapons

### Default Pistol (always owned, never lost)
| Stat | Value |
|------|-------|
| Damage | 12 |
| Fire rate | 3 shots/sec |
| Magazine | 12 |
| Reload time | 1.5s (90 ticks) |
| Spread | 0.02 |
| Moving spread mult | 2.0 |
| Penetration | 1 |
| Knockback | 8 |
| Projectile speed | 50 |
| Shop price | Free (default) |

### SMG
| Stat | Value |
|------|-------|
| Damage | 15 |
| Fire rate | 12 shots/sec |
| Magazine | 40 |
| Reload time | 2.0s (120 ticks) |
| Spread | 0.06 |
| Moving spread mult | 2.5 |
| Penetration | 2 |
| Knockback | 6 |
| Projectile speed | 45 |
| Shop price | $200 |

### Rifle (existing stats, now buyable)
| Stat | Value |
|------|-------|
| Damage | 25 |
| Fire rate | 8 shots/sec |
| Magazine | 30 |
| Reload time | 1.5s (90 ticks) |
| Spread | 0.03 |
| Moving spread mult | 3.0 |
| Penetration | 5 |
| Knockback | 12 |
| Projectile speed | 50 |
| Shop price | $500 |

### Shotgun
| Stat | Value |
|------|-------|
| Damage | 18 per pellet |
| Pellets | 6 |
| Fire rate | 2 shots/sec |
| Magazine | 6 |
| Reload time | 2.5s (150 ticks) |
| Spread | 0.15 (per pellet, random within cone) |
| Moving spread mult | 1.5 |
| Penetration | 1 |
| Knockback | 20 |
| Projectile speed | 40 |
| Projectile lifetime | 30 ticks (shorter range) |
| Shop price | $400 |

All weapons keep the active/perfect reload mechanic (same windows).

---

## Economy

### Cash Drops
- Enemies drop cash on death (amount varies by type, see above)
- Cash appears as a pickup on the ground (like crates), auto-collected on proximity
- Cash pickups have no lifetime limit (persist for the whole run)

### Shop Prices
- SMG: $200
- Shotgun: $400
- Rifle: $500
- Grenades (5-pack): $100

### Starting State (first time playing)
- $0 cash
- Default pistol only
- 5 grenades (replenished each run for free)

### Expected Progression Pace
- A successful run to extraction should earn roughly $150-300
- A death partway through (Hot Zone) might have accumulated $80-150 but it's lost
- Early runs: 2-3 successful extractions to afford SMG
- Mid runs: 2-3 more to afford shotgun or rifle
- Weapons are permanent once bought (only lost if you bring them and die)

---

## Implementation Phases

### Phase 1: Weapons System
- Refactor current single-weapon to support multiple weapon types
- Add pistol, SMG, shotgun configs to weapons.json
- Add shotgun pellet spread mechanic
- Weapon selection in game state (which weapon is equipped)
- Arena mode defaults to rifle (preserves current experience)

### Phase 2: Extraction Map & Spawning
- Map data structure: bounds, wall definitions, trigger regions, zone boundaries
- Map config file (JSON) with wall placements and trigger zones
- Wall collision for player, enemies, and projectiles
- Line of sight system: per-enemy raycast against walls, visibility flag on enemies
- New spawner logic for extraction mode (ambient per-zone + triggered packs)
- Sprinter enemy type
- Camera follows player through larger map

### Phase 3: Economy & Persistence
- Cash drop system (enemy death → cash pickup)
- localStorage persistence (stash cash, owned weapons)
- Cash HUD element during runs

### Phase 4: Hub & Game Mode Selection
- Main menu with Arena / Extraction mode buttons
- Hub screen for extraction mode (stash, shop, loadout, start run)
- Extraction zone rendering and win condition
- Death → return to hub logic
- Grenade restocking between runs

### Phase 5: Polish
- Minimap or compass arrow pointing to extraction
- Zone visual differentiation (subtle ground color changes)
- Extraction zone visual indicator (glowing area)
- Balance tuning based on playtesting

---

## Open Questions / Future Ideas
- Multiple maps with different layouts and difficulty?
- Weapon attachments/mods as drops?
- Boss enemies guarding extraction?
- Leaderboards (fastest extraction, most cash in one run)?
- Insurance system (pay to protect weapon)?
