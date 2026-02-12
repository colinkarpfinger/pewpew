import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import type { WeaponType, EnemyType } from '../simulation/types.ts';

type WeaponModelKey = WeaponType | 'sniper';

const MODEL_FILES: Record<WeaponModelKey, string> = {
  pistol: 'SM_Wep_Pistol_01.fbx',
  smg: 'SM_Wep_Preset_A_SMG_01.fbx',
  rifle: 'SM_Wep_Preset_A_Rifle_01.fbx',
  shotgun: 'SM_Wep_Shotgun_01.fbx',
  machinegun: 'SM_Wep_Preset_A_Heavy_01.fbx',
  sniper: 'SM_Wep_Preset_A_Sniper_01.fbx',
};

const modelCache = new Map<WeaponModelKey, THREE.Group>();
let modelsLoaded = false;

const gunmetalMaterial = new THREE.MeshStandardMaterial({
  color: 0x2a2a2a,
  metalness: 0.7,
  roughness: 0.3,
});

export async function loadWeaponModels(): Promise<void> {
  const loader = new FBXLoader();
  const entries = Object.entries(MODEL_FILES) as [WeaponModelKey, string][];

  const promises = entries.map(([key, file]) =>
    loader.loadAsync(`/assets/Models/${file}`).then((group) => {
      // Apply gunmetal material to all meshes
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material = gunmetalMaterial;
          child.castShadow = true;
        }
      });

      // Scale down from Unity scale to game scale
      group.scale.setScalar(0.015);

      // Rotate so the barrel points along +X (local forward)
      // FBX from Unity: Z-forward, rotate +90° around Y to align with +X
      group.rotation.y = Math.PI / 2;

      modelCache.set(key, group);
    }).catch((err) => {
      console.warn(`Failed to load weapon model ${file}:`, err);
    })
  );

  await Promise.all(promises);
  modelsLoaded = true;
}

export function areWeaponModelsLoaded(): boolean {
  return modelsLoaded;
}

export function getWeaponModel(type: WeaponModelKey): THREE.Group | null {
  const cached = modelCache.get(type);
  if (!cached) return null;
  return cached.clone();
}

/** Map enemy type to weapon model key */
export function enemyWeaponType(enemyType: EnemyType): WeaponModelKey | null {
  switch (enemyType) {
    case 'gunner': return 'smg';
    case 'shotgunner': return 'shotgun';
    case 'sniper': return 'sniper';
    default: return null;
  }
}
