import './style.css';
import * as THREE from 'three';
import type { GameConfigs, GameEvent, GameMode, WeaponType, ArmorType } from './simulation/types.ts';
import { TICK_DURATION } from './simulation/types.ts';
import { createGame, tick } from './simulation/game.ts';
import type { GameInstance } from './simulation/game.ts';
import { Renderer } from './rendering/renderer.ts';
import { InputHandler } from './input.ts';
import type { IInputHandler } from './input-interface.ts';
import { TouchInputHandler } from './touch-input.ts';
import { isMobile } from './platform.ts';
import { updateHUD, showGameOver, hideGameOver, showExtractionSuccess, onRestart, setWeaponConfig, setActiveWeaponName } from './ui.ts';
import { FullRecorder } from './recording/full-recorder.ts';
import { RingRecorder } from './recording/ring-recorder.ts';
import { saveReplay, loadReplay } from './recording/api.ts';
import { ReplayViewer } from './replay/viewer.ts';
import { showStartScreen, hideStartScreen, onStartGame } from './ui/start-screen.ts';
import { showHubScreen, hideHubScreen, setupHubScreen } from './ui/hub-screen.ts';
import { setupShopScreen, openShopScreen, closeShopScreen, isShopOpen } from './ui/shop-screen.ts';
import { createHomebase, destroyHomebase, homebaseTick } from './simulation/homebase.ts';
import type { HomebaseInstance } from './simulation/homebase.ts';
import homebaseMapConfig from './configs/homebase-map.json';
import type { HomebaseMapConfig } from './simulation/types.ts';
import { showEscapeMenu, hideEscapeMenu, setupEscapeMenu } from './ui/escape-menu.ts';
import { showReplayBrowser } from './ui/replay-browser.ts';
import { showReplayControls, hideReplayControls, onReplayExit } from './ui/replay-controls.ts';
import { initCrosshair, showCrosshair, hideCrosshair, processHitEvents, updateCrosshairSpread, updateAmmoArc, triggerCrosshairRecoil, updateCrosshairRecoil } from './ui/crosshair.ts';
import { initDevConsole, toggleDevConsole, isDevConsoleEnabled, setDevConsoleEnabled, isDevConsoleVisible, logToConsole, registerCommand } from './ui/dev-console.ts';

import { AudioSystem } from './audio/audio.ts';
import playerConfig from './configs/player.json';
import weaponsConfig from './configs/weapons.json';
import enemiesConfig from './configs/enemies.json';
import spawningConfig from './configs/spawning.json';
import arenaConfig from './configs/arena.json';
import multikillConfig from './configs/multikill.json';
import grenadeConfig from './configs/grenade.json';
import cratesConfig from './configs/crates.json';
import cashConfig from './configs/cash.json';
import gunnerConfig from './configs/gunner.json';
import audioConfig from './configs/audio.json';
import extractionMapConfig from './configs/extraction-map.json';
import destructibleCratesConfig from './configs/destructible-crates.json';
import { addCashToStash, getWeaponUpgradeLevel, setArmorHp } from './persistence.ts';
import shopConfig from './configs/shop.json';
import armorConfig from './configs/armor.json';
import bandagesConfig from './configs/bandages.json';
import shotgunnerConfig from './configs/shotgunner.json';
import sniperConfig from './configs/sniper.json';
import weaponUpgradesConfig from './configs/weapon-upgrades.json';
import type { BandageConfig, RangedEnemyConfig, WeaponUpgradesConfig, WeaponConfig, ExtractionMapConfig } from './simulation/types.ts';
import { getEffectiveWeaponConfig } from './simulation/weapon-upgrades.ts';
import { loadWeaponModels } from './rendering/weapon-models.ts';
import { setupInventoryScreen, openInventoryScreen, closeInventoryScreen, isInventoryOpen } from './ui/inventory-screen.ts';
import { setupStashScreen, openStashScreen, closeStashScreen, isStashOpen } from './ui/stash-screen.ts';
import { setupLootScreen, openLootScreen, closeLootScreen, isLootOpen, updateLootSearch, quickTransferHovered } from './ui/loot-screen.ts';
import { findNearestLootContainer } from './simulation/loot-containers.ts';
import { initHudHotbar, updateHudHotbar, showHudHotbar, hideHudHotbar } from './ui.ts';
import { syncInventoryToPlayer, countItemInBackpack, removeItemFromBackpack } from './simulation/inventory.ts';
import { ITEM_DEFS, WEAPON_AMMO_MAP, ITEM_TO_ARMOR_TYPE } from './simulation/items.ts';
import { savePlayerInventory, loadPlayerInventory } from './persistence.ts';
import inventoryConfig from './configs/inventory.json';
import type { InventoryConfig } from './simulation/types.ts';

