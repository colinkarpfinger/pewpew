import * as THREE from 'three';
import type { GameState, GameEvent, WeaponConfig, WeaponType, EnemyType, ArmorType, BandageConfig, HomebaseInteractable } from '../simulation/types.ts';
import type { HomebaseState } from '../simulation/homebase.ts';
import { ParticleSystem } from './particles.ts';
import {
  createPlayerMesh,
  createPlayerArmorMesh,
  createEnemyMesh,
  createEnemyProjectileMesh,
  createGrenadeMesh,
  createCashMesh,
  createCrateMesh,
  createDestructibleCrateMesh,
  createObstacleMesh,
  createObstacleMeshWithColor,
  createCircleObstacleMesh,
  createGroundMesh,
  createZoneGroundMesh,
  createWallMeshes,
  createExtractionZoneMesh,
  createWeaponMesh,
  createLootContainerMesh,
  type EnemyMeshGroup,
} from './entities.ts';
import { createCamera, updateCamera, triggerScreenShake, triggerZoomPunch, triggerWeaponKick } from './camera.ts';
import { getZoneIndex } from '../simulation/extraction-map.ts';
import { FogOfWar } from './fog-of-war.ts';

export class Renderer {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly webglRenderer: THREE.WebGLRenderer;

  private playerGroup: THREE.Group | null = null;
  private playerCapsule: THREE.Mesh | null = null;
  private playerAim: THREE.Mesh | null = null;
  private playerReloadBar: THREE.Group | null = null;
  private playerArmorMesh: THREE.Mesh | null = null;
  private playerWeaponGroup: THREE.Group | null = null;
  private playerRadius = 0.4;
  private dodgeDuration = 18;
  private weaponConfig: WeaponConfig | null = null;
  private bandageConfig: BandageConfig | null = null;
  private enemyGroups = new Map<number, EnemyMeshGroup>();
  private projectileMeshes = new Map<number, THREE.Mesh>();
  private enemyProjectileMeshes = new Map<number, THREE.Mesh>();
  private grenadeMeshes = new Map<number, THREE.Mesh>();
  private crateMeshes = new Map<number, THREE.Mesh>();
  private cashMeshes = new Map<number, THREE.Mesh>();
  private destructibleCrateMeshes = new Map<number, THREE.Mesh>();
  private lootContainerMeshes = new Map<number, THREE.Group>();
  private particles: ParticleSystem | null = null;
  private muzzleFlashes: { light: THREE.PointLight; timer: number }[] = [];
  private tracers: { mesh: THREE.Mesh; vx: number; vz: number; lifetime: number }[] = [];
  private dirLight: THREE.DirectionalLight | null = null;
  private enemyTypes = new Map<number, EnemyType>();
  private sniperLaserMeshes = new Map<number, THREE.Mesh>();
  private hitFlashTimers = new Map<number, number>();

  // Damage vignette
  private vignetteScene: THREE.Scene | null = null;
  private vignetteCamera: THREE.OrthographicCamera | null = null;
  private vignetteMesh: THREE.Mesh | null = null;
  private vignetteOpacity = 0;
  private vignetteDecayTimer = 0;
  private vignetteBaseOpacity = 0; // sustained low-HP vignette

  // Fog of war
  private fogOfWar: FogOfWar;
  private skipFogOfWar = false;

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

