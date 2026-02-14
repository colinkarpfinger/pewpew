/**
 * Migration script: converts extraction-map.json → Three.js editor-compatible JSON scene.
 * Run with: npx tsx scripts/migrate-level.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const mapPath = path.join(rootDir, 'src/configs/extraction-map.json');
const outPath = path.join(rootDir, 'public/levels/extraction-01.json');

interface Vec2 { x: number; y: number }
interface Wall { pos: Vec2; width: number; height: number; rotation?: number; shape?: string; radius?: number }
interface Zone { yMin: number; yMax: number; ambientInterval: number; sprinterRatio: number; gunnerRatio?: number; shotgunnerRatio?: number; sniperRatio?: number; initialEnemyCount?: number }
interface ExtractionZone { x: number; y: number; width: number; height: number }
interface MapConfig {
  width: number; height: number; playerSpawn: Vec2;
  extractionZones: ExtractionZone[]; walls: Wall[]; zones: Zone[];
  maxEnemies: number; minSpawnDistFromPlayer: number;
  enemyDetectionRange?: number; wanderSpeedMultiplier?: number;
  destructibleCrates?: Vec2[];
}

const map: MapConfig = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));

// Helpers for Three.js JSON format
let nextUuid = 1;
function uuid(): string { return `uuid-${nextUuid++}`; }

interface GeoEntry { uuid: string; type: string; [key: string]: unknown }
interface MatEntry { uuid: string; type: string; color: number; roughness?: number; metalness?: number; [key: string]: unknown }
interface ObjEntry {
  uuid: string; type: string; name: string;
  geometry?: string; material?: string;
  matrix: number[];
  userData?: Record<string, unknown>;
  children?: ObjEntry[];
}

const geometries: GeoEntry[] = [];
const materials: MatEntry[] = [];
const children: ObjEntry[] = [];

// Reusable material
const wallMatUuid = uuid();
materials.push({ uuid: wallMatUuid, type: 'MeshStandardMaterial', color: 0x666666, roughness: 0.8, metalness: 0.1 });

const groundMatUuid = uuid();
materials.push({ uuid: groundMatUuid, type: 'MeshStandardMaterial', color: 0x333333, roughness: 0.9, metalness: 0.0 });

const markerMatUuid = uuid();
materials.push({ uuid: markerMatUuid, type: 'MeshStandardMaterial', color: 0x00ff00, roughness: 1.0, metalness: 0.0, transparent: true, opacity: 0.3 });

const crateMatUuid = uuid();
materials.push({ uuid: crateMatUuid, type: 'MeshStandardMaterial', color: 0x8B4513, roughness: 0.7, metalness: 0.1 });

const WALL_HEIGHT = 1.5;

/** Build a column-major 4x4 matrix from position, rotation (Y-axis), and scale */
function makeMatrix(pos: [number, number, number], rotY: number = 0, scale: [number, number, number] = [1, 1, 1]): number[] {
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  // Column-major: columns are [right, up, forward, translation]
  return [
    scale[0] * c,  0, scale[0] * -s, 0,
    0,             scale[1], 0,       0,
    scale[2] * s,  0, scale[2] * c,  0,
    pos[0],        pos[1], pos[2],    1,
  ];
}

// ---- Walls ----
let wallIdx = 0;
for (const wall of map.walls) {
  if (wall.shape === 'circle' && wall.radius) {
    // Circle obstacle → CylinderGeometry pillar
    const geoUuid = uuid();
    geometries.push({
      uuid: geoUuid,
      type: 'CylinderGeometry',
      radiusTop: wall.radius,
      radiusBottom: wall.radius,
      height: WALL_HEIGHT,
      radialSegments: 16,
    });
    const objUuid = uuid();
    children.push({
      uuid: objUuid,
      type: 'Mesh',
      name: `pillar_${wallIdx}`,
      geometry: geoUuid,
      material: wallMatUuid,
      matrix: makeMatrix([wall.pos.x, WALL_HEIGHT / 2, wall.pos.y]),
      userData: { radius: wall.radius },
    });
  } else {
    // Box wall
    const geoUuid = uuid();
    geometries.push({
      uuid: geoUuid,
      type: 'BoxGeometry',
      width: wall.width,
      height: WALL_HEIGHT,
      depth: wall.height,
    });
    const objUuid = uuid();
    // In the editor, rotation.y maps to -rotation in game space
    const editorRotY = wall.rotation ? -wall.rotation : 0;
    children.push({
      uuid: objUuid,
      type: 'Mesh',
      name: `wall_${wallIdx}`,
      geometry: geoUuid,
      material: wallMatUuid,
      matrix: makeMatrix([wall.pos.x, WALL_HEIGHT / 2, wall.pos.y], editorRotY),
    });
  }
  wallIdx++;
}

// ---- Player spawn ----
{
  const geoUuid = uuid();
  geometries.push({ uuid: geoUuid, type: 'BoxGeometry', width: 0.5, height: 0.1, depth: 0.5 });
  children.push({
    uuid: uuid(),
    type: 'Mesh',
    name: 'spawn_player',
    geometry: geoUuid,
    material: markerMatUuid,
    matrix: makeMatrix([map.playerSpawn.x, 0.05, map.playerSpawn.y]),
  });
}

