# 3D Weapon Models, Enemy Facing & Tracers

**Commit**: 1683e5c
**Date**: 2026-02-11

## What Changed

### 3D Weapon Models
- Added FBX loader (`src/rendering/weapon-models.ts`) that loads 6 Synty PolygonMilitary weapon models at startup
- Models are cached in a `Map` and cloned on use, with a shared dark gunmetal `MeshStandardMaterial`
- `createWeaponMesh()` tries the 3D model first, falls back to the original box geometry if models haven't loaded yet
- Weapon upgrade emissive glow is applied by cloning the material per-instance

**Model mapping:**
| Weapon | FBX File |
|--------|----------|
| Pistol | SM_Wep_Pistol_01.fbx |
| SMG | SM_Wep_Preset_A_SMG_01.fbx |
| Rifle | SM_Wep_Preset_A_Rifle_01.fbx |
| Shotgun | SM_Wep_Shotgun_01.fbx |
| Machine Gun | SM_Wep_Preset_A_Heavy_01.fbx |
| Sniper | SM_Wep_Preset_A_Sniper_01.fbx |

### Player Weapon Positioning
- Weapon attached to right side of player (`+Z` in local space, which is visual right given camera angle)
- Pistol extends forward (`r * 1.5` X offset); all other guns pulled back (`r * 0.3`) so the grip aligns with the body

### Enemy Facing Direction
- Added `facingDir: Vec2` to the `Enemy` interface in simulation
- Sprinters face their movement direction (toward player)
- Wandering enemies face their wander direction
- Ranged enemies (gunner, shotgunner, sniper) face toward the player
- Renderer rotates enemy groups by `facingDir` each frame

### Enemy Weapons
- Ranged enemies now hold visible weapon models: gunner→SMG, shotgunner→shotgun, sniper→sniper rifle
- Sprinters have no weapon (melee only)
- Weapons inherit enemy group rotation automatically

### Tracers Replace Bullets
- Player projectile sphere meshes are no longer rendered
- On each `projectile_fired` event, a tracer spawns at the computed gun muzzle world position
- Tracers are thin bright boxes (0.6 units long) that travel at 60 units/s and fade out over 0.15s
- Shotgun fires one tracer per pellet, showing the spread pattern from the gun
- Muzzle flash light also moved to the gun muzzle position

## Files Modified
| File | Change |
|------|--------|
| `src/rendering/weapon-models.ts` | **New** — FBX loader, cache, model mapping |
| `src/rendering/entities.ts` | 3D model support in `createWeaponMesh`, weapons on enemies |
| `src/rendering/renderer.ts` | Tracers, muzzle positioning, enemy rotation, removed projectile rendering |
| `src/simulation/types.ts` | Added `facingDir` to `Enemy` |
| `src/simulation/enemies.ts` | Populate `facingDir` each tick |
| `src/simulation/spawner.ts` | Initialize `facingDir` on spawn |
| `src/simulation/extraction-spawner.ts` | Initialize `facingDir` on spawn |
| `src/main.ts` | Call `loadWeaponModels()` at boot |

## Design Decisions
- **Async loading with fallback**: Models load in the background. Games can start immediately with box-geometry weapons, and 3D models appear on subsequent weapon swaps once loaded.
- **Simulation purity preserved**: `facingDir` is a sim-layer field computed from existing movement/targeting logic. No Three.js imports in simulation code.
- **Tracers are visual-only**: Bullet collision still uses the simulation projectile position (spawning from player center). Tracers are a rendering effect from the gun muzzle. This avoids edge cases like bullets passing through walls when the gun tip is past a corner.
