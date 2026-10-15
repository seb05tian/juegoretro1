import Phaser from 'phaser';
import { WORLD, PALETTE } from './config/balance';
import { GameScene } from './scenes/GameScene';
import { Overlay } from './ui/Overlay';
import { SynthAudio } from './systems/audio';
import './style.css';

const audio = new SynthAudio();
const scene = new GameScene(audio);
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: WORLD.width,
  height: WORLD.height,
  backgroundColor: PALETTE.space,
  scene: [scene],
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: WORLD.width, height: WORLD.height },
  render: { antialias: true, roundPixels: false, pixelArt: false },
  fps: { target: 60, forceSetTimeOut: false, smoothStep: true },
  input: { activePointers: 2, touch: { capture: true } },
  banner: false,
});
new Overlay(game, audio);
if (import.meta.env.DEV) {
  Object.defineProperty(window, '__VOID_PULSE_DEBUG__', { value: {
    snapshot: () => scene.debugSnapshot(),
    startBoss: () => scene.debugStartBoss(),
    firePlayer: () => scene.debugFirePlayer(),
    scheduleGift: () => scene.debugScheduleGift(),
    bringGiftToPlayer: () => scene.debugBringGiftToPlayer(),
    setBossHealth: (hp: number) => scene.debugSetBossHealth(hp),
    preparePulse: () => scene.debugPreparePulse(),
    eliminatePlayer: () => scene.debugEliminatePlayer(),
  }, configurable: false, enumerable: false });
}

window.addEventListener('error', (event) => {
  const message = document.querySelector<HTMLElement>('#fatal-error');
  if (message) { message.hidden = false; message.textContent = 'No se pudo iniciar el motor gráfico. Prueba en una versión reciente de Chrome, Firefox o Safari.'; }
  else console.error('VOID PULSE runtime error', event.message);
});
window.addEventListener('unhandledrejection', () => {
  const message = document.querySelector<HTMLElement>('#fatal-error');
  if (message) { message.hidden = false; message.textContent = 'El motor del juego encontró un error al iniciar. Actualiza el navegador o prueba en Chrome, Firefox o Safari recientes.'; }
});

