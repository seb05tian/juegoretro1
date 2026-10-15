import { getSettings, type Settings } from './persistence';

export class SynthAudio {
  private context: AudioContext | null = null;
  private musicTimer = 0;
  private musicStep = 0;
  private settings: Settings = getSettings();
  private readonly notes = [55, 65.41, 73.42, 82.41, 73.42, 65.41, 49, 65.41];

  unlock(): void {
    if (typeof window.AudioContext === 'undefined') return;
    if (!this.context) this.context = new AudioContext();
    if (this.context.state === 'suspended') void this.context.resume();
    if (!this.musicTimer) this.musicTimer = window.setInterval(() => this.musicTick(), 300);
  }
  setSettings(settings: Settings): void { this.settings = settings; }
  stop(): void { if (this.musicTimer) window.clearInterval(this.musicTimer); this.musicTimer = 0; }
  play(type: 'shot' | 'hit' | 'explode' | 'pulse' | 'warning' | 'win' | 'ui'): void {
    if (!this.context || this.settings.muted || this.settings.effects <= 0) return;
    const now = this.context.currentTime;
    const configs = { shot: [670, 0.055, 'triangle'], hit: [145, 0.12, 'sawtooth'], explode: [82, 0.28, 'triangle'], pulse: [240, 0.48, 'sine'], warning: [420, 0.35, 'square'], win: [660, 0.55, 'sine'], ui: [880, 0.035, 'sine'] } as const;
    const [frequency, duration, wave] = configs[type];
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, frequency * (type === 'shot' ? 0.48 : 0.22)), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.11 * this.settings.effects, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain); gain.connect(this.context.destination);
    oscillator.start(now); oscillator.stop(now + duration + 0.02);
  }
  private musicTick(): void {
    if (!this.context || this.settings.muted || this.settings.music <= 0) return;
    if (this.musicStep % 2 === 0) {
      const oscillator = this.context.createOscillator(); const gain = this.context.createGain();
      const now = this.context.currentTime;
      oscillator.type = 'sine'; oscillator.frequency.value = this.notes[this.musicStep % this.notes.length]!;
      gain.gain.setValueAtTime(0.0001, now); gain.gain.linearRampToValueAtTime(0.035 * this.settings.music, now + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
      oscillator.connect(gain); gain.connect(this.context.destination); oscillator.start(now); oscillator.stop(now + 0.45);
    }
    this.musicStep += 1;
  }
}
