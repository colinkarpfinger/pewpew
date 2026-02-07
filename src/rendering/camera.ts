import * as THREE from 'three';

const CAMERA_ANGLE = 55 * (Math.PI / 180); // 55 degrees from horizontal
const CAMERA_DISTANCE = 18;
const FOLLOW_LERP = 0.08;

export function createCamera(aspect: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 200);
  setCameraPosition(camera, 0, 0);
  return camera;
}

function setCameraPosition(camera: THREE.PerspectiveCamera, targetX: number, targetZ: number): void {
  camera.position.set(
    targetX,
    Math.sin(CAMERA_ANGLE) * CAMERA_DISTANCE,
    targetZ + Math.cos(CAMERA_ANGLE) * CAMERA_DISTANCE,
  );
  camera.lookAt(targetX, 0, targetZ);
}

export function updateCamera(camera: THREE.PerspectiveCamera, playerX: number, playerZ: number): void {
  const targetX = playerX;
  const targetZ = playerZ;

  const targetCamX = targetX;
  const targetCamY = Math.sin(CAMERA_ANGLE) * CAMERA_DISTANCE;
  const targetCamZ = targetZ + Math.cos(CAMERA_ANGLE) * CAMERA_DISTANCE;

  camera.position.x += (targetCamX - camera.position.x) * FOLLOW_LERP;
  camera.position.y += (targetCamY - camera.position.y) * FOLLOW_LERP;
  camera.position.z += (targetCamZ - camera.position.z) * FOLLOW_LERP;

  camera.lookAt(
    camera.position.x,
    0,
    camera.position.z - Math.cos(CAMERA_ANGLE) * CAMERA_DISTANCE,
  );
}
