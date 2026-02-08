import * as THREE from 'three';

export function createPlayerMesh(radius: number): THREE.Group {
  const group = new THREE.Group();

  // Capsule body
  const geometry = new THREE.CapsuleGeometry(radius, radius * 1.2, 8, 16);
  const material = new THREE.MeshStandardMaterial({ color: 0x00aaff });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.rotation.x = -Math.PI / 2; // stand upright
  mesh.position.y = radius * 1.1; // raise above ground
  group.add(mesh);

  // Aim indicator (small cone pointing forward)
  const aimGeo = new THREE.ConeGeometry(radius * 0.3, radius * 0.8, 8);
  const aimMat = new THREE.MeshStandardMaterial({ color: 0x44ccff });
  const aimMesh = new THREE.Mesh(aimGeo, aimMat);
  aimMesh.rotation.x = -Math.PI / 2;
  aimMesh.position.set(radius * 1.2, radius * 0.8, 0);
  group.add(aimMesh);

  return group;
}

export interface EnemyMeshGroup {
  group: THREE.Group;
  headMesh: THREE.Mesh;
}

export function createEnemyMesh(radius: number): EnemyMeshGroup {
  const group = new THREE.Group();

  // Body cube
  const bodyGeo = new THREE.BoxGeometry(radius * 2, radius * 2, radius * 2);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff3333 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  body.position.y = radius;
  group.add(body);

  // Head sphere — sits on top of body
  const headRadius = radius * 0.8;
  const headGeo = new THREE.SphereGeometry(headRadius, 10, 10);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xcc2222 });
  const head = new THREE.Mesh(headGeo, headMat);
  head.castShadow = true;
  head.position.y = radius * 2 + headRadius; // top of body cube + head radius
  group.add(head);

  return { group, headMesh: head };
}

export function createProjectileMesh(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(0.04, 6, 6);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffff00,
    emissive: 0xffaa00,
    emissiveIntensity: 1.0,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = 0.5;
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
