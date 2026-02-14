import * as THREE from 'three';
import type { WeaponType, EnemyType, ArmorType } from '../simulation/types.ts';
import { getWeaponModel, enemyWeaponType } from './weapon-models.ts';

export function createPlayerMesh(radius: number): THREE.Group {
  const group = new THREE.Group();

  // Capsule body (CapsuleGeometry is vertical by default along Y)
  const height = radius * 1.2;
  const geometry = new THREE.CapsuleGeometry(radius, height, 8, 16);
  const material = new THREE.MeshStandardMaterial({ color: 0x00aaff });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.position.y = radius + height / 2; // bottom hemisphere rests on ground
  group.add(mesh); // children[0]

  // Aim indicator (small cone pointing forward along X)
  const aimGeo = new THREE.ConeGeometry(radius * 0.3, radius * 0.8, 8);
  const aimMat = new THREE.MeshStandardMaterial({ color: 0x44ccff });
  const aimMesh = new THREE.Mesh(aimGeo, aimMat);
  aimMesh.rotation.z = -Math.PI / 2; // tip points along +X
  aimMesh.position.set(radius * 1.2, radius + height / 2, 0);
  group.add(aimMesh); // children[1]

  // Reload progress bar (vertical bar to the right of the player)
  const reloadGroup = createReloadBar(radius);
  group.add(reloadGroup); // children[2]

  return group;
}

export function createReloadBar(playerRadius: number): THREE.Group {
  const barGroup = new THREE.Group();
  barGroup.visible = false;

  const barHeight = playerRadius * 3;
  const barWidth = 0.12;
  const barDepth = 0.06;

  // Background (dark)
  const bgGeo = new THREE.BoxGeometry(barWidth, barHeight, barDepth);
  const bgMat = new THREE.MeshStandardMaterial({ color: 0x222222, transparent: true, opacity: 0.7 });
  const bgMesh = new THREE.Mesh(bgGeo, bgMat);
  bgMesh.position.y = barHeight / 2 + 0.1;
  barGroup.add(bgMesh); // children[0] — background

  // Fill (white, scales with progress)
  const fillGeo = new THREE.BoxGeometry(barWidth * 0.8, barHeight, barDepth * 1.01);
  const fillMat = new THREE.MeshStandardMaterial({
    color: 0xaaaaaa,
    emissive: 0x555555,
    emissiveIntensity: 0.3,
  });
  const fillMesh = new THREE.Mesh(fillGeo, fillMat);
  fillMesh.position.y = barHeight / 2 + 0.1;
  barGroup.add(fillMesh); // children[1] — fill

  // Active reload zone (green tint)
  const activeGeo = new THREE.BoxGeometry(barWidth * 1.02, barHeight, barDepth * 1.02);
  const activeMat = new THREE.MeshStandardMaterial({
    color: 0x66ccff,
    emissive: 0x3388aa,
    emissiveIntensity: 0.4,
    transparent: true,
    opacity: 0.6,
  });
  const activeMesh = new THREE.Mesh(activeGeo, activeMat);
  barGroup.add(activeMesh); // children[2] — active zone

  // Perfect reload zone (gold)
  const perfectGeo = new THREE.BoxGeometry(barWidth * 1.03, barHeight, barDepth * 1.03);
  const perfectMat = new THREE.MeshStandardMaterial({
    color: 0xffcc33,
    emissive: 0xaa8822,
    emissiveIntensity: 0.6,
    transparent: true,
    opacity: 0.8,
  });
  const perfectMesh = new THREE.Mesh(perfectGeo, perfectMat);
  barGroup.add(perfectMesh); // children[3] — perfect zone

  // Cursor line (thin bright line showing current position)
  const cursorGeo = new THREE.BoxGeometry(barWidth * 1.4, 0.03, barDepth * 1.4);
  const cursorMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 1.0,
  });
  const cursorMesh = new THREE.Mesh(cursorGeo, cursorMat);
  barGroup.add(cursorMesh); // children[4] — cursor

  // Position to the right of player
  barGroup.position.set(playerRadius + 0.4, 0, 0);

  return barGroup;
}

export interface EnemyMeshGroup {
  group: THREE.Group;
  bodyMesh: THREE.Mesh;
  headMesh: THREE.Mesh;
  hasArmor: boolean;
  hasHelmet: boolean;
}

