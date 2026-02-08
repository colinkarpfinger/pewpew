// ---- Configs ----

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
  magazineSize: number;
  reloadTime: number; // ticks
  activeReloadStart: number; // fraction 0-1
  activeReloadEnd: number;
  perfectReloadStart: number;
  perfectReloadEnd: number;
  activeReloadDamageBonus: number; // multiplier (e.g. 1.1 = +10%)
  perfectReloadDamageBonus: number;
}

export interface WeaponsConfig {
  rifle: WeaponConfig;
}

export interface EnemyTypeConfig {
  speed: number;
  hp: number;
  contactDamage: number;
  radius: number;
  scoreValue: number;
}

export interface EnemiesConfig {
  rusher: EnemyTypeConfig;
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
}

export interface GameConfigs {
  player: PlayerConfig;
  weapons: WeaponsConfig;
  enemies: EnemiesConfig;
  spawning: SpawningConfig;
  arena: ArenaConfig;
  multikill: MultiKillConfig;
  grenade: GrenadeConfig;
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
  damageBonusMultiplier: number; // from active/perfect reload, resets on next reload
  speedBoostTimer: number; // ticks remaining for multi-kill speed boost
  speedBoostMultiplier: number; // current speed multiplier from multi-kill
}

export interface Enemy {
  id: number;
  type: 'rusher';
  pos: Vec2;
  hp: number;
  radius: number;
  speed: number;
  contactDamage: number;
  scoreValue: number;
  knockbackVel: Vec2;
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
  | 'grenade_exploded';

export interface GameEvent {
  tick: number;
  type: GameEventType;
  data?: Record<string, unknown>;
}

// ---- Game State ----

export interface SpawnerState {
  timer: number; // ticks until next spawn
  currentInterval: number;
}

export interface GameState {
  tick: number;
  player: Player;
  enemies: Enemy[];
  projectiles: Projectile[];
  grenades: Grenade[];
  obstacles: Obstacle[];
  arena: ArenaConfig;
  grenadeAmmo: number;
  score: number;
  gameOver: boolean;
  nextEntityId: number;
  spawner: SpawnerState;
  events: GameEvent[];
}

export const TICK_RATE = 60;
export const TICK_DURATION = 1 / TICK_RATE;
