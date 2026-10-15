import Phaser from 'phaser';
import { ENEMY, PALETTE, PICKUP, PLAYER, RESONANCE, WORLD, type EnemyKind, WAVE_LIST } from '../config/balance';
import { activateResonance, awardKill, bossPhase, expireCombo, mayFire, movePlayer, playerShotOffsets, seededRandom, takeDamage, waveMembers, type HostileBolt, type PlayerState, type Point, type ScoreState } from '../systems/logic';
import { getSettings, getShipPalette, type Settings, type ShipPalette } from '../systems/persistence';
import { SynthAudio } from '../systems/audio';

interface Enemy extends Point { kind: EnemyKind; hp: number; maxHp: number; age: number; phase: number; fireIn: number; dead: boolean; hit: number }
interface Shot extends Point { vx: number; vy: number; friendly: boolean; damage: number; pierce: number; radius: number; dead: boolean; converted?: boolean }
interface Pickup extends Point { type: 'triple' | 'pierce' | 'shield' | 'repair'; age: number; dead: boolean; gift?: boolean }
interface Particle extends Point { vx: number; vy: number; life: number; max: number; color: number; size: number }
interface ShockRing extends Point { age: number; duration: number; radius: number; color: number }
interface Boss extends Point { hp: number; maxHp: number; phase: 1 | 2 | 3; age: number; fireIn: number; hit: number; dead: boolean; supportIn: number }
type RunState = 'menu' | 'playing' | 'paused' | 'victorySequence' | 'gameover' | 'victory';

const colorHex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

export class GameScene extends Phaser.Scene {
  private gfx!: Phaser.GameObjects.Graphics;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private rng = seededRandom(20261013);
  private state: RunState = 'menu';
  private settings: Settings = getSettings();
  private shipPalette: ShipPalette = getShipPalette();
  private audio: SynthAudio;
  private player: PlayerState = this.freshPlayer();
  private score: ScoreState = { score: 0, combo: 0, multiplier: 1, lastKillAt: -9999, kills: 0 };
  private enemies: Enemy[] = [];
  private shots: Shot[] = [];
  private shotPool: Shot[] = [];
  private pickups: Pickup[] = [];
  private particles: Particle[] = [];
  private particlePool: Particle[] = [];
  private shockRings: ShockRing[] = [];
  private stars: Array<{ x: number; y: number; speed: number; size: number; alpha: number }> = [];
  private structures: Array<{ x: number; y: number; speed: number; size: number; rot: number }> = [];
  private boss: Boss | null = null;
  private wave = 0;
  private queue: EnemyKind[] = [];
  private queueTimer = 0;
  private nextGiftAt: number = PICKUP.giftFirstMs;
  private transition = 0;
  private transitionLabel = '';
  private elapsed = 0;
  private visualElapsed = 0;
  private started = false;
  private touchActive = false;
  private touchDevice = false;
  private touchMovedAt = -1;
  private lastPointer = { x: 0, y: 0 };
  private joystick = { x: 0, y: 0 };
  private fireHeld = false;
  private pulseThisFrame = false;
  private frameCounter = 0;
  private labels = new Map<string, Phaser.GameObjects.Text>();
  private pulseAge = -1;
  private victorySequence = -1;
  private finalBlastStage = 0;

  constructor(audio: SynthAudio = new SynthAudio()) { super('game'); this.audio = audio; }

  debugSnapshot(): Readonly<Record<string, unknown>> {
    return { state: this.state, wave: this.wave, time: this.elapsed, victoryTime: this.victorySequence, transition: this.transition, shipPalette: this.shipPalette.id, player: { x: this.player.x, y: this.player.y, hp: this.player.hp, energy: this.player.energy, weapon: this.player.weapon }, score: this.score.score, combo: this.score.combo, enemyCount: this.enemies.filter((enemy) => !enemy.dead).length, projectileCount: this.shots.filter((shot) => !shot.dead).length, friendlyShots: this.shots.filter((shot) => shot.friendly && !shot.dead).map(({ x, y, vx, vy }) => ({ x, y, vx, vy })), pickups: this.pickups.filter((item) => !item.dead).map(({ type, x, y, gift }) => ({ type, x, y, gift: gift === true })), convertedCount: this.shots.filter((shot) => shot.converted).length, boss: this.boss ? { hp: this.boss.hp, phase: this.boss.phase } : null };
  }

  debugFirePlayer(): void { if (import.meta.env.DEV) this.firePlayer(); }
  debugScheduleGift(): void { if (import.meta.env.DEV) this.nextGiftAt = this.elapsed * 1_000; }
  debugBringGiftToPlayer(): void {
    if (!import.meta.env.DEV) return;
    const gift = this.pickups.find((item) => item.gift && !item.dead);
    if (gift) { gift.x = this.player.x; gift.y = this.player.y; }
  }

  debugStartBoss(score = 1_250): void {
    if (!import.meta.env.DEV) return;
    this.player = this.freshPlayer(); this.score = { score, combo: 0, multiplier: 1, lastKillAt: -9999, kills: 0 };
    this.enemies = []; this.clearShots(); this.pickups = []; this.clearParticles(); this.shockRings = []; this.victorySequence = -1; this.finalBlastStage = 0;
    this.wave = 5; this.queue = []; this.transition = 0; this.elapsed = 0; this.nextGiftAt = PICKUP.giftFirstMs; this.started = true;
    this.boss = { x: 270, y: 220, hp: 120, maxHp: 120, phase: 1, age: 0, fireIn: 99, hit: 0, dead: false, supportIn: 99 };
    this.setState('playing');
  }

  debugSetBossHealth(hp: number): void { if (import.meta.env.DEV && this.boss) this.boss.hp = Math.max(0, Math.min(this.boss.maxHp, hp)); }

  debugPreparePulse(): void {
    if (!import.meta.env.DEV) return;
    this.player.energy = 100;
    for (let i = 0; i < 15; i++) this.spawnShot(this.player.x - 56 + i * 8, this.player.y, 0, 240, false, 1, 0, 4.5);
  }

  debugEliminatePlayer(): void {
    if (!import.meta.env.DEV) return;
    this.player.hp = 1; this.player.invulnerableUntil = 0;
    takeDamage(this.player, this.elapsed * 1_000); this.setState('gameover'); this.endRun('gameover');
  }

