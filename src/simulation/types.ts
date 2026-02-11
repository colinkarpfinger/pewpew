// ---- Configs ----

export type WeaponType = 'pistol' | 'smg' | 'rifle' | 'shotgun' | 'machinegun';
export type ArmorType = 'light' | 'medium' | 'heavy';
export type GameMode = 'arena' | 'extraction';
export type EnemyType = 'sprinter' | 'gunner' | 'shotgunner' | 'sniper';

export type BandageType = 'small' | 'large';

export interface BandageTierConfig {
  healAmount: number;
  healTime: number; // ticks
  speedMultiplier: number;
  activeHealStart: number; // fraction 0-1
  activeHealEnd: number;
  perfectHealStart: number;
  perfectHealEnd: number;
  activeHealBonus: number; // multiplier on heal amount
  perfectHealBonus: number;
}

export type BandageConfig = Record<BandageType, BandageTierConfig>;

export interface PlayerConfig {
  speed: number;
  hp: number;
  radius: number;
  iframeDuration: number; // ticks
  dodgeDuration: number; // ticks
  dodgeCooldown: number; // ticks after dodge ends
  dodgeSpeedMultiplier: number;
}

export interface WeaponConfig {
  damage: number;
  fireRate: number; // shots per second
  projectileSpeed: number;
  projectileLifetime: number; // ticks
  spread: number; // radians
  movingSpreadMultiplier: number; // multiplier applied to spread when player is moving
  headshotMultiplier: number;
  penetration: number; // max enemies a bullet can hit (requires first-hit headshot)
  knockback: number; // knockback speed applied to enemies on hit
  headshotKnockbackMultiplier: number;
  pelletsPerShot?: number; // for shotgun; defaults to 1
  magazineSize: number;
  reloadTime: number; // ticks
  activeReloadStart: number; // fraction 0-1
  activeReloadEnd: number;
  perfectReloadStart: number;
  perfectReloadEnd: number;
  activeReloadDamageBonus: number; // multiplier (e.g. 1.1 = +10%)
  perfectReloadDamageBonus: number;
  recoilAim: number; // 0-1 scale for crosshair kick on fire
  recoilScreen: number; // 0-1 scale for camera shake on fire
}

export type WeaponsConfig = Record<WeaponType, WeaponConfig>;

export interface EnemyTypeConfig {
  speed: number;
  hp: number;
  contactDamage: number;
  radius: number;
  scoreValue: number;
}

export interface EnemiesConfig {
  sprinter: EnemyTypeConfig;
  gunner: EnemyTypeConfig;
  shotgunner: EnemyTypeConfig;
  sniper: EnemyTypeConfig;
  armorChance?: number;
  helmetChance?: number;
  armorDamageReduction?: number;
  helmetHeadshotReduction?: number;
}

export interface SpawningConfig {
  initialInterval: number; // ticks between spawns
  minimumInterval: number;
  decayRate: number; // multiplier per spawn
  maxEnemies: number;
}

export interface ArenaConfig {
  width: number;
  height: number;
  obstacleCount: number;
  obstacleSize: number;
}

export interface MultiKillTier {
  kills: number;
  speedMultiplier: number;
  duration: number; // ticks
  pulseForce: number;
}

export interface MultiKillConfig {
  minKills: number;
  tiers: MultiKillTier[];
  pulseRadius: number;
}

export interface GrenadeConfig {
  minSpeed: number;        // launch speed at minimum charge
  maxSpeed: number;        // launch speed at full charge
  radius: number;
  fuseTime: number;        // ticks
  gravity: number;         // vertical acceleration (units/s²)
  damageRadius: number;
  knockbackRadius: number;
  damage: number;
  knockbackForce: number;
  groundFriction: number;  // per-tick velocity multiplier when rolling on ground
  bounceRestitution: number; // velocity preserved on bounce
  startingAmmo: number;
  selfDamageMultiplier: number; // fraction of grenade damage applied to player
}

export interface CrateConfig {
  dropChance: number;
  multikillDropChance: number;
  lifetime: number; // ticks
  blinkThreshold: number; // ticks remaining when blinking starts
  radius: number;
  types: Record<string, number>; // type name → weight
  healthAmount: number;
}

export interface CashConfig {
  sprinterBills: number[];
  gunnerBills: number[];
  shotgunnerBills?: number[];
  sniperBills?: number[];
  denomination: number;
  scatterRadius: number;
  pickupRadius: number;
}

export interface GunnerConfig {
  projectileDamage: number;
  projectileSpeed: number;
  projectileLifetime: number; // ticks
  fireCooldownTicks: number;
  engageRange: number;
  retreatRange: number;
  spread: number; // radians
  advanceDuration: number; // ticks
  retreatDuration: number; // ticks
  retreatSpeedMultiplier: number;
}