export function createEnemyMesh(radius: number, enemyType: EnemyType = 'sprinter', hasArmor = false, hasHelmet = false): EnemyMeshGroup {
  const group = new THREE.Group();

  let bodyColor = 0xff8800; // sprinter
  let headColor = 0xcc6600;
  if (enemyType === 'gunner') {
    bodyColor = 0x8844cc;
    headColor = 0x6633aa;
  } else if (enemyType === 'shotgunner') {
    bodyColor = 0xcc4422;
    headColor = 0xaa3311;
  } else if (enemyType === 'sniper') {
    bodyColor = 0x2266cc;
    headColor = 0x1155aa;
  }

  // Body cube
  const bodyGeo = new THREE.BoxGeometry(radius * 2, radius * 2, radius * 2);
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  body.position.y = radius;
  group.add(body);

  // Head sphere — sits on top of body
  const headRadius = radius * 0.8;
  const headGeo = new THREE.SphereGeometry(headRadius, 10, 10);
  const headMat = new THREE.MeshStandardMaterial({ color: headColor });
  const head = new THREE.Mesh(headGeo, headMat);
  head.castShadow = true;
  head.position.y = radius * 2 + headRadius; // top of body cube + head radius
  group.add(head);

  // Enemy armor overlay (slightly larger body box)
  if (hasArmor) {
    const armorGeo = new THREE.BoxGeometry(radius * 2.3, radius * 1.8, radius * 2.3);
    const armorMat = new THREE.MeshStandardMaterial({
      color: 0x333333,
      metalness: 0.6,
      roughness: 0.4,
    });
    const armorMesh = new THREE.Mesh(armorGeo, armorMat);
    armorMesh.castShadow = true;
    armorMesh.position.y = radius;
    group.add(armorMesh);
  }

  // Enemy helmet (half-sphere on top of head)
  if (hasHelmet) {
    const helmetGeo = new THREE.SphereGeometry(headRadius * 1.15, 10, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const helmetMat = new THREE.MeshStandardMaterial({
      color: 0x888888,
      metalness: 0.7,
      roughness: 0.3,
    });
    const helmetMesh = new THREE.Mesh(helmetGeo, helmetMat);
    helmetMesh.castShadow = true;
    helmetMesh.position.y = radius * 2 + headRadius; // same as head center
    group.add(helmetMesh);
  }

  // Attach weapon model for ranged enemies
  const weaponKey = enemyWeaponType(enemyType);
  if (weaponKey) {
    const weapon = createWeaponMesh(weaponKey, 0);
    weapon.position.set(radius * 0.3, radius, radius * 0.6);
    group.add(weapon);
  }

  return { group, bodyMesh: body, headMesh: head, hasArmor, hasHelmet };
}

export function createPlayerArmorMesh(playerRadius: number, armorTier: ArmorType): THREE.Mesh {
  const scaleMap: Record<ArmorType, number> = { light: 1.0, medium: 1.15, heavy: 1.3 };
  const scale = scaleMap[armorTier];

  const width = playerRadius * 1.6 * scale;
  const height = playerRadius * 1.0 * scale;
  const depth = playerRadius * 1.2 * scale;

  const geometry = new THREE.BoxGeometry(width, height, depth);
  const material = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.9,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
}

export function createExtractionZoneMesh(width: number, height: number): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(width, height);
  const material = new THREE.MeshStandardMaterial({
    color: 0x00ff44,
    emissive: 0x00aa22,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.4,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02; // slightly above ground to avoid z-fighting
  return mesh;
}

export function createProjectileMesh(weaponType: WeaponType = 'rifle'): THREE.Mesh {
  let radius = 0.04;
  let color = 0xffff00;
  let emissive = 0xffaa00;

  switch (weaponType) {
    case 'pistol':
      radius = 0.03;
      color = 0xffffcc;
      emissive = 0xccaa66;
      break;
    case 'smg':
      radius = 0.03;
      color = 0xff8800;
      emissive = 0xcc6600;
      break;
    case 'rifle':
      // defaults
      break;
    case 'shotgun':
      radius = 0.05;
      color = 0xff4400;
      emissive = 0xcc3300;
      break;
    case 'machinegun':
      radius = 0.035;
      color = 0xff6622;
      emissive = 0xdd4400;
      break;
  }

  const geometry = new THREE.SphereGeometry(radius, 6, 6);
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: 1.0,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = 0.5;
  return mesh;
}

export function createEnemyProjectileMesh(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(0.08, 6, 6);
  const material = new THREE.MeshStandardMaterial({
    color: 0xff2222,
    emissive: 0xcc0000,
    emissiveIntensity: 1.0,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = 0.5;
  return mesh;
}

export function createGrenadeMesh(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(0.15, 8, 8);
  const material = new THREE.MeshStandardMaterial({
    color: 0x22aa22,
    emissive: 0x115511,
    emissiveIntensity: 0.5,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.position.y = 0.15;
  return mesh;
}

export function createCrateMesh(crateType: string): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(0.4, 0.4, 0.4);
  const isHealth = crateType === 'health';
  const material = new THREE.MeshStandardMaterial({
    color: isHealth ? 0x22cc44 : 0x2266ff,
    emissive: isHealth ? 0x115522 : 0x112255,
    emissiveIntensity: 0.6,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.position.y = 0.3;
  return mesh;
}

export function createCashMesh(): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(0.3, 0.02, 0.18);
  const material = new THREE.MeshStandardMaterial({
    color: 0x2e8b57,
    emissive: 0x1a5c38,
    emissiveIntensity: 0.8,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.position.y = 0.3;
  return mesh;
}

export function createDestructibleCrateMesh(width: number, height: number): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(width, 0.8, height);
  const material = new THREE.MeshStandardMaterial({
    color: 0x8B6914,
    emissive: 0x443008,
    emissiveIntensity: 0.2,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.y = 0.4;
  return mesh;
}

export function createCircleObstacleMesh(radius: number, color: number = 0x666666): THREE.Mesh {
  const wallHeight = 1.5;
  const geometry = new THREE.CylinderGeometry(radius, radius, wallHeight, 16);
  const material = new THREE.MeshStandardMaterial({ color });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.y = wallHeight / 2;
  return mesh;
}

export function createObstacleMesh(width: number, height: number): THREE.Mesh {
  const wallHeight = 1.5;
  const geometry = new THREE.BoxGeometry(width, wallHeight, height);
  const material = new THREE.MeshStandardMaterial({ color: 0x666666 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.y = wallHeight / 2;
  return mesh;
}

export function createGroundMesh(arenaWidth: number, arenaHeight: number): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(arenaWidth, arenaHeight);
  const material = new THREE.MeshStandardMaterial({
    color: 0x333333,
    roughness: 0.8,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}

export function createZoneGroundMesh(arenaWidth: number, yMin: number, yMax: number, color: number): THREE.Mesh {
  const zoneHeight = yMax - yMin;
  const geometry = new THREE.PlaneGeometry(arenaWidth, zoneHeight);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.8,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  // Position at center of zone (yMin and yMax are in simulation coords, Z in three.js)
  const centerY = (yMin + yMax) / 2;
  mesh.position.set(0, 0, centerY);
  return mesh;
}

export function createObstacleMeshWithColor(width: number, height: number, color: number): THREE.Mesh {
  const wallHeight = 1.5;
  const geometry = new THREE.BoxGeometry(width, wallHeight, height);
  const material = new THREE.MeshStandardMaterial({ color });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.y = wallHeight / 2;
  return mesh;
}

export function createWeaponMesh(weaponType: WeaponType | 'sniper', upgradeLevel: number): THREE.Group {
  // Try to use loaded 3D model
  const model = getWeaponModel(weaponType);
  if (model) {
    // Apply upgrade-level emissive glow
    if (upgradeLevel > 0) {
      const emissiveIntensity = upgradeLevel * 0.3;
      const emissiveColor = upgradeLevel >= 3 ? 0xddaa22 : upgradeLevel >= 2 ? 0x88aadd : 0x446688;
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mat = (child.material as THREE.MeshStandardMaterial).clone();
          mat.emissive = new THREE.Color(emissiveColor);
          mat.emissiveIntensity = emissiveIntensity;
          child.material = mat;
        }
      });
    }
    return model;
  }

  // Fallback: box geometry
  const group = new THREE.Group();

  let length = 0.5;
  let width = 0.08;
  let color = 0x444444;

  switch (weaponType) {
    case 'pistol':
      length = 0.35;
      width = 0.06;
      color = 0x555555;
      break;
    case 'smg':
      length = 0.45;
      width = 0.07;
      color = 0x444455;
      break;
    case 'rifle':
      length = 0.6;
      width = 0.06;
      color = 0x445544;
      break;
    case 'shotgun':
      length = 0.55;
      width = 0.1;
      color = 0x554433;
      break;
    case 'machinegun':
      length = 0.7;
      width = 0.12;
      color = 0x3a3a3a;
      break;
    case 'sniper':
      length = 0.65;
      width = 0.06;
      color = 0x3a4a5a;
      break;
  }

  // Barrel
  const barrelGeo = new THREE.BoxGeometry(length, width, width);
  const emissiveIntensity = upgradeLevel * 0.3;
  const emissiveColor = upgradeLevel >= 3 ? 0xddaa22 : upgradeLevel >= 2 ? 0x88aadd : 0x446688;
  const barrelMat = new THREE.MeshStandardMaterial({
    color,
    emissive: emissiveColor,
    emissiveIntensity,
  });
  const barrel = new THREE.Mesh(barrelGeo, barrelMat);
  barrel.position.x = length / 2;
  group.add(barrel);

  return group;
}

export function createWallMeshes(arenaWidth: number, arenaHeight: number): THREE.Group {
  const group = new THREE.Group();
  const wallHeight = 2;
  const wallThickness = 0.3;
  const mat = new THREE.MeshStandardMaterial({ color: 0x555555 });

  const halfW = arenaWidth / 2;
  const halfH = arenaHeight / 2;

  // North wall
  const northGeo = new THREE.BoxGeometry(arenaWidth + wallThickness * 2, wallHeight, wallThickness);
  const north = new THREE.Mesh(northGeo, mat);
  north.position.set(0, wallHeight / 2, -halfH - wallThickness / 2);
  group.add(north);

  // South wall
  const south = new THREE.Mesh(northGeo, mat);
  south.position.set(0, wallHeight / 2, halfH + wallThickness / 2);
  group.add(south);

  // East wall
  const eastGeo = new THREE.BoxGeometry(wallThickness, wallHeight, arenaHeight + wallThickness * 2);
  const east = new THREE.Mesh(eastGeo, mat);
  east.position.set(halfW + wallThickness / 2, wallHeight / 2, 0);
  group.add(east);

  // West wall
  const west = new THREE.Mesh(eastGeo, mat);
  west.position.set(-halfW - wallThickness / 2, wallHeight / 2, 0);
  group.add(west);

  return group;
}
