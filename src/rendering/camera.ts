import * as THREE from 'three';

const CAMERA_ANGLE = 55 * (Math.PI / 180); // 55 degrees from horizontal
const CAMERA_DISTANCE = 22;
const FOLLOW_LERP = 0.08;

// ---- Screen Shake ----
let shakeIntensity = 0;
let shakeTimer = 0;

export function triggerScreenShake(intensity: number, durationSec: number): void {
  // Take the stronger shake if overlapping
  if (intensity > shakeIntensity) {
    shakeIntensity = intensity;
  }
  shakeTimer = Math.max(shakeTimer, durationSec);
}

function updateScreenShake(dt: number): { dx: number; dz: number } {
  if (shakeTimer <= 0) return { dx: 0, dz: 0 };
  shakeTimer -= dt;
  if (shakeTimer <= 0) {
    shakeTimer = 0;
    shakeIntensity = 0;
    return { dx: 0, dz: 0 };
  }
  const dx = (Math.random() * 2 - 1) * shakeIntensity;
  const dz = (Math.random() * 2 - 1) * shakeIntensity;
  return { dx, dz };
}

// ---- Zoom Punch ----
let zoomAmount = 0;
let zoomTimer = 0;
let zoomDuration = 0;

export function triggerZoomPunch(amount: number, durationSec: number): void {
  if (amount > zoomAmount) {
    zoomAmount = amount;
  }
  zoomTimer = durationSec;
  zoomDuration = durationSec;
}

function getZoomOffset(dt: number): number {
  if (zoomTimer <= 0) return 0;
  zoomTimer -= dt;
  if (zoomTimer <= 0) {
    zoomTimer = 0;
    const result = 0;
    zoomAmount = 0;
    return result;
  }
  // Linear decay
  return zoomAmount * (zoomTimer / zoomDuration);
}

// ---- Weapon Kick ----
let kickOffsetX = 0;
let kickOffsetZ = 0;
let kickTimer = 0;
const KICK_DECAY = 0.08; // seconds

export function triggerWeaponKick(aimAngle: number, amount: number): void {
  // Offset opposite to aim direction
  kickOffsetX = -Math.cos(aimAngle) * amount;
  kickOffsetZ = -Math.sin(aimAngle) * amount;
  kickTimer = KICK_DECAY;
}

function getKickOffset(dt: number): { dx: number; dz: number } {
  if (kickTimer <= 0) return { dx: 0, dz: 0 };
  kickTimer -= dt;
  if (kickTimer <= 0) {
    kickTimer = 0;
    kickOffsetX = 0;
    kickOffsetZ = 0;
    return { dx: 0, dz: 0 };
  }
  const t = kickTimer / KICK_DECAY;
  return { dx: kickOffsetX * t, dz: kickOffsetZ * t };
}

export function createCamera(aspect: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 200);
  setCameraPosition(camera, 0, 0);
  return camera;
}

function setCameraPosition(camera: THREE.PerspectiveCamera, targetX: number, targetZ: number): void {
  camera.position.set(
    targetX,
    Math.sin(CAMERA_ANGLE) * CAMERA_DISTANCE,
    targetZ - Math.cos(CAMERA_ANGLE) * CAMERA_DISTANCE,
  );
  camera.lookAt(targetX, 0, targetZ);
}

export function updateCamera(camera: THREE.PerspectiveCamera, playerX: number, playerZ: number, dt: number): void {
  const targetX = playerX;
  const targetZ = playerZ;

  // Zoom punch reduces effective camera distance
  const zoomOff = getZoomOffset(dt);
  const effectiveDistance = CAMERA_DISTANCE - zoomOff;

  const targetCamX = targetX;
  const targetCamY = Math.sin(CAMERA_ANGLE) * effectiveDistance;
  const targetCamZ = targetZ - Math.cos(CAMERA_ANGLE) * effectiveDistance;

  camera.position.x += (targetCamX - camera.position.x) * FOLLOW_LERP;
  camera.position.y += (targetCamY - camera.position.y) * FOLLOW_LERP;
  camera.position.z += (targetCamZ - camera.position.z) * FOLLOW_LERP;

  // Apply screen shake offset
  const shake = updateScreenShake(dt);
  camera.position.x += shake.dx;
  camera.position.z += shake.dz;

  // Apply weapon kick offset
  const kick = getKickOffset(dt);
  camera.position.x += kick.dx;
  camera.position.z += kick.dz;

  camera.lookAt(
    camera.position.x,
    0,
    camera.position.z + Math.cos(CAMERA_ANGLE) * effectiveDistance,
  );
}