const configs: GameConfigs = {
  player: playerConfig,
  weapons: weaponsConfig,
  enemies: enemiesConfig,
  spawning: spawningConfig,
  arena: arenaConfig,
  multikill: multikillConfig,
  grenade: grenadeConfig,
  crates: cratesConfig,
  cash: cashConfig,
  gunner: gunnerConfig,
  armor: armorConfig,
  extractionMap: extractionMapConfig as ExtractionMapConfig,
  destructibleCrates: destructibleCratesConfig,
  bandages: bandagesConfig as BandageConfig,
  shotgunner: shotgunnerConfig as RangedEnemyConfig,
  sniper: sniperConfig as RangedEnemyConfig,
  weaponUpgrades: weaponUpgradesConfig as unknown as WeaponUpgradesConfig,
  inventory: inventoryConfig as InventoryConfig,
};
const configsJson = JSON.stringify(configs);

// ---- App State ----
type Screen = 'start' | 'hub' | 'homebase' | 'playing' | 'paused' | 'gameOver' | 'replay';
let screen: Screen = 'start';
let prePauseScreen: Screen = 'playing';
let equippedWeapon: WeaponType = 'pistol';
let equippedArmor: ArmorType | null = null;
let runConfigs: GameConfigs = configs; // effective configs for current run (with upgrades applied)
let homebase: HomebaseInstance | null = null;

// ---- Core objects ----
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const mobile = isMobile();
const input: IInputHandler = mobile
  ? new TouchInputHandler(canvas)
  : new InputHandler(renderer.camera, canvas);
const audioSystem = new AudioSystem(audioConfig);

let game: GameInstance;
let fullRecorder: FullRecorder;
let ringRecorder: RingRecorder;
let replayViewer: ReplayViewer | null = null;

let accumulator = 0;
let lastTime = performance.now();
let gameOverShown = false;
let currentSeed = 0;

// Hit stop (freeze frame) state
let timeScale = 1.0;
let hitStopTimer = 0;

if (!mobile) initCrosshair(canvas);
initDevConsole();
initHudHotbar();
// Pending use-item from inventory context menu (processed next tick)
let pendingUseItemDefId: string | null = null;

setupInventoryScreen(() => {
  // On change: sync inventory to player legacy fields
  if (game) {
    syncInventoryToPlayer(game.state.player, runConfigs);
  }
}, (defId: string) => {
  // On use item: queue for next tick processing
  pendingUseItemDefId = defId;
  closeInventoryScreen();
});
setupStashScreen(() => {
  // On stash close: no-op (player stays in homebase or hub)
  if (screen === 'hub') showHubScreen();
});
setupLootScreen(() => {
  // On change: sync inventory to player legacy fields
  if (game) {
    syncInventoryToPlayer(game.state.player, runConfigs);
  }
});

// Register dev console commands
registerCommand('state', () => {
  if (!game) return 'No active game';
  const s = game.state;
  return `tick:${s.tick} hp:${s.player.hp.toFixed(0)}/${s.player.maxHp} score:${s.score} enemies:${s.enemies.length} grenades:${s.grenadeAmmo} weapon:${s.player.activeWeapon} mode:${s.gameMode}`;
});

registerCommand('hp', (args) => {
  if (!game) return 'No active game';
  const val = parseInt(args);
  if (isNaN(val)) return `HP: ${game.state.player.hp.toFixed(0)}/${game.state.player.maxHp}`;
  game.state.player.hp = Math.min(val, game.state.player.maxHp);
  return `HP set to ${game.state.player.hp}`;
});

registerCommand('score', (args) => {
  if (!game) return 'No active game';
  const val = parseInt(args);
  if (isNaN(val)) return `Score: ${game.state.score}`;
  game.state.score = val;
  return `Score set to ${val}`;
});

registerCommand('grenades', (args) => {
  if (!game) return 'No active game';
  const val = parseInt(args);
  if (isNaN(val)) return `Grenades: ${game.state.grenadeAmmo}`;
  game.state.grenadeAmmo = val;
  return `Grenades set to ${val}`;
});