export interface RangedEnemyConfig {
  projectileDamage: number;
  projectileSpeed: number;
  projectileLifetime: number; // ticks
  fireCooldownTicks: number;
  engageRange: number;
  retreatRange: number;
  spread: number; // radians
  advanceDuration: number; // ticks
  retreatDuration: number; // ticks
  retreatSpeedMultiplier: number;
  preferredRange?: number; // sniper stays at this distance
  pelletsPerShot?: number; // shotgunner fires multiple pellets
  telegraphTicks?: number; // ticks of laser telegraph before firing (sniper)
}

export interface ArmorTierConfig {
  damageReduction: number;
  maxHp: number;
}

export type ArmorConfig = Record<ArmorType, ArmorTierConfig>;

export interface WeaponUpgradeLevel {
  price: number;
  damageBonus: number;
  fireRateBonus: number;
  magazineSizeBonus: number;
  reloadTimeReduction: number; // ticks to subtract from reload time
}

export interface WeaponUpgradeConfig {
  maxLevel: number;
  levels: WeaponUpgradeLevel[];
}

export type WeaponUpgradesConfig = Record<WeaponType, WeaponUpgradeConfig>;

export interface GameConfigs {
  player: PlayerConfig;
  weapons: WeaponsConfig;
  enemies: EnemiesConfig;
  spawning: SpawningConfig;
  arena: ArenaConfig;
  multikill: MultiKillConfig;
  grenade: GrenadeConfig;
  crates: CrateConfig;
  cash?: CashConfig;
  gunner?: GunnerConfig;
  armor?: ArmorConfig;
  extractionMap?: ExtractionMapConfig;
  destructibleCrates?: DestructibleCrateConfig;
  bandages?: BandageConfig;
  shotgunner?: RangedEnemyConfig;
  sniper?: RangedEnemyConfig;
  weaponUpgrades?: WeaponUpgradesConfig;
}

// ---- Entities ----

export interface Vec2 {
  x: number;
  y: number;
}

export interface Player {
  pos: Vec2;
  hp: number;
  maxHp: number;
  radius: number;
  aimDir: Vec2; // normalized
  iframeTimer: number; // ticks remaining, 0 = vulnerable
  fireCooldown: number; // ticks remaining
  dodgeTimer: number; // ticks remaining in dodge, 0 = not dodging
  dodgeCooldown: number; // ticks remaining before dodge available again
  dodgeDir: Vec2; // locked movement direction during dodge
  ammo: number;
  reloadTimer: number; // 0 = not reloading, >0 = ticks elapsed since reload started
  reloadFumbled: boolean; // true = fumbled this cycle, ignore further reload input
  damageBonusMultiplier: number; // from active/perfect reload, resets on next reload
  speedBoostTimer: number; // ticks remaining for multi-kill speed boost
  speedBoostMultiplier: number; // current speed multiplier from multi-kill
  activeWeapon: WeaponType;
  equippedArmor: ArmorType | null;
  armorDamageReduction: number;
  armorHp: number;
  armorMaxHp: number;
  healTimer: number; // 0 = not healing, >0 = ticks elapsed
  healType: BandageType | null; // which bandage is being used
  healFumbled: boolean;
  healSpeedMultiplier: number; // 1.0 = normal, <1.0 during healing
  bandageSmallCount: number;
  bandageLargeCount: number;
}

export interface Enemy {
  id: number;
  type: EnemyType;
  pos: Vec2;
  hp: number;
  radius: number;
  speed: number;
  contactDamage: number;
  scoreValue: number;
  knockbackVel: Vec2;
  visible: boolean;
  stunTimer: number; // ticks remaining where enemy can't move
  aiState?: 'wander' | 'chase'; // extraction mode: wander until player spotted
  wanderDir?: Vec2; // current wander direction
  wanderTimer?: number; // ticks remaining before picking new wander direction
  aiPhase?: 'advance' | 'retreat';
  aiTimer?: number;
  fireCooldown?: number;
  hasArmor?: boolean;
  hasHelmet?: boolean;
  telegraphTimer?: number; // ticks remaining in telegraph phase (sniper laser)
  telegraphDir?: Vec2; // locked aim direction during telegraph
}

export interface Projectile {
  id: number;
  pos: Vec2;
  vel: Vec2;
  damage: number;
  lifetime: number; // ticks remaining
  headshotTargetId: number | null; // enemy ID whose head was under cursor at fire time
  penetrationLeft: number; // how many more enemies this bullet can hit
  hitEnemyIds: number[]; // enemies already hit (to avoid double-hits)
  killCount: number; // accumulated kills by this bullet (for multi-kill detection)
  weaponType: WeaponType;
}

export interface EnemyProjectile {
  id: number;
  pos: Vec2;
  vel: Vec2;
  damage: number;
  lifetime: number; // ticks remaining
}

export interface Obstacle {
  pos: Vec2; // center
  width: number;
  height: number;
}

export interface Grenade {
  id: number;
  pos: Vec2;
  vel: Vec2;
  height: number;      // vertical position above ground
  verticalVel: number; // vertical velocity (positive = up)
  fuseTimer: number;   // ticks remaining until explosion
}

export type CrateType = 'grenade' | 'health';

