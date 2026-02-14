# Level Editor Integration Spec

## Overview

Use the built-in Three.js Editor as a browser-based level editor. Humans place
and arrange objects visually. AI agents read/write the JSON directly. Game code
interprets the scene using naming conventions.

**Principle**: The editor is dumb — it places things in 3D. The code is smart —
it decides what those things mean. Naming conventions are the bridge.

## Pipeline

```
Three.js Editor (visual)  ←→  level JSON file  ←→  Game loader (code)
       ↑                                                    ↓
  Human drags stuff                               Simulation state +
  AI edits JSON                                   Rapier colliders +
                                                  Three.js scene
```

### Workflow

1. Open editor at `/editor` (served by Vite in dev, static in prod)
2. Import `.glb` models or create primitives (Box, Cylinder, etc.)
3. Name objects using the naming convention below
4. Optionally add `userData` for per-instance properties
5. File → Export Scene → save as `public/levels/level-name.json`
6. Game loads the JSON, extracts gameplay data, renders the scene

## File Structure

```
public/
  levels/
    extraction-01.json      # Three.js editor scene export
    extraction-02.json
  models/
    wall_concrete.glb       # Reusable 3D models
    pillar_stone.glb
    barrel_rusty.glb
    crate_wood.glb
    cover_sandbags.glb
editor/                     # Three.js editor files (from three.js repo)
  index.html
  js/
  css/
src/
  level-loader.ts           # Reads editor JSON → game state
```

## Naming Convention

Object names in the editor determine how game code treats them. The prefix is
the contract between editor and code.

### Collidable Objects

These get Rapier physics colliders. Players, enemies, and projectiles collide
with them.

| Prefix | Collider Shape | Example Names |
|--------|---------------|---------------|
| `wall_` | box (from bounding box) | `wall_north_01`, `wall_corridor_left` |
| `pillar_` | circle (from bounding box width) | `pillar_center`, `pillar_entry_01` |
| `cover_` | box (from bounding box) | `cover_sandbags_01`, `cover_car_wreck` |

Collider dimensions are derived automatically from the object's bounding box:
- **Box collider**: `width` = bounding box X size, `height` = bounding box Z size
- **Circle collider**: `radius` = max(bbox X, bbox Z) / 2

Override with `userData` if the auto-derived shape is wrong:

```json
{ "collider": { "shape": "circle", "radius": 2.0 } }
```

```json
{ "collider": { "shape": "box", "width": 3, "height": 1.5 } }
```

### Destructible Objects

Same as collidable, but can be destroyed. Uses `crate_` prefix.

| Prefix | Behavior | Example Names |
|--------|----------|---------------|
| `crate_` | Destructible, drops loot | `crate_wood_01`, `crate_ammo_03` |

Optional `userData`:

```json
{ "hp": 50, "lootTier": 2 }
```

Defaults: `hp = 100`, `lootTier` derived from zone position.

### Spawn Points

Empty objects (or any mesh — only position is used) that mark where things
appear.

| Prefix | Purpose | Example Names |
|--------|---------|---------------|
| `spawn_player` | Player start position (exactly one) | `spawn_player` |
| `spawn_enemy_` | Enemy spawn region | `spawn_enemy_zone1_01` |

### Zones

Invisible trigger regions. Use a Box or Plane mesh — only position and
dimensions matter. The mesh won't render in-game.

| Prefix | Purpose | Example Names |
|--------|---------|---------------|
| `zone_extraction_` | Extraction/win zone | `zone_extraction_start`, `zone_extraction_end` |
| `zone_difficulty_` | Enemy difficulty region | `zone_difficulty_1`, `zone_difficulty_2` |

`userData` for difficulty zones:

```json
{
  "zoneIndex": 0,
  "maxEnemies": 10,
  "spawnRate": 0.5,
  "enemyTypes": ["basic", "shotgunner"]
}
```

### Decorations

Visual only. No collider, no game logic. Just makes the level look good.

| Prefix | Purpose | Example Names |
|--------|---------|---------------|
| `deco_` | Pure visual | `deco_barrel_01`, `deco_debris_03`, `deco_light_hanging` |

### Lights

Three.js lights placed in the editor are used directly for rendering. No prefix
needed — the loader detects them by type (PointLight, SpotLight, etc.).