registerCommand('weapon', (args) => {
  if (!game) return 'No active game';
  const valid = ['pistol', 'smg', 'rifle', 'shotgun', 'machinegun'] as const;
  if (!args) return `Weapon: ${game.state.player.activeWeapon}  (options: ${valid.join(', ')})`;
  const wt = args.trim().toLowerCase();
  if (!valid.includes(wt as typeof valid[number])) return `Unknown weapon. Options: ${valid.join(', ')}`;
  const weaponType = wt as typeof valid[number];
  game.state.player.activeWeapon = weaponType;
  const wc = configs.weapons[weaponType];
  game.state.player.ammo = wc.magazineSize;
  game.state.player.reloadTimer = 0;
  game.state.player.fireCooldown = 0;
  game.state.player.damageBonusMultiplier = 1.0;
  setWeaponConfig(wc);
  setActiveWeaponName(weaponType);
  renderer.setWeaponConfig(wc);
  return `Switched to ${weaponType} (${wc.magazineSize} rounds, ${wc.damage} dmg)`;
});

registerCommand('kill', () => {
  if (!game) return 'No active game';
  const count = game.state.enemies.length;
  game.state.enemies = [];
  return `Killed ${count} enemies`;
});

// ---- Scene setup ----
function rebuildScene(): void {
  renderer.scene.clear();

  const ambient = new THREE.AmbientLight(0xffffff, 0.4);
  renderer.scene.add(ambient);

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
  renderer.scene.add(dirLight);
}

// ---- Homebase ----

// Homebase interaction prompt element
const homebasePrompt = document.createElement('div');
homebasePrompt.id = 'homebase-interact-prompt';
homebasePrompt.className = 'hidden';
document.getElementById('game-container')!.appendChild(homebasePrompt);

function enterHomebase(): void {
  // Clean up old homebase
  if (homebase) {
    destroyHomebase(homebase);
    homebase = null;
  }

  homebase = createHomebase(homebaseMapConfig as HomebaseMapConfig, configs.player.radius);

  rebuildScene();
  renderer.initHomebase(homebase.state);

  // Show the player's currently equipped weapon
  const inv = loadPlayerInventory(inventoryConfig.backpackSize);
  const homeWeapon = (inv.equipment.weapon1?.defId ?? 'pistol') as WeaponType;
  const homeUpgrade = inv.equipment.weapon1?.upgradeLevel ?? 0;
  renderer.setPlayerWeapon(homeWeapon, homeUpgrade);

  // Hide all overlays
  hideGameOver();
  hideStartScreen();
  hideHubScreen();
  hideEscapeMenu();
  hideReplayControls();
  hideHudHotbar();
  closeLootScreen();
  closeInventoryScreen();
  if (mobile) {
    (input as TouchInputHandler).setVisible(false);
  } else {
    hideCrosshair();
  }

  homebasePrompt.classList.add('hidden');
  interactPrompt.classList.add('hidden');
  accumulator = 0;
  lastTime = performance.now();
  screen = 'homebase';
}

