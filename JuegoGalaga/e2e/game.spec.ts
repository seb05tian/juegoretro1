import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('menú, controles y ajustes persisten en los dos formatos', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /void pulse/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /iniciar misión/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pausar misión' })).toBeHidden();
  await expect(page.locator('.touch-pulse')).toBeHidden();
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: `artifacts/${testInfo.project.name}-menu.png`, fullPage: true });

  await page.getByRole('button', { name: 'CONTROLES' }).click();
  await expect(page.getByRole('heading', { name: 'Controles' })).toBeVisible();
  await page.waitForTimeout(320);
  await page.screenshot({ path: `artifacts/${testInfo.project.name}-controls.png`, fullPage: true });
  await page.getByRole('button', { name: 'VOLVER' }).click();
  await page.getByRole('button', { name: 'AJUSTES' }).click();
  await page.getByRole('checkbox', { name: 'Reducir movimiento' }).check();
  await expect(page.getByRole('checkbox', { name: 'Reducir movimiento' })).toBeChecked();
  await page.waitForTimeout(320);
  await page.screenshot({ path: `artifacts/${testInfo.project.name}-settings.png`, fullPage: true });
  await page.reload();
  await page.getByRole('button', { name: 'AJUSTES' }).click();
  await expect(page.getByRole('checkbox', { name: 'Reducir movimiento' })).toBeChecked();
  await page.getByRole('button', { name: 'VOLVER' }).click();
  await expect(page.getByRole('button', { name: /iniciar misión/i })).toBeVisible();
  expect(errors).toEqual([]);
});

test('ofrece ocho paletas, previsualiza la nave y conserva la selección', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: /personalizar nave/i }).click();
  await expect(page.getByRole('heading', { name: 'Elige tus colores' })).toBeVisible();
  const preview = page.locator('[data-ship-preview]');
  await expect(preview).toBeVisible();
  await expect(page.locator('.ship-preview-art')).toBeVisible();
  await expect(page.locator('[data-palette]')).toHaveCount(8);
  await page.locator('[data-palette="aurora"]').click();
  await expect(page.locator('[data-palette="aurora"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-palette="aether"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#palette-description')).toHaveText('Menta · turquesa · rosa');
  await expect.poll(() => preview.evaluate((element) => (element as HTMLElement).style.getPropertyValue('--ship-primary'))).toBe('#8cf0c6');
  await expect.poll(() => page.locator('[data-palette="aurora"]').evaluate((element) => getComputedStyle(element).borderTopColor)).toBe('rgb(140, 240, 198)');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('void-pulse-ship-palette-v1'))).toBe('aurora');
  await page.screenshot({ path: `artifacts/${testInfo.project.name}-customize.png`, fullPage: true });
  await page.reload();
  await page.getByRole('button', { name: /personalizar nave/i }).click();
  await expect(page.locator('[data-palette="aurora"]')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'VOLVER AL MENÚ' }).click();
  await page.getByRole('button', { name: /iniciar misión/i }).click();
  await expect.poll(async () => page.evaluate(() => window.__VOID_PULSE_DEBUG__?.snapshot().shipPalette)).toBe('aurora');
  expect(errors).toEqual([]);
});

test('fires one straight shot, then a falling gift grants temporary triple fire', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('void-pulse-settings-v1', JSON.stringify({ music: 0.35, effects: 0.55, muted: false, reducedMotion: false, autoFire: false })));
  await page.goto('/');
  await page.evaluate(() => window.__VOID_PULSE_DEBUG__?.startBoss());
  await expect.poll(async () => page.evaluate(() => window.__VOID_PULSE_DEBUG__?.snapshot().player)).toMatchObject({ weapon: 'single' });

  await page.evaluate(() => window.__VOID_PULSE_DEBUG__?.firePlayer());
  await expect.poll(async () => page.evaluate(() => (window.__VOID_PULSE_DEBUG__?.snapshot().friendlyShots as Array<{ vx: number; vy: number }>).length)).toBe(1);
  const baseShots = await page.evaluate(() => window.__VOID_PULSE_DEBUG__?.snapshot().friendlyShots as Array<{ vx: number; vy: number }>);
  expect(baseShots).toHaveLength(1);
  expect(baseShots[0]).toMatchObject({ x: 270, vx: 0, vy: -720 });

  await page.evaluate(() => window.__VOID_PULSE_DEBUG__?.scheduleGift());
  await expect.poll(async () => page.evaluate(() => (window.__VOID_PULSE_DEBUG__?.snapshot().pickups as Array<{ gift: boolean }>).some((pickup) => pickup.gift))).toBe(true);
  const gift = await page.evaluate(() => (window.__VOID_PULSE_DEBUG__?.snapshot().pickups as Array<{ type: string; y: number; gift: boolean }>).find((pickup) => pickup.gift)!);
  expect(gift).toMatchObject({ type: 'triple', gift: true });
  expect(gift.y).toBeGreaterThan(100);
  expect(gift.y).toBeLessThan(180);
  await page.screenshot({ path: `artifacts/${testInfo.project.name}-gift-drop.png`, fullPage: true });
  await page.evaluate(() => window.__VOID_PULSE_DEBUG__?.bringGiftToPlayer());
  await expect.poll(async () => page.evaluate(() => window.__VOID_PULSE_DEBUG__?.snapshot().player), { timeout: 10_000 }).toMatchObject({ weapon: 'triple' });

  await page.evaluate(() => window.__VOID_PULSE_DEBUG__?.firePlayer());
  await expect.poll(async () => page.evaluate(() => (window.__VOID_PULSE_DEBUG__?.snapshot().friendlyShots as Array<{ vx: number }>).length)).toBe(3);
  const upgradedShots = await page.evaluate(() => window.__VOID_PULSE_DEBUG__?.snapshot().friendlyShots as Array<{ vx: number; vy: number }>);
  expect(upgradedShots.map((shot) => shot.vx).sort((a, b) => a - b)).toEqual([-21.6, 0, 21.6]);
  expect(upgradedShots.every((shot) => shot.vy === -720)).toBe(true);
});

