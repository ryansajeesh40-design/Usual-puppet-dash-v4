
export enum ObjectType {
  BLOCK = 'BLOCK',
  SPIKE = 'SPIKE',
  PORTAL_SHIP = 'PORTAL_SHIP',
  PORTAL_BALL = 'PORTAL_BALL',
  PORTAL_UFO = 'PORTAL_UFO',
  PORTAL_WAVE = 'PORTAL_WAVE',
  PORTAL_ROBOT = 'PORTAL_ROBOT',
  PORTAL_SPIDER = 'PORTAL_SPIDER',
  PORTAL_SWING = 'PORTAL_SWING',
  PORTAL_JETPACK = 'PORTAL_JETPACK',
  PORTAL_CUBE = 'PORTAL_CUBE'
}

export interface GameObject {
  id: string;
  type: ObjectType;
  x: number;
  y: number;
  z?: number; // Layering property: higher means front
}

export interface LevelData {
  id: string;
  name: string;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Demon';
  objects: GameObject[];
  bestScore?: number;
}

export interface UserSettings {
  speed: number;
  primaryColor: string;
  secondaryColor: string;
  volume: number;
}

export type PlayerMode = 'CUBE' | 'SHIP' | 'BALL' | 'UFO' | 'WAVE' | 'ROBOT' | 'SPIDER' | 'SWING' | 'JETPACK';

export interface GameState {
  player: {
    x: number;
    y: number;
    vy: number;
    rotation: number;
    isDead: boolean;
    isJumping: boolean;
    mode: PlayerMode;
    gravityDir: 1 | -1;
  };
  cameraX: number;
  activeLevel: LevelData | null;
  status: 'IDLE' | 'PLAYING' | 'GAMEOVER' | 'EDITOR' | 'WIN';
}

export type AppView = 'MENU' | 'PLAY' | 'EDITOR' | 'LEVEL_SELECT' | 'SETTINGS';
