# Headshot System Design

## Inspiration

Based on Escape from Duckov's headshot system, confirmed by community discussion:

> "Crosshair has to be on head (at time of click) + bullet hits = headshot / critical hit"
> — Banana Bob, Steam Discussion

Synthetik uses a similar approach where headshots depend on where the bullet physically lands on the enemy sprite, with angle affecting difficulty. Both games use real projectiles (not hitscan), so the bullet must travel and connect.

## How It Works

The headshot system uses a **two-part check**:

### 1. At Fire Time (Rendering Layer)
When the player clicks to fire, raycast the cursor through the camera against enemy **head meshes** in the 3D scene. If the ray hits a head:
- Record which enemy's head was targeted (`headshotTargetId`)
- This gets stamped onto the projectile created by the simulation

### 2. At Collision Time (Simulation Layer)
When a projectile collides with an enemy:
- If the projectile has a `headshotTargetId` matching that enemy's ID → **headshot**
- Apply the headshot damage multiplier (e.g., 2.0x)
- Otherwise → normal body shot damage

### Why This Works
- **Cursor on head + bullet connects = headshot.** Same as Duckov.
- If cursor was on head but bullet misses (enemy moved, spread, etc.) → no headshot, no hit at all.
- If bullet hits but cursor wasn't on head → body shot.
- If cursor was on enemy A's head but bullet hits enemy B → body shot on B.
- The 2D simulation doesn't need height awareness — the headshot determination happens via 3D raycasting in the rendering/input layer, and is passed to the sim as a simple enemy ID.

## Visual Design

### Enemy Head
- Small sphere (radius ~0.15) sitting on top of the enemy body cube
- Different color from body (darker red / maroon) to make it a visible target
- Positioned at the top of the body cube

### Projectiles
- Small fast spheres — feel like bullets, not cannonballs
- Speed tuned high enough that leading targets is minimal at typical ranges
- Yellow/orange emissive glow for visibility

## Data Flow

```
Mouse click while fire=true
  → Raycast cursor against enemy head meshes (3D, rendering layer)
  → If hit: headshotTargetId = enemy.id
  → InputState.headshotTargetId passed to simulation
  → tryFire() stamps headshotTargetId on the Projectile
  → Projectile travels through 2D sim
  → checkProjectileCollisions(): if proj.headshotTargetId === enemy.id → headshot damage
  → Event system emits 'enemy_hit' with headshot flag for rendering feedback
```

## Config

In `weapons.json`:
```json
{
  "rifle": {
    "headshotMultiplier": 2.0
  }
}
```

## Future Considerations
- Headshot visual/audio feedback (different hit indicator, sound, particles)
- Enemies with helmets that reduce or negate headshot bonus (like Duckov's armor system)
- Per-weapon headshot multipliers (snipers get higher, SMGs get lower — like Duckov)
- Headshot kill counter in HUD/score