// ---- Game lifecycle ----
function startGame(mode: GameMode = 'arena', weapon?: WeaponType, armor?: ArmorType | null): void {
  currentSeed = Date.now();
  const activeWeapon: WeaponType = weapon ?? (mode === 'extraction' ? 'pistol' : 'rifle');
  equippedWeapon = activeWeapon;
  equippedArmor = armor ?? null;
  // Apply weapon upgrades for extraction mode
  let effectiveConfigs = configs;
  if (mode === 'extraction' && configs.weaponUpgrades) {
    const upgradedWeapons = { ...configs.weapons } as Record<string, WeaponConfig>;
    for (const wt of Object.keys(configs.weapons) as Array<WeaponType>) {
      const upgradeLevel = getWeaponUpgradeLevel(wt);
      if (upgradeLevel > 0 && configs.weaponUpgrades[wt]) {
        upgradedWeapons[wt] = getEffectiveWeaponConfig(configs.weapons[wt], upgradeLevel, configs.weaponUpgrades[wt]);
      }
    }
    effectiveConfigs = { ...configs, weapons: upgradedWeapons as typeof configs.weapons };
  }

  runConfigs = effectiveConfigs;
  game = createGame(runConfigs, currentSeed, mode, activeWeapon, equippedArmor);

  // Load persisted inventory for extraction mode (inventory-as-loadout)
  if (mode === 'extraction') {
    const inv = loadPlayerInventory(inventoryConfig.backpackSize);

    // Fill magazines: top off equipped weapons with backpack ammo (or free mag)
    for (const slotKey of ['weapon1', 'weapon2'] as const) {
      const weaponItem = inv.equipment[slotKey];
      if (!weaponItem) continue;
      const wt = weaponItem.defId as WeaponType;
      const wc = effectiveConfigs.weapons[wt];
      if (!wc) continue;
      const magSize = wc.magazineSize;
      const currentAmmo = weaponItem.currentAmmo ?? 0;
      const needed = magSize - currentAmmo;
      if (needed > 0) {
        const ammoType = WEAPON_AMMO_MAP[wt];
        if (ammoType) {
          const available = countItemInBackpack(inv, ammoType);
          if (available > 0) {
            const pulled = Math.min(needed, available);
            removeItemFromBackpack(inv, ammoType, pulled);
            weaponItem.currentAmmo = currentAmmo + pulled;
          } else {
            // Free mag if no ammo available at all
            weaponItem.currentAmmo = magSize;
          }
        } else {
          weaponItem.currentAmmo = magSize;
        }
      }
    }

    // Read equipped weapon/armor from inventory
    const weapon1 = inv.equipment.weapon1;
    if (weapon1) {
      const wt = weapon1.defId as WeaponType;
      equippedWeapon = wt;
      game.state.player.activeWeapon = wt;
    }
    const armorItem = inv.equipment.armor;
    if (armorItem) {
      const armorType = ITEM_TO_ARMOR_TYPE[armorItem.defId];
      equippedArmor = armorType ? armorType as ArmorType : null;
    } else {
      equippedArmor = null;
    }

    game.state.player.inventory = inv;
    syncInventoryToPlayer(game.state.player, effectiveConfigs);
  }

  fullRecorder = new FullRecorder(currentSeed, configsJson);
  ringRecorder = new RingRecorder(game);

  // For extraction, equippedWeapon may have been updated from inventory
  const finalWeapon: WeaponType = mode === 'extraction' ? equippedWeapon : activeWeapon;
  const weaponConfig = effectiveConfigs.weapons[finalWeapon];
  setWeaponConfig(weaponConfig);
  setActiveWeaponName(finalWeapon);

  rebuildScene();
  renderer.initArena(game.state);
  renderer.setPlayerArmor(equippedArmor);
  renderer.setDodgeDuration(configs.player.dodgeDuration);
  renderer.setWeaponConfig(weaponConfig);
  renderer.setBandageConfig(bandagesConfig as BandageConfig);
  const upgradeLevel = mode === 'extraction' ? getWeaponUpgradeLevel(finalWeapon) : 0;
  renderer.setPlayerWeapon(finalWeapon, upgradeLevel);
  audioSystem.init();
  gameOverShown = false;
  hideGameOver();
  hideStartScreen();
  hideHubScreen();
  hideEscapeMenu();
  hideReplayControls();
  closeShopScreen();
  homebasePrompt.classList.add('hidden');
  if (mobile) {
    (input as TouchInputHandler).setVisible(true);
  } else {
    showCrosshair();
  }
  accumulator = 0;
  lastTime = performance.now();
  timeScale = 1.0;
  hitStopTimer = 0;
  screen = 'playing';

  // Show hotbar for extraction mode
  if (mode === 'extraction') {
    showHudHotbar();
    updateHudHotbar(game.state.player.inventory);
  } else {
    hideHudHotbar();
  }
}

function enterReplay(viewer: ReplayViewer): void {
  replayViewer = viewer;
  rebuildScene();
  renderer.initArena(viewer.getState());
  hideGameOver();
  hideStartScreen();
  hideEscapeMenu();
  showReplayControls(viewer);
  accumulator = 0;
  lastTime = performance.now();
  screen = 'replay';
}

function exitReplay(): void {
  replayViewer = null;
  hideReplayControls();
  showStartScreen();
  screen = 'start';
}

function goToTitle(): void {
  hideGameOver();
  hideEscapeMenu();
  hideReplayControls();
  hideHudHotbar();
  closeLootScreen();
  closeInventoryScreen();
  closeShopScreen();
  if (homebase) {
    destroyHomebase(homebase);
    homebase = null;
  }
  homebasePrompt.classList.add('hidden');
  if (mobile) {
    (input as TouchInputHandler).setVisible(false);
  } else {
    hideCrosshair();
  }
  showStartScreen();
  screen = 'start';
}

