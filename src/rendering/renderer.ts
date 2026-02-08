import * as THREE from 'three';
import type { GameState } from '../simulation/types.ts';
import {
  createPlayerMesh,
  createEnemyMesh,
  createProjectileMesh,
  createObstacleMesh,
  createGroundMesh,
  createWallMeshes,
  type EnemyMeshGroup,
} from './entities.ts';
import { createCamera, updateCamera } from './camera.ts';

export class Renderer {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly webglRenderer: THREE.WebGLRenderer;

  private playerGroup: THREE.Group | null = null;
  private enemyGroups = new Map<number, EnemyMeshGroup>();
  private projectileMeshes = new Map<number, THREE.Mesh>();

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    this.webglRenderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.webglRenderer.setPixelRatio(window.devicePixelRatio);
    this.webglRenderer.setSize(window.innerWidth, window.innerHeight);
    this.webglRenderer.shadowMap.enabled = true;

    this.camera = createCamera(window.innerWidth / window.innerHeight);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 60;
    dirLight.shadow.camera.left = -20;
    dirLight.shadow.camera.right = 20;
    dirLight.shadow.camera.top = 20;
    dirLight.shadow.camera.bottom = -20;
    this.scene.add(dirLight);

    window.addEventListener('resize', () => this.onResize());
  }

  /** Set up static arena geometry (ground, walls, obstacles) */
  initArena(state: GameState): void {
    // Clear stale refs from previous game
    this.enemyGroups.clear();
    this.projectileMeshes.clear();
    this.playerGroup = null;

    // Ground
    const ground = createGroundMesh(state.arena.width, state.arena.height);
    this.scene.add(ground);

    // Walls
    const walls = createWallMeshes(state.arena.width, state.arena.height);
    this.scene.add(walls);

    // Obstacles
    for (const obs of state.obstacles) {
      const mesh = createObstacleMesh(obs.width, obs.height);
      mesh.position.set(obs.pos.x, mesh.position.y, obs.pos.y);
      this.scene.add(mesh);
    }

    // Player
    this.playerGroup = createPlayerMesh(state.player.radius);
    this.scene.add(this.playerGroup);
  }

  /** Sync all dynamic visuals to match simulation state */
  syncState(state: GameState): void {
    // Player position and rotation
    if (this.playerGroup) {
      this.playerGroup.position.set(state.player.pos.x, 0, state.player.pos.y);
      const aimAngle = Math.atan2(state.player.aimDir.y, state.player.aimDir.x);
      this.playerGroup.rotation.y = -aimAngle;

      // Flash during i-frames
      this.playerGroup.visible = state.player.iframeTimer === 0 ||
        Math.floor(state.player.iframeTimer / 4) % 2 === 0;
    }

    // Update camera
    updateCamera(this.camera, state.player.pos.x, state.player.pos.y);

    // Sync enemies
    const currentEnemyIds = new Set<number>();
    for (const enemy of state.enemies) {
      currentEnemyIds.add(enemy.id);
      let entry = this.enemyGroups.get(enemy.id);
      if (!entry) {
        entry = createEnemyMesh(enemy.radius);
        this.enemyGroups.set(enemy.id, entry);
        this.scene.add(entry.group);
      }
      entry.group.position.set(enemy.pos.x, 0, enemy.pos.y);
    }
    // Remove dead enemy meshes
    for (const [id, entry] of this.enemyGroups) {
      if (!currentEnemyIds.has(id)) {
        this.scene.remove(entry.group);
        this.enemyGroups.delete(id);
      }
    }

    // Sync projectiles
    const currentProjIds = new Set<number>();
    for (const proj of state.projectiles) {
      currentProjIds.add(proj.id);
      let mesh = this.projectileMeshes.get(proj.id);
      if (!mesh) {
        mesh = createProjectileMesh();
        this.projectileMeshes.set(proj.id, mesh);
        this.scene.add(mesh);
      }
      mesh.position.set(proj.pos.x, mesh.position.y, proj.pos.y);
    }
    // Remove dead projectile meshes
    for (const [id, mesh] of this.projectileMeshes) {
      if (!currentProjIds.has(id)) {
        this.scene.remove(mesh);
        this.projectileMeshes.delete(id);
      }
    }
  }

  render(): void {
    this.webglRenderer.render(this.scene, this.camera);
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.webglRenderer.setSize(w, h);
  }

  /** Get the ground plane for raycasting (y=0) */
  getGroundPlane(): THREE.Plane {
    return new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  }

  /** Get enemy head meshes mapped by enemy ID, for headshot raycasting */
  getEnemyHeadMeshes(): Map<number, THREE.Mesh> {
    const heads = new Map<number, THREE.Mesh>();
    for (const [id, entry] of this.enemyGroups) {
      heads.set(id, entry.headMesh);
    }
    return heads;
  }
}