// ---- Extraction zones ----
for (let i = 0; i < map.extractionZones.length; i++) {
  const ez = map.extractionZones[i];
  const geoUuid = uuid();
  geometries.push({ uuid: geoUuid, type: 'BoxGeometry', width: ez.width, height: 0.1, depth: ez.height });
  children.push({
    uuid: uuid(),
    type: 'Mesh',
    name: `zone_extraction_${i}`,
    geometry: geoUuid,
    material: markerMatUuid,
    matrix: makeMatrix([ez.x, 0.05, ez.y]),
  });
}

// ---- Difficulty zones ----
for (let i = 0; i < map.zones.length; i++) {
  const zone = map.zones[i];
  const zoneWidth = map.width;
  const zoneHeight = zone.yMax - zone.yMin;
  const centerY = (zone.yMin + zone.yMax) / 2;

  const geoUuid = uuid();
  geometries.push({ uuid: geoUuid, type: 'BoxGeometry', width: zoneWidth, height: 0.05, depth: zoneHeight });
  children.push({
    uuid: uuid(),
    type: 'Mesh',
    name: `zone_difficulty_${i}`,
    geometry: geoUuid,
    material: markerMatUuid,
    matrix: makeMatrix([0, 0.025, centerY]),
    userData: {
      ambientInterval: zone.ambientInterval,
      sprinterRatio: zone.sprinterRatio,
      gunnerRatio: zone.gunnerRatio ?? 0,
      shotgunnerRatio: zone.shotgunnerRatio ?? 0,
      sniperRatio: zone.sniperRatio ?? 0,
      initialEnemyCount: zone.initialEnemyCount ?? 0,
    },
  });
}

// ---- Arena bounds ----
{
  const geoUuid = uuid();
  geometries.push({ uuid: geoUuid, type: 'BoxGeometry', width: map.width, height: 0.05, depth: map.height });
  children.push({
    uuid: uuid(),
    type: 'Mesh',
    name: 'arena_bounds',
    geometry: geoUuid,
    material: markerMatUuid,
    matrix: makeMatrix([0, 0.025, 0]),
  });
}

// ---- Ground ----
{
  const geoUuid = uuid();
  geometries.push({ uuid: geoUuid, type: 'BoxGeometry', width: map.width + 2, height: 0.1, depth: map.height + 2 });
  children.push({
    uuid: uuid(),
    type: 'Mesh',
    name: 'ground_main',
    geometry: geoUuid,
    material: groundMatUuid,
    matrix: makeMatrix([0, -0.05, 0]),
  });
}

// ---- Destructible crates ----
if (map.destructibleCrates) {
  for (let i = 0; i < map.destructibleCrates.length; i++) {
    const pos = map.destructibleCrates[i];
    const geoUuid = uuid();
    geometries.push({ uuid: geoUuid, type: 'BoxGeometry', width: 1.0, height: 1.0, depth: 1.0 });

    // Determine loot tier from zone position
    let lootTier = 1;
    for (let z = 0; z < map.zones.length; z++) {
      if (pos.y >= map.zones[z].yMin && pos.y < map.zones[z].yMax) {
        lootTier = z + 1;
        break;
      }
    }

    children.push({
      uuid: uuid(),
      type: 'Mesh',
      name: `crate_${i}`,
      geometry: geoUuid,
      material: crateMatUuid,
      matrix: makeMatrix([pos.x, 0.5, pos.y]),
      userData: { hp: 50, lootTier },
    });
  }
}

// ---- Ambient light ----
children.push({
  uuid: uuid(),
  type: 'AmbientLight',
  name: 'AmbientLight',
  color: 0xffffff,
  intensity: 0.4,
  matrix: makeMatrix([0, 0, 0]),
} as unknown as ObjEntry);

// ---- Directional light ----
children.push({
  uuid: uuid(),
  type: 'DirectionalLight',
  name: 'DirectionalLight',
  color: 0xffffff,
  intensity: 0.8,
  matrix: makeMatrix([10, 20, 10]),
} as unknown as ObjEntry);

// ---- Assemble scene ----
const sceneJson = {
  metadata: {
    version: 4.6,
    type: 'Object',
    generator: 'migrate-level.ts',
  },
  geometries,
  materials,
  object: {
    uuid: uuid(),
    type: 'Scene',
    name: 'Scene',
    background: 0x1a1a2e,
    children,
    matrix: makeMatrix([0, 0, 0]),
  },
};

// ---- Write output ----
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(sceneJson, null, 2));
console.log(`Migrated level written to ${outPath}`);
console.log(`  ${map.walls.length} walls/pillars`);
console.log(`  ${map.extractionZones.length} extraction zones`);
console.log(`  ${map.zones.length} difficulty zones`);
console.log(`  ${map.destructibleCrates?.length ?? 0} destructible crates`);
