import * as THREE from 'three';
import type { GameState, GameEvent } from '../simulation/types.ts';

// ---- Emit config ----

interface EmitConfig {
  x: number;
  z: number;
  count: number;
  speed: [number, number];       // min, max
  angle: number;                 // center direction (radians)
  spread: number;                // half-angle of cone (radians), Math.PI for omni
  lifetime: [number, number];    // seconds
  size: [number, number];
  color: THREE.Color;
  gravity: number;               // downward pull (world-Y per s²)
  ySpeed?: [number, number];     // vertical speed range (upward)
}

// ---- Procedural soft-circle texture ----

function createCircleTexture(): THREE.Texture {
  const sz = 32;
  const c = document.createElement('canvas');
  c.width = sz;
  c.height = sz;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(sz / 2, sz / 2, 0, sz / 2, sz / 2, sz / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, sz, sz);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

// ---- Patch PointsMaterial for per-vertex sizes ----

function patchPointsMaterial(mat: THREE.PointsMaterial): void {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      'uniform float size;',
      'attribute float size;',
    );
  };
}

// ---- ParticleSystem ----

const MAX_PARTICLES = 2000;

export class ParticleSystem {
  readonly points: THREE.Points;

  // GPU buffers
  private posAttr: THREE.BufferAttribute;
  private colorAttr: THREE.BufferAttribute;
  private sizeAttr: THREE.BufferAttribute;

  // CPU pool (parallel arrays)
  private vx: Float32Array;
  private vy: Float32Array; // world-Y (up)
  private vz: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private baseR: Float32Array;
  private baseG: Float32Array;
  private baseB: Float32Array;
  private grav: Float32Array;
  private baseSize: Float32Array;

  private aliveCount = 0;

  constructor() {
    const geo = new THREE.BufferGeometry();

    const positions = new Float32Array(MAX_PARTICLES * 3);
    const colors = new Float32Array(MAX_PARTICLES * 3);
    const sizes = new Float32Array(MAX_PARTICLES);

    this.posAttr = new THREE.BufferAttribute(positions, 3);
    this.colorAttr = new THREE.BufferAttribute(colors, 3);
    this.sizeAttr = new THREE.BufferAttribute(sizes, 1);

    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('color', this.colorAttr);
    geo.setAttribute('size', this.sizeAttr);
    geo.setDrawRange(0, 0);

    const mat = new THREE.PointsMaterial({
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      transparent: true,
      map: createCircleTexture(),
    });
    patchPointsMaterial(mat);

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;

    // Allocate CPU-side arrays
    this.vx = new Float32Array(MAX_PARTICLES);
    this.vy = new Float32Array(MAX_PARTICLES);
    this.vz = new Float32Array(MAX_PARTICLES);
    this.life = new Float32Array(MAX_PARTICLES);
    this.maxLife = new Float32Array(MAX_PARTICLES);
    this.baseR = new Float32Array(MAX_PARTICLES);
    this.baseG = new Float32Array(MAX_PARTICLES);
    this.baseB = new Float32Array(MAX_PARTICLES);
    this.grav = new Float32Array(MAX_PARTICLES);
    this.baseSize = new Float32Array(MAX_PARTICLES);
  }

