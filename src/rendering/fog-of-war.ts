import * as THREE from 'three';
import type { Obstacle, DestructibleCrate, ArenaConfig, Vec2 } from '../simulation/types.ts';

// ---- Tunable Constants ----
const FOV_HALF_ANGLE = 65 * (Math.PI / 180); // 130° total bright cone
const SHADOW_MAP_SAMPLES = 512;
const MAX_RAY_DIST = 40;
const FOG_DARKNESS = 0.6;
const CONE_DARKNESS = 0.35;
const EDGE_SOFTNESS = 0.15; // radians — cone edge smoothstep width
const SHADOW_EDGE_SOFTNESS = 0.5; // world units — shadow edge smoothstep width

// ---- AABB type for internal use ----
interface AABB {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Ray-AABB distance: returns distance to nearest intersection, or Infinity if no hit */
function rayDistToAABB(
  ox: number, oy: number,
  dx: number, dy: number,
  aabb: AABB,
): number {
  let tMin = 0;
  let tMax = MAX_RAY_DIST;

  // X slab
  if (Math.abs(dx) < 1e-10) {
    if (ox < aabb.minX || ox > aabb.maxX) return Infinity;
  } else {
    const invD = 1 / dx;
    let t1 = (aabb.minX - ox) * invD;
    let t2 = (aabb.maxX - ox) * invD;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return Infinity;
  }

  // Y slab
  if (Math.abs(dy) < 1e-10) {
    if (oy < aabb.minY || oy > aabb.maxY) return Infinity;
  } else {
    const invD = 1 / dy;
    let t1 = (aabb.minY - oy) * invD;
    let t2 = (aabb.maxY - oy) * invD;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return Infinity;
  }

  return tMin;
}

/** Convert obstacles + destructible crates + arena boundary walls into AABBs */
function buildCasterList(
  obstacles: Obstacle[],
  destructibleCrates: DestructibleCrate[],
  arena: ArenaConfig,
): AABB[] {
  const casters: AABB[] = [];

  for (const obs of obstacles) {
    const hw = obs.width / 2;
    const hh = obs.height / 2;
    casters.push({
      minX: obs.pos.x - hw,
      maxX: obs.pos.x + hw,
      minY: obs.pos.y - hh,
      maxY: obs.pos.y + hh,
    });
  }

  for (const dc of destructibleCrates) {
    // destructible crates are 1x1
    casters.push({
      minX: dc.pos.x - 0.5,
      maxX: dc.pos.x + 0.5,
      minY: dc.pos.y - 0.5,
      maxY: dc.pos.y + 0.5,
    });
  }

  // Arena boundary walls (thick slabs outside the playable area)
  const w = arena.width / 2;
  const h = arena.height / 2;
  const wallThickness = 2;
  // North wall
  casters.push({ minX: -w - wallThickness, maxX: w + wallThickness, minY: -h - wallThickness, maxY: -h });
  // South wall
  casters.push({ minX: -w - wallThickness, maxX: w + wallThickness, minY: h, maxY: h + wallThickness });
  // West wall
  casters.push({ minX: -w - wallThickness, maxX: -w, minY: -h - wallThickness, maxY: h + wallThickness });
  // East wall
  casters.push({ minX: w, maxX: w + wallThickness, minY: -h - wallThickness, maxY: h + wallThickness });

  return casters;
}

/** Cast SHADOW_MAP_SAMPLES rays and write min distance per angle into Float32Array */
function buildShadowMap(
  playerPos: Vec2,
  casters: AABB[],
  out: Float32Array,
): void {
  const step = (Math.PI * 2) / SHADOW_MAP_SAMPLES;
  for (let i = 0; i < SHADOW_MAP_SAMPLES; i++) {
    const angle = i * step;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let minDist = MAX_RAY_DIST;
    for (let c = 0; c < casters.length; c++) {
      const d = rayDistToAABB(playerPos.x, playerPos.y, dx, dy, casters[c]);
      if (d < minDist) minDist = d;
    }
    out[i] = minDist;
  }
}

// ---- Fragment Shader ----
const fogFragmentShader = /* glsl */ `
  uniform sampler2D uShadowMap;
  uniform vec2 uPlayerPos;        // world XZ
  uniform float uAimAngle;        // radians
  uniform float uFovHalfAngle;
  uniform float uFogDarkness;
  uniform float uConeDarkness;
  uniform float uEdgeSoftness;
  uniform float uShadowEdgeSoftness;
  uniform float uMaxRayDist;
  uniform int uSamples;
  uniform mat4 uInvViewProj;

  varying vec2 vUv;

  #define PI 3.14159265359
  #define TWO_PI 6.28318530718

  void main() {
    // Unproject screen UV to world XZ (y=0 ground plane)
    vec4 ndc = vec4(vUv * 2.0 - 1.0, 0.0, 1.0);
    vec4 worldPos = uInvViewProj * ndc;
    worldPos /= worldPos.w;

    // Ray from camera through this pixel to y=0 plane
    vec4 ndcNear = vec4(vUv * 2.0 - 1.0, -1.0, 1.0);
    vec4 ndcFar = vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
    vec4 worldNear = uInvViewProj * ndcNear;
    vec4 worldFar = uInvViewProj * ndcFar;
    worldNear /= worldNear.w;
    worldFar /= worldFar.w;

    // Intersect with y=0 plane
    float t = -worldNear.y / (worldFar.y - worldNear.y);
    vec3 groundPoint = worldNear.xyz + t * (worldFar.xyz - worldNear.xyz);

    float dx = groundPoint.x - uPlayerPos.x;
    float dz = groundPoint.z - uPlayerPos.y; // sim Y maps to world Z

    float dist = length(vec2(dx, dz));
    float angle = atan(dz, dx); // in sim space: atan(simY, simX)

    // ---- Shadow map lookup ----
    // Normalize angle to [0, TWO_PI)
    float normAngle = mod(angle, TWO_PI);
    if (normAngle < 0.0) normAngle += TWO_PI;
    float shadowU = normAngle / TWO_PI;
    float shadowDist = texture2D(uShadowMap, vec2(shadowU, 0.5)).r * uMaxRayDist;

    // Shadow factor: 1.0 = fully shadowed, 0.0 = not shadowed
    float shadowFactor = smoothstep(shadowDist - uShadowEdgeSoftness, shadowDist, dist);

    // ---- FOV cone ----
    // Angle difference between pixel direction and aim direction
    float aimDiff = angle - uAimAngle;
    // Wrap to [-PI, PI]
    aimDiff = mod(aimDiff + PI, TWO_PI) - PI;
    float absDiff = abs(aimDiff);

    // Cone factor: 1.0 = outside cone, 0.0 = inside cone
    float coneFactor = smoothstep(uFovHalfAngle - uEdgeSoftness, uFovHalfAngle + uEdgeSoftness, absDiff);

    // Combine: shadow takes priority (darker), cone is lighter darkness
    float darkness = max(shadowFactor * uFogDarkness, coneFactor * uConeDarkness);

    // Don't darken right around the player
    float playerProximity = smoothstep(0.0, 1.5, dist);
    darkness *= playerProximity;

    gl_FragColor = vec4(0.0, 0.0, 0.0, darkness);
  }
`;

const fogVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

export class FogOfWar {
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private shadowMapData: Float32Array;
  private shadowMapTexture: THREE.DataTexture;
  private casters: AABB[] = [];

  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.shadowMapData = new Float32Array(SHADOW_MAP_SAMPLES);
    this.shadowMapTexture = new THREE.DataTexture(
      this.shadowMapData,
      SHADOW_MAP_SAMPLES, 1,
      THREE.RedFormat,
      THREE.FloatType,
    );
    this.shadowMapTexture.minFilter = THREE.LinearFilter;
    this.shadowMapTexture.magFilter = THREE.LinearFilter;
    this.shadowMapTexture.wrapS = THREE.RepeatWrapping;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uShadowMap: { value: this.shadowMapTexture },
        uPlayerPos: { value: new THREE.Vector2(0, 0) },
        uAimAngle: { value: 0 },
        uFovHalfAngle: { value: FOV_HALF_ANGLE },
        uFogDarkness: { value: FOG_DARKNESS },
        uConeDarkness: { value: CONE_DARKNESS },
        uEdgeSoftness: { value: EDGE_SOFTNESS },
        uShadowEdgeSoftness: { value: SHADOW_EDGE_SOFTNESS },
        uMaxRayDist: { value: MAX_RAY_DIST },
        uSamples: { value: SHADOW_MAP_SAMPLES },
        uInvViewProj: { value: new THREE.Matrix4() },
      },
      vertexShader: fogVertexShader,
      fragmentShader: fogFragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.scene.add(this.mesh);
  }

  /** Rebuild caster list from current obstacles/crates/arena */
  setCasters(
    obstacles: Obstacle[],
    destructibleCrates: DestructibleCrate[],
    arena: ArenaConfig,
  ): void {
    this.casters = buildCasterList(obstacles, destructibleCrates, arena);
  }

  /** Update shadow map and uniforms each frame */
  update(
    playerPos: Vec2,
    aimDir: Vec2,
    camera: THREE.PerspectiveCamera,
    destructibleCrates: DestructibleCrate[],
    obstacles: Obstacle[],
    arena: ArenaConfig,
  ): void {
    // Rebuild casters since destructible crates can be destroyed
    this.casters = buildCasterList(obstacles, destructibleCrates, arena);

    // Build shadow map
    // Normalize distances to [0,1] range for texture storage
    buildShadowMap(playerPos, this.casters, this.shadowMapData);
    for (let i = 0; i < SHADOW_MAP_SAMPLES; i++) {
      this.shadowMapData[i] = this.shadowMapData[i] / MAX_RAY_DIST;
    }
    this.shadowMapTexture.needsUpdate = true;

    // Update uniforms
    this.material.uniforms.uPlayerPos.value.set(playerPos.x, playerPos.y);
    this.material.uniforms.uAimAngle.value = Math.atan2(aimDir.y, aimDir.x);

    // Compute inverse view-projection matrix
    const vpMatrix = new THREE.Matrix4();
    vpMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const invVP = vpMatrix.invert();
    this.material.uniforms.uInvViewProj.value.copy(invVP);
  }

  /** Render the fog overlay */
  render(renderer: THREE.WebGLRenderer): void {
    renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.shadowMapTexture.dispose();
    this.material.dispose();
    (this.mesh.geometry as THREE.BufferGeometry).dispose();
  }
}