// ---- Pause logic ----
function pauseGame(): void {
  if (screen === 'playing' || screen === 'gameOver' || screen === 'homebase') {
    prePauseScreen = screen;
    showEscapeMenu();
    if (mobile) (input as TouchInputHandler).setVisible(false);
    screen = 'paused';
  }
}

function resumeGame(): void {
  hideEscapeMenu();
  if (prePauseScreen === 'homebase') {
    screen = 'homebase';
  } else {
    const resumeToPlaying = !gameOverShown;
    if (mobile && resumeToPlaying) (input as TouchInputHandler).setVisible(true);
    screen = resumeToPlaying ? 'playing' : 'gameOver';
  }
  lastTime = performance.now();
  accumulator = 0;
}

// Wire up mobile pause button
if (mobile) {
  (input as TouchInputHandler).setPauseHandler(pauseGame);
}

// Suppress browser context menu globally
window.addEventListener('contextmenu', (e) => e.preventDefault());

// ---- Escape key ----
window.addEventListener('keydown', (e) => {
  // F key: homebase interactions
  if (e.key.toLowerCase() === 'f' && screen === 'homebase' && !isShopOpen() && !isStashOpen()) {
    if (homebase && homebase.state.nearestInteractable) {
      const ia = homebase.state.nearestInteractable;
      if (ia.type === 'shop') {
        openShopScreen();
      } else if (ia.type === 'stash') {
        openStashScreen(inventoryConfig as InventoryConfig);
      } else if (ia.type === 'raid') {
        startGame('extraction');
      }
    }
    return;
  }

  // F key: toggle loot screen (in-game)
  if (e.key.toLowerCase() === 'f' && screen === 'playing' && !isInventoryOpen() && !isLootOpen()) {
    if (game && game.state.gameMode === 'extraction') {
      const container = findNearestLootContainer(
        game.state,
        (inventoryConfig as InventoryConfig).lootInteractionRadius,
      );
      if (container) {
        openLootScreen(game.state.player.inventory, container, inventoryConfig as InventoryConfig);
      }
    }
    return;
  }
  if (e.key.toLowerCase() === 'f' && isLootOpen()) {
    // F on a hovered item = quick transfer; F on empty space = close
    if (!quickTransferHovered()) {
      closeLootScreen();
    }
    return;
  }

  // Tab / I toggles inventory (not while looting)
  if ((e.key === 'Tab' || e.key.toLowerCase() === 'i') && screen === 'playing') {
    e.preventDefault();
    if (isLootOpen()) {
      closeLootScreen();
    } else if (isInventoryOpen()) {
      closeInventoryScreen();
    } else if (game) {
      openInventoryScreen(game.state.player.inventory, inventoryConfig as InventoryConfig);
    }
    return;
  }

  // Close inventory on Escape (without pausing)
  if (e.key === 'Escape' && isInventoryOpen()) {
    closeInventoryScreen();
    return;
  }

  // Close loot screen on Escape
  if (e.key === 'Escape' && isLootOpen()) {
    closeLootScreen();
    return;
  }

  // Close shop screen on Escape
  if (e.key === 'Escape' && isShopOpen()) {
    closeShopScreen();
    return;
  }

  // Close stash screen on Escape
  if (e.key === 'Escape' && isStashOpen()) {
    closeStashScreen();
    return;
  }

  if (e.key === 'Escape') {
    if (screen === 'playing' || screen === 'gameOver' || screen === 'homebase') {
      pauseGame();
    } else if (screen === 'paused') {
      resumeGame();
    }
  }

  // Tilde toggles dev console
  if (e.key === '`') {
    toggleDevConsole();
    return;
  }

  // F8 quick-save ring buffer
  if (e.key === 'F8' && (screen === 'playing' || screen === 'paused' || screen === 'gameOver')) {
    const replay = ringRecorder.toReplay(configsJson);
    saveReplay(replay).then((filename) => {
      console.log(`Ring buffer saved: ${filename}`);
    }).catch(console.error);
  }
});

// ---- Escape menu callbacks ----
setupEscapeMenu({
  onResume: () => {
    resumeGame();
  },
  onSaveFull: () => {
    const replay = fullRecorder.toReplay();
    return saveReplay(replay);
  },
  onSaveRing: () => {
    const replay = ringRecorder.toReplay(configsJson);
    return saveReplay(replay);
  },
  onLoadReplay: () => {
    hideEscapeMenu();
    showReplayBrowser(
      (filename) => {
        loadReplay(filename).then((replay) => {
          const viewer = new ReplayViewer(replay, renderer);
          enterReplay(viewer);
        }).catch(console.error);
      },
      () => {
        // Back from browser — return to pause menu
        showEscapeMenu();
      },
    );
  },
  onToggleConsole: () => {
    const newState = !isDevConsoleEnabled();
    setDevConsoleEnabled(newState);
    return newState;
  },
  onQuit: () => {
    goToTitle();
  },
});

