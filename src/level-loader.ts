import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Obstacle, ExtractionMapConfig, Vec2, ZoneConfig, ExtractionZone } from './simulation/types.ts';

export interface LevelData {
  arena: { width: number; height: number };
  playerSpawn: Vec2;
  obstacles: Obstacle[];
  destructibleCrates: { pos: Vec2; hp: number; lootTier: number }[];
  extractionZones: ExtractionZone[];
  zones: ZoneConfig[];
  scene: THREE.Scene;
}

/** Convert LevelData to an ExtractionMapConfig compatible with the existing game code */
export function levelDataToExtractionMap(level: LevelData, meta: {
  maxEnemies: number;
  minSpawnDistFromPlayer: number;
  enemyDetectionRange?: number;
  wanderSpeedMultiplier?: number;
}): ExtractionMapConfig {
  return {
    width: level.arena.width,
    height: level.arena.height,
    playerSpawn: level.playerSpawn,
    extractionZones: level.extractionZones,
    walls: level.obstacles,
    triggerRegions: [],
    zones: level.zones,
    maxEnemies: meta.maxEnemies,
    minSpawnDistFromPlayer: meta.minSpawnDistFromPlayer,
    enemyDetectionRange: meta.enemyDetectionRange,
    wanderSpeedMultiplier: meta.wanderSpeedMultiplier,
    destructibleCrates: level.destructibleCrates.map(c => c.pos),
  };
}

/** Parse a Three.js editor JSON export into game-usable LevelData */
export function loadLevelFromJSON(json: Record<string, unknown>): LevelData {
  const loader = new THREE.ObjectLoader();
  const scene = loader.parse(json) as THREE.Scene;
  return loadLevelFromScene(scene);
}

/** Load a GLB file and parse it into game-usable LevelData */
export async function loadLevelFromGLB(url: string): Promise<LevelData> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  // GLTFLoader returns a Group — wrap it in a Scene for consistent return type
  const scene = new THREE.Scene();
  scene.add(gltf.scene);
  return loadLevelFromScene(scene);
}

/** Shared traversal: extract game objects from a Three.js scene */
function loadLevelFromScene(scene: THREE.Scene): LevelData {
  let arenaWidth = 40;
  let arenaHeight = 120;
  let playerSpawn: Vec2 = { x: 0, y: 0 };
  const obstacles: Obstacle[] = [];
  const destructibleCrates: { pos: Vec2; hp: number; lootTier: number }[] = [];
  const extractionZones: ExtractionZone[] = [];
  const zones: ZoneConfig[] = [];
  const toRemove: THREE.Object3D[] = [];

  scene.traverse((obj) => {
    const name = obj.name;
    if (!name) return;

    // Arena bounds — defines playable area from bounding box
    if (name === 'arena_bounds') {
      const box = new THREE.Box3().setFromObject(obj);
      arenaWidth = box.max.x - box.min.x;
      arenaHeight = box.max.z - box.min.z;
      toRemove.push(obj);
      return;
    }

    // Player spawn
    if (name === 'spawn_player') {
      playerSpawn = { x: obj.position.x, y: obj.position.z };
      toRemove.push(obj);
      return;
    }

    // Enemy spawn points (store as userData on the scene for later use)
    if (name.startsWith('spawn_enemy_')) {
      toRemove.push(obj);
      return;
    }

    // Extraction zones
    if (name.startsWith('zone_extraction_')) {
      const box = new THREE.Box3().setFromObject(obj);
      extractionZones.push({
        x: (box.min.x + box.max.x) / 2,
        y: (box.min.z + box.max.z) / 2,
        width: box.max.x - box.min.x,
        height: box.max.z - box.min.z,
      });
      toRemove.push(obj);
      return;
    }

    // Difficulty zones
    if (name.startsWith('zone_difficulty_')) {
      const ud = obj.userData as Record<string, unknown>;
      const box = new THREE.Box3().setFromObject(obj);
      zones.push({
        yMin: box.min.z,
        yMax: box.max.z,
        ambientInterval: (ud.ambientInterval as number) ?? 200,
        sprinterRatio: (ud.sprinterRatio as number) ?? 1.0,
        gunnerRatio: ud.gunnerRatio as number | undefined,
        shotgunnerRatio: ud.shotgunnerRatio as number | undefined,
        sniperRatio: ud.sniperRatio as number | undefined,
        initialEnemyCount: ud.initialEnemyCount as number | undefined,
      });
      toRemove.push(obj);
      return;
    }

    // Only process Meshes for collider objects
    if (!(obj instanceof THREE.Mesh)) return;

    // Walls and pillars — static obstacles
    if (name.startsWith('wall_') || name.startsWith('pillar_') || name.startsWith('cover_')) {
      const obstacle = meshToObstacle(obj);
      if (obstacle) obstacles.push(obstacle);
      return;
    }

    // Destructible crates
    if (name.startsWith('crate_')) {
      const ud = obj.userData as Record<string, unknown>;
      destructibleCrates.push({
        pos: { x: obj.position.x, y: obj.position.z },
        hp: (ud.hp as number) ?? 50,
        lootTier: (ud.lootTier as number) ?? 1,
      });
      return;
    }
  });

  // Sort zones by yMin so they're in order
  zones.sort((a, b) => a.yMin - b.yMin);

  // Remove marker objects from the visual scene
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
  };
}

/** @deprecated Use loadLevelFromJSON instead */
export const loadLevel = loadLevelFromJSON;

/** Derive an Obstacle from a mesh's bounding box and transform */
function meshToObstacle(mesh: THREE.Mesh): Obstacle | null {
  const ud = mesh.userData as Record<string, unknown>;

  // Check for explicit circle collider
  if (ud.collider === 'circle' || mesh.name.startsWith('pillar_')) {
    const box = new THREE.Box3().setFromObject(mesh);
    const sizeX = box.max.x - box.min.x;
    const sizeZ = box.max.z - box.min.z;
    const radius = (ud.radius as number) ?? Math.max(sizeX, sizeZ) / 2;
    return {
      pos: { x: mesh.position.x, y: mesh.position.z },
      width: 0,
      height: 0,
      shape: 'circle',
      radius,
    };
  }

  // Box collider — derive from geometry bounding box (pre-transform)
  const geo = mesh.geometry;
  if (!geo) return null;
  geo.computeBoundingBox();
  const geoBBox = geo.boundingBox;
  if (!geoBBox) return null;

  const width = (geoBBox.max.x - geoBBox.min.x) * Math.abs(mesh.scale.x);
  const height = (geoBBox.max.z - geoBBox.min.z) * Math.abs(mesh.scale.z);

  const obstacle: Obstacle = {
    pos: { x: mesh.position.x, y: mesh.position.z },
    width,
    height,
  };

  // Extract Y rotation as the 2D rotation (negate because editor Y-up rotation maps to -rotation in game)
  if (Math.abs(mesh.rotation.y) > 0.001) {
    obstacle.rotation = -mesh.rotation.y;
  }

  return obstacle;
}
