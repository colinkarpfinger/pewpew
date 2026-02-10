import * as THREE from 'three';
import type { GameState, GameEvent, WeaponConfig, EnemyType } from '../simulation/types.ts';
import { ParticleSystem } from './particles.ts';
import {
  createPlayerMesh,
  createEnemyMesh,
  createProjectileMesh,
  createGrenadeMesh,
  createCrateMesh,
  createObstacleMesh,
  createGroundMesh,
  createWallMeshes,
  createExtractionZoneMesh,
  type EnemyMeshGroup,
} from './entities.ts';
import { createCamera, updateCamera } from './camera.ts';

export class Renderer {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly webglRenderer: THREE.WebGLRenderer;

  private playerGroup: THREE.Group | null = null;
  private playerCapsule: THREE.Mesh | null = null;
  private playerAim: THREE.Mesh | null = null;
  private playerReloadBar: THREE.Group | null = null;
  private playerRadius = 0.4;
  private dodgeDuration = 18;
  private weaponConfig: WeaponConfig | null = null;
  private enemyGroups = new Map<number, EnemyMeshGroup>();
  private projectileMeshes = new Map<number, THREE.Mesh>();
  private grenadeMeshes = new Map<number, THREE.Mesh>();
  private crateMeshes = new Map<number, THREE.Mesh>();
  private particles: ParticleSystem | null = null;
  private muzzleFlashes: { light: THREE.PointLight; timer: number }[] = [];
  private dirLight: THREE.DirectionalLight | null = null;
  private enemyTypes = new Map<number, EnemyType>();

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
    this.grenadeMeshes.clear();
    this.crateMeshes.clear();
    this.enemyTypes.clear();
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

    // Extraction zone marker
    if (state.extractionMap) {
      const ez = state.extractionMap.extractionZone;
      const ezMesh = createExtractionZoneMesh(ez.width, ez.height);
      ezMesh.position.set(ez.x, 0.02, ez.y);
      this.scene.add(ezMesh);
    }

    // Find the directional light in the scene (created by rebuildScene) for shadow follow
    this.dirLight = null;
    for (const child of this.scene.children) {
      if (child instanceof THREE.DirectionalLight) {
        this.dirLight = child;
        break;
      }
    }

    // Clean up muzzle flashes
    for (const mf of this.muzzleFlashes) {
      this.scene.remove(mf.light);
      mf.light.dispose();
    }
    this.muzzleFlashes = [];

    // Particles
    if (this.particles) this.particles.dispose();
    this.particles = new ParticleSystem();
    this.scene.add(this.particles.points);

