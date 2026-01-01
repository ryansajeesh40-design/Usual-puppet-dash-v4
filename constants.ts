
export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 450;
export const BLOCK_SIZE = 40;
export const PLAYER_SIZE = 36;
export const GRAVITY = 0.8;
export const JUMP_FORCE = -12;
export const FORWARD_SPEED = 5;

export const THEME = {
  primary: '#00f2ff',
  secondary: '#ff00ea',
  background: '#0a0a0a',
  surface: '#1a1a1a',
  text: '#ffffff',
  accent: '#7000ff'
};

export const INITIAL_LEVELS: any[] = [
  {
    id: '1',
    name: 'Puppet Genesis',
    difficulty: 'Easy',
    objects: [
      { id: 'b1', type: 'SPIKE', x: 600, y: 360 },
      { id: 'b2', type: 'SPIKE', x: 900, y: 360 },
      { id: 'b3', type: 'BLOCK', x: 1200, y: 320 },
      { id: 'b4', type: 'BLOCK', x: 1240, y: 320 },
      { id: 'b5', type: 'SPIKE', x: 1400, y: 360 },
      { id: 'b6', type: 'SPIKE', x: 1440, y: 360 },
      { id: 'b7', type: 'BLOCK', x: 1700, y: 280 },
      { id: 'b8', type: 'BLOCK', x: 1740, y: 280 },
      { id: 'b9', type: 'SPIKE', x: 1780, y: 360 },
    ]
  },
  {
    id: '2',
    name: 'Neon Strings',
    difficulty: 'Medium',
    objects: [
        { id: 's1', type: 'SPIKE', x: 500, y: 360 },
        { id: 's2', type: 'SPIKE', x: 540, y: 360 },
        { id: 'b1', type: 'BLOCK', x: 800, y: 320 },
        { id: 'b2', type: 'BLOCK', x: 840, y: 320 },
        { id: 's3', type: 'SPIKE', x: 840, y: 280 },
    ]
  }
];
