import type Phaser from 'phaser';
import { DEFAULT_SETTINGS, getBest, getSettings, getShipPalette, saveSettings, saveShipPalette, SHIP_PALETTES, type Settings, type ShipPaletteId } from '../systems/persistence';
import type { SynthAudio } from '../systems/audio';

type Hud = { score: number; combo: number; multiplier: number; hp: number; energy: number; wave: number; weapon: string; time: number };

export class Overlay {
  private screen = 'menu';
  private settings: Settings = getSettings();
  private shipPalette = getShipPalette();
  private readonly root: HTMLElement;
  private readonly live: HTMLElement;

  constructor(private readonly game: Phaser.Game, private readonly audio: SynthAudio) {
    this.root = document.querySelector<HTMLElement>('#overlay-root')!;
    this.root.innerHTML = `
      <div class="topline"><span><i class="status-dot"></i> SISTEMA AETHER // EN LÍNEA</span><span class="top-right">N.º 01 — PILOTO DE PRUEBA</span></div>
      <section class="screen menu-screen is-visible" data-screen="menu" aria-labelledby="brand-title">
        <div class="menu-copy">
          <p class="eyebrow"><span class="eyebrow-rule"></span>SECTOR FRONTERA  /  07</p>
          <h1 id="brand-title"><span>VOID</span><span class="title-pulse">PULSE</span></h1>
          <p class="edition">NEON REBELLION</p>
          <p class="tagline">El silencio del vacío<br>está a punto de romperse.</p>
          <button class="button primary" data-action="start"><span>INICIAR MISIÓN</span><span class="button-arrow">↗</span></button>
          <div class="menu-secondary"><button class="button quiet" data-action="controls">CONTROLES</button><button class="button quiet" data-action="settings">AJUSTES</button><button class="button quiet customize-launch" data-action="customize" aria-label="Personalizar nave" title="Personalizar nave"><span>PERSONALIZAR</span><span aria-hidden="true">◈</span></button></div>
          <div class="record"><span>RÉCORD PERSONAL</span><strong id="menu-best">000000</strong></div>
        </div>
        <div class="ship-caption"><span>PROTOTIPO DE CAZA</span><strong>AETHER—01</strong><i>RESONANCE CORE / MK. IV</i></div>
        <div class="menu-foot"><span>WASD / FLECHAS <b>·</b> MOVER</span><span>ESPACIO <b>·</b> DISPARAR</span></div>
      </section>
      <section class="screen modal-screen" data-screen="controls" aria-labelledby="controls-title">
        <article class="panel">
          <p class="eyebrow">SISTEMA DE PILOTAJE</p><h2 id="controls-title">Controles</h2>
          <div class="control-list"><div><span>MOVER</span><kbd>W A S D</kbd><b>o</b><kbd>↑ ↓ ← →</kbd></div><div><span>DISPARAR</span><kbd>ESPACIO</kbd><b>o</b><kbd>Z</kbd></div><div><span>PULSO</span><kbd>X</kbd><i>Con el núcleo al 100%</i></div><div><span>PAUSA</span><kbd>ESC</kbd><b>o</b><kbd>P</kbd></div><div><span>SONIDO</span><kbd>M</kbd><i>Silencio total</i></div></div>
          <p class="panel-note">En móvil: arrastra en cualquier zona para maniobrar. El fuego automático está activado; el pulso tiene su propio botón.</p>
          <button class="button secondary" data-action="back">VOLVER</button>
        </article>
      </section>
      <section class="screen modal-screen" data-screen="settings" aria-labelledby="settings-title">
        <article class="panel">
          <p class="eyebrow">PREFERENCIAS DEL PILOTO</p><h2 id="settings-title">Ajustes</h2>
          <label class="setting-row"><span>MÚSICA SINTETIZADA</span><input type="range" min="0" max="100" step="5" data-setting="music" aria-label="Volumen de música"><output data-output="music"></output></label>
          <label class="setting-row"><span>EFECTOS</span><input type="range" min="0" max="100" step="5" data-setting="effects" aria-label="Volumen de efectos"><output data-output="effects"></output></label>
          <label class="toggle-row"><span>Silenciar todo</span><input type="checkbox" data-setting="muted" aria-label="Silenciar todo"></label>
          <label class="toggle-row"><span>Reducir destellos y sacudidas</span><input type="checkbox" data-setting="reducedMotion" aria-label="Reducir movimiento"></label>
          <label class="toggle-row"><span>Disparo automático</span><input type="checkbox" data-setting="autoFire" aria-label="Disparo automático"></label>
          <button class="button secondary" data-action="back">VOLVER</button>
        </article>
      </section>
      <section class="screen modal-screen" data-screen="customize" aria-labelledby="customize-title">
        <article class="panel customize-panel">
          <p class="eyebrow">HANGAR DE PERSONALIZACIÓN</p><h2 id="customize-title">Elige tus colores</h2>
          <div class="ship-preview-card" data-ship-preview aria-label="Vista previa de AETHER-01">
            <div class="preview-heading"><span>VISTA PREVIA</span><strong>AETHER-01</strong></div>
            <svg class="ship-preview-art" viewBox="0 0 240 150" role="img" aria-labelledby="ship-preview-title ship-preview-desc">
              <title id="ship-preview-title">AETHER-01</title><desc id="ship-preview-desc">Nave de combate con alas angulares, núcleo luminoso y motores de energía.</desc>
              <defs><radialGradient id="preview-aura"><stop offset="0" stop-color="var(--ship-primary)" stop-opacity=".3"/><stop offset="1" stop-color="var(--ship-primary)" stop-opacity="0"/></radialGradient></defs>
              <ellipse cx="120" cy="78" rx="83" ry="60" fill="url(#preview-aura)"/>
              <path class="preview-flame" d="M101 95 L108 132 L120 111 L132 132 L139 95 Z"/>
              <path class="preview-hull" d="M120 20 L139 49 L185 70 L157 80 L145 111 L120 101 L95 111 L83 80 L55 70 L101 49 Z"/>
              <path class="preview-wing" d="M103 51 L71 70 L94 75 L104 68 M137 51 L169 70 L146 75 L136 68"/>
              <path class="preview-canopy" d="M120 31 L132 58 L128 89 L120 97 L112 89 L108 58 Z"/>
              <circle class="preview-core-glow" cx="120" cy="61" r="15"/><circle class="preview-core" cx="120" cy="61" r="7"/><circle class="preview-core-light" cx="117" cy="58" r="2.5"/>
              <circle class="preview-accent" cx="82" cy="82" r="3"/><circle class="preview-accent" cx="158" cy="82" r="3"/>
            </svg>
            <p class="palette-description" id="palette-description" aria-live="polite"></p>
          </div>
          <p class="palette-label">PALETAS DE COLOR</p>
          <div class="palette-grid" role="group" aria-label="Elige una paleta para tu nave">
            ${SHIP_PALETTES.map((palette) => `<button class="palette-option" data-action="palette" data-palette="${palette.id}" aria-pressed="${palette.id === this.shipPalette.id}">
              <span class="palette-swatches" aria-hidden="true"><i style="--swatch:#${palette.primary.toString(16).padStart(6, '0')}"></i><i style="--swatch:#${palette.secondary.toString(16).padStart(6, '0')}"></i><i style="--swatch:#${palette.accent.toString(16).padStart(6, '0')}"></i></span>
              <span class="palette-copy"><strong>${palette.name}</strong><small>${palette.description}</small></span><span class="palette-check" aria-hidden="true">✓</span>
            </button>`).join('')}
          </div>
          <p class="customize-hint">La elección se guarda automáticamente y también cambia tu nave durante la misión.</p>
          <button class="button secondary" data-action="back">VOLVER AL MENÚ</button>
        </article>
      </section>
      <section class="screen modal-screen" data-screen="paused" aria-labelledby="pause-title">
        <article class="panel pause-panel">
          <p class="eyebrow">MODO SEGURO</p><h2 id="pause-title">Misión en pausa</h2><p class="panel-note">El tiempo se detuvo. Revisa el radar y vuelve cuando estés listo.</p>
          <button class="button primary" data-action="resume">CONTINUAR <span class="button-arrow">↗</span></button>
          <button class="button quiet" data-action="settings">AJUSTES</button>
          <button class="button quiet" data-action="restart">REINICIAR MISIÓN</button>
          <button class="button quiet" data-action="menu">MENÚ PRINCIPAL</button>
        </article>
      </section>
      <section class="screen modal-screen" data-screen="gameover" aria-labelledby="end-title">
        <article class="panel result-panel"><p class="eyebrow">SEÑAL PERDIDA</p><h2 id="end-title">Misión terminada</h2><p class="result-score" data-result="score">000000</p><span class="result-caption">PUNTUACIÓN FINAL</span><div class="stats"><div><strong data-result="kills">0</strong><span>ELIMINACIONES</span></div><div><strong data-result="wave">0 / 5</strong><span>SECTORES</span></div><div><strong data-result="time">0:00</strong><span>TIEMPO</span></div></div><p class="record-note" data-result="record"></p><button class="button primary" data-action="restart">REINTENTAR <span class="button-arrow">↗</span></button><button class="button quiet" data-action="menu">MENÚ PRINCIPAL</button></article>
      </section>
      <section class="screen modal-screen" data-screen="victory" aria-labelledby="win-title">
        <article class="panel result-panel victory-panel"><p class="eyebrow"><span class="status-dot"></span>OBJETIVO NEUTRALIZADO</p><h2 id="win-title">El núcleo<br><em>ha caído.</em></h2><p class="panel-note">Las estrellas vuelven a respirar. La frontera no olvidará tu señal.</p><p class="result-score" data-result="score">000000</p><span class="result-caption">PUNTUACIÓN FINAL</span><div class="stats"><div><strong data-result="kills">0</strong><span>ELIMINACIONES</span></div><div><strong data-result="wave">5 / 5</strong><span>SECTORES</span></div><div><strong data-result="time">0:00</strong><span>TIEMPO</span></div></div><p class="record-note" data-result="record"></p><button class="button primary" data-action="restart">OTRA MISIÓN <span class="button-arrow">↗</span></button><button class="button quiet" data-action="menu">MENÚ PRINCIPAL</button></article>
      </section>
      <button class="pause-button" data-action="pause" aria-label="Pausar misión" title="Pausar (Esc)"><span></span><span></span></button>
      <button class="touch-pulse" data-action="pulse" aria-label="Activar Pulso de Resonancia" disabled><i></i><span>PULSO</span></button>
      <div class="touch-hint">ARRASTRA PARA MOVER</div>
      <div class="screen-reader" aria-live="polite" aria-atomic="true"></div>`;
    this.live = this.root.querySelector<HTMLElement>('.screen-reader')!;
    this.root.querySelector('#menu-best')!.textContent = getBest().toString().padStart(6, '0');
    this.updateShipPalettePreview();
    this.root.addEventListener('click', this.onClick);
    this.root.addEventListener('input', this.onInput);
    this.root.addEventListener('change', this.onChange);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('blur', this.onBlur);
    this.game.events.on('game-ready', this.onReady);
    this.game.events.on('run-state', this.onRunState);
    this.game.events.on('run-ended', this.onRunEnded);
    this.game.events.on('hud', this.onHud);
    this.setSettingsForm();
    this.show('menu');
  }