### Ground / Floor

| Prefix | Purpose | Example Names |
|--------|---------|---------------|
| `ground_` | Floor surface | `ground_main`, `ground_zone2_dark` |

### Ignored

Objects with no recognized prefix are loaded into the scene for rendering but
have no game logic attached. This is a safe default — you can always add
meaning later by renaming.

## Coordinate System Mapping

The Three.js editor uses 3D coordinates. The game simulation is 2D.

| | Editor (3D) | Game Simulation (2D) |
|---|---|---|
| Left/Right | X | X |
| Up (vertical) | Y | (height, not used in sim) |
| Forward/Back | Z | Y |
| Rotation | rotation.y (radians) | rotation (negated) |

The loader maps: `gamePos = { x: obj.position.x, y: obj.position.z }`
and `gameRotation = -obj.rotation.y`.

## Level JSON Format

The file is a standard Three.js editor scene export (JSON Object Scene Format
4). No custom format — just the editor's native output.

Abbreviated structure:

```json
{
  "metadata": { "version": 4.6, "type": "Object", "generator": "Object3D.toJSON" },
  "geometries": [
    { "uuid": "...", "type": "BoxGeometry", "width": 6, "height": 1.5, "depth": 1 }
  ],
  "materials": [
    { "uuid": "...", "type": "MeshStandardMaterial", "color": 6710886 }
  ],
  "object": {
    "uuid": "...",
    "type": "Scene",
    "name": "extraction_01",
    "children": [
      {
        "uuid": "...",
        "type": "Mesh",
        "name": "wall_north_01",
        "geometry": "geo-uuid-ref",
        "material": "mat-uuid-ref",
        "matrix": [1,0,0,0, 0,1,0,0, 0,0,1,0, 5,0.75,10,1],
        "userData": {}
      },
      {
        "uuid": "...",
        "type": "Mesh",
        "name": "spawn_player",
        "geometry": "geo-uuid-ref",
        "material": "mat-uuid-ref",
        "matrix": [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,-55,1]
      },
      {
        "uuid": "...",
        "type": "Mesh",
        "name": "deco_barrel_01",
        "geometry": "geo-uuid-ref",
        "material": "mat-uuid-ref",
        "matrix": [1,0,0,0, 0,1,0,0, 0,0,1,0, 3,0.4,8,1]
      }
    ]
  }
}
```

For parametric primitives (Box, Cylinder, Sphere), the geometry section is
compact and AI-friendly. For imported `.glb` models, the geometry contains
vertex data (large, not AI-editable) — but the object entries (name, position,
userData) remain simple.

**AI agents operate at the `children` array level** — adding/moving/renaming
objects. They don't touch geometry vertex data.

## Loader Design

### `src/level-loader.ts`