    // Player
    this.playerRadius = state.player.radius;
    this.playerGroup = createPlayerMesh(state.player.radius);
    this.playerCapsule = this.playerGroup.children[0] as THREE.Mesh;
    this.playerAim = this.playerGroup.children[1] as THREE.Mesh;
    this.playerReloadBar = this.playerGroup.children[2] as THREE.Group;
    this.scene.add(this.playerGroup);
  }

  /** Configure dodge animation duration (in ticks) */
  setDodgeDuration(ticks: number): void {
    this.dodgeDuration = ticks;
  }

  /** Store weapon config for reload bar calculations */
  setWeaponConfig(config: WeaponConfig): void {
    this.weaponConfig = config;
  }

  /** Sync all dynamic visuals to match simulation state */
  syncState(state: GameState): void {
    // Player position and rotation
    if (this.playerGroup && this.playerCapsule && this.playerAim) {
      this.playerGroup.position.set(state.player.pos.x, 0, state.player.pos.y);

      if (state.player.dodgeTimer > 0) {
        // Dodge animation
        const elapsed = this.dodgeDuration - state.player.dodgeTimer;
        const t = elapsed / this.dodgeDuration; // 0→1

        // Face dodge direction instead of aim direction
        const dodgeAngle = Math.atan2(state.player.dodgeDir.y, state.player.dodgeDir.x);
        this.playerGroup.rotation.y = -dodgeAngle;

        // Hide aim indicator during dodge
        this.playerAim.visible = false;

        const r = this.playerRadius;
        const capsuleHeight = r * 1.2;
        const uprightY = r + capsuleHeight / 2;

        // Easing functions
        const easeInQuad = (x: number) => x * x;
        const easeOutQuad = (x: number) => 1 - (1 - x) * (1 - x);

        if (t < 0.22) {
          // Phase 1: Tip over (0→90° on local X axis)
          const p = easeInQuad(t / 0.22);
          const tipAngle = p * Math.PI / 2;
          this.playerCapsule.rotation.x = 0;
          this.playerCapsule.rotation.z = tipAngle;
          // Lower Y as capsule tips: from upright to lying on ground
          this.playerCapsule.position.y = uprightY * (1 - p) + r * p;
        } else if (t < 0.78) {
          // Phase 2: Roll — keep tipped, spin around long axis
          const rollT = (t - 0.22) / (0.78 - 0.22);
          this.playerCapsule.rotation.z = Math.PI / 2;
          // 3 half-rotations while rolling
          this.playerCapsule.rotation.x = rollT * Math.PI * 3;
          this.playerCapsule.position.y = r;
        } else {
          // Phase 3: Pop up (90°→0° on local X axis)
          const p = easeOutQuad((t - 0.78) / (1 - 0.78));
          const tipAngle = (1 - p) * Math.PI / 2;
          this.playerCapsule.rotation.z = tipAngle;
          this.playerCapsule.rotation.x = 0;
          // Raise Y back to upright
          this.playerCapsule.position.y = r * (1 - p) + uprightY * p;
        }
      } else {
        // Normal: upright, aim-directed
        const aimAngle = Math.atan2(state.player.aimDir.y, state.player.aimDir.x);
        this.playerGroup.rotation.y = -aimAngle;
        this.playerAim.visible = true;

        // Reset capsule mesh to upright defaults
        const r = this.playerRadius;
        const capsuleHeight = r * 1.2;
        this.playerCapsule.rotation.set(0, 0, 0);
        this.playerCapsule.position.y = r + capsuleHeight / 2;
      }

      // Flash during i-frames
      this.playerGroup.visible = state.player.iframeTimer === 0 ||
        Math.floor(state.player.iframeTimer / 4) % 2 === 0;

      // Reload bar with active/perfect timing zones
      if (this.playerReloadBar && this.weaponConfig) {
        const reloading = state.player.reloadTimer > 0;
        this.playerReloadBar.visible = reloading;

        if (reloading) {
          const wc = this.weaponConfig;
          const progress = state.player.reloadTimer / wc.reloadTime;
          const barHeight = this.playerRadius * 3;
          const baseY = 0.1; // bottom of bar

          // Fill bar — grows from bottom
          const fillMesh = this.playerReloadBar.children[1] as THREE.Mesh;
          fillMesh.scale.y = progress;
          fillMesh.position.y = (barHeight * progress) / 2 + baseY;

          // Active zone — positioned by config fractions
          const activeMesh = this.playerReloadBar.children[2] as THREE.Mesh;
          const activeCenterY = ((wc.activeReloadStart + wc.activeReloadEnd) / 2) * barHeight + baseY;
          activeMesh.scale.y = (wc.activeReloadEnd - wc.activeReloadStart);
          activeMesh.position.y = activeCenterY;

          // Perfect zone — positioned within active zone
          const perfectMesh = this.playerReloadBar.children[3] as THREE.Mesh;
          const perfectCenterY = ((wc.perfectReloadStart + wc.perfectReloadEnd) / 2) * barHeight + baseY;
          perfectMesh.scale.y = (wc.perfectReloadEnd - wc.perfectReloadStart);
          perfectMesh.position.y = perfectCenterY;

          // Cursor line — shows current progress position
          const cursorMesh = this.playerReloadBar.children[4] as THREE.Mesh;
          cursorMesh.position.y = progress * barHeight + baseY;

          // Counter-rotate so bar always faces camera
          this.playerReloadBar.rotation.y = -this.playerGroup.rotation.y;
        }
      }
    }

    // Update camera
    updateCamera(this.camera, state.player.pos.x, state.player.pos.y);

    // Sync enemies
    const currentEnemyIds = new Set<number>();
    for (const enemy of state.enemies) {
      currentEnemyIds.add(enemy.id);
      let entry = this.enemyGroups.get(enemy.id);
      if (!entry) {
        entry = createEnemyMesh(enemy.radius, enemy.type);
        this.enemyGroups.set(enemy.id, entry);
        this.enemyTypes.set(enemy.id, enemy.type);
        this.scene.add(entry.group);
      }
      entry.group.position.set(enemy.pos.x, 0, enemy.pos.y);
      entry.group.visible = enemy.visible;
    }
    // Remove dead enemy meshes
    for (const [id, entry] of this.enemyGroups) {
      if (!currentEnemyIds.has(id)) {
        this.scene.remove(entry.group);
        this.enemyGroups.delete(id);
        this.enemyTypes.delete(id);
      }
    }

    // Update directional light to follow player (for shadow coverage on large maps)
    if (this.dirLight) {
      this.dirLight.position.set(
        state.player.pos.x + 10,
        20,
        state.player.pos.y + 10,
      );
      this.dirLight.target.position.set(state.player.pos.x, 0, state.player.pos.y);
      this.dirLight.target.updateMatrixWorld();
    }

    // Sync projectiles
    const currentProjIds = new Set<number>();
    for (const proj of state.projectiles) {
      currentProjIds.add(proj.id);
      let mesh = this.projectileMeshes.get(proj.id);
      if (!mesh) {
        mesh = createProjectileMesh(proj.weaponType);
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

    // Sync grenades
    const currentGrenadeIds = new Set<number>();
    for (const grenade of state.grenades) {
      currentGrenadeIds.add(grenade.id);
      let mesh = this.grenadeMeshes.get(grenade.id);
      if (!mesh) {
        mesh = createGrenadeMesh();
        this.grenadeMeshes.set(grenade.id, mesh);
        this.scene.add(mesh);
      }
      mesh.position.set(grenade.pos.x, 0.15 + grenade.height, grenade.pos.y);
    }
    // Remove exploded grenade meshes
    for (const [id, mesh] of this.grenadeMeshes) {
      if (!currentGrenadeIds.has(id)) {
        this.scene.remove(mesh);
        this.grenadeMeshes.delete(id);
      }
    }

    // Sync crates
    const currentCrateIds = new Set<number>();
    for (const crate of state.crates) {
      currentCrateIds.add(crate.id);
      let mesh = this.crateMeshes.get(crate.id);
      if (!mesh) {
        mesh = createCrateMesh(crate.crateType);
        this.crateMeshes.set(crate.id, mesh);
        this.scene.add(mesh);
      }
      // Bob animation
      const bobY = 0.3 + Math.sin(state.tick * 0.05) * 0.08;
      mesh.position.set(crate.pos.x, bobY, crate.pos.y);
      mesh.rotation.y = state.tick * 0.02;

      // Blink when expiring (last 120 ticks = 2s)
      if (crate.lifetime <= 120) {
        mesh.visible = Math.floor(crate.lifetime / 6) % 2 === 0;
      } else {
        mesh.visible = true;
      }
    }
    // Remove picked up / expired crate meshes
    for (const [id, mesh] of this.crateMeshes) {
      if (!currentCrateIds.has(id)) {
        this.scene.remove(mesh);
        this.crateMeshes.delete(id);
      }
    }
  }

  /** Update particle system with accumulated events and dt */
  updateParticles(dt: number, events: GameEvent[], state: GameState): void {
    if (!this.particles) return;
    this.particles.processEvents(events, state);
    this.particles.update(dt);
    this.updateMuzzleFlashes(dt, events);
  }

  private updateMuzzleFlashes(dt: number, events: GameEvent[]): void {
    // Spawn new flashes from projectile_fired events
    for (const ev of events) {
      if (ev.type === 'projectile_fired') {
        const d = ev.data;
        if (!d || typeof d.x !== 'number' || typeof d.y !== 'number') continue;

        const light = new THREE.PointLight(0xff8c20, 3, 8);
        light.position.set(d.x as number, 0.5, d.y as number);
        this.scene.add(light);
        // Random duration between 60-80ms
        this.muzzleFlashes.push({ light, timer: 0.06 + Math.random() * 0.02 });
      } else if (ev.type === 'grenade_exploded') {
        const d = ev.data;
        if (!d || typeof d.x !== 'number' || typeof d.y !== 'number') continue;

        const light = new THREE.PointLight(0xff6600, 8, 15);
        light.position.set(d.x as number, 1.0, d.y as number);
        this.scene.add(light);
        this.muzzleFlashes.push({ light, timer: 0.2 });
      }
    }

    // Update existing flashes
    for (let i = this.muzzleFlashes.length - 1; i >= 0; i--) {
      const mf = this.muzzleFlashes[i];
      mf.timer -= dt;
      if (mf.timer <= 0) {
        this.scene.remove(mf.light);
        mf.light.dispose();
        this.muzzleFlashes.splice(i, 1);
      } else {
        // Fade intensity linearly
        const maxTimer = 0.07; // approximate midpoint
        mf.light.intensity = 3 * (mf.timer / maxTimer);
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
