import { ENEMY, PLAYER, RESONANCE, WAVE_LIST, type EnemyKind } from '../config/balance';

export interface Point { x: number; y: number }
export interface HostileBolt extends Point { vx: number; vy: number; converted?: boolean; dead?: boolean }
export interface PlayerState extends Point {
  hp: number; maxHp: number; energy: number; invulnerableUntil: number;
  shieldUntil: number; fireAt: number; weapon: 'single' | 'triple' | 'pierce'; weaponUntil: number;
}
export interface ScoreState { score: number; combo: number; multiplier: number; lastKillAt: number; kills: number }
export interface EnemyRecord { kind: EnemyKind; hp: number; dead: boolean }

export function normalizedInput(x: number, y: number): Point {
  const length = Math.hypot(x, y);
  return length > 0 ? { x: x / length, y: y / length } : { x: 0, y: 0 };
}

export function movePlayer(position: Point, input: Point, seconds: number): Point {
  const axis = normalizedInput(input.x, input.y);
  const dt = Math.max(0, Math.min(seconds, 0.05));
  return {
    x: Math.max(PLAYER.minX, Math.min(PLAYER.maxX, position.x + axis.x * PLAYER.speed * dt)),
    y: Math.max(PLAYER.minY, Math.min(PLAYER.maxY, position.y + axis.y * PLAYER.speed * dt)),
  };
}

export function mayFire(player: PlayerState, now: number): boolean {
  if (now < player.fireAt) return false;
  player.fireAt = now + PLAYER.fireMs;
  return true;
}

export function playerShotOffsets(weapon: PlayerState['weapon']): readonly number[] {
  return weapon === 'triple' ? [-12, 0, 12] : [0];
}

export function takeDamage(player: PlayerState, now: number): 'blocked' | 'shield' | 'hit' | 'dead' {
  if (now < player.invulnerableUntil) return 'blocked';
  if (now < player.shieldUntil) {
    player.shieldUntil = 0;
    player.invulnerableUntil = now + 350;
    return 'shield';
  }
  player.hp = Math.max(0, player.hp - 1);
  player.invulnerableUntil = now + 1_100;
  return player.hp === 0 ? 'dead' : 'hit';
}

export function activateResonance(player: PlayerState, bolts: HostileBolt[], now: number): HostileBolt[] {
  if (player.energy < RESONANCE.max) return [];
  player.energy = 0;
  player.invulnerableUntil = Math.max(player.invulnerableUntil, now + RESONANCE.invulnerableMs);
  const nearby = bolts.filter((bolt) => !bolt.dead && !bolt.converted && Math.hypot(bolt.x - player.x, bolt.y - player.y) <= RESONANCE.radius)
    .slice(0, RESONANCE.maxConverted);
  for (const bolt of nearby) { bolt.converted = true; bolt.vx = 0; bolt.vy = -Math.abs(bolt.vy || 460); }
  return nearby;
}

export function awardKill(score: ScoreState, enemy: EnemyRecord, now: number): number {
  if (enemy.dead) return 0;
  enemy.dead = true;
  score.combo = now - score.lastKillAt <= 2_500 ? score.combo + 1 : 1;
  score.multiplier = Math.min(5, 1 + Math.floor((score.combo - 1) / 3));
  score.lastKillAt = now;
  score.kills += 1;
  const points = ENEMY[enemy.kind].score * score.multiplier;
  score.score += points;
  return points;
}

export function expireCombo(score: ScoreState, now: number): void {
  if (score.combo > 0 && now - score.lastKillAt > 2_500) { score.combo = 0; score.multiplier = 1; }
}

export function waveMembers(wave: number): ReadonlyArray<EnemyKind> {
  return WAVE_LIST[wave - 1] ?? [];
}

export function bossPhase(hp: number, maxHp: number): 1 | 2 | 3 {
  const ratio = hp / maxHp;
  return ratio <= 0.25 ? 3 : ratio <= 0.6 ? 2 : 1;
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}
