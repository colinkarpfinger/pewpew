import * as THREE from 'three';
import type { InputState, Vec2 } from './simulation/types.ts';
import type { IInputHandler, EnemyRef } from './input-interface.ts';
import { normalize } from './simulation/collision.ts';

export class InputHandler implements IInputHandler {
  private keys = new Set<string>();
  private mouseDown = false;
  private mousePos = new THREE.Vector2();
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  private camera: THREE.PerspectiveCamera;
  private playerPos: Vec2 = { x: 0, y: 0 };
  private headMeshes = new Map<number, THREE.Mesh>();

  // Edge-detected dodge input
  private dodgePressed = false;
  private dodgeConsumed = false;

  // Edge-detected reload input
  private reloadPressed = false;
  private reloadConsumed = false;

  // Charge-based grenade input (hold G to charge, release to throw)
  private grenadeChargeStart: number | null = null;
  private grenadeReleased = false;
  private grenadeReleasePower = 0;
  private static readonly GRENADE_MAX_CHARGE_MS = 1000;

  constructor(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement) {
    this.camera = camera;

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.key.toLowerCase());
      if (e.key === ' ' && !this.dodgeConsumed) {
        this.dodgePressed = true;
      }
      if (e.key.toLowerCase() === 'r' && !this.reloadConsumed) {
        this.reloadPressed = true;
      }
      if (e.key.toLowerCase() === 'g' && this.grenadeChargeStart === null) {
        this.grenadeChargeStart = performance.now();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
      if (e.key === ' ') {
        this.dodgeConsumed = false;
      }
      if (e.key.toLowerCase() === 'r') {
        this.reloadConsumed = false;
      }
      if (e.key.toLowerCase() === 'g' && this.grenadeChargeStart !== null) {
        const holdMs = performance.now() - this.grenadeChargeStart;
        this.grenadeReleasePower = Math.min(1, holdMs / InputHandler.GRENADE_MAX_CHARGE_MS);
        this.grenadeReleased = true;
        this.grenadeChargeStart = null;
      }
    });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouseDown = true;
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });

    canvas.addEventListener('mousemove', (e) => {
      this.mousePos.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1,
      );
    });

    // Prevent context menu on right-click
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Update with current player position (for aim calculation) */
  setPlayerPos(pos: Vec2): void {
    this.playerPos = pos;
  }

  /** No-op on desktop — used by touch input for auto-targeting */
  setEnemies(_enemies: EnemyRef[]): void {}

  /** No-op on desktop — touch handler cleans up DOM */
  dispose(): void {}

  /** Update head meshes for headshot raycasting */
  setHeadMeshes(heads: Map<number, THREE.Mesh>): void {
    this.headMeshes = heads;
  }

  /** Consume edge-detected inputs after simulation ticks have processed them. */
  consumeEdgeInputs(): void {
    if (this.dodgePressed) {
      this.dodgePressed = false;
      this.dodgeConsumed = true;
    }
    if (this.reloadPressed) {
      this.reloadPressed = false;
      this.reloadConsumed = true;
    }
    if (this.grenadeReleased) {
      this.grenadeReleased = false;
      this.grenadeReleasePower = 0;
    }
  }

  /** Get current input state for simulation */
  getInput(): InputState {
    // Movement direction from WASD
    let mx = 0;
    let my = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) my -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) my += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) mx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) mx += 1;

    // In our coordinate system, simulation Y maps to Three.js Z
    // W/S move in sim Y (which is Z in 3D), A/D move in sim X
    const moveDir = normalize({ x: mx, y: my });

    // Aim direction: raycast mouse onto ground plane
    this.raycaster.setFromCamera(this.mousePos, this.camera);
    const intersection = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(this.groundPlane, intersection);

    let aimDir: Vec2 = { x: 1, y: 0 };
    if (intersection) {
      const dx = intersection.x - this.playerPos.x;
      const dy = intersection.z - this.playerPos.y; // Z in 3D = Y in sim
      aimDir = normalize({ x: dx, y: dy });
    }

    // Check if cursor is over an enemy head
    let headshotTargetId: number | null = null;
    if (this.headMeshes.size > 0) {
      const headArray = Array.from(this.headMeshes.values());
      const hits = this.raycaster.intersectObjects(headArray);
      if (hits.length > 0) {
        // Find which enemy ID this head mesh belongs to
        for (const [id, mesh] of this.headMeshes) {
          if (mesh === hits[0].object) {
            headshotTargetId = id;
            // Aim at the enemy's ground position instead of the ground plane
            // intersection — clicking the top of a head would otherwise aim
            // behind the enemy due to the camera angle.
            const enemyWorldPos = new THREE.Vector3();
            mesh.parent!.getWorldPosition(enemyWorldPos);
            const dx = enemyWorldPos.x - this.playerPos.x;
            const dy = enemyWorldPos.z - this.playerPos.y;
            aimDir = normalize({ x: dx, y: dy });
            break;
          }
        }
      }
    }

    // Read edge-detected inputs (consumed separately via consumeEdgeInputs)
    const dodge = this.dodgePressed;
    const reload = this.reloadPressed;
    const throwGrenade = this.grenadeReleased;
    const throwPower = this.grenadeReleasePower;

    return {
      moveDir,
      aimDir,
      fire: this.mouseDown,
      headshotTargetId,
      dodge,
      reload,
      throwGrenade,
      throwPower,
    };
  }
}
