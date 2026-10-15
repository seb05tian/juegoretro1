import { describe, expect, it } from 'vitest';
import { activateResonance, awardKill, bossPhase, expireCombo, mayFire, movePlayer, normalizedInput, playerShotOffsets, seededRandom, takeDamage, waveMembers, type PlayerState, type ScoreState } from '../src/systems/logic';
import { PLAYER, RESONANCE } from '../src/config/balance';

const player = (): PlayerState => ({ x: 270, y: 820, hp: 3, maxHp: 3, energy: 0, invulnerableUntil: 0, shieldUntil: 0, fireAt: 0, weapon: 'single', weaponUntil: 0 });
const score = (): ScoreState => ({ score: 0, combo: 0, multiplier: 1, lastKillAt: -9999, kills: 0 });

describe('movimiento y armas', () => {
  it('normaliza la diagonal y limita velocidad por delta', () => {
    const direction = normalizedInput(1, 1);
    expect(Math.hypot(direction.x, direction.y)).toBeCloseTo(1);
    const moved = movePlayer({ x: 270, y: 820 }, direction, 0.05);
    expect(Math.hypot(moved.x - 270, moved.y - 820)).toBeCloseTo(PLAYER.speed * 0.05);
  });
  it('limita la nave a las cuatro bandas permitidas', () => {
    expect(movePlayer({ x: PLAYER.minX, y: PLAYER.minY }, { x: -1, y: -1 }, 0.05)).toEqual({ x: PLAYER.minX, y: PLAYER.minY });
    expect(movePlayer({ x: PLAYER.maxX, y: PLAYER.maxY }, { x: 1, y: 1 }, 0.05)).toEqual({ x: PLAYER.maxX, y: PLAYER.maxY });
  });
  it('usa un único intervalo global de 180 ms', () => {
    const p = player();
    expect(mayFire(p, 0)).toBe(true);
    expect(mayFire(p, 179)).toBe(false);
    expect(mayFire(p, 180)).toBe(true);
  });
  it('keeps the base and piercing shots straight and makes the gift triple', () => {
    expect(playerShotOffsets('single')).toEqual([0]);
    expect(playerShotOffsets('pierce')).toEqual([0]);
    expect(playerShotOffsets('triple')).toEqual([-12, 0, 12]);
  });
});

describe('daño y resonancia', () => {
  it('aplica una sola vida por impacto y respeta 1,1 s de invulnerabilidad', () => {
    const p = player();
    expect(takeDamage(p, 100)).toBe('hit');
    expect(p.hp).toBe(2);
    expect(takeDamage(p, 500)).toBe('blocked');
    expect(takeDamage(p, 1_201)).toBe('hit');
    expect(takeDamage(p, 2_302)).toBe('dead');
    expect(p.hp).toBe(0);
    expect(takeDamage(p, 3_500)).toBe('dead');
    expect(p.hp).toBe(0);
  });
  it('consume un escudo con el primer impacto y conserva la vida', () => {
    const p = player(); p.shieldUntil = 5_000;
    expect(takeDamage(p, 1_000)).toBe('shield');
    expect(p.hp).toBe(3);
    expect(p.shieldUntil).toBe(0);
    expect(takeDamage(p, 1_200)).toBe('blocked');
  });
  it('no activa el pulso antes de 100 de energía', () => {
    const p = player(); p.energy = 99;
    expect(activateResonance(p, [{ x: 270, y: 700, vx: 0, vy: 200 }], 1_000)).toHaveLength(0);
    expect(p.energy).toBe(99);
  });
  it('convierte como máximo 12 proyectiles cercanos, los marca y protege 250 ms', () => {
    const p = player(); p.energy = 100;
    const bolts = Array.from({ length: 15 }, (_, index) => ({ x: 270 + index, y: 820, vx: 0, vy: 200 }));
    const converted = activateResonance(p, bolts, 1_000);
    expect(converted).toHaveLength(RESONANCE.maxConverted);
    expect(converted.every((bolt) => bolt.converted && bolt.vy < 0)).toBe(true);
    expect(p.energy).toBe(0);
    expect(p.invulnerableUntil).toBe(1_250);
    expect(activateResonance(p, bolts, 1_100)).toHaveLength(0);
  });
});

describe('oleadas, jefe y puntuación', () => {
  it('define las cuatro oleadas iniciales con cantidades y tipos correctos', () => {
    expect(waveMembers(1)).toHaveLength(8);
    expect(waveMembers(2)).toHaveLength(12);
    expect(waveMembers(2).filter((kind) => kind === 'striker')).toHaveLength(2);
    expect(waveMembers(3).filter((kind) => kind === 'bulwark')).toHaveLength(2);
    expect(waveMembers(4).filter((kind) => kind === 'orbiter')).toHaveLength(3);
    expect(waveMembers(6)).toHaveLength(0);
  });
  it('cambia fases exactamente en los umbrales del 60% y 25%', () => {
    expect(bossPhase(120, 120)).toBe(1);
    expect(bossPhase(72, 120)).toBe(2);
    expect(bossPhase(30, 120)).toBe(3);
  });
  it('suma puntos una sola vez y escala el combo hasta ×5', () => {
    const s = score(); const enemy = { kind: 'scout' as const, hp: 0, dead: false };
    expect(awardKill(s, enemy, 100)).toBe(100);
    expect(awardKill(s, enemy, 200)).toBe(0);
    for (let i = 1; i < 15; i++) awardKill(s, { kind: 'scout', hp: 0, dead: false }, 200 + i * 100);
    expect(s.multiplier).toBe(5);
    expect(s.kills).toBe(15);
    expect(s.score).toBeGreaterThan(0);
  });
  it('reinicia cadena al superar 2,5 segundos', () => {
    const s = score();
    awardKill(s, { kind: 'scout', hp: 0, dead: false }, 0);
    expireCombo(s, 2_501);
    expect(s.combo).toBe(0);
    expect(s.multiplier).toBe(1);
  });
  it('reproduce secuencias aleatorias con la misma semilla', () => {
    const a = seededRandom(23); const b = seededRandom(23);
    expect(Array.from({ length: 8 }, a)).toEqual(Array.from({ length: 8 }, b));
  });
});