  emit(cfg: EmitConfig): void {
    for (let i = 0; i < cfg.count; i++) {
      if (this.aliveCount >= MAX_PARTICLES) return;
      const idx = this.aliveCount++;

      // Random within cone
      const a = cfg.angle + (Math.random() * 2 - 1) * cfg.spread;
      const spd = lerp(cfg.speed[0], cfg.speed[1], Math.random());
      this.vx[idx] = Math.cos(a) * spd;
      this.vz[idx] = Math.sin(a) * spd;

      // Vertical speed
      if (cfg.ySpeed) {
        this.vy[idx] = lerp(cfg.ySpeed[0], cfg.ySpeed[1], Math.random());
      } else {
        this.vy[idx] = 0;
      }

      const lt = lerp(cfg.lifetime[0], cfg.lifetime[1], Math.random());
      this.life[idx] = lt;
      this.maxLife[idx] = lt;

      this.baseR[idx] = cfg.color.r;
      this.baseG[idx] = cfg.color.g;
      this.baseB[idx] = cfg.color.b;
      this.grav[idx] = cfg.gravity;

      const sz = lerp(cfg.size[0], cfg.size[1], Math.random());
      this.baseSize[idx] = sz;

      // Set GPU position (x, y_up, z)
      const p = this.posAttr.array as Float32Array;
      p[idx * 3] = cfg.x;
      p[idx * 3 + 1] = 0.1; // slightly above ground
      p[idx * 3 + 2] = cfg.z;

      // Set initial color
      const c = this.colorAttr.array as Float32Array;
      c[idx * 3] = cfg.color.r;
      c[idx * 3 + 1] = cfg.color.g;
      c[idx * 3 + 2] = cfg.color.b;

      // Set size
      (this.sizeAttr.array as Float32Array)[idx] = sz;
    }
  }

  update(dt: number): void {
    const pos = this.posAttr.array as Float32Array;
    const col = this.colorAttr.array as Float32Array;
    const sizes = this.sizeAttr.array as Float32Array;

    let i = 0;
    while (i < this.aliveCount) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // Swap-remove: copy last alive into this slot
        this.swapRemove(i);
        continue; // re-check same index (now has different particle)
      }

      const t = this.life[i] / this.maxLife[i]; // 1 → 0

      // Apply gravity
      this.vy[i] -= this.grav[i] * dt;

      // Move
      pos[i * 3] += this.vx[i] * dt;
      pos[i * 3 + 1] += this.vy[i] * dt;
      pos[i * 3 + 2] += this.vz[i] * dt;

      // Clamp Y above ground
      if (pos[i * 3 + 1] < 0.01) {
        pos[i * 3 + 1] = 0.01;
        this.vy[i] = 0;
      }

      // Fade color toward black (additive blending = visual fade)
      col[i * 3] = this.baseR[i] * t;
      col[i * 3 + 1] = this.baseG[i] * t;
      col[i * 3 + 2] = this.baseB[i] * t;

      // Shrink near end
      sizes[i] = this.baseSize[i] * Math.min(1, t * 3);