export interface Crate {
  id: number;
  pos: Vec2;
  crateType: CrateType;
  lifetime: number; // ticks remaining
}

export interface CashPickup {
  id: number;
  pos: Vec2;
  amount: number;
}

// ---- Destructible Crates ----

export interface DestructibleCrate {
  id: number;
  pos: Vec2;
  hp: number;
  maxHp: number;
  lootTier: number; // 1-4
}

export interface DestructibleCrateLootTable {
  cashBillsMin: number;
  cashBillsMax: number;
  healthChance: number;
  grenadeChance: number;
}

export interface DestructibleCrateConfig {
  hp: number;
  width: number;
  height: number;
  cashDenomination: number;
  cashScatterRadius: number;
  lootTables: DestructibleCrateLootTable[];
  proceduralCountPerZone: number[];
}

// ---- Extraction Map ----

export interface ExtractionZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TriggerRegion {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  spawnPoints: Vec2[];
  enemyCount: number;
  sprinterRatio: number;
  gunnerRatio?: number;
  shotgunnerRatio?: number;
  sniperRatio?: number;
}

export interface ZoneConfig {
  yMin: number;
  yMax: number;
  ambientInterval: number;
  sprinterRatio: number;
  gunnerRatio?: number;
  shotgunnerRatio?: number;
  sniperRatio?: number;
  initialEnemyCount?: number; // enemies pre-spawned in this zone at level start
}

export interface ExtractionMapConfig {
  width: number;
  height: number;
  playerSpawn: Vec2;
  extractionZones: ExtractionZone[];
  walls: Obstacle[];
  triggerRegions: TriggerRegion[];
  zones: ZoneConfig[];
  maxEnemies: number;
  minSpawnDistFromPlayer: number;
  enemyDetectionRange?: number; // distance at which enemies with LOS will aggro
  wanderSpeedMultiplier?: number; // fraction of normal speed while wandering
  destructibleCrates?: Vec2[]; // hand-placed crate positions
}

export interface ExtractionSpawnerState {
  ambientTimers: number[];
  triggeredRegionIds: number[];
}

// ---- Input ----

export interface InputState {
  moveDir: Vec2; // normalized or zero
  aimDir: Vec2; // normalized, world-space direction from player
  fire: boolean;
  headshotTargetId: number | null; // enemy ID whose head is under cursor
  dodge: boolean; // edge-detected: true only on press frame
  reload: boolean; // edge-detected: true only on press frame
  throwGrenade: boolean; // true on G key release frame
  throwPower: number;    // 0-1 charge fraction (how long G was held)
  healSmall: boolean; // edge-detected: true on key '4' press
  healLarge: boolean; // edge-detected: true on key '5' press
}

// ---- Events ----

export type GameEventType =
  | 'projectile_fired'
  | 'enemy_hit'
  | 'enemy_killed'
  | 'player_hit'
  | 'player_death'
  | 'enemy_spawned'
  | 'projectile_destroyed'
  | 'player_dodge_start'
  | 'reload_start'
  | 'reload_complete'
  | 'reload_fumbled'
  | 'multikill'
  | 'grenade_thrown'
  | 'grenade_bounced'
  | 'grenade_exploded'
  | 'crate_spawned'
  | 'crate_picked_up'
  | 'crate_expired'
  | 'cash_spawned'
  | 'cash_picked_up'
  | 'enemy_projectile_fired'
  | 'trigger_activated'
  | 'extraction_success'
  | 'destructible_crate_hit'
  | 'destructible_crate_destroyed'
  | 'heal_start'
  | 'heal_complete'
  | 'heal_fumbled'
  | 'heal_interrupted'
  | 'armor_broken'
  | 'sniper_telegraph';

export interface GameEvent {
  tick: number;
  type: GameEventType;
  data?: Record<string, unknown>;
}

// ---- Run Stats ----

export interface RunStats {
  enemyKills: number;
  headshotKills: number;
  bulletsFired: number;
  bulletsHit: number;
  hpLost: number;
  hpHealed: number;
  cashEarned: number;
  distanceTraveled: number;
}

// ---- Game State ----

export interface SpawnerState {
  timer: number; // ticks until next spawn
  currentInterval: number;
}

export interface GameState {
  tick: number;
  gameMode: GameMode;
  player: Player;
  enemies: Enemy[];
  projectiles: Projectile[];
  enemyProjectiles: EnemyProjectile[];
  grenades: Grenade[];
  crates: Crate[];
  cashPickups: CashPickup[];
  destructibleCrates: DestructibleCrate[];
  obstacles: Obstacle[];
  arena: ArenaConfig;
  grenadeAmmo: number;
  runCash: number;
  score: number;
  gameOver: boolean;
  nextEntityId: number;
  spawner: SpawnerState;
  events: GameEvent[];
  extractionMap: ExtractionMapConfig | null;
  extractionSpawner: ExtractionSpawnerState | null;
  extracted: boolean;
  runStats: RunStats;
}

export const TICK_RATE = 60;
export const TICK_DURATION = 1 / TICK_RATE;