```typescript
import * as THREE from 'three';
import type { Obstacle, ExtractionMapConfig, Vec2 } from './simulation/types';

interface LevelData {
  // For simulation
  arena: { width: number; height: number };
  playerSpawn: Vec2;
  obstacles: Obstacle[];
  destructibleCrates: { pos: Vec2; hp: number; lootTier: number }[];
  extractionZones: { x: number; y: number; width: number; height: number }[];
  zones: ZoneConfig[];

  // For rendering — the loaded scene itself
  scene: THREE.Scene;

  // Objects that are purely decorative (already in scene, listed for reference)
  decorations: THREE.Object3D[];
}

function loadLevel(json: object): LevelData {
  const loader = new THREE.ObjectLoader();
  const scene = loader.parse(json);

  const obstacles: Obstacle[] = [];
  const destructibleCrates = [];
  const extractionZones = [];
  const zones = [];
  const decorations = [];
  let playerSpawn: Vec2 = { x: 0, y: 0 };
  let arenaWidth = 0;
  let arenaHeight = 0;

  // Collect non-renderable objects for removal after traversal
  const toRemove: THREE.Object3D[] = [];

  scene.traverse((obj) => {
    const name = obj.name.toLowerCase();

    // --- Collidable walls ---
    if (name.startsWith('wall_') || name.startsWith('cover_')) {
      const bbox = new THREE.Box3().setFromObject(obj);
      const size = new THREE.Vector3();
      bbox.getSize(size);

      const colliderOverride = obj.userData?.collider;
      obstacles.push({
        pos: { x: obj.position.x, y: obj.position.z },
        width: colliderOverride?.width ?? size.x,
        height: colliderOverride?.height ?? size.z,
        rotation: obj.rotation.y !== 0 ? -obj.rotation.y : undefined,
        shape: 'box',
      });
    }

    // --- Collidable pillars ---
    else if (name.startsWith('pillar_')) {
      const bbox = new THREE.Box3().setFromObject(obj);
      const size = new THREE.Vector3();
      bbox.getSize(size);

      const colliderOverride = obj.userData?.collider;
      const radius = colliderOverride?.radius ?? Math.max(size.x, size.z) / 2;
      obstacles.push({
        pos: { x: obj.position.x, y: obj.position.z },
        width: 0,
        height: 0,
        shape: 'circle',
        radius,
      });
    }

    // --- Destructible crates ---
    else if (name.startsWith('crate_')) {
      const bbox = new THREE.Box3().setFromObject(obj);
      const size = new THREE.Vector3();
      bbox.getSize(size);

      destructibleCrates.push({
        pos: { x: obj.position.x, y: obj.position.z },
        hp: obj.userData?.hp ?? 100,
        lootTier: obj.userData?.lootTier ?? 1,
      });

      // Also add as obstacle for collision
      obstacles.push({
        pos: { x: obj.position.x, y: obj.position.z },
        width: size.x,
        height: size.z,
        shape: 'box',
      });
    }

    // --- Player spawn ---
    else if (name.startsWith('spawn_player')) {
      playerSpawn = { x: obj.position.x, y: obj.position.z };
      toRemove.push(obj); // don't render the spawn marker
    }

    // --- Extraction zones ---
    else if (name.startsWith('zone_extraction_')) {
      const bbox = new THREE.Box3().setFromObject(obj);
      const size = new THREE.Vector3();
      bbox.getSize(size);

      extractionZones.push({
        x: obj.position.x,
        y: obj.position.z,
        width: size.x,
        height: size.z,
      });
      toRemove.push(obj); // zones are invisible in-game
    }

    // --- Difficulty zones ---
    else if (name.startsWith('zone_difficulty_')) {
      zones.push({
        zoneIndex: obj.userData?.zoneIndex ?? zones.length,
        yMin: obj.position.z - (obj.scale.z / 2),
        yMax: obj.position.z + (obj.scale.z / 2),
        ...(obj.userData ?? {}),
      });
      toRemove.push(obj);
    }

    // --- Arena bounds (special: defines playable area) ---
    else if (name === 'arena_bounds') {
      const bbox = new THREE.Box3().setFromObject(obj);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      arenaWidth = size.x;
      arenaHeight = size.z;
      toRemove.push(obj);
    }

    // --- Decorations ---
    else if (name.startsWith('deco_')) {
      decorations.push(obj);
      // Keep in scene — purely visual
    }

    // --- Ground ---
    else if (name.startsWith('ground_')) {
      // Keep in scene for rendering
    }

    // --- Everything else: keep in scene, no game logic ---
  });

  // Remove non-renderable markers from the scene
  for (const obj of toRemove) {
    obj.parent?.remove(obj);
  }

  return {
    arena: { width: arenaWidth, height: arenaHeight },
    playerSpawn,
    obstacles,
    destructibleCrates,
    extractionZones,
    zones,
    scene,
    decorations,
  };
}
```

### Integration with Existing Code

The loader produces two things:

1. **Simulation data** (`obstacles`, `playerSpawn`, etc.) — feeds into
   `createGame()` exactly like the current `extraction-map.json` does
2. **A Three.js scene** — replaces the current `initArena()` procedural mesh
   creation

```
Current:  extraction-map.json → createGame(config) → initArena(state) builds meshes
New:      level.json → loadLevel(json) → scene goes to renderer
                                        → obstacles/spawns go to createGame()
```

The simulation layer doesn't change at all. It still receives `Obstacle[]`,
`Vec2` spawns, etc. Only the source of that data changes — from hand-written
JSON to editor-exported JSON parsed by the loader.

## What the Editor Doesn't Handle

These stay in code:

