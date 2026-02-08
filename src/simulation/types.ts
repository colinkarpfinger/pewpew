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

export interface GameConfigs {
  player: PlayerConfig;
  weapons: WeaponsConfig;
  enemies: EnemiesConfig;
  spawning: SpawningConfig;
  arena: ArenaConfig;
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
}

export interface Projectile {
  id: number;
  pos: Vec2;
  vel: Vec2;
  damage: number;
  lifetime: number; // ticks remaining
  headshotTargetId: number | null; // enemy ID whose head was under cursor at fire time
}

export interface Obstacle {
  pos: Vec2; // center
  width: number;
  height: number;
}

// ---- Input ----

export interface InputState {
  moveDir: Vec2; // normalized or zero
  aimDir: Vec2; // normalized, world-space direction from player
  fire: boolean;
  headshotTargetId: number | null; // enemy ID whose head is under cursor
  dodge: boolean; // edge-detected: true only on press frame
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
  | 'player_dodge_start';

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
  obstacles: Obstacle[];
  arena: ArenaConfig;
  score: number;
  gameOver: boolean;
  nextEntityId: number;
  spawner: SpawnerState;
  events: GameEvent[];
}

export const TICK_RATE = 60;
export const TICK_DURATION = 1 / TICK_RATE;