    // Damage vignette overlay
    this.vignetteScene = new THREE.Scene();
    this.vignetteCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const vignetteMat = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
      fragmentShader: `
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
          vec2 center = vUv - 0.5;
          float dist = length(center) * 2.0;
          float vignette = smoothstep(0.3, 1.2, dist);
          gl_FragColor = vec4(0.6, 0.0, 0.0, vignette * uOpacity);
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.vignetteMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), vignetteMat);
    this.vignetteScene.add(this.vignetteMesh);

    // Fog of war overlay
    this.fogOfWar = new FogOfWar();

    window.addEventListener('resize', () => this.onResize());
  }

  /** Set up static arena geometry (ground, walls, obstacles) */
  initArena(state: GameState): void {
    // Clear stale refs from previous game
    this.skipFogOfWar = false;
    this.enemyGroups.clear();
    this.projectileMeshes.clear();
    this.enemyProjectileMeshes.clear();
    this.grenadeMeshes.clear();
    this.crateMeshes.clear();
    this.cashMeshes.clear();
    this.destructibleCrateMeshes.clear();
    this.lootContainerMeshes.clear();
    this.enemyTypes.clear();
    this.sniperLaserMeshes.clear();
    this.hitFlashTimers.clear();
    this.tracers = [];
    this.playerGroup = null;

    // Ground
    const isExtraction = !!state.extractionMap;
    if (isExtraction && state.extractionMap) {
      const floorColors = [0x333333, 0x3a3333, 0x4a2828, 0x5a2020];
      for (let i = 0; i < state.extractionMap.zones.length; i++) {
        const zone = state.extractionMap.zones[i];
        const color = floorColors[i] ?? floorColors[floorColors.length - 1];
        const zoneMesh = createZoneGroundMesh(state.arena.width, zone.yMin, zone.yMax, color);
        this.scene.add(zoneMesh);
      }
    } else {
      const ground = createGroundMesh(state.arena.width, state.arena.height);
      this.scene.add(ground);
    }

    // Walls
    const walls = createWallMeshes(state.arena.width, state.arena.height);
    this.scene.add(walls);

    // Obstacles
    const obstacleColors = [0x666666, 0x6a5555, 0x7a4444, 0x8a3333];
    for (const obs of state.obstacles) {
      let mesh: THREE.Mesh;
      if (obs.shape === 'circle' && obs.radius !== undefined) {
        // Circle obstacle: use cylinder mesh
        const color = isExtraction && state.extractionMap
          ? (() => { const zi = getZoneIndex(state.extractionMap!, obs.pos.y); return zi >= 0 ? (obstacleColors[zi] ?? obstacleColors[obstacleColors.length - 1]) : 0x666666; })()
          : 0x666666;
        mesh = createCircleObstacleMesh(obs.radius, color);
      } else if (isExtraction && state.extractionMap) {
        const zi = getZoneIndex(state.extractionMap, obs.pos.y);
        const color = zi >= 0 ? (obstacleColors[zi] ?? obstacleColors[obstacleColors.length - 1]) : 0x666666;
        mesh = createObstacleMeshWithColor(obs.width, obs.height, color);
      } else {
        mesh = createObstacleMesh(obs.width, obs.height);
      }
      mesh.position.set(obs.pos.x, mesh.position.y, obs.pos.y);
      if (obs.rotation) {
        mesh.rotation.y = -obs.rotation;
      }
      this.scene.add(mesh);
    }

    // Destructible crates (initial)
    for (const dc of state.destructibleCrates) {
      const mesh = createDestructibleCrateMesh(1.0, 1.0);
      mesh.position.set(dc.pos.x, mesh.position.y, dc.pos.y);
      this.scene.add(mesh);
      this.destructibleCrateMeshes.set(dc.id, mesh);
    }

    // Extraction zone markers
    if (state.extractionMap) {
      for (const ez of state.extractionMap.extractionZones) {
        const ezMesh = createExtractionZoneMesh(ez.width, ez.height);
        ezMesh.position.set(ez.x, 0.02, ez.y);
        this.scene.add(ezMesh);
      }
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

    // Fog of war casters
    this.fogOfWar.setCasters(state.obstacles, state.destructibleCrates, state.arena);

    // Player
    this.playerRadius = state.player.radius;
    this.playerGroup = createPlayerMesh(state.player.radius);
    this.playerCapsule = this.playerGroup.children[0] as THREE.Mesh;
    this.playerAim = this.playerGroup.children[1] as THREE.Mesh;
    this.playerReloadBar = this.playerGroup.children[2] as THREE.Group;
    this.scene.add(this.playerGroup);
  }

  /** Set up arena from a pre-loaded Three.js editor scene.
   *  Adds editor scene objects to the renderer scene, then creates dynamic objects on top. */
  initArenaFromScene(editorScene: THREE.Scene, state: GameState): void {
    // Clear stale refs (same as initArena)
    this.enemyGroups.clear();
    this.projectileMeshes.clear();
    this.enemyProjectileMeshes.clear();
    this.grenadeMeshes.clear();
    this.crateMeshes.clear();
    this.cashMeshes.clear();
    this.destructibleCrateMeshes.clear();
    this.enemyTypes.clear();
    this.sniperLaserMeshes.clear();
    this.hitFlashTimers.clear();
    this.tracers = [];
    this.playerGroup = null;

    // Add all objects from the editor scene to our scene
    // We need to move children out since they can only have one parent
    const objectsToAdd: THREE.Object3D[] = [];
    while (editorScene.children.length > 0) {
      objectsToAdd.push(editorScene.children[0]);
      editorScene.remove(editorScene.children[0]);
    }
    for (const obj of objectsToAdd) {
      // Skip lights from editor scene — we use our own from rebuildScene
      if (obj instanceof THREE.Light) continue;
      this.scene.add(obj);
    }

    // Walls (arena boundary walls — still needed since editor doesn't include them)
    const walls = createWallMeshes(state.arena.width, state.arena.height);
    this.scene.add(walls);

    // Destructible crates (initial) — create interactive meshes tracked by the renderer
    for (const dc of state.destructibleCrates) {
      const mesh = createDestructibleCrateMesh(1.0, 1.0);
      mesh.position.set(dc.pos.x, mesh.position.y, dc.pos.y);
      this.scene.add(mesh);
      this.destructibleCrateMeshes.set(dc.id, mesh);
    }

    // Extraction zone markers
    if (state.extractionMap) {
      for (const ez of state.extractionMap.extractionZones) {
        const ezMesh = createExtractionZoneMesh(ez.width, ez.height);
        ezMesh.position.set(ez.x, 0.02, ez.y);
        this.scene.add(ezMesh);
      }
    }

    // Find the directional light (from rebuildScene)
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

    // Fog of war casters
    this.fogOfWar.setCasters(state.obstacles, state.destructibleCrates, state.arena);

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

  /** Store bandage config for heal bar calculations */
  setBandageConfig(config: BandageConfig): void {
    this.bandageConfig = config;
  }

  /** Set or swap weapon model on the player */
  setPlayerWeapon(type: WeaponType, upgradeLevel: number): void {
    if (this.playerWeaponGroup && this.playerGroup) {
      this.playerGroup.remove(this.playerWeaponGroup);
      this.playerWeaponGroup = null;
    }
    if (this.playerGroup) {
      this.playerWeaponGroup = createWeaponMesh(type, upgradeLevel);
      const r = this.playerRadius;
      const capsuleHeight = r * 1.2;
      // Pistol extends forward; longer guns pull back so grip aligns with player body
      const xOffset = type === 'pistol' ? r * 1.5 : r * 0.3;
      this.playerWeaponGroup.position.set(xOffset, r + capsuleHeight / 2, r * 0.5);
      this.playerGroup.add(this.playerWeaponGroup);
    }
  }

  /** Attach or remove armor mesh on player capsule */
  setPlayerArmor(armorTier: ArmorType | null): void {
    if (this.playerArmorMesh && this.playerCapsule) {
      this.playerCapsule.remove(this.playerArmorMesh);
      this.playerArmorMesh = null;
    }
    if (armorTier && this.playerCapsule) {
      this.playerArmorMesh = createPlayerArmorMesh(this.playerRadius, armorTier);
      this.playerCapsule.add(this.playerArmorMesh);
    }
  }

  /** Sync all dynamic visuals to match simulation state */
  syncState(state: GameState, dt: number = 1 / 60): void {
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

      // Reload / Heal bar with active/perfect timing zones
      if (this.playerReloadBar) {
        const reloading = state.player.reloadTimer > 0;
        const healing = state.player.healTimer > 0 && state.player.healType !== null;
        this.playerReloadBar.visible = reloading || healing;

        if (reloading && this.weaponConfig) {
          const wc = this.weaponConfig;
          const progress = state.player.reloadTimer / wc.reloadTime;
          const barHeight = this.playerRadius * 3;
          const baseY = 0.1;

          const fillMesh = this.playerReloadBar.children[1] as THREE.Mesh;
          (fillMesh.material as THREE.MeshStandardMaterial).color.setHex(0xaaaaaa);
          (fillMesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x555555);
          fillMesh.scale.y = progress;
          fillMesh.position.y = (barHeight * progress) / 2 + baseY;

          const activeMesh = this.playerReloadBar.children[2] as THREE.Mesh;
          (activeMesh.material as THREE.MeshStandardMaterial).color.setHex(0x66ccff);
          (activeMesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x3388aa);
          const activeCenterY = ((wc.activeReloadStart + wc.activeReloadEnd) / 2) * barHeight + baseY;
          activeMesh.scale.y = (wc.activeReloadEnd - wc.activeReloadStart);
          activeMesh.position.y = activeCenterY;

          const perfectMesh = this.playerReloadBar.children[3] as THREE.Mesh;
          const perfectCenterY = ((wc.perfectReloadStart + wc.perfectReloadEnd) / 2) * barHeight + baseY;
          perfectMesh.scale.y = (wc.perfectReloadEnd - wc.perfectReloadStart);
          perfectMesh.position.y = perfectCenterY;

          const cursorMesh = this.playerReloadBar.children[4] as THREE.Mesh;
          cursorMesh.position.y = progress * barHeight + baseY;

          this.playerReloadBar.rotation.y = -this.playerGroup.rotation.y;
        } else if (healing && this.bandageConfig) {
          const healType = state.player.healType!;
          const tc = this.bandageConfig[healType];
          const progress = state.player.healTimer / tc.healTime;
          const barHeight = this.playerRadius * 3;
          const baseY = 0.1;

          // Green fill for healing
          const fillMesh = this.playerReloadBar.children[1] as THREE.Mesh;
          (fillMesh.material as THREE.MeshStandardMaterial).color.setHex(0x44cc66);
          (fillMesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x228833);
          fillMesh.scale.y = progress;
          fillMesh.position.y = (barHeight * progress) / 2 + baseY;

          // Active zone — green tint
          const activeMesh = this.playerReloadBar.children[2] as THREE.Mesh;
          (activeMesh.material as THREE.MeshStandardMaterial).color.setHex(0x66ff88);
          (activeMesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x33aa44);
          const activeCenterY = ((tc.activeHealStart + tc.activeHealEnd) / 2) * barHeight + baseY;
          activeMesh.scale.y = (tc.activeHealEnd - tc.activeHealStart);
          activeMesh.position.y = activeCenterY;

          // Perfect zone — gold
          const perfectMesh = this.playerReloadBar.children[3] as THREE.Mesh;
          const perfectCenterY = ((tc.perfectHealStart + tc.perfectHealEnd) / 2) * barHeight + baseY;
          perfectMesh.scale.y = (tc.perfectHealEnd - tc.perfectHealStart);
          perfectMesh.position.y = perfectCenterY;

          // Cursor
          const cursorMesh = this.playerReloadBar.children[4] as THREE.Mesh;
          cursorMesh.position.y = progress * barHeight + baseY;

          this.playerReloadBar.rotation.y = -this.playerGroup.rotation.y;
        }
      }
    }

    // Update camera
    updateCamera(this.camera, state.player.pos.x, state.player.pos.y, dt);

    // Update fog of war
    this.fogOfWar.update(
      state.player.pos,
      state.player.aimDir,
      this.camera,
      state.destructibleCrates,
      state.obstacles,
      state.arena,
    );

    // Sync enemies
    const currentEnemyIds = new Set<number>();
    for (const enemy of state.enemies) {
      currentEnemyIds.add(enemy.id);
      let entry = this.enemyGroups.get(enemy.id);
      if (!entry) {
        entry = createEnemyMesh(enemy.radius, enemy.type, enemy.hasArmor ?? false, enemy.hasHelmet ?? false);
        this.enemyGroups.set(enemy.id, entry);
        this.enemyTypes.set(enemy.id, enemy.type);
        this.scene.add(entry.group);
      }
      entry.group.position.set(enemy.pos.x, 0, enemy.pos.y);
      entry.group.visible = enemy.visible;

      // Rotate enemy to face their facing direction
      entry.group.rotation.y = -Math.atan2(enemy.facingDir.y, enemy.facingDir.x);

      // Hit flash: set emissive white when recently hit
      const flashTime = this.hitFlashTimers.get(enemy.id);
      const emissiveColor = (flashTime && flashTime > 0) ? 0xffffff : 0x000000;
      const emissiveIntensity = (flashTime && flashTime > 0) ? 0.8 : 0;
      (entry.bodyMesh.material as THREE.MeshStandardMaterial).emissive.setHex(emissiveColor);
      (entry.bodyMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = emissiveIntensity;
      (entry.headMesh.material as THREE.MeshStandardMaterial).emissive.setHex(emissiveColor);
      (entry.headMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = emissiveIntensity;
    }
    // Remove dead enemy meshes
    for (const [id, entry] of this.enemyGroups) {
      if (!currentEnemyIds.has(id)) {
        this.scene.remove(entry.group);
        this.enemyGroups.delete(id);
        this.enemyTypes.delete(id);
        this.hitFlashTimers.delete(id);
      }
    }

    // Sniper laser telegraph beams
    const activeLaserIds = new Set<number>();
    for (const enemy of state.enemies) {
      if (enemy.type !== 'sniper' || !enemy.telegraphTimer || enemy.telegraphTimer <= 0 || !enemy.telegraphDir) continue;
      activeLaserIds.add(enemy.id);

      let laser = this.sniperLaserMeshes.get(enemy.id);
      if (!laser) {
        const laserLength = 30;
        const geo = new THREE.CylinderGeometry(0.02, 0.02, laserLength, 4);
        geo.rotateZ(Math.PI / 2); // align along X axis
        const mat = new THREE.MeshBasicMaterial({
          color: 0xff0000,
          transparent: true,
          opacity: 0.4,
        });
        laser = new THREE.Mesh(geo, mat);
        this.sniperLaserMeshes.set(enemy.id, laser);
        this.scene.add(laser);
      }

      // Position and orient the laser
      const dir = enemy.telegraphDir;
      const angle = Math.atan2(dir.y, dir.x);
      const laserLength = 30;
      const halfLen = laserLength / 2;
      laser.position.set(
        enemy.pos.x + Math.cos(angle) * halfLen,
        0.5,
        enemy.pos.y + Math.sin(angle) * halfLen,
      );
      laser.rotation.y = -angle;

      // Pulse opacity based on remaining time (gets more opaque as it's about to fire)
      const maxTelegraph = 60; // matches config
      const progress = 1 - (enemy.telegraphTimer / maxTelegraph);
      const opacity = 0.15 + progress * 0.55;
      (laser.material as THREE.MeshBasicMaterial).opacity = opacity;
      laser.visible = enemy.visible;
    }

    // Remove lasers for enemies that stopped telegraphing or died
    for (const [id, laser] of this.sniperLaserMeshes) {
      if (!activeLaserIds.has(id)) {
        this.scene.remove(laser);
        this.sniperLaserMeshes.delete(id);
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

    // Player projectiles are not rendered — tracers are used instead (see updateTracers)

    // Update tracers
    this.updateTracers(dt, state.obstacles, state.arena);

    // Sync enemy projectiles
    const currentEnemyProjIds = new Set<number>();
    for (const proj of state.enemyProjectiles) {
      currentEnemyProjIds.add(proj.id);
      let mesh = this.enemyProjectileMeshes.get(proj.id);
      if (!mesh) {
        mesh = createEnemyProjectileMesh();
        this.enemyProjectileMeshes.set(proj.id, mesh);
        this.scene.add(mesh);
      }
      mesh.position.set(proj.pos.x, mesh.position.y, proj.pos.y);
    }
    // Remove dead enemy projectile meshes
    for (const [id, mesh] of this.enemyProjectileMeshes) {
      if (!currentEnemyProjIds.has(id)) {
        this.scene.remove(mesh);
        this.enemyProjectileMeshes.delete(id);
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

    // Sync destructible crates (remove destroyed)
    const currentDestructibleCrateIds = new Set<number>();
    for (const dc of state.destructibleCrates) {
      currentDestructibleCrateIds.add(dc.id);
    }
    for (const [id, mesh] of this.destructibleCrateMeshes) {
      if (!currentDestructibleCrateIds.has(id)) {
        this.scene.remove(mesh);
        this.destructibleCrateMeshes.delete(id);
      }
    }

    // Sync loot containers
    const currentLootIds = new Set<number>();
    for (const lc of state.lootContainers) {
      currentLootIds.add(lc.id);
      let mesh = this.lootContainerMeshes.get(lc.id);
      if (!mesh) {
        mesh = createLootContainerMesh(lc.containerType);
        this.lootContainerMeshes.set(lc.id, mesh);
        this.scene.add(mesh);
      }
      mesh.position.set(lc.pos.x, 0, lc.pos.y);

      // Pulse the glow indicator based on search progress
      const glow = mesh.children[1] as THREE.Mesh | undefined;
      if (glow) {
        const pulse = 0.6 + Math.sin(state.tick * 0.08) * 0.4;
        (glow.material as THREE.MeshStandardMaterial).opacity = lc.searchProgress >= lc.capacity ? 0.3 : pulse;
      }
    }
    for (const [id, mesh] of this.lootContainerMeshes) {
      if (!currentLootIds.has(id)) {
        this.scene.remove(mesh);
        this.lootContainerMeshes.delete(id);
      }
    }

    // Sync cash pickups
    const currentCashIds = new Set<number>();
    for (const cash of state.cashPickups) {
      currentCashIds.add(cash.id);
      let mesh = this.cashMeshes.get(cash.id);
      if (!mesh) {
        mesh = createCashMesh();
        this.cashMeshes.set(cash.id, mesh);
        this.scene.add(mesh);
      }
      // Bob and spin animation
      const bobY = 0.3 + Math.sin(state.tick * 0.06) * 0.1;
      mesh.position.set(cash.pos.x, bobY, cash.pos.y);
      mesh.rotation.y = state.tick * 0.03;
    }
    // Remove picked up cash meshes
    for (const [id, mesh] of this.cashMeshes) {
      if (!currentCashIds.has(id)) {
        this.scene.remove(mesh);
        this.cashMeshes.delete(id);
      }
    }
  }

  /** Update particle system with accumulated events and dt */
  updateParticles(dt: number, events: GameEvent[], state: GameState): void {
    if (!this.particles) return;
    this.particles.processEvents(events, state);
    this.particles.update(dt);
    this.updateMuzzleFlashes(dt, events);
    this.processJuiceEvents(events, state);
    this.updateHitFlashTimers(dt);
    this.updateVignette(dt, state);
  }

  /** Compute gun muzzle position in world space (3D coords) given player sim pos and aim angle */
  private getMuzzlePos(simX: number, simY: number, angle: number): { x: number; y: number; z: number } {
    const r = this.playerRadius;
    const forwardDist = r * 1.5 + 0.3; // past the gun barrel tip
    const sideDist = r * 0.5; // right side offset (matches weapon Z offset)
    return {
      x: simX + Math.cos(angle) * forwardDist - Math.sin(angle) * sideDist,
      y: r + r * 1.2 / 2, // weapon height
      z: simY + Math.sin(angle) * forwardDist + Math.cos(angle) * sideDist,
    };
  }

  private updateMuzzleFlashes(dt: number, events: GameEvent[]): void {
    // Spawn one flash per shot (not per pellet) from projectile_fired events
    let shotFlashAdded = false;
    for (const ev of events) {
      if (ev.type === 'projectile_fired') {
        const d = ev.data;
        if (!d || typeof d.x !== 'number' || typeof d.y !== 'number' || typeof d.angle !== 'number') continue;

        // Spawn tracer from gun muzzle (one per pellet)
        const muzzle = this.getMuzzlePos(d.x as number, d.y as number, d.angle as number);
        this.spawnTracer(muzzle, d.angle as number);

        // Muzzle flash only once per shot
        if (!shotFlashAdded) {
          const light = new THREE.PointLight(0xff8c20, 3, 8);
          light.position.set(muzzle.x, muzzle.y, muzzle.z);
          this.scene.add(light);
          this.muzzleFlashes.push({ light, timer: 0.06 + Math.random() * 0.02 });
          shotFlashAdded = true;
        }
      } else if (ev.type === 'enemy_projectile_fired') {
        const d = ev.data;
        if (!d || typeof d.x !== 'number' || typeof d.y !== 'number') continue;

        const light = new THREE.PointLight(0xff2200, 2, 6);
        light.position.set(d.x as number, 0.5, d.y as number);
        this.scene.add(light);
        this.muzzleFlashes.push({ light, timer: 0.05 + Math.random() * 0.02 });
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

  private processJuiceEvents(events: GameEvent[], state: GameState): void {
    for (const ev of events) {
      if (ev.type === 'player_hit') {
        const damage = typeof ev.data?.damage === 'number' ? ev.data.damage as number : 10;
        const scale = Math.min(damage / state.player.maxHp, 1);
        triggerScreenShake(0.15 + scale * 0.25, 0.15);
        this.vignetteOpacity = 0.6;
        this.vignetteDecayTimer = 0.4;
      } else if (ev.type === 'grenade_exploded') {
        triggerScreenShake(0.25, 0.2);
        triggerZoomPunch(2.0, 0.3);
      } else if (ev.type === 'enemy_killed') {
        const headshot = ev.data?.headshot === true;
        if (headshot) {
          triggerZoomPunch(1.0, 0.15);
        }
      } else if (ev.type === 'multikill') {
        triggerScreenShake(0.5, 0.25);
        triggerZoomPunch(1.5, 0.25);
      } else if (ev.type === 'armor_broken') {
        triggerScreenShake(0.3, 0.15);
      } else if (ev.type === 'enemy_hit') {
        const enemyId = ev.data?.enemyId;
        if (typeof enemyId === 'number') {
          this.hitFlashTimers.set(enemyId, 0.08);
        }
      } else if (ev.type === 'projectile_fired') {
        const d = ev.data;
        if (d && typeof d.angle === 'number') {
          const recoilScreen = this.weaponConfig?.recoilScreen ?? 0.5;
          triggerWeaponKick(d.angle as number, 0.015 * recoilScreen);
        }
      }
    }
  }

  private updateHitFlashTimers(dt: number): void {
    for (const [id, timer] of this.hitFlashTimers) {
      const newTimer = timer - dt;
      if (newTimer <= 0) {
        this.hitFlashTimers.delete(id);
      } else {
        this.hitFlashTimers.set(id, newTimer);
      }
    }
  }

  private updateVignette(dt: number, state: GameState): void {
    // Sustain vignette at low HP
    const hpRatio = state.player.hp / state.player.maxHp;
    this.vignetteBaseOpacity = hpRatio <= 0.3 ? 0.2 : 0;

    // Decay hit vignette
    if (this.vignetteDecayTimer > 0) {
      this.vignetteDecayTimer -= dt;
      if (this.vignetteDecayTimer <= 0) {
        this.vignetteOpacity = 0;
      }
    }

    // Effective opacity is max of hit flash and sustained
    const effectiveOpacity = Math.max(this.vignetteOpacity, this.vignetteBaseOpacity);
    if (this.vignetteMesh) {
      (this.vignetteMesh.material as THREE.ShaderMaterial).uniforms.uOpacity.value = effectiveOpacity;
    }
  }

  private spawnTracer(muzzle: { x: number; y: number; z: number }, angle: number): void {
    const tracerLength = 0.6;
    const geo = new THREE.BoxGeometry(tracerLength, 0.02, 0.02);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffee88,
      emissive: 0xffcc44,
      emissiveIntensity: 2.0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(muzzle.x, muzzle.y, muzzle.z);
    mesh.rotation.y = -angle;
    this.scene.add(mesh);

    const speed = 60; // faster than bullets (50) so they lead
    this.tracers.push({
      mesh,
      vx: Math.cos(angle) * speed,
      vz: Math.sin(angle) * speed,
      lifetime: 0.15,
    });
  }

  private updateTracers(dt: number, obstacles: GameState['obstacles'], arena: GameState['arena']): void {
    const halfW = arena.width / 2;
    const halfH = arena.height / 2;

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.lifetime -= dt;
      t.mesh.position.x += t.vx * dt;
      t.mesh.position.z += t.vz * dt;

      // Check if tracer hit an obstacle or left the arena
      const tx = t.mesh.position.x;
      const tz = t.mesh.position.z;
      let hit = tx < -halfW || tx > halfW || tz < -halfH || tz > halfH;
      if (!hit) {
        for (const obs of obstacles) {
          if (obs.shape === 'circle' && obs.radius !== undefined) {
            // Circle obstacle: distance check
            const cdx = tx - obs.pos.x;
            const cdz = tz - obs.pos.y;
            if (cdx * cdx + cdz * cdz < obs.radius * obs.radius) {
              hit = true;
              break;
            }
          } else if (obs.rotation) {
            // Rotated box: transform point into obstacle's local space
            const cdx = tx - obs.pos.x;
            const cdz = tz - obs.pos.y;
            const cos = Math.cos(-obs.rotation);
            const sin = Math.sin(-obs.rotation);
            const localX = cdx * cos - cdz * sin;
            const localZ = cdx * sin + cdz * cos;
            if (Math.abs(localX) < obs.width / 2 && Math.abs(localZ) < obs.height / 2) {
              hit = true;
              break;
            }
          } else {
            // Axis-aligned box
            const dx = tx - obs.pos.x;
            const dz = tz - obs.pos.y;
            if (Math.abs(dx) < obs.width / 2 && Math.abs(dz) < obs.height / 2) {
              hit = true;
              break;
            }
          }
        }
      }

      if (t.lifetime <= 0 || hit) {
        this.scene.remove(t.mesh);
        t.mesh.geometry.dispose();
        (t.mesh.material as THREE.Material).dispose();
        this.tracers.splice(i, 1);
      } else {
        // Fade out
        const opacity = t.lifetime / 0.15;
        (t.mesh.material as THREE.MeshStandardMaterial).opacity = opacity;
        (t.mesh.material as THREE.MeshStandardMaterial).transparent = true;
      }
    }
  }

  /** Set up homebase room scene (ground, walls, interactable markers, player) */
  initHomebase(state: HomebaseState): void {
    // Clear stale refs
    this.enemyGroups.clear();
    this.projectileMeshes.clear();
    this.enemyProjectileMeshes.clear();
    this.grenadeMeshes.clear();
    this.crateMeshes.clear();
    this.cashMeshes.clear();
    this.destructibleCrateMeshes.clear();
    this.lootContainerMeshes.clear();
    this.enemyTypes.clear();
    this.sniperLaserMeshes.clear();
    this.hitFlashTimers.clear();
    this.tracers = [];
    this.playerGroup = null;
    this.skipFogOfWar = true;

    // Warm-toned ground floor
    const groundGeo = new THREE.PlaneGeometry(state.arena.width, state.arena.height);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x3a3530, roughness: 0.9 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Arena boundary walls
    const walls = createWallMeshes(state.arena.width, state.arena.height);
    this.scene.add(walls);

    // Room obstacles (furniture/walls)
    for (const obs of state.obstacles) {
      const mesh = createObstacleMeshWithColor(obs.width, obs.height, 0x555550);
      mesh.position.set(obs.pos.x, mesh.position.y, obs.pos.y);
      if (obs.rotation) mesh.rotation.y = -obs.rotation;
      this.scene.add(mesh);
    }

    // Interactable markers
    for (const ia of state.interactables) {
      this.createInteractableMarker(ia);
    }

    // Find directional light
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
    this.playerRadius = state.playerRadius;
    this.playerGroup = createPlayerMesh(state.playerRadius);
    this.playerCapsule = this.playerGroup.children[0] as THREE.Mesh;
    this.playerAim = this.playerGroup.children[1] as THREE.Mesh;
    this.playerReloadBar = this.playerGroup.children[2] as THREE.Group;
    this.playerReloadBar.visible = false;
    this.scene.add(this.playerGroup);
  }

  private createInteractableMarker(ia: HomebaseInteractable): void {
    if (ia.type === 'shop') {
      // Green terminal box
      const geo = new THREE.BoxGeometry(1.2, 1.5, 0.8);
      const mat = new THREE.MeshStandardMaterial({ color: 0x228844, emissive: 0x114422, emissiveIntensity: 0.3 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.position.set(ia.pos.x, 0.75, ia.pos.y);
      this.scene.add(mesh);
      // Screen glow
      const screenGeo = new THREE.PlaneGeometry(0.8, 0.6);
      const screenMat = new THREE.MeshStandardMaterial({ color: 0x44ff88, emissive: 0x44ff88, emissiveIntensity: 0.8 });
      const screenMesh = new THREE.Mesh(screenGeo, screenMat);
      screenMesh.position.set(ia.pos.x, 1.2, ia.pos.y + 0.41);
      this.scene.add(screenMesh);
    } else if (ia.type === 'stash') {
      // Brown storage crate
      const geo = new THREE.BoxGeometry(1.4, 0.9, 1.0);
      const mat = new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.8 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.position.set(ia.pos.x, 0.45, ia.pos.y);
      this.scene.add(mesh);
      // Lid highlight
      const lidGeo = new THREE.BoxGeometry(1.4, 0.08, 1.0);
      const lidMat = new THREE.MeshStandardMaterial({ color: 0xAA8820 });
      const lidMesh = new THREE.Mesh(lidGeo, lidMat);
      lidMesh.position.set(ia.pos.x, 0.94, ia.pos.y);
      this.scene.add(lidMesh);
    } else if (ia.type === 'raid') {
      // Extraction-zone styled marker on the floor
      const w = ia.width ?? 4;
      const h = ia.height ?? 1.5;
      const geo = new THREE.PlaneGeometry(w, h);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x44aa44,
        emissive: 0x228822,
        emissiveIntensity: 0.4,
        transparent: true,
        opacity: 0.6,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(ia.pos.x, 0.02, ia.pos.y);
      this.scene.add(mesh);
      // Door frame
      const doorGeo = new THREE.BoxGeometry(w + 0.4, 2.5, 0.3);
      const doorMat = new THREE.MeshStandardMaterial({ color: 0x556655 });
      const doorMesh = new THREE.Mesh(doorGeo, doorMat);
      doorMesh.castShadow = true;
      doorMesh.position.set(ia.pos.x, 1.25, ia.pos.y + h / 2 + 0.15);
      this.scene.add(doorMesh);
    }
  }

  /** Sync homebase player position, camera, and lights per frame */
  syncHomebase(state: HomebaseState, dt: number): void {
    if (this.playerGroup) {
      this.playerGroup.position.set(state.playerPos.x, 0, state.playerPos.y);
      const aimAngle = Math.atan2(state.playerAimDir.y, state.playerAimDir.x);
      this.playerGroup.rotation.y = -aimAngle;
      if (this.playerAim) this.playerAim.visible = true;

      // Reset capsule transform
      if (this.playerCapsule) {
        const r = this.playerRadius;
        const capsuleHeight = r * 1.2;
        this.playerCapsule.rotation.set(0, 0, 0);
        this.playerCapsule.position.y = r + capsuleHeight / 2;
      }
    }

    // Camera follow
    updateCamera(this.camera, state.playerPos.x, state.playerPos.y, dt);

    // Light follow
    if (this.dirLight) {
      this.dirLight.position.set(state.playerPos.x + 10, 20, state.playerPos.y + 10);
      this.dirLight.target.position.set(state.playerPos.x, 0, state.playerPos.y);
      this.dirLight.target.updateMatrixWorld();
    }
  }

  render(): void {
    this.webglRenderer.render(this.scene, this.camera);

    // Render fog of war overlay (skip in homebase)
    this.webglRenderer.autoClear = false;
    if (!this.skipFogOfWar) {
      this.fogOfWar.render(this.webglRenderer);
    }

    // Render vignette overlay on top
    if (this.vignetteScene && this.vignetteCamera) {
      const effectiveOpacity = Math.max(this.vignetteOpacity, this.vignetteBaseOpacity);
      if (effectiveOpacity > 0) {
        this.webglRenderer.render(this.vignetteScene, this.vignetteCamera);
      }
    }
    this.webglRenderer.autoClear = true;
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
