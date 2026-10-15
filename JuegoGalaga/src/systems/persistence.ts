export interface Settings { music: number; effects: number; muted: boolean; reducedMotion: boolean; autoFire: boolean }
export const DEFAULT_SETTINGS: Settings = { music: 0.35, effects: 0.55, muted: false, reducedMotion: false, autoFire: true };
export const SHIP_PALETTES = [
  { id: 'aether', name: 'AETHER', description: 'Cian · violeta · ámbar', primary: 0x31e7ff, secondary: 0x9461ff, accent: 0xffcb66 },
  { id: 'eclipse', name: 'ECLIPSE', description: 'Magenta · violeta · oro', primary: 0xff4fb8, secondary: 0x9461ff, accent: 0xffcb66 },
  { id: 'verdant', name: 'VERDANT', description: 'Menta · azul · lima', primary: 0x5cf2c2, secondary: 0x31a7ff, accent: 0xecff77 },
  { id: 'solar', name: 'SOLAR', description: 'Ámbar · coral · hielo', primary: 0xffcb66, secondary: 0xff6f91, accent: 0xeef7ff },
  { id: 'crimson', name: 'CRIMSON', description: 'Coral · granate · oro', primary: 0xf26d7d, secondary: 0x87284b, accent: 0xffd166 },
  { id: 'abyss', name: 'ABYSS', description: 'Azul · índigo · aqua', primary: 0x4bb7ff, secondary: 0x5e5bdc, accent: 0x83fff0 },
  { id: 'aurora', name: 'AURORA', description: 'Menta · turquesa · rosa', primary: 0x8cf0c6, secondary: 0x228f9b, accent: 0xff9ad5 },
  { id: 'lumen', name: 'LUMEN', description: 'Lavanda · violeta · lima', primary: 0xc5a8ff, secondary: 0x6d4ad6, accent: 0xd8ff72 },
] as const;
export type ShipPalette = (typeof SHIP_PALETTES)[number];
export type ShipPaletteId = ShipPalette['id'];
const SHIP_PALETTE_KEY = 'void-pulse-ship-palette-v1';
const BEST_KEY = 'void-pulse-best-v1';
const SETTINGS_KEY = 'void-pulse-settings-v1';
export function getShipPalette(): ShipPalette {
  try {
    const id = localStorage.getItem(SHIP_PALETTE_KEY);
    return SHIP_PALETTES.find((palette) => palette.id === id) ?? SHIP_PALETTES[0];
  } catch { return SHIP_PALETTES[0]; }
}
export function saveShipPalette(id: ShipPaletteId): ShipPalette {
  const palette = SHIP_PALETTES.find((item) => item.id === id) ?? SHIP_PALETTES[0];
  try { localStorage.setItem(SHIP_PALETTE_KEY, palette.id); } catch { /* storage may be disabled */ }
  return palette;
}
export function getBest(): number { try { return Number(localStorage.getItem(BEST_KEY) ?? 0) || 0; } catch { return 0; } }
export function saveBest(score: number): number {
  const best = Math.max(getBest(), score);
  try { localStorage.setItem(BEST_KEY, String(best)); } catch { /* storage may be disabled */ }
  return best;
}
export function getSettings(): Settings {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<Settings> }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}
export function saveSettings(settings: Settings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* storage may be disabled */ }
}