      i++;
    }

    this.points.geometry.setDrawRange(0, this.aliveCount);
    this.posAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
  }

  processEvents(events: GameEvent[], state: GameState): void {
    for (const ev of events) {
      const d = ev.data as Record<string, unknown> | undefined;
      if (!d) continue;

      switch (ev.type) {
        case 'projectile_fired':
          this.emit({
            x: d.x as number,
            z: d.y as number,
            count: 4 + Math.floor(Math.random() * 3), // 4-6
            speed: [4, 10],
            angle: d.angle as number,
            spread: 0.25,
            lifetime: [0.03, 0.08],
            size: [0.1, 0.2],
            color: new THREE.Color(1, 0.7, 0.2), // orange/yellow
            gravity: 6,
            ySpeed: [1, 3],
          });
          break;

        case 'projectile_destroyed':
          this.emit({
            x: d.x as number,
            z: d.y as number,
            count: 6 + Math.floor(Math.random() * 5), // 6-10
            speed: [2, 6],
            angle: 0,
            spread: Math.PI,
            lifetime: [0.1, 0.25],
            size: [0.1, 0.2],
            color: new THREE.Color(1, 0.7, 0.2), // orange/yellow sparks
            gravity: 3,
            ySpeed: [1, 4],
          });
          break;

        case 'enemy_hit':
          if ((d.remainingHp as number) > 0) {
            this.emit({
              x: d.x as number,
              z: d.y as number,
              count: 4 + Math.floor(Math.random() * 3), // 4-6
              speed: [2, 5],
              angle: 0,
              spread: Math.PI,
              lifetime: [0.1, 0.2],
              size: [0.15, 0.25],
              color: new THREE.Color(1, 0.15, 0.1), // red
              gravity: 0,
              ySpeed: [0.5, 2],
            });
          }
          break;

        case 'enemy_killed': {
          const hs = d.headshot as boolean;
          if (hs) {
            // Headshot kill — dense blood burst
            this.emit({
              x: d.x as number,
              z: d.y as number,
              count: 50 + Math.floor(Math.random() * 21), // 50-70
              speed: [6, 16],
              angle: 0,
              spread: Math.PI,
              lifetime: [0.1, 0.3],
              size: [0.08, 0.18],
              color: new THREE.Color(1.0, 0.1, 0.05), // bright red, fades visibly with additive blend
              gravity: 8,
              ySpeed: [4, 10],
            });
          } else {
            // Normal kill
            this.emit({
              x: d.x as number,
              z: d.y as number,
              count: 20 + Math.floor(Math.random() * 11), // 20-30
              speed: [2, 7],
              angle: 0,
              spread: Math.PI,
              lifetime: [0.3, 0.6],
              size: [0.2, 0.5],
              color: new THREE.Color(1, 0.1, 0.05), // red
              gravity: 4,
              ySpeed: [2, 6],
            });
          }
          break;
        }

        case 'player_hit':
          this.emit({
            x: d.x as number,
            z: d.y as number,
            count: 12 + Math.floor(Math.random() * 7), // 12-18
            speed: [2, 6],
            angle: 0,
            spread: Math.PI,
            lifetime: [0.15, 0.3],
            size: [0.2, 0.4],
            color: new THREE.Color(0.8, 0.05, 0.05), // dark red
            gravity: 2,
            ySpeed: [1, 3],
          });
          break;
      }
    }

    // Dodge trail — continuous while dodging
    if (state.player.dodgeTimer > 0) {
      this.emit({
        x: state.player.pos.x,
        z: state.player.pos.y,
        count: 2 + Math.floor(Math.random() * 2), // 2-3 per frame
        speed: [0.5, 2],
        angle: Math.atan2(state.player.dodgeDir.y, state.player.dodgeDir.x) + Math.PI, // behind player
        spread: 0.5,
        lifetime: [0.2, 0.4],
        size: [0.2, 0.4],
        color: new THREE.Color(0.2, 0.6, 1), // cyan/blue
        gravity: -0.5, // slight upward drift
        ySpeed: [0.3, 1.5],
      });
    }
  }

  dispose(): void {
    this.points.geometry.dispose();
    const mat = this.points.material as THREE.PointsMaterial;
    mat.map?.dispose();
    mat.dispose();
  }

  private swapRemove(i: number): void {
    const last = this.aliveCount - 1;
    if (i !== last) {
      // Copy last into i — CPU arrays
      this.vx[i] = this.vx[last];
      this.vy[i] = this.vy[last];
      this.vz[i] = this.vz[last];
      this.life[i] = this.life[last];
      this.maxLife[i] = this.maxLife[last];
      this.baseR[i] = this.baseR[last];
      this.baseG[i] = this.baseG[last];
      this.baseB[i] = this.baseB[last];
      this.grav[i] = this.grav[last];
      this.baseSize[i] = this.baseSize[last];

      // GPU arrays
      const pos = this.posAttr.array as Float32Array;
      pos[i * 3] = pos[last * 3];
      pos[i * 3 + 1] = pos[last * 3 + 1];
      pos[i * 3 + 2] = pos[last * 3 + 2];

      const col = this.colorAttr.array as Float32Array;
      col[i * 3] = col[last * 3];
      col[i * 3 + 1] = col[last * 3 + 1];
      col[i * 3 + 2] = col[last * 3 + 2];

      (this.sizeAttr.array as Float32Array)[i] = (this.sizeAttr.array as Float32Array)[last];
    }
    this.aliveCount--;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