// ---- Replay exit ----
onReplayExit(() => {
  exitReplay();
});

// ---- Shop screen ----
setupShopScreen(
  shopConfig.prices,
  configs.weapons,
  shopConfig.armorPrices,
  armorConfig,
  shopConfig.bandagePrices,
  weaponUpgradesConfig as unknown as WeaponUpgradesConfig,
  shopConfig.ammoPrices,
  shopConfig.ammoPerPurchase,
  inventoryConfig as InventoryConfig,
);

// ---- Hub screen ----
setupHubScreen({
  onStartRun: (weapon, armor) => {
    startGame('extraction', weapon, armor);
  },
  onBack: () => {
    hideHubScreen();
    showStartScreen();
    screen = 'start';
  },
  onManageStash: () => {
    hideHubScreen();
    openStashScreen(inventoryConfig as InventoryConfig);
  },
}, shopConfig.prices, configs.weapons, shopConfig.armorPrices, armorConfig, shopConfig.bandagePrices, weaponUpgradesConfig as unknown as WeaponUpgradesConfig, shopConfig.ammoPrices, shopConfig.ammoPerPurchase);

// ---- Start screen ----
onStartGame((mode) => {
  if (screen === 'start') {
    if (mode === 'extraction') {
      enterHomebase();
    } else {
      startGame('arena');
    }
  }
});

// ---- Restart from game over ----
onRestart(() => {
  if (screen === 'gameOver') {
    if (game.state.gameMode === 'extraction') {
      enterHomebase();
    } else {
      startGame('arena');
    }
  }
});

