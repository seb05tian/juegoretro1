export const WORLD = { width: 540, height: 960 } as const;
export const PLAYER = { speed: 380, radius: 16, minX: 32, maxX: 508, minY: 580, maxY: 900, fireMs: 180, boltSpeed: 720, lives: 3 } as const;
export const PICKUP = { giftFirstMs: 20_000, giftIntervalMs: 30_000, giftSpawnY: 144, giftFallSpeed: 120, fallSpeed: 75 } as const;
export const PALETTE = { space: 0x070b1a, deep: 0x0d1230, cyan: 0x31e7ff, pink: 0xff4fb8, violet: 0x9461ff, gold: 0xffcb66, white: 0xeef7ff } as const;
export const ENEMY = {
  scout: { hp: 1, score: 100, energy: 10, radius: 15, color: 0xff4fb8 },
  striker: { hp: 2, score: 160, energy: 15, radius: 19, color: 0xff8a68 },
  bulwark: { hp: 5, score: 300, energy: 20, radius: 27, color: 0x9461ff },
  orbiter: { hp: 3, score: 220, energy: 15, radius: 21, color: 0xffcb66 },
} as const;
export type EnemyKind = keyof typeof ENEMY;
export const WAVE_LIST: ReadonlyArray<ReadonlyArray<EnemyKind>> = [
  ['scout', 'scout', 'scout', 'scout', 'scout', 'scout', 'scout', 'scout'],
  ['scout', 'scout', 'scout', 'scout', 'scout', 'scout', 'scout', 'scout', 'scout', 'scout', 'striker', 'striker'],
  ['scout', 'scout', 'scout', 'scout', 'scout', 'scout', 'scout', 'scout', 'striker', 'striker', 'striker', 'striker', 'bulwark', 'bulwark'],
  ['scout', 'scout', 'scout', 'scout', 'scout', 'scout', 'striker', 'striker', 'striker', 'striker', 'orbiter', 'orbiter', 'orbiter'],
];
export const RESONANCE = { max: 100, radius: 170, maxConverted: 12, invulnerableMs: 250 } as const;
