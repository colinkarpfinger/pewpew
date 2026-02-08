import * as THREE from 'three';
import type { InputState, Vec2 } from './simulation/types.ts';
import { normalize } from './simulation/collision.ts';

export class InputHandler {
  private keys = new Set<string>();
  private mouseDown = false;
  private mousePos = new THREE.Vector2();
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  private camera: THREE.PerspectiveCamera;
  private playerPos: Vec2 = { x: 0, y: 0 };
  private headMeshes = new Map<number, THREE.Mesh>();

  constructor(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement) {
    this.camera = camera;

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.key.toLowerCase());
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
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

  /** Update head meshes for headshot raycasting */
  setHeadMeshes(heads: Map<number, THREE.Mesh>): void {
    this.headMeshes = heads;
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
            break;
          }
        }
      }
    }

    return {
      moveDir,
      aimDir,
      fire: this.mouseDown,
      headshotTargetId,
    };
  }
}