// ---- Main loop ----
function gameLoop(now: number): void {
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  if (screen === 'playing') {
    // Decay hit stop timer using real (unscaled) time
    if (hitStopTimer > 0) {
      hitStopTimer -= dt;
      if (hitStopTimer <= 0) {
        hitStopTimer = 0;
        timeScale = 1.0;
      }
    }

    const scaledDt = dt * timeScale;
    accumulator += scaledDt;
    const state = game.state;
    input.setPlayerPos(state.player.pos);
    input.setEnemies(state.enemies.map(e => ({ id: e.id, pos: e.pos, radius: e.radius })));
    if (!mobile) {
      (input as InputHandler).setHeadMeshes(renderer.getEnemyHeadMeshes());
    }
    const currentInput = input.getInput();

    // Suppress game input while dev console, inventory, or loot screen is focused
    if (isDevConsoleVisible() || isInventoryOpen() || isLootOpen()) {
      currentInput.moveDir = { x: 0, y: 0 };
      currentInput.fire = false;
      currentInput.firePressed = false;
      currentInput.dodge = false;
      currentInput.reload = false;
      currentInput.throwGrenade = false;
      currentInput.healSmall = false;
      currentInput.healLarge = false;
      currentInput.interact = false;
      currentInput.weaponSlot1 = false;
      currentInput.weaponSlot2 = false;
      currentInput.hotbarUse = null;
    }

    // Handle pending use-item from inventory context menu
    if (pendingUseItemDefId && state.gameMode === 'extraction') {
      const defId = pendingUseItemDefId;
      pendingUseItemDefId = null;
      const def = ITEM_DEFS[defId];
      if (def) {
        if (def.category === 'medical') {
          // Find which hotbar slot has this defId and inject hotbar use
          const hotbarIdx = state.player.inventory.hotbar.indexOf(defId);
          if (hotbarIdx !== -1) {
            currentInput.hotbarUse = hotbarIdx;
          }
        }
        // Grenades via context menu: just put on hotbar, user throws with G
      }
    }

    const frameEvents: GameEvent[] = [];

    if (!mobile) {
      // Update dynamic crosshair based on effective spread
      const isDodging = state.player.dodgeTimer > 0;
      const isMoving = currentInput.moveDir.x !== 0 || currentInput.moveDir.y !== 0;
      const weapon = runConfigs.weapons[state.player.activeWeapon];
      const effectiveSpread = isDodging
        ? weapon.spread * weapon.movingSpreadMultiplier * 3.0
        : weapon.spread * (isMoving ? weapon.movingSpreadMultiplier : 1.0);
      updateCrosshairSpread(effectiveSpread);
      updateCrosshairRecoil();

      // Update ammo arc
      const isReloading = state.player.reloadTimer > 0;
      updateAmmoArc({
        ammo: state.player.ammo,
        maxAmmo: weapon.magazineSize,
        reloading: isReloading,
        reloadProgress: isReloading ? state.player.reloadTimer / weapon.reloadTime : 0,
        damageBonusMultiplier: state.player.damageBonusMultiplier,
      });
    }

    let ticksRan = false;
    while (accumulator >= TICK_DURATION) {
      ticksRan = true;
      fullRecorder.recordTick(currentInput);
      ringRecorder.recordTick(currentInput, game);
      tick(game, currentInput, runConfigs);
      if (!mobile) {
        processHitEvents(state.events);
        for (const ev of state.events) {
          if (ev.type === 'projectile_fired') {
            const wc = runConfigs.weapons[state.player.activeWeapon];
            triggerCrosshairRecoil(wc.recoilAim);
          }
        }
      }
      frameEvents.push(...state.events);
      accumulator -= TICK_DURATION;
    }
    if (ticksRan) {
      input.consumeEdgeInputs();
    }

    // Update loot search timer
    if (isLootOpen()) {
      updateLootSearch(ticksRan ? 1 : 0);

      // Close loot screen if player took damage this frame
      for (const ev of frameEvents) {
        if (ev.type === 'player_hit') {
          closeLootScreen();
          break;
        }
      }
    }

    // Interaction prompt: show when near a loot container (extraction mode only)
    if (state.gameMode === 'extraction' && !isLootOpen() && !isInventoryOpen()) {
      const nearby = findNearestLootContainer(
        state,
        (inventoryConfig as InventoryConfig).lootInteractionRadius,
      );
      if (nearby) {
        interactPrompt.classList.remove('hidden');
      } else {
        interactPrompt.classList.add('hidden');
      }
    } else {
      interactPrompt.classList.add('hidden');
    }

    // Log events to dev console
    if (isDevConsoleVisible() && frameEvents.length > 0) {
      for (const ev of frameEvents) {
        if (ev.type === 'enemy_spawned') continue; // too noisy
        const data = ev.data ? ' ' + JSON.stringify(ev.data) : '';
        logToConsole(`[${ev.tick}] ${ev.type}${data}`);
      }
    }

    if (state.extracted && !gameOverShown) {
      gameOverShown = true;
      // Convert backpack cash_stack items to stash cash
      const backpackCash = countItemInBackpack(state.player.inventory, 'cash_stack');
      if (backpackCash > 0) {
        addCashToStash(backpackCash);
        removeItemFromBackpack(state.player.inventory, 'cash_stack', backpackCash);
      }
      // Save armor HP on successful extraction
      if (equippedArmor) {
        setArmorHp(equippedArmor, state.player.armorHp);
      }
      // Save inventory on successful extraction
      savePlayerInventory(state.player.inventory);
      showExtractionSuccess(state.score, backpackCash, state.runStats);
      if (mobile) (input as TouchInputHandler).setVisible(false);
      hideHudHotbar();
      closeLootScreen();
      closeInventoryScreen();
      screen = 'gameOver';
    } else if (state.gameOver && !gameOverShown) {
      gameOverShown = true;
      // On death in extraction: lose equipped weapon (except pistol) and armor
      // The inventory is NOT saved — everything brought into the raid is lost
      if (state.gameMode === 'extraction') {
        const inv = loadPlayerInventory(inventoryConfig.backpackSize);
        // Remove equipped weapon if not pistol
        if (equippedWeapon !== 'pistol' && inv.equipment.weapon1?.defId === equippedWeapon) {
          inv.equipment.weapon1 = null;
        }
        // Remove equipped armor
        if (equippedArmor && inv.equipment.armor) {
          inv.equipment.armor = null;
        }
        // Give back a pistol if weapon1 is now empty
        if (!inv.equipment.weapon1) {
          inv.equipment.weapon1 = { defId: 'pistol', quantity: 1, upgradeLevel: getWeaponUpgradeLevel('pistol') };
        }
        savePlayerInventory(inv);
      }
      // Build lost gear string
      const lostParts: string[] = [];
      if (equippedWeapon !== 'pistol') lostParts.push(equippedWeapon);
      if (equippedArmor) lostParts.push(`${equippedArmor} armor`);
      const lostGear = lostParts.length > 0 ? lostParts.join(' + ') : undefined;
      showGameOver(state.score, state.gameMode, lostGear, state.runStats);
      if (mobile) (input as TouchInputHandler).setVisible(false);
      screen = 'gameOver';
    }

    // Handle weapon swap events — update weapon config/display
    for (const ev of frameEvents) {
      if (ev.type === 'weapon_swap') {
        const wt = state.player.activeWeapon;
        const wc = runConfigs.weapons[wt];
        setWeaponConfig(wc);
        setActiveWeaponName(wt);
        renderer.setWeaponConfig(wc);
        const upgradeLevel = state.gameMode === 'extraction' ? getWeaponUpgradeLevel(wt) : 0;
        renderer.setPlayerWeapon(wt, upgradeLevel);
      }
    }

    // Process hit stop events
    for (const ev of frameEvents) {
      if (ev.type === 'enemy_killed') {
        const headshot = ev.data?.headshot === true;
        if (headshot) {
          timeScale = 0.05;
          hitStopTimer = 0.08;
        } else {
          timeScale = 0.1;
          hitStopTimer = 0.05;
        }
      } else if (ev.type === 'multikill') {
        timeScale = 0.05;
        hitStopTimer = 0.12;
      } else if (ev.type === 'grenade_exploded') {
        timeScale = 0.15;
        hitStopTimer = 0.1;
      }
    }

    renderer.syncState(state, scaledDt);
    renderer.updateParticles(scaledDt, frameEvents, state);
    audioSystem.processEvents(frameEvents, state);
    renderer.render();
    updateHUD(state);
    if (state.gameMode === 'extraction') {
      updateHudHotbar(state.player.inventory);
    }
  } else if (screen === 'homebase' && homebase) {
    // Homebase: player movement + interaction prompts
    input.setPlayerPos(homebase.state.playerPos);
    input.setEnemies([]);
    const currentInput = input.getInput();

    // Suppress input when overlay is open
    if (isShopOpen() || isStashOpen()) {
      currentInput.moveDir = { x: 0, y: 0 };
      currentInput.fire = false;
      currentInput.firePressed = false;
      currentInput.dodge = false;
      currentInput.reload = false;
      currentInput.interact = false;
    }

    accumulator += dt;
    while (accumulator >= TICK_DURATION) {
      homebaseTick(homebase, currentInput, configs.player);
      accumulator -= TICK_DURATION;
    }
    input.consumeEdgeInputs();

    // Update interaction prompt
    const ia = homebase.state.nearestInteractable;
    if (ia && !isShopOpen() && !isStashOpen()) {
      homebasePrompt.classList.remove('hidden');
      if (ia.type === 'shop') homebasePrompt.innerHTML = '<kbd>F</kbd> Shop';
      else if (ia.type === 'stash') homebasePrompt.innerHTML = '<kbd>F</kbd> Stash';
      else if (ia.type === 'raid') homebasePrompt.innerHTML = '<kbd>F</kbd> Start Raid';
    } else {
      homebasePrompt.classList.add('hidden');
    }

    renderer.syncHomebase(homebase.state, dt);
    renderer.render();
  } else if (screen === 'paused' || screen === 'gameOver') {
    // Still render the scene (visible behind overlay)
    renderer.syncState(game.state, dt);
    renderer.updateParticles(dt, [], game.state);
    renderer.render();
    updateHUD(game.state);
  } else if (screen === 'replay') {
    if (replayViewer) {
      replayViewer.update(dt);
      updateHUD(replayViewer.getState());
    }
  }

  requestAnimationFrame(gameLoop);
}

// ---- Boot ----

// Fullscreen button on start screen
const fullscreenBtn = document.getElementById('fullscreen-btn');
if (fullscreenBtn) {
  fullscreenBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Don't trigger start game
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  });
}

import RAPIER from '@dimforge/rapier2d-deterministic-compat';

// Create interaction prompt element
const interactPrompt = document.createElement('div');
interactPrompt.id = 'interact-prompt';
interactPrompt.className = 'hidden';
interactPrompt.innerHTML = '<kbd>F</kbd> Search';
document.getElementById('game-container')!.appendChild(interactPrompt);

async function boot(): Promise<void> {
  await RAPIER.init();
  showStartScreen();
  loadWeaponModels().catch(console.error);
  requestAnimationFrame(gameLoop);
}

boot();
