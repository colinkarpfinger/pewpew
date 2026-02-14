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
import { addCashToStash, removeWeapon, removeArmor, getBandages, getWeaponUpgradeLevel, getArmorHp, setArmorHp, clearArmorHp } from './persistence.ts';
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
import { setupLootScreen, openLootScreen, closeLootScreen, isLootOpen, updateLootSearch } from './ui/loot-screen.ts';
import { findNearestLootContainer } from './simulation/loot-containers.ts';
import { initHudHotbar, updateHudHotbar, showHudHotbar, hideHudHotbar } from './ui.ts';
import { syncInventoryToPlayer, createEmptyInventory, addItemToBackpack } from './simulation/inventory.ts';
import { ARMOR_TYPE_TO_ITEM } from './simulation/items.ts';
import { savePlayerInventory } from './persistence.ts';
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
type Screen = 'start' | 'hub' | 'playing' | 'paused' | 'gameOver' | 'replay';
let screen: Screen = 'start';
let equippedWeapon: WeaponType = 'pistol';
let equippedArmor: ArmorType | null = null;
let runConfigs: GameConfigs = configs; // effective configs for current run (with upgrades applied)

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
setupInventoryScreen(() => {
  // On change: sync inventory to player legacy fields
  if (game) {
    syncInventoryToPlayer(game.state.player, runConfigs);
  }
});
setupStashScreen(() => {
  // On stash close: return to hub
  showHubScreen();
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

  // Set bandage counts from persistence and build inventory
  if (mode === 'extraction') {
    const bandageStock = getBandages();
    game.state.player.bandageSmallCount = bandageStock.small;
    game.state.player.bandageLargeCount = bandageStock.large;

    // Load armor HP from persistence (default to maxHp if not saved)
    if (equippedArmor && game.state.player.armorMaxHp > 0) {
      const savedHp = getArmorHp(equippedArmor);
      if (savedHp !== undefined) {
        game.state.player.armorHp = Math.min(savedHp, game.state.player.armorMaxHp);
        // If armor HP was 0 from persistence, it's broken
        if (game.state.player.armorHp <= 0) {
          game.state.player.armorHp = 0;
          game.state.player.armorDamageReduction = 0;
        }
      }
    }

    // Build a fresh raid inventory with only the selected loadout
    const inv = createEmptyInventory(inventoryConfig.backpackSize);
    // Equip selected weapon
    inv.equipment.weapon1 = {
      defId: activeWeapon,
      quantity: 1,
      upgradeLevel: getWeaponUpgradeLevel(activeWeapon),
    };
    // Equip selected armor
    if (equippedArmor) {
      const armorItemId = ARMOR_TYPE_TO_ITEM[equippedArmor] ?? `${equippedArmor}_armor`;
      inv.equipment.armor = {
        defId: armorItemId,
        quantity: 1,
        currentHp: game.state.player.armorHp > 0 ? game.state.player.armorHp : undefined,
      };
    }
    // Put bandages in backpack
    if (bandageStock.small > 0) {
      addItemToBackpack(inv, { defId: 'bandage_small', quantity: bandageStock.small });
    }
    if (bandageStock.large > 0) {
      addItemToBackpack(inv, { defId: 'bandage_large', quantity: bandageStock.large });
    }
    game.state.player.inventory = inv;
    syncInventoryToPlayer(game.state.player, effectiveConfigs);
  }

  fullRecorder = new FullRecorder(currentSeed, configsJson);
  ringRecorder = new RingRecorder(game);

  const weaponConfig = effectiveConfigs.weapons[activeWeapon];
  setWeaponConfig(weaponConfig);
  setActiveWeaponName(activeWeapon);

  rebuildScene();
  renderer.initArena(game.state);
  renderer.setPlayerArmor(equippedArmor);
  renderer.setDodgeDuration(configs.player.dodgeDuration);
  renderer.setWeaponConfig(weaponConfig);
  renderer.setBandageConfig(bandagesConfig as BandageConfig);
  const upgradeLevel = mode === 'extraction' ? getWeaponUpgradeLevel(activeWeapon) : 0;
  renderer.setPlayerWeapon(activeWeapon, upgradeLevel);
  audioSystem.init();
  gameOverShown = false;
  hideGameOver();
  hideStartScreen();
  hideHubScreen();
  hideEscapeMenu();
  hideReplayControls();
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
  if (screen === 'playing' || screen === 'gameOver') {
    showEscapeMenu();
    if (mobile) (input as TouchInputHandler).setVisible(false);
    screen = 'paused';
  }
}

function resumeGame(): void {
  hideEscapeMenu();
  const resumeToPlaying = !gameOverShown;
  if (mobile && resumeToPlaying) (input as TouchInputHandler).setVisible(true);
  screen = resumeToPlaying ? 'playing' : 'gameOver';
  lastTime = performance.now();
  accumulator = 0;
}

// Wire up mobile pause button
if (mobile) {
  (input as TouchInputHandler).setPauseHandler(pauseGame);
}

// ---- Escape key ----
window.addEventListener('keydown', (e) => {
  // F key: toggle loot screen
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
    closeLootScreen();
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

  // Close stash screen on Escape → return to hub
  if (e.key === 'Escape' && isStashOpen()) {
    closeStashScreen();
    return;
  }

  if (e.key === 'Escape') {
    if (screen === 'playing' || screen === 'gameOver') {
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
}, shopConfig.prices, configs.weapons, shopConfig.armorPrices, armorConfig, shopConfig.bandagePrices, weaponUpgradesConfig as unknown as WeaponUpgradesConfig);

// ---- Start screen ----
onStartGame((mode) => {
  if (screen === 'start') {
    if (mode === 'extraction') {
      hideStartScreen();
      showHubScreen();
      screen = 'hub';
    } else {
      startGame('arena');
    }
  }
});

// ---- Restart from game over ----
onRestart(() => {
  if (screen === 'gameOver') {
    if (game.state.gameMode === 'extraction') {
      hideGameOver();
      if (!mobile) hideCrosshair();
      showHubScreen();
      screen = 'hub';
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
      addCashToStash(state.runCash);
      // Save armor HP on successful extraction
      if (equippedArmor) {
        setArmorHp(equippedArmor, state.player.armorHp);
      }
      // Save inventory on successful extraction
      savePlayerInventory(state.player.inventory);
      showExtractionSuccess(state.score, state.runCash, state.runStats);
      if (mobile) (input as TouchInputHandler).setVisible(false);
      hideHudHotbar();
      closeLootScreen();
      closeInventoryScreen();
      screen = 'gameOver';
    } else if (state.gameOver && !gameOverShown) {
      gameOverShown = true;
      // Cash is NOT added to stash on death — it's lost
      if (state.gameMode === 'extraction') {
        removeWeapon(equippedWeapon);
        if (equippedArmor) {
          removeArmor(equippedArmor);
          clearArmorHp(equippedArmor);
        }
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