  create(): void {
    this.touchDevice = window.matchMedia('(pointer: coarse)').matches;
    this.gfx = this.add.graphics();
    this.gfx.setDepth(0);
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,Z,X,P,ESC,M') as Record<string, Phaser.Input.Keyboard.Key>;
    const random = seededRandom(4110);
    this.stars = Array.from({ length: 150 }, () => ({ x: random() * WORLD.width, y: random() * WORLD.height, speed: 14 + random() * 100, size: 0.5 + random() * 1.6, alpha: 0.16 + random() * 0.58 }));
    this.structures = Array.from({ length: 8 }, (_, i) => ({ x: i % 2 ? 28 + random() * 75 : WORLD.width - 28 - random() * 75, y: random() * WORLD.height, speed: 12 + random() * 29, size: 22 + random() * 45, rot: random() * Math.PI }));
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.touchActive = pointer.wasTouch; this.lastPointer = { x: pointer.x, y: pointer.y };
      if (pointer.wasTouch) { this.touchDevice = true; this.fireHeld = true; this.joystick = { x: 0, y: 0 }; this.touchMovedAt = this.elapsed; }
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => { if (pointer.wasTouch) { this.touchActive = false; this.fireHeld = false; this.joystick = { x: 0, y: 0 }; } });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.touchActive || !pointer.isDown || !pointer.wasTouch) return;
      const scaleX = this.game.scale.gameSize.width / WORLD.width;
      const scaleY = this.game.scale.gameSize.height / WORLD.height;
      this.joystick = { x: (pointer.x - this.lastPointer.x) * scaleX / 45, y: (pointer.y - this.lastPointer.y) * scaleY / 45 };
      this.lastPointer = { x: pointer.x, y: pointer.y };
      this.touchMovedAt = this.elapsed;
    });
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.code === 'Escape' || event.code === 'KeyP') this.togglePause();
      if (event.code === 'KeyM') { this.settings.muted = !this.settings.muted; this.audio.setSettings(this.settings); this.audio.play('ui'); this.game.events.emit('settings-changed', this.settings); }
    });
    this.game.events.on('ui-action', this.onUiAction, this);
    this.game.events.on('settings-changed', this.onSettings, this);
    this.game.events.on('ship-palette-changed', this.onShipPaletteChanged, this);
    this.game.events.emit('game-ready', { best: this.readBest(), settings: this.settings });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('ui-action', this.onUiAction, this);
      this.game.events.off('settings-changed', this.onSettings, this);
      this.game.events.off('ship-palette-changed', this.onShipPaletteChanged, this);
      this.input.keyboard?.off('keydown'); this.input.removeAllListeners(); this.audio.stop();
    });
  }

  private freshPlayer(): PlayerState { return { x: 270, y: 820, hp: 3, maxHp: 3, energy: 0, invulnerableUntil: 0, shieldUntil: 0, fireAt: 0, weapon: 'single', weaponUntil: 0 }; }
  private spawnShot(x: number, y: number, vx: number, vy: number, friendly: boolean, damage: number, pierce: number, radius: number, converted = false): void {
    const shot = this.shotPool.pop() ?? { x, y, vx, vy, friendly, damage, pierce, radius, dead: false };
    shot.x = x; shot.y = y; shot.vx = vx; shot.vy = vy; shot.friendly = friendly;
    shot.damage = damage; shot.pierce = pierce; shot.radius = radius; shot.dead = false; shot.converted = converted;
    this.shots.push(shot);
  }
  private clearShots(): void {
    for (const shot of this.shots) if (this.shotPool.length < 512) { shot.dead = false; shot.converted = undefined; this.shotPool.push(shot); }
    this.shots.length = 0;
  }
  private clearParticles(): void {
    for (const particle of this.particles) if (this.particlePool.length < 260) this.particlePool.push(particle);
    this.particles.length = 0;
  }
  private readBest(): number { try { return Number(localStorage.getItem('void-pulse-best-v1') ?? 0) || 0; } catch { return 0; } }
  private onSettings(settings: Settings): void { this.settings = settings; this.audio.setSettings(settings); }
  private onShipPaletteChanged(palette: ShipPalette): void { this.shipPalette = palette; }
  private onUiAction(action: string): void {
    if (action === 'start' || action === 'restart') { this.audio.unlock(); this.startRun(); }
    else if (action === 'resume') this.setState('playing');
    else if (action === 'pause') this.togglePause();
    else if (action === 'menu') this.setState('menu');
    else if (action === 'pulse') this.pulseThisFrame = true;
    else if (action === 'sound') { this.settings.muted = !this.settings.muted; this.audio.setSettings(this.settings); this.game.events.emit('settings-changed', this.settings); }
  }

  private startRun(): void {
    this.player = this.freshPlayer(); this.score = { score: 0, combo: 0, multiplier: 1, lastKillAt: -9999, kills: 0 };
    this.enemies = []; this.clearShots(); this.pickups = []; this.clearParticles(); this.shockRings = []; this.boss = null; this.victorySequence = -1; this.finalBlastStage = 0;
    this.wave = 0; this.queue = []; this.queueTimer = 0; this.nextGiftAt = PICKUP.giftFirstMs; this.transition = 0; this.elapsed = 0; this.started = true; this.rng = seededRandom(20261013 + Math.floor(Math.random() * 100000));
    this.startWave(1); this.setState('playing'); this.audio.unlock();
  }

  private setState(state: RunState): void {
    this.state = state;
    if (state !== 'playing') { this.joystick = { x: 0, y: 0 }; this.fireHeld = false; }
    this.game.events.emit('run-state', { state, score: this.score.score, wave: this.wave });
  }
  private togglePause(): void {
    if (this.state === 'playing') this.setState('paused');
    else if (this.state === 'paused') this.setState('playing');
  }
  private beginTransition(title: string, subtitle: string): void {
    this.transition = 1.8; this.transitionLabel = title;
    this.game.events.emit('sector-transition', { title, subtitle, wave: this.wave });
  }
  private startWave(number: number): void {
    this.wave = number;
    if (number <= WAVE_LIST.length) { this.queue = [...waveMembers(number)]; this.queueTimer = 0.45; this.beginTransition(number === 1 ? 'AMENAZA DETECTADA' : 'SECTOR ASEGURADO', `OLEADA ${String(number).padStart(2, '0')}  /  ${['RECONOCIMIENTO', 'INTERCEPCIÓN', 'BLOQUEO', 'FRACTURA'][number - 1]}`); }
    else { this.wave = 5; this.boss = { x: 270, y: -180, hp: 120, maxHp: 120, phase: 1, age: 0, fireIn: 2.8, hit: 0, dead: false, supportIn: 7 }; this.beginTransition('EL NÚCLEO DESPIERTA', 'THE HOLLOW CORE  ·  PRIORIDAD ABSOLUTA'); this.audio.play('warning'); }
    this.game.events.emit('hud', this.hud());
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.05);
    this.visualElapsed += dt;
    if (this.state === 'playing' || this.state === 'victorySequence') this.elapsed += dt;
    this.frameCounter += 1;
    this.updateBackdrop(dt);
    if (this.state === 'playing') this.simulate(dt);
    else if (this.state === 'victorySequence') { this.updateParticles(dt); this.updateVictorySequence(Math.min(delta / 1000, 0.1)); }
    this.render();
    if (this.frameCounter % 5 === 0) this.game.events.emit('hud', this.hud());
  }

  private simulate(dt: number): void {
    const now = this.elapsed * 1000;
    if (this.touchMovedAt >= 0 && this.elapsed - this.touchMovedAt > 0.11) this.joystick = { x: 0, y: 0 };
    if (!this.started) { this.started = true; this.startWave(1); }
    if (this.transition > 0) { this.transition = Math.max(0, this.transition - dt); if (this.wave === 0 && this.transition === 0) this.startWave(1); }
    const x = (Number(this.keys.D.isDown || this.keys.RIGHT.isDown) - Number(this.keys.A.isDown || this.keys.LEFT.isDown)) + this.joystick.x;
    const y = (Number(this.keys.S.isDown || this.keys.DOWN.isDown) - Number(this.keys.W.isDown || this.keys.UP.isDown)) + this.joystick.y;
    const moved = movePlayer(this.player, { x, y }, dt);
    this.player.x = moved.x; this.player.y = moved.y;
    const wantsFire = this.keys.SPACE.isDown || this.keys.Z.isDown || this.fireHeld || (this.settings.autoFire && this.touchDevice && !this.touchActive);
    if (wantsFire && mayFire(this.player, now)) this.firePlayer();
    if (Phaser.Input.Keyboard.JustDown(this.keys.X) || this.pulseThisFrame) this.usePulse();
    this.pulseThisFrame = false;
    if (this.player.weapon !== 'single' && now >= this.player.weaponUntil) { this.player.weapon = 'single'; this.player.weaponUntil = 0; }
    if (this.state !== 'playing') return;
    expireCombo(this.score, now);
    this.updateWave(dt); this.updateEnemies(dt, now); this.updateBoss(dt, now); this.updateShots(dt); this.updatePickups(dt, now); this.updateParticles(dt);
    this.collide(now);
  }

  private firePlayer(): void {
    const offsets = playerShotOffsets(this.player.weapon);
    for (const offset of offsets) this.spawnShot(this.player.x + offset, this.player.y - 23, offset === 0 ? 0 : offset * 1.8, -PLAYER.boltSpeed, true, 1, this.player.weapon === 'pierce' ? 2 : 0, 4.5);
    this.audio.play('shot');
  }

  private usePulse(): void {
    if (this.player.energy < RESONANCE.max) return;
    const hostiles = this.shots.filter((shot): shot is Shot & HostileBolt => !shot.friendly && !shot.dead);
    const converted = activateResonance(this.player, hostiles, this.elapsed * 1000);
    for (const bolt of converted) { const shot = bolt as Shot; shot.friendly = true; shot.damage = 1; shot.pierce = Math.max(shot.pierce, 1); }
    this.pulseAge = 0;
    this.audio.play('pulse'); this.burst(this.player.x, this.player.y, PALETTE.cyan, 32, 260);
    this.game.events.emit('pulse-fired');
    if (!this.settings.reducedMotion) this.cameras.main.shake(180, 0.0035);
  }

  private updateWave(dt: number): void {
    if (this.transition > 0 || this.boss) return;
    if (this.wave === 0) { this.startWave(1); return; }
    if (this.queue.length > 0) {
      this.queueTimer -= dt;
      if (this.queueTimer <= 0) { this.spawnEnemy(this.queue.shift()!); this.queueTimer = Math.max(0.42, 0.82 - this.wave * 0.055); }
    } else if (this.enemies.length === 0) {
      if (this.wave < 4) this.startWave(this.wave + 1);
      else this.startWave(5);
    }
  }

  private spawnEnemy(kind: EnemyKind, x = 50 + this.rng() * 440, y = -35): void {
    const base = ENEMY[kind];
    this.enemies.push({ x, y, kind, hp: base.hp, maxHp: base.hp, age: 0, phase: this.rng() * Math.PI * 2, fireIn: 1.7 + this.rng() * 2.4, dead: false, hit: 0 });
  }
  private updateEnemies(dt: number, now: number): void {
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      enemy.age += dt; enemy.hit = Math.max(0, enemy.hit - dt);
      const t = enemy.age; const drift = Math.sin(t * (enemy.kind === 'scout' ? 2.8 : 1.25) + enemy.phase);
      const targetY = enemy.kind === 'striker' ? 180 + Math.sin(t * 0.8 + enemy.phase) * 115 : enemy.kind === 'bulwark' ? 160 + Math.sin(t * 0.42 + enemy.phase) * 24 : 130 + Math.sin(t * 0.9 + enemy.phase) * 50;
      if (enemy.kind === 'striker' && t < 1.3) { enemy.y += dt * 220; enemy.x += drift * dt * 100; }
      else { enemy.y += (targetY - enemy.y) * Math.min(1, dt * 2.3); enemy.x += drift * dt * (enemy.kind === 'scout' ? 135 : enemy.kind === 'orbiter' ? 100 : 42); }
      enemy.x = Phaser.Math.Clamp(enemy.x, 35, 505);
      enemy.fireIn -= dt;
      if (enemy.fireIn <= 0 && enemy.y > 50 && enemy.y < 445) { this.enemyAttack(enemy); enemy.fireIn = enemy.kind === 'bulwark' ? 3.2 : enemy.kind === 'striker' ? 2.25 : 2.6 + this.rng() * 1.2; }
      if (enemy.y > 1000) enemy.dead = true;
    }
    this.enemies = this.enemies.filter((enemy) => !enemy.dead || enemy.hit > 0.3);
    void now;
  }

  private enemyAttack(enemy: Enemy): void {
    const start = { x: enemy.x, y: enemy.y + 14 };
    const dx = this.player.x - start.x; const dy = this.player.y - start.y;
    const speed = enemy.kind === 'scout' ? 245 : enemy.kind === 'bulwark' ? 210 : 290;
    const angle = Math.atan2(dy, dx);
    const count = enemy.kind === 'bulwark' ? 5 : enemy.kind === 'orbiter' ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const spread = count === 5 ? (i - 2) * 0.2 : count === 2 ? (i - 0.5) * 0.23 : 0;
      this.spawnShot(start.x, start.y, Math.cos(angle + spread) * speed, Math.sin(angle + spread) * speed, false, 1, 0, enemy.kind === 'bulwark' ? 6 : 4.5);
    }
    this.burst(start.x, start.y, ENEMY[enemy.kind].color, 5, 45);
  }

  private updateBoss(dt: number, now: number): void {
    const boss = this.boss; if (!boss || boss.dead) return;
    boss.age += dt; boss.hit = Math.max(0, boss.hit - dt);
    const previousPhase = boss.phase;
    boss.phase = bossPhase(boss.hp, boss.maxHp);
    boss.x = 270 + Math.sin(boss.age * (boss.phase === 1 ? 0.38 : boss.phase === 2 ? 0.82 : 1.04)) * (boss.phase === 1 ? 65 : 170);
    boss.y += (boss.phase === 3 ? 190 : 220 - boss.y) * Math.min(1, dt * 1.8);
    boss.fireIn -= dt; boss.supportIn -= dt;
    if (boss.fireIn <= 0) {
      this.bossAttack(boss); boss.fireIn = boss.phase === 1 ? 2.05 : boss.phase === 2 ? 1.65 : 1.34;
    }
    if (boss.supportIn <= 0 && boss.phase >= 2) {
      if (this.enemies.filter((enemy) => !enemy.dead).length < 4) this.spawnEnemy(this.rng() > 0.5 ? 'scout' : 'striker', Phaser.Math.Clamp(boss.x + (this.rng() - 0.5) * 180, 70, 470), boss.y + 40);
      boss.supportIn = this.enemies.filter((enemy) => !enemy.dead).length < 4 ? (boss.phase === 2 ? 7 : 5.5) : 1.2;
    }
    if (boss.phase > previousPhase) { this.burst(boss.x, boss.y, PALETTE.violet, 25, 190); this.audio.play('warning'); this.game.events.emit('boss-phase', boss.phase); }
    if (boss.hp <= 0) this.defeatBoss(boss);
    this.game.events.emit('boss-hud', { hp: boss.hp, max: boss.maxHp, phase: boss.phase });
    void now;
  }
  private bossAttack(boss: Boss): void {
    const phase = boss.phase;
    const aimed = Math.atan2(this.player.y - boss.y, this.player.x - boss.x);
    const patterns = phase === 1 ? 5 : phase === 2 ? 7 : 7;
    const gap = phase === 3 ? 0.17 : 0.15;
    const center = phase === 1 ? Math.PI / 2 : aimed;
    for (let i = 0; i < patterns; i++) {
      const angle = center + (i - (patterns - 1) / 2) * gap;
      this.spawnShot(boss.x + Math.cos(angle) * 28, boss.y + 40, Math.cos(angle) * (phase === 3 ? 250 : 205), Math.sin(angle) * (phase === 3 ? 250 : 205), false, 1, 0, 5.5);
    }
    if (phase > 1) {
      const angle = Math.atan2(this.player.y - (boss.y + 60), this.player.x - boss.x);
      for (const spread of [-0.15, 0.15]) this.spawnShot(boss.x, boss.y + 60, Math.cos(angle + spread) * 310, Math.sin(angle + spread) * 310, false, 1, 0, 4.5);
    }
  }
  private defeatBoss(boss: Boss): void {
    if (boss.dead) return; boss.dead = true;
    this.enemies = []; this.clearShots(); this.victorySequence = 0; this.finalBlastStage = 0;
    this.setState('victorySequence');
  }
  private updateVictorySequence(dt: number): void {
    if (this.victorySequence < 0 || !this.boss) return;
    this.victorySequence += dt;
    const stages = [0.05, 0.24, 0.43, 0.62, 0.81, 1.0];
    while (this.finalBlastStage < stages.length && this.victorySequence >= stages[this.finalBlastStage]!) {
      const stage = this.finalBlastStage++;
      const x = this.boss.x + (this.rng() - 0.5) * (stage === stages.length - 1 ? 24 : 150);
      const y = this.boss.y + (this.rng() - 0.5) * (stage === stages.length - 1 ? 24 : 110);
      const color = stage % 2 === 0 ? PALETTE.cyan : stage === stages.length - 1 ? PALETTE.gold : PALETTE.pink;
      this.burst(x, y, color, stage === stages.length - 1 ? 58 : 28 + stage * 4, 180 + stage * 45);
      this.shockRings.push({ x, y, age: 0, duration: 0.72, radius: stage === stages.length - 1 ? 215 : 88 + stage * 15, color });
      this.audio.play(stage === stages.length - 1 ? 'win' : 'explode');
      if (!this.settings.reducedMotion) this.cameras.main.shake(stage === stages.length - 1 ? 260 : 95, stage === stages.length - 1 ? 0.003 : 0.001);
    }
    if (this.victorySequence >= 1.8) { this.victorySequence = -1; this.setState('victory'); this.endRun('victory'); }
  }

  private updateShots(dt: number): void {
    for (const shot of this.shots) {
      if (shot.dead) continue;
      if (shot.converted) {
        const target = this.nearestEnemy(shot.x, shot.y);
        if (target) { const dx = target.x - shot.x; const dy = target.y - shot.y; const len = Math.hypot(dx, dy) || 1; shot.vx += dx / len * 500 * dt; shot.vy += dy / len * 500 * dt; const speed = Math.hypot(shot.vx, shot.vy); if (speed > 650) { shot.vx *= 650 / speed; shot.vy *= 650 / speed; } }
        else shot.vy = -460;
      }
      shot.x += shot.vx * dt; shot.y += shot.vy * dt;
      if (shot.x < -30 || shot.x > 570 || shot.y < -40 || shot.y > 1010) shot.dead = true;
    }
    let alive = 0;
    for (let index = 0; index < this.shots.length; index++) {
      const shot = this.shots[index]!;
      if (shot.dead) {
        if (this.shotPool.length < 512) { shot.dead = false; shot.converted = undefined; this.shotPool.push(shot); }
      } else this.shots[alive++] = shot;
    }
    this.shots.length = alive;
  }
  private updatePickups(dt: number, now: number): void {
    if (now >= this.nextGiftAt) {
      if (!this.pickups.some((item) => item.gift && !item.dead)) {
        const x = Phaser.Math.Clamp(this.player.x + (this.rng() - 0.5) * 220, 48, WORLD.width - 48);
        this.pickups.push({ x, y: PICKUP.giftSpawnY, type: 'triple', age: 0, dead: false, gift: true });
        this.audio.play('ui');
      }
      this.nextGiftAt = now + PICKUP.giftIntervalMs;
    }
    for (const item of this.pickups) {
      if (item.dead) continue;
      item.age += dt; item.y += (item.gift ? PICKUP.giftFallSpeed : PICKUP.fallSpeed) * dt; item.x += Math.sin(item.age * 2.4) * 28 * dt;
      if (Math.hypot(item.x - this.player.x, item.y - this.player.y) < 27) {
        if (item.type === 'repair') this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1);
        else if (item.type === 'shield') this.player.shieldUntil = now + 16_000;
        else { this.player.weapon = item.type; this.player.weaponUntil = now + (item.type === 'triple' ? 12_000 : 10_000); }
        item.dead = true; this.audio.play('ui'); this.burst(item.x, item.y, item.type === 'repair' ? PALETTE.gold : PALETTE.cyan, 12, 100);
      }
      if (item.y > WORLD.height + 20) item.dead = true;
    }
    this.pickups = this.pickups.filter((item) => !item.dead);
  }
  private updateParticles(dt: number): void {
    for (const particle of this.particles) { particle.life -= dt; particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.vx *= 0.985; particle.vy *= 0.985; }
    let alive = 0;
    for (let index = 0; index < this.particles.length; index++) {
      const particle = this.particles[index]!;
      if (particle.life > 0 && alive < 240) this.particles[alive++] = particle;
      else if (this.particlePool.length < 260) this.particlePool.push(particle);
    }
    this.particles.length = alive;
    for (const ring of this.shockRings) ring.age += dt;
    this.shockRings = this.shockRings.filter((ring) => ring.age < ring.duration);
    if (this.pulseAge >= 0) { this.pulseAge += dt; if (this.pulseAge > 0.72) this.pulseAge = -1; }
  }

  private collide(now: number): void {
    for (const shot of this.shots) {
      if (!shot.friendly || shot.dead) continue;
      let consumed = false;
      for (const enemy of this.enemies) {
        if (enemy.dead || Math.hypot(shot.x - enemy.x, shot.y - enemy.y) > ENEMY[enemy.kind].radius + shot.radius) continue;
        enemy.hp -= shot.damage; enemy.hit = 0.12; this.burst(shot.x, shot.y, ENEMY[enemy.kind].color, 3, 65); this.audio.play('hit');
        if (enemy.hp <= 0) this.killEnemy(enemy, now);
        if (shot.pierce > 0) shot.pierce -= 1; else consumed = true;
        if (consumed) break;
      }
      if (!consumed && this.boss && !this.boss.dead && Math.hypot(shot.x - this.boss.x, shot.y - (this.boss.y + 35)) < 87) {
        this.boss.hp -= 1; this.boss.hit = 0.1; consumed = shot.pierce <= 0; if (shot.pierce > 0) shot.pierce -= 1; this.burst(shot.x, shot.y, PALETTE.cyan, 2, 45);
      }
      if (consumed) shot.dead = true;
    }
    for (const shot of this.shots) {
      if (shot.friendly || shot.dead || now < this.player.invulnerableUntil) continue;
      if (Math.hypot(shot.x - this.player.x, shot.y - this.player.y) <= shot.radius + 13) {
        shot.dead = true; const result = takeDamage(this.player, now);
        if (result === 'hit' || result === 'dead') { this.audio.play('explode'); this.burst(this.player.x, this.player.y, PALETTE.pink, 18, 150); if (!this.settings.reducedMotion) this.cameras.main.shake(190, 0.003); }
        else if (result === 'shield') this.audio.play('pulse');
        if (result === 'dead') { this.setState('gameover'); this.endRun('gameover'); }
      }
    }
    for (const enemy of this.enemies) {
      if (enemy.dead || now < this.player.invulnerableUntil) continue;
      if (Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y) <= ENEMY[enemy.kind].radius + 13) {
        const result = takeDamage(this.player, now);
        if (result === 'hit' || result === 'dead') { this.audio.play('explode'); this.burst(enemy.x, enemy.y, ENEMY[enemy.kind].color, 16, 150); enemy.dead = true; if (result === 'dead') { this.setState('gameover'); this.endRun('gameover'); } }
        break;
      }
    }
  }

  private killEnemy(enemy: Enemy, now: number): void {
    const awarded = awardKill(this.score, { kind: enemy.kind, hp: enemy.hp, dead: false }, now);
    enemy.dead = true; this.player.energy = Math.min(RESONANCE.max, this.player.energy + ENEMY[enemy.kind].energy);
    this.burst(enemy.x, enemy.y, ENEMY[enemy.kind].color, enemy.kind === 'bulwark' ? 24 : 14, enemy.kind === 'bulwark' ? 180 : 135);
    this.audio.play('explode'); this.game.events.emit('enemy-killed', { kind: enemy.kind, points: awarded });
    if (this.rng() < 0.13) { const types: Pickup['type'][] = ['triple', 'pierce', 'shield', 'repair']; this.pickups.push({ x: enemy.x, y: enemy.y, type: types[Math.floor(this.rng() * types.length)]!, age: 0, dead: false }); }
  }
  private nearestEnemy(x: number, y: number): Enemy | Boss | null {
    let closest: Enemy | Boss | null = null; let distance = Infinity;
    for (const enemy of this.enemies) { if (enemy.dead) continue; const d = Math.hypot(x - enemy.x, y - enemy.y); if (d < distance) { closest = enemy; distance = d; } }
    if (this.boss && !this.boss.dead) { const d = Math.hypot(x - this.boss.x, y - this.boss.y); if (d < distance) closest = this.boss; }
    return closest;
  }
  private burst(x: number, y: number, color: number, count: number, speed: number): void {
    if (this.settings.reducedMotion) count = Math.ceil(count / 3);
    for (let i = 0; i < count && this.particles.length < 260; i++) {
      const angle = this.rng() * Math.PI * 2; const velocity = speed * (0.3 + this.rng() * 0.7); const life = 0.22 + this.rng() * 0.5;
      const particle = this.particlePool.pop() ?? { x, y, vx: 0, vy: 0, life, max: life, color, size: 1 };
      particle.x = x; particle.y = y; particle.vx = Math.cos(angle) * velocity; particle.vy = Math.sin(angle) * velocity;
      particle.life = life; particle.max = life; particle.color = color; particle.size = 1 + this.rng() * 3.5;
      this.particles.push(particle);
    }
  }
  private endRun(result: 'gameover' | 'victory'): void {
    let best = this.readBest(); const record = this.score.score > best;
    if (record) { best = this.score.score; try { localStorage.setItem('void-pulse-best-v1', String(best)); } catch { /* local persistence unavailable */ } }
    this.game.events.emit('run-ended', { result, score: this.score.score, best, record, kills: this.score.kills, wave: this.wave, seconds: Math.floor(this.elapsed) });
  }

  private updateBackdrop(dt: number): void {
    for (const star of this.stars) { star.y += star.speed * dt; if (star.y > WORLD.height) { star.y = -3; star.x = this.rng() * WORLD.width; } }
    for (const object of this.structures) { object.y += object.speed * dt; object.rot += dt * 0.04; if (object.y > WORLD.height + 100) object.y = -100; }
  }

  private hud(): object { return { score: this.score.score, combo: this.score.combo, multiplier: this.score.multiplier, hp: this.player.hp, energy: this.player.energy, wave: this.wave, weapon: this.player.weapon, weaponUntil: this.player.weaponUntil, shieldUntil: this.player.shieldUntil, time: this.elapsed, best: this.readBest() }; }

  private render(): void {
    const g = this.gfx; g.clear();
    this.drawBackdrop(g);
    if (this.state !== 'menu') this.drawWorld(g);
    else { for (const label of this.labels.values()) label.setVisible(false); this.drawMenuShip(g); }
    if (this.transition > 0 && this.state === 'playing') this.drawTransition(g);
    else { this.labels.get('transition-title')?.setVisible(false); this.labels.get('transition-subtitle')?.setVisible(false); }
  }
  private drawBackdrop(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(PALETTE.space, 1); g.fillRect(0, 0, WORLD.width, WORLD.height);
    g.fillStyle(PALETTE.deep, 0.14); g.fillCircle(82, 240 + Math.sin(this.visualElapsed * 0.2) * 22, 165); g.fillCircle(485, 650 + Math.sin(this.visualElapsed * 0.14) * 32, 205);
    g.fillStyle(PALETTE.violet, 0.035); g.fillCircle(415, 190, 138); g.fillStyle(PALETTE.cyan, 0.025); g.fillCircle(122, 768, 160);
    const sectorTints = [PALETTE.violet, PALETTE.cyan, PALETTE.pink, PALETTE.gold, PALETTE.pink] as const;
    g.fillStyle(sectorTints[Math.max(0, Math.min(4, this.wave - 1))]!, this.wave === 0 ? 0.018 : 0.026); g.fillCircle(288 + Math.sin(this.visualElapsed * 0.12) * 60, 390, 190);
    for (const object of this.structures) {
      g.lineStyle(1, PALETTE.violet, 0.13); g.save(); g.translateCanvas(object.x, object.y); g.rotateCanvas(object.rot);
      g.strokePoints([new Phaser.Math.Vector2(-object.size, -8), new Phaser.Math.Vector2(-object.size * 0.55, -object.size * 0.46), new Phaser.Math.Vector2(object.size * 0.65, -object.size * 0.38), new Phaser.Math.Vector2(object.size, 0), new Phaser.Math.Vector2(object.size * 0.35, object.size * 0.22), new Phaser.Math.Vector2(-object.size * 0.7, object.size * 0.3)], false);
      g.restore();
    }
    for (const star of this.stars) { g.fillStyle(star.speed > 75 ? PALETTE.cyan : PALETTE.white, star.alpha); if (star.speed > 75) g.fillRect(star.x, star.y, star.size * 0.48, star.size * 3.2); else g.fillCircle(star.x, star.y, star.size); }
    g.lineStyle(1, PALETTE.cyan, 0.035); g.lineBetween(28, 0, 28, WORLD.height); g.lineBetween(512, 0, 512, WORLD.height);
  }

  private path(g: Phaser.GameObjects.Graphics, points: Point[], fill: number, alpha = 1, stroke = 0, strokeAlpha = 1, width = 1): void {
    g.fillStyle(fill, alpha); g.fillPoints(points.map((p) => new Phaser.Math.Vector2(p.x, p.y)), true);
    if (stroke) { g.lineStyle(width, stroke, strokeAlpha); g.strokePoints(points.map((p) => new Phaser.Math.Vector2(p.x, p.y)), true); }
  }
  private drawShip(g: Phaser.GameObjects.Graphics, x: number, y: number, scale = 1, tilt = 0, flicker = false): void {
    g.save(); g.translateCanvas(x, y); g.rotateCanvas(tilt);
    const s = scale; const metal = 0x172b46;
    g.fillStyle(this.shipPalette.primary, 0.18); g.fillEllipse(0, 25 * s, 36 * s, 16 * s);
    const flame = 19 + Math.sin(this.visualElapsed * 36) * 7;
    this.path(g, [{ x: -10 * s, y: 13 * s }, { x: -6 * s, y: (13 + flame) * s }, { x: 0, y: 17 * s }, { x: 6 * s, y: (13 + flame) * s }, { x: 10 * s, y: 13 * s }], this.shipPalette.primary, 0.85);
    this.path(g, [{ x: 0, y: -32 * s }, { x: 12 * s, y: -10 * s }, { x: 34 * s, y: 3 * s }, { x: 18 * s, y: 8 * s }, { x: 12 * s, y: 20 * s }, { x: 0, y: 14 * s }, { x: -12 * s, y: 20 * s }, { x: -18 * s, y: 8 * s }, { x: -34 * s, y: 3 * s }, { x: -12 * s, y: -10 * s }], metal, 1, this.shipPalette.secondary, 0.9, 1.3);
    this.path(g, [{ x: 0, y: -24 * s }, { x: 8 * s, y: -4 * s }, { x: 5 * s, y: 11 * s }, { x: 0, y: 15 * s }, { x: -5 * s, y: 11 * s }, { x: -8 * s, y: -4 * s }], 0x183b5a, 1, this.shipPalette.primary, 0.9, 1.3);
    this.path(g, [{ x: -25 * s, y: 3 * s }, { x: -12 * s, y: -1 * s }, { x: -8 * s, y: 7 * s }, { x: -19 * s, y: 6 * s }], 0x23506c, 1);
    this.path(g, [{ x: 25 * s, y: 3 * s }, { x: 12 * s, y: -1 * s }, { x: 8 * s, y: 7 * s }, { x: 19 * s, y: 6 * s }], 0x23506c, 1);
    g.lineStyle(1.2 * s, PALETTE.white, 0.65); g.lineBetween(-26 * s, 2 * s, -13 * s, -3 * s); g.lineBetween(26 * s, 2 * s, 13 * s, -3 * s);
    g.fillStyle(this.shipPalette.primary, flicker ? 0.32 : 1); g.fillCircle(0, -3 * s, 3.2 * s); g.fillStyle(PALETTE.white, 0.85); g.fillCircle(0, -4 * s, 1.3 * s);
    g.fillStyle(this.shipPalette.accent, 0.95); g.fillCircle(-17 * s, 8 * s, 1.8 * s); g.fillCircle(17 * s, 8 * s, 1.8 * s);
    g.restore();
  }

  private drawWorld(g: Phaser.GameObjects.Graphics): void {
    for (const shot of this.shots) this.drawShot(g, shot);
    for (const enemy of this.enemies) if (!enemy.dead || enemy.hit > 0) this.drawEnemy(g, enemy);
    if (this.boss && (!this.boss.dead || this.state === 'victorySequence')) this.drawBoss(g, this.boss);
    for (const item of this.pickups) this.drawPickup(g, item);
    for (const ring of this.shockRings) { const progress = ring.age / ring.duration; g.lineStyle(4 * (1 - progress) + 1, ring.color, (1 - progress) * 0.72); g.strokeCircle(ring.x, ring.y, 12 + ring.radius * progress); }
    for (const p of this.particles) { g.fillStyle(p.color, Math.max(0, p.life / p.max)); g.fillCircle(p.x, p.y, p.size * (0.55 + p.life / p.max * 0.5)); }
    if (this.pulseAge >= 0) { const progress = this.pulseAge / 0.72; g.lineStyle(4 * (1 - progress) + 1, this.shipPalette.primary, (1 - progress) * 0.8); g.strokeCircle(this.player.x, this.player.y, 12 + RESONANCE.radius * progress); g.lineStyle(1, PALETTE.white, (1 - progress) * 0.7); g.strokeCircle(this.player.x, this.player.y, Math.max(0, 12 + RESONANCE.radius * progress - 7)); }
    const blinking = this.elapsed * 1000 < this.player.invulnerableUntil && Math.floor(this.elapsed * 18) % 2 === 0;
    if (!blinking || this.settings.reducedMotion) this.drawShip(g, this.player.x, this.player.y, 1, Phaser.Math.Clamp((this.keys.D.isDown || this.keys.RIGHT.isDown ? 0.16 : 0) - (this.keys.A.isDown || this.keys.LEFT.isDown ? 0.16 : 0), -0.2, 0.2));
    if (this.elapsed * 1000 < this.player.shieldUntil) { g.lineStyle(2, this.shipPalette.primary, 0.62 + Math.sin(this.visualElapsed * 9) * 0.2); g.strokeCircle(this.player.x, this.player.y, 31); }
    this.drawHud(g);
  }
  private drawShot(g: Phaser.GameObjects.Graphics, shot: Shot): void {
    const color = shot.friendly ? (shot.converted ? PALETTE.gold : this.shipPalette.primary) : PALETTE.pink;
    g.lineStyle(shot.friendly ? 3 : 2.4, color, 0.25); g.lineBetween(shot.x, shot.y, shot.x - shot.vx * 0.026, shot.y - shot.vy * 0.026);
    g.fillStyle(color, 0.25); g.fillCircle(shot.x, shot.y, shot.radius * 2.2); g.fillStyle(PALETTE.white, 0.95); g.fillCircle(shot.x, shot.y, shot.radius * 0.54);
  }
  private drawEnemy(g: Phaser.GameObjects.Graphics, e: Enemy): void {
    const c = ENEMY[e.kind].color; const r = ENEMY[e.kind].radius; const flash = e.hit > 0;
    g.fillStyle(c, 0.13); g.fillCircle(e.x, e.y, r * 1.6);
    if (e.kind === 'scout') {
      this.path(g, [{ x: e.x, y: e.y + r }, { x: e.x + r * 0.72, y: e.y }, { x: e.x + r * 0.25, y: e.y - r * 0.25 }, { x: e.x, y: e.y - r * 0.95 }, { x: e.x - r * 0.25, y: e.y - r * 0.25 }, { x: e.x - r * 0.72, y: e.y }], flash ? PALETTE.white : 0x2b1736, 1, c, 0.95, 1.5);
      g.fillStyle(c, 0.95); g.fillCircle(e.x, e.y + 2, 3.1);
    } else if (e.kind === 'striker') {
      this.path(g, [{ x: e.x, y: e.y - r }, { x: e.x + r, y: e.y - 2 }, { x: e.x + r * 0.52, y: e.y + r * 0.5 }, { x: e.x, y: e.y + r }, { x: e.x - r * 0.52, y: e.y + r * 0.5 }, { x: e.x - r, y: e.y - 2 }], flash ? PALETTE.white : 0x352332, 1, c, 1, 1.7);
      g.lineStyle(2, c, 0.8); g.lineBetween(e.x - 8, e.y + 4, e.x + 8, e.y + 4); g.fillStyle(PALETTE.gold, 0.9); g.fillCircle(e.x, e.y - 1, 3);
    } else if (e.kind === 'bulwark') {
      g.lineStyle(2, c, 0.7); g.strokeCircle(e.x, e.y, r + 5 + Math.sin(this.visualElapsed * 3) * 1.5);
      this.path(g, [{ x: e.x - r, y: e.y - r * 0.45 }, { x: e.x - r * 0.45, y: e.y - r }, { x: e.x + r * 0.55, y: e.y - r * 0.82 }, { x: e.x + r, y: e.y - r * 0.18 }, { x: e.x + r * 0.75, y: e.y + r * 0.65 }, { x: e.x, y: e.y + r }, { x: e.x - r * 0.82, y: e.y + r * 0.48 }], flash ? PALETTE.white : 0x211d41, 1, c, 0.95, 2);
      g.fillStyle(c, 0.85); g.fillCircle(e.x, e.y, 5.5);
    } else {
      g.save(); g.translateCanvas(e.x, e.y); g.rotateCanvas(Math.sin(e.age) * 0.12);
      g.lineStyle(3, c, 0.82); g.strokeCircle(0, 0, r); g.lineStyle(1, PALETTE.white, 0.45); g.strokeCircle(0, 0, r * 0.68);
      g.fillStyle(flash ? PALETTE.white : 0x483421, 1); g.fillCircle(0, 0, 8); g.fillStyle(c, 1); g.fillCircle(0, 0, 3); g.fillStyle(c, 0.9); g.fillCircle(-r * 0.68, 0, 3); g.fillCircle(r * 0.68, 0, 3); g.restore();
    }
    if (e.maxHp > 1) { g.fillStyle(0x10172d, 0.8); g.fillRoundedRect(e.x - r, e.y + r + 7, r * 2, 3, 1); g.fillStyle(c, 0.9); g.fillRoundedRect(e.x - r, e.y + r + 7, r * 2 * e.hp / e.maxHp, 3, 1); }
  }
  private drawBoss(g: Phaser.GameObjects.Graphics, b: Boss): void {
    const c = b.dead ? PALETTE.gold : b.phase === 3 ? PALETTE.pink : PALETTE.violet; const beat = Math.sin(b.age * 3.5);
    g.fillStyle(c, 0.11); g.fillCircle(b.x, b.y + 22, 112 + beat * 8);
    g.lineStyle(2, c, 0.6); g.strokeCircle(b.x, b.y + 20, 86 + beat * 4); g.lineStyle(1, PALETTE.cyan, 0.45); g.strokeCircle(b.x, b.y + 20, 72 - beat * 3);
    g.save(); g.translateCanvas(b.x, b.y); g.rotateCanvas(Math.sin(b.age * 0.7) * 0.045);
    const plate = b.hit > 0 || (b.dead && Math.sin(this.visualElapsed * 36) > 0.35) ? PALETTE.white : 0x18152f;
    this.path(g, [{ x: -83, y: 11 }, { x: -115, y: -18 }, { x: -98, y: -59 }, { x: -47, y: -79 }, { x: -27, y: -59 }, { x: 11, y: -89 }, { x: 49, y: -66 }, { x: 101, y: -77 }, { x: 119, y: -29 }, { x: 84, y: 13 }, { x: 67, y: 82 }, { x: 22, y: 68 }, { x: -9, y: 97 }, { x: -50, y: 66 }], plate, 1, c, 1, 2.2);
    this.path(g, [{ x: -55, y: -38 }, { x: -26, y: -60 }, { x: -6, y: -40 }, { x: -21, y: -5 }, { x: -64, y: -2 }], 0x29234b, 1, PALETTE.cyan, 0.65, 1);
    this.path(g, [{ x: 34, y: -42 }, { x: 64, y: -54 }, { x: 83, y: -25 }, { x: 65, y: 4 }, { x: 30, y: -1 }], 0x322642, 1, PALETTE.pink, 0.58, 1);
    g.fillStyle(c, 0.32); g.fillCircle(0, 10, 39); g.lineStyle(3, PALETTE.cyan, 0.88); g.strokeCircle(0, 10, 30 + beat * 2); g.fillStyle(PALETTE.cyan, 0.95); g.fillCircle(0, 10, 13); g.fillStyle(PALETTE.white, 0.95); g.fillCircle(-3, 7, 4);
    g.fillStyle(PALETTE.gold, 0.85); g.fillCircle(-73, 16, 5); g.fillCircle(77, 24, 4); g.fillCircle(8, -71, 4);
    g.restore();
    // Exposed core target, plus unmistakable threat telegraph when the next barrage approaches.
    g.lineStyle(2, PALETTE.cyan, 0.32 + Math.max(0, 0.85 - b.fireIn) * 0.55); g.strokeCircle(b.x, b.y + 10, 40 + beat * 2);
    for (let i = 0; i < 3; i++) { g.fillStyle(PALETTE.pink, 0.45); g.fillRect(b.x - 65 + i * 65, b.y + 70, 20, 3); }
  }
  private drawPickup(g: Phaser.GameObjects.Graphics, p: Pickup): void {
    if (p.gift) {
      const pulse = 0.78 + Math.sin(p.age * 5) * 0.12;
      g.fillStyle(PALETTE.cyan, 0.16); g.fillRoundedRect(p.x - 17, p.y - 15, 34, 30, 5);
      g.lineStyle(2, PALETTE.cyan, pulse); g.strokeRoundedRect(p.x - 14, p.y - 10, 28, 22, 3);
      g.fillStyle(PALETTE.pink, 0.95); g.fillRect(p.x - 2, p.y - 10, 4, 22); g.fillRect(p.x - 14, p.y - 1, 28, 4);
      g.lineStyle(1.5, PALETTE.gold, 0.95); g.strokeCircle(p.x - 4, p.y - 12, 4); g.strokeCircle(p.x + 4, p.y - 12, 4);
      g.fillStyle(PALETTE.white, 0.95); g.fillCircle(p.x, p.y - 12, 1.8);
      g.lineStyle(1, PALETTE.white, 0.72); g.lineBetween(p.x - 7, p.y + 5, p.x - 7, p.y + 1); g.lineBetween(p.x, p.y + 5, p.x, p.y + 1); g.lineBetween(p.x + 7, p.y + 5, p.x + 7, p.y + 1);
      return;
    }
    const color = p.type === 'repair' ? PALETTE.gold : p.type === 'shield' ? PALETTE.violet : PALETTE.cyan;
    g.fillStyle(color, 0.15); g.fillCircle(p.x, p.y, 19 + Math.sin(p.age * 5) * 2); g.lineStyle(1.5, color, 0.85); g.strokeCircle(p.x, p.y, 12);
    g.fillStyle(color, 0.92); g.fillCircle(p.x, p.y, 4);
    if (p.type === 'repair') { g.fillStyle(PALETTE.space, 1); g.fillRect(p.x - 1, p.y - 5, 2, 10); g.fillRect(p.x - 5, p.y - 1, 10, 2); }
    if (p.type === 'shield') { g.lineStyle(1.5, PALETTE.white, 0.9); g.strokeCircle(p.x, p.y, 5); }
    if (p.type === 'triple') { g.lineStyle(1, PALETTE.white, 0.8); g.lineBetween(p.x - 5, p.y + 4, p.x - 5, p.y - 4); g.lineBetween(p.x, p.y + 4, p.x, p.y - 4); g.lineBetween(p.x + 5, p.y + 4, p.x + 5, p.y - 4); }
    if (p.type === 'pierce') { g.lineStyle(1.5, PALETTE.white, 0.85); g.lineBetween(p.x - 6, p.y + 4, p.x + 6, p.y - 4); }
  }
  private drawHud(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(0x080d20, 0.84); g.fillRoundedRect(18, 18, WORLD.width - 36, 64, 13); g.lineStyle(1, PALETTE.cyan, 0.14); g.strokeRoundedRect(18, 18, WORLD.width - 36, 64, 13);
    g.fillStyle(PALETTE.white, 0.42); g.fillRect(33, 32, 3, 34); g.fillStyle(PALETTE.cyan, 0.95); g.fillRect(33, 32, 3, 34);
    g.fillStyle(PALETTE.white, 0.55); g.fillRect(49, 29, 56, 3); g.fillStyle(PALETTE.white, 0.96); g.fillRect(49, 29, 56 * (this.score.score % 1500) / 1500, 3);
    g.fillStyle(PALETTE.white, 0.48); g.fillRect(49, 61, 56, 2); g.fillStyle(PALETTE.gold, 0.9); g.fillRect(49, 61, 56 * (this.score.multiplier - 1) / 4, 2);
    // Icons and labels are rendered inside Phaser for crisp scale at every aspect ratio.
    g.lineStyle(2, PALETTE.pink, 0.85); g.strokeCircle(128, 43, 6); g.strokeCircle(147, 43, 6); g.strokeCircle(166, 43, 6);
    for (let i = 0; i < this.player.maxHp; i++) { g.fillStyle(i < this.player.hp ? PALETTE.pink : 0x26304a, i < this.player.hp ? 0.95 : 0.75); g.fillCircle(128 + i * 19, 43, 3.2); }
    this.drawText('score', `${this.score.score.toString().padStart(7, '0')}`, 214, 31, 17, PALETTE.white, 'center');
    this.drawText('multiplier', `×${this.score.multiplier}`, 214, 54, 9, PALETTE.gold, 'center');
    this.drawText('sector', `SECTOR  ${String(Math.max(1, this.wave)).padStart(2, '0')}`, 300, 31, 9, PALETTE.white, 'center');
    g.fillStyle(0x192c43, 0.9); g.fillRoundedRect(354, 35, 147, 15, 7); g.fillStyle(PALETTE.cyan, 0.85); g.fillRoundedRect(356, 37, 143 * this.player.energy / 100, 11, 5);
    g.lineStyle(1, PALETTE.white, 0.32); g.strokeRoundedRect(354, 35, 147, 15, 7);
    this.drawText('resonance', 'RESONANCIA', 427, 23, 8, PALETTE.cyan, 'center');
    this.drawText('pulse-ready', this.player.energy >= 100 ? 'X  PULSO LISTO' : '', 427, 62, 8, PALETTE.white, 'center');
    if (this.player.energy >= 100) { g.lineStyle(1, PALETTE.cyan, 0.6); g.strokeCircle(499, 44, 11 + Math.sin(this.visualElapsed * 7) * 2); }
    if (this.boss && !this.boss.dead) {
      g.fillStyle(0x0b1026, 0.9); g.fillRoundedRect(69, 99, 402, 25, 9); g.fillStyle(0x321933, 0.9); g.fillRoundedRect(77, 106, 386, 10, 4); g.fillStyle(this.boss.phase === 3 ? PALETTE.pink : PALETTE.violet, 0.94); g.fillRoundedRect(77, 106, 386 * Math.max(0, this.boss.hp) / this.boss.maxHp, 10, 4);
      this.drawText('boss-name', 'THE HOLLOW CORE', 270, 93, 9, PALETTE.white, 'center'); this.drawText('boss-phase', `FASE ${this.boss.phase}`, 270, 121, 8, PALETTE.cyan, 'center');
    } else { this.labels.get('boss-name')?.setVisible(false); this.labels.get('boss-phase')?.setVisible(false); }
    if (this.player.weapon !== 'single') {
      const seconds = Math.max(0, (this.player.weaponUntil - this.elapsed * 1000) / 1000);
      const label = this.player.weapon === 'triple' ? 'TRIPLE TIRO' : 'PENETRANTE';
      this.drawText('weapon', `${label}  ${seconds.toFixed(1)}s`, 270, 920, 10, PALETTE.cyan, 'center');
      g.fillStyle(PALETTE.cyan, 0.65); g.fillRoundedRect(183, 938, 174 * seconds / (this.player.weapon === 'triple' ? 12 : 10), 3, 1.5);
    } else if (this.player.shieldUntil > this.elapsed * 1000) this.drawText('weapon', `ESCUDO  ${((this.player.shieldUntil - this.elapsed * 1000) / 1000).toFixed(1)}s`, 270, 928, 9, PALETTE.violet, 'center');
    else this.drawText('weapon', '', 270, 928, 9, PALETTE.violet, 'center');
  }
  private drawText(key: string, value: string, x: number, y: number, size: number, color: number, align: CanvasTextAlign = 'left', alpha = 0.95): void {
    let label = this.labels.get(key);
    if (!label) { label = this.add.text(x, y, value, { fontFamily: 'Arial, sans-serif', fontSize: `${size}px`, color: colorHex(color), resolution: 2 }); label.setOrigin(align === 'center' ? 0.5 : align === 'right' ? 1 : 0, 0.5).setDepth(10); this.labels.set(key, label); }
    label.setText(value).setPosition(x, y).setFontSize(size).setColor(colorHex(color)).setAlpha(alpha).setVisible(value.length > 0);
  }
  private drawTransition(g: Phaser.GameObjects.Graphics): void {
    const fade = Math.min(1, this.transition * 2, (1.8 - this.transition) * 2 + 0.25);
    g.fillStyle(PALETTE.space, 0.3 * fade); g.fillRect(0, 0, WORLD.width, WORLD.height);
    g.lineStyle(1, PALETTE.cyan, 0.32 * fade); g.lineBetween(72, 462, 468, 462); g.lineBetween(72, 514, 468, 514);
    this.drawText('transition-title', this.transitionLabel, 270, 475, 19, PALETTE.white, 'center');
    this.drawText('transition-subtitle', `SISTEMA DE COMBATE  //  ${Math.ceil(this.transition).toString().padStart(2, '0')}`, 270, 501, 8, PALETTE.cyan, 'center');
  }
  private drawMenuShip(g: Phaser.GameObjects.Graphics): void { this.drawShip(g, 270 + Math.sin(this.visualElapsed * 0.6) * 25, 690 + Math.sin(this.visualElapsed * 1.2) * 8, 1.55, Math.sin(this.visualElapsed * 0.7) * 0.05); }
}