- Enemy AI and behavior
- Weapon stats and balance
- Physics simulation
- Spawning logic (timing, waves, difficulty scaling)
- Player mechanics
- HUD and UI
- Lighting mood/atmosphere (though editor-placed lights are used)
- Procedural placement rules (e.g., random crate distribution within zones)

The editor is purely spatial: where things are, how they look, what they're
called.

## AI Agent Workflow

An AI agent creating or modifying a level would:

1. Read the level JSON
2. Navigate to `object.children` array
3. Add/move/remove/rename entries
4. For new primitives, add entries to `geometries` and reference them
5. For imported models, reference existing geometry UUIDs
6. Write the modified JSON back

Example — AI adds a wall:

```json
{
  "uuid": "ai-generated-uuid-001",
  "type": "Mesh",
  "name": "wall_corridor_new",
  "geometry": "existing-box-geo-uuid",
  "material": "existing-wall-mat-uuid",
  "matrix": [1,0,0,0, 0,1,0,0, 0,0,1,0, 8,0.75,15,1],
  "userData": {}
}
```

The matrix column-major `[..., tx, ty, tz, 1]` encodes the position. For
simple placement, the AI just sets the last column. For rotation, it builds
a proper rotation matrix (or the loader could support a `position`/`rotation`
shorthand in `userData` that overrides the matrix).

## Migration from Current Format

The current `extraction-map.json` can be converted to an editor scene:

1. For each wall in `walls[]`, create a Box mesh named `wall_N`
2. Place at `(wall.pos.x, wallHeight/2, wall.pos.y)` with rotation
3. For each crate position, create a Box mesh named `crate_N`
4. Create a marker named `spawn_player` at the player spawn
5. Create zone planes named `zone_extraction_*` and `zone_difficulty_*`
6. Export as the initial editor scene

This could be a one-time script or done manually in the editor.

## Editor Setup

### Option A: Link to Three.js Editor (simplest)

Copy the `editor/` directory from the
[three.js repo](https://github.com/mrdoob/three.js/tree/dev/editor) into the
project. Serve it via Vite:

```typescript
// vite.config.ts
export default defineConfig({
  // existing config...
  server: {
    // editor is served as static files at /editor
  },
  publicDir: 'public',
});
```

Place editor files in `public/editor/` so they're served at `/editor/index.html`.

### Option B: Embed in dev server

Add a Vite plugin or route that serves the editor only in development mode.
This keeps the editor out of production builds.

### Option C: Standalone

Just open `editor/index.html` directly. No integration with dev server.
The user exports JSON files manually and drops them into `public/levels/`.

Option A or C is recommended to start. The editor doesn't need deep integration
with the game's build system.

## Asset Pipeline Strategy

Two complementary workflows targeting different use cases:

### Blender → GLB (primary authoring)

For building levels with 3D assets (FBX models from Unity, custom meshes, etc.):

- Import FBX assets into Blender (good Unity FBX compatibility)
- Build and light the level in a proper 3D tool with full material editing
- Export as GLB (self-contained: geometry + textures in one file)
- Place the GLB in `public/levels/` — the game loads it at runtime
- Updating an asset = re-export from Blender, replace the file

This is the right tool for authoring: snapping, instancing, material nodes,
texture painting, and a real viewport.

### Web Editor (modding / gameplay tuning)

For adjusting gameplay-relevant properties without a 3D tool:

- Move spawn points, resize zones, reposition walls
- Adjust `userData` (HP, loot tiers, zone difficulty)
- Quick iteration via Game menu save → reload game
- No install required — runs in the browser

The web editor doesn't need to handle complex 3D assets. Its strength is
spatial tweaking and game metadata, not asset creation.

### Future: Reference-Based Levels

When the project moves to Blender-authored levels with many reusable assets,
the level format should shift from embedded geometry to asset references:

```json
{
  "assets": [
    { "path": "assets/building_01.glb", "position": [5, 0, 10], "rotation": [0, 1.57, 0], "name": "wall_building_01" }
  ],
  "metadata": {
    "playerSpawn": [0, 0],
    "zones": [...]
  }
}
```

This keeps level files small, assets reusable, and updates automatic (swap
the GLB, level picks up the change). The web editor would edit positions and
metadata without touching the source assets.