test('inicia, mueve, pausa, continúa y reinicia una partida', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: /iniciar misión/i }).click();
  await expect.poll(async () => page.evaluate(() => window.__VOID_PULSE_DEBUG__?.snapshot().state)).toBe('playing');
  await page.waitForTimeout(1_900);
  const before = await page.evaluate(() => window.__VOID_PULSE_DEBUG__?.snapshot().player as { x: number; y: number });
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(180);
  await page.keyboard.up('ArrowLeft');
  const after = await page.evaluate(() => window.__VOID_PULSE_DEBUG__?.snapshot().player as { x: number; y: number });
  expect(after.x).toBeLessThan(before.x);
  await page.screenshot({ path: `artifacts/${testInfo.project.name}-gameplay.png`, fullPage: true });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Misión en pausa' })).toBeVisible();
  await page.waitForTimeout(320);
  await page.screenshot({ path: `artifacts/${testInfo.project.name}-pause.png`, fullPage: true });
  const pausedTime = await page.evaluate(() => Number(window.__VOID_PULSE_DEBUG__?.snapshot().time));
  await page.waitForTimeout(400);
  await expect.poll(async () => page.evaluate(() => Number(window.__VOID_PULSE_DEBUG__?.snapshot().time))).toBe(pausedTime);
  await page.getByRole('button', { name: /continuar/i }).click();
  await expect.poll(async () => page.evaluate(() => window.__VOID_PULSE_DEBUG__?.snapshot().state)).toBe('playing');
  await page.getByRole('button', { name: 'Pausar misión' }).click();
  await page.getByRole('button', { name: 'REINICIAR MISIÓN' }).click();
  await expect.poll(async () => page.evaluate(() => window.__VOID_PULSE_DEBUG__?.snapshot().state)).toBe('playing');
  const reset = await page.evaluate(() => window.__VOID_PULSE_DEBUG__?.snapshot());
  expect(reset?.player).toMatchObject({ x: 270, y: 820, hp: 3, energy: 0 });
  expect(errors).toEqual([]);
});

test('el control táctil queda disponible en vista móvil', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'El control táctil se presenta en dispositivos con puntero táctil.');
  await page.goto('/');
  await page.getByRole('button', { name: /iniciar misión/i }).click();
  await expect(page.locator('.touch-pulse')).toBeVisible();
  await expect(page.locator('#game canvas')).toBeVisible();
  const frame = await page.locator('#game-frame').boundingBox();
  expect(frame?.height).toBeLessThanOrEqual((page.viewportSize()?.height ?? 0) + 1);
});

test('el pulso convierte disparos y el jefe completa sus tres fases', async ({ page, isMobile }) => {
  await page.goto('/');
  await page.evaluate(() => window.__VOID_PULSE_DEBUG__?.startBoss());
  await expect.poll(async () => page.evaluate(() => window.__VOID_PULSE_DEBUG__?.snapshot().boss)).toMatchObject({ hp: 120, phase: 1 });
  await page.evaluate(() => window.__VOID_PULSE_DEBUG__?.preparePulse());
  if (isMobile) await page.locator('.touch-pulse').click();
  else await page.keyboard.press('x');
  await expect.poll(async () => page.evaluate(() => window.__VOID_PULSE_DEBUG__?.snapshot())).toMatchObject({ convertedCount: 12, player: { energy: 0 } });

  await page.evaluate(() => window.__VOID_PULSE_DEBUG__?.setBossHealth(72));
  await expect.poll(async () => page.evaluate(() => window.__VOID_PULSE_DEBUG__?.snapshot().boss)).toMatchObject({ hp: 72, phase: 2 });
  await page.evaluate(() => window.__VOID_PULSE_DEBUG__?.setBossHealth(30));
  await expect.poll(async () => page.evaluate(() => window.__VOID_PULSE_DEBUG__?.snapshot().boss)).toMatchObject({ hp: 30, phase: 3 });
  await page.screenshot({ path: `artifacts/${test.info().project.name}-boss-phase-3.png`, fullPage: true });
  await page.evaluate(() => window.__VOID_PULSE_DEBUG__?.setBossHealth(0));
  await expect.poll(async () => page.evaluate(() => window.__VOID_PULSE_DEBUG__?.snapshot().state), { timeout: 20_000 }).toBe('victory');
  await expect(page.getByRole('heading', { name: /el núcleo ha caído/i })).toBeVisible();
  await expect(page.locator('[data-screen="victory"] [data-result="record"]')).toContainText('NUEVO RÉCORD');
  await page.waitForTimeout(320);
  await page.screenshot({ path: `artifacts/${test.info().project.name}-victory.png`, fullPage: true });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('void-pulse-best-v1'))).toBe('1250');
});

test('muestra derrota y guarda un récord tras perder la última vida', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__VOID_PULSE_DEBUG__?.startBoss());
  await page.evaluate(() => window.__VOID_PULSE_DEBUG__?.eliminatePlayer());
  await expect(page.getByRole('heading', { name: 'Misión terminada' })).toBeVisible();
  await expect(page.locator('[data-screen="gameover"] [data-result="wave"]')).toContainText('5 / 5');
  await page.waitForTimeout(320);
  await page.screenshot({ path: `artifacts/${test.info().project.name}-gameover.png`, fullPage: true });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('void-pulse-best-v1'))).toBe('1250');
});