  private onClick = (event: MouseEvent): void => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target) return;
    event.preventDefault(); event.stopPropagation();
    const action = target.dataset.action!;
    this.audio.unlock(); this.audio.play('ui');
    if (action === 'controls' || action === 'settings' || action === 'customize') { this.show(action); return; }
    if (action === 'palette') { this.selectShipPalette(target.dataset.palette); return; }
    if (action === 'back') { this.show(this.screen === 'settings' ? (this.game.registry.get('paused') ? 'paused' : 'menu') : 'menu'); return; }
    this.game.events.emit('ui-action', action);
  };
  private onInput = (event: Event): void => {
    const input = event.target as HTMLInputElement;
    const key = input.dataset.setting as keyof Settings | undefined;
    if (!key || (key !== 'music' && key !== 'effects')) return;
    this.settings[key] = Number(input.value) / 100;
    this.updateOutput(key); this.persistSettings();
  };
  private onChange = (event: Event): void => {
    const input = event.target as HTMLInputElement;
    const key = input.dataset.setting as keyof Settings | undefined;
    if (!key) return;
    if (key === 'music' || key === 'effects') this.settings[key] = Number(input.value) / 100;
    else this.settings[key] = input.checked;
    this.persistSettings(); this.setSettingsForm();
  };
  private onVisibility = (): void => { if (document.hidden) this.game.events.emit('ui-action', 'pause'); };
  private onBlur = (): void => { this.game.events.emit('ui-action', 'pause'); };

  private onReady = ({ best, settings }: { best: number; settings: Settings }): void => {
    this.settings = { ...DEFAULT_SETTINGS, ...settings }; this.audio.setSettings(this.settings);
    this.root.querySelector('#menu-best')!.textContent = best.toString().padStart(6, '0'); this.setSettingsForm();
  };
  private selectShipPalette(id: string | undefined): void {
    if (!SHIP_PALETTES.some((palette) => palette.id === id)) return;
    this.shipPalette = saveShipPalette(id as ShipPaletteId);
    this.updateShipPalettePreview();
    this.game.events.emit('ship-palette-changed', this.shipPalette);
  }
  private updateShipPalettePreview(): void {
    const preview = this.root.querySelector<HTMLElement>('[data-ship-preview]');
    if (!preview) return;
    const colors = { primary: `#${this.shipPalette.primary.toString(16).padStart(6, '0')}`, secondary: `#${this.shipPalette.secondary.toString(16).padStart(6, '0')}`, accent: `#${this.shipPalette.accent.toString(16).padStart(6, '0')}` };
    for (const [key, value] of Object.entries(colors)) {
      preview.style.setProperty(`--ship-${key}`, value);
      this.root.querySelector<HTMLElement>('.customize-panel')?.style.setProperty(`--ship-${key}`, value);
    }
    this.root.querySelector('#palette-description')!.textContent = this.shipPalette.description;
    this.root.querySelectorAll<HTMLButtonElement>('[data-palette]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.palette === this.shipPalette.id)));
  }
  private onRunState = ({ state }: { state: string }): void => {
    if (state === 'paused') { this.game.registry.set('paused', true); this.show('paused'); }
    else if (state === 'playing') { this.game.registry.set('paused', false); this.show(''); }
    else if (state === 'victorySequence') this.show('sequence');
    else if (state === 'menu') { this.game.registry.set('paused', false); this.show('menu'); }
    else if (state === 'gameover' || state === 'victory') { this.show(state); }
  };
  private onRunEnded = (result: { result: 'gameover' | 'victory'; score: number; best: number; record: boolean; kills: number; wave: number; seconds: number }): void => {
    this.show(result.result);
    this.root.querySelectorAll<HTMLElement>('[data-result="score"]').forEach((el) => { el.textContent = result.score.toString().padStart(6, '0'); });
    this.root.querySelectorAll<HTMLElement>('[data-result="kills"]').forEach((el) => { el.textContent = String(result.kills); });
    this.root.querySelectorAll<HTMLElement>('[data-result="wave"]').forEach((el) => { el.textContent = `${Math.min(result.wave, 5)} / 5`; });
    this.root.querySelectorAll<HTMLElement>('[data-result="time"]').forEach((el) => { el.textContent = `${Math.floor(result.seconds / 60)}:${String(result.seconds % 60).padStart(2, '0')}`; });
    this.root.querySelectorAll<HTMLElement>('[data-result="record"]').forEach((el) => { el.textContent = result.record ? '✦ NUEVO RÉCORD PERSONAL' : `RÉCORD PERSONAL  ${result.best.toString().padStart(6, '0')}`; });
  };
  private onHud = (hud: Hud): void => {
    this.live.textContent = `Oleada ${hud.wave}. Puntuación ${hud.score}. Vidas ${hud.hp}. Resonancia ${hud.energy} por ciento.`;
    const pulse = this.root.querySelector<HTMLButtonElement>('.touch-pulse')!;
    pulse.disabled = hud.energy < 100; pulse.classList.toggle('ready', hud.energy >= 100);
  };

  private show(screen: string): void {
    this.screen = screen;
    this.root.querySelectorAll<HTMLElement>('[data-screen]').forEach((element) => element.classList.toggle('is-visible', element.dataset.screen === screen));
    this.root.classList.toggle('is-playing', screen === '');
    this.root.classList.toggle('is-menu', screen === 'menu' || screen === 'controls' || screen === 'settings' || screen === 'customize');
    const gameActive = screen === '' || screen === 'paused';
    this.root.querySelector<HTMLElement>('.pause-button')!.hidden = !gameActive;
    this.root.querySelector<HTMLElement>('.touch-pulse')!.hidden = screen !== '';
    this.root.querySelector<HTMLElement>('.touch-hint')!.hidden = screen !== '';
  }
  private setSettingsForm(): void {
    for (const key of ['music', 'effects'] as const) { const input = this.root.querySelector<HTMLInputElement>(`[data-setting="${key}"]`); if (input) input.value = String(Math.round(this.settings[key] * 100)); this.updateOutput(key); }
    for (const key of ['muted', 'reducedMotion', 'autoFire'] as const) { const input = this.root.querySelector<HTMLInputElement>(`[data-setting="${key}"]`); if (input) input.checked = this.settings[key]; }
  }
  private updateOutput(key: 'music' | 'effects'): void { const output = this.root.querySelector<HTMLOutputElement>(`[data-output="${key}"]`); if (output) output.value = `${Math.round(this.settings[key] * 100)}%`; }
  private persistSettings(): void { saveSettings(this.settings); this.audio.setSettings(this.settings); this.game.events.emit('settings-changed', this.settings); }
}
