import * as THREE from 'three';
import type { WeaponType, EnemyType } from '../simulation/types.ts';

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
  headMesh: THREE.Mesh;
}

export function createEnemyMesh(radius: number, enemyType: EnemyType = 'rusher'): EnemyMeshGroup {
  const group = new THREE.Group();

  const isSprinter = enemyType === 'sprinter';
  const bodyColor = isSprinter ? 0xff8800 : 0xff3333;
  const headColor = isSprinter ? 0xcc6600 : 0xcc2222;

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

  return { group, headMesh: head };
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
  const geometry = new THREE.OctahedronGeometry(0.2, 0);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffd700,
    emissive: 0xcc9900,
    emissiveIntensity: 0.8,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.position.y = 0.3;
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
