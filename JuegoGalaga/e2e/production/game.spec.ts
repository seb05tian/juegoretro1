import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('el build de producción funciona sin diagnósticos ni recursos externos', async ({ page }) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') external.push(url.href);
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /void pulse/i })).toBeVisible();
  expect(await page.evaluate(() => '__VOID_PULSE_DEBUG__' in window)).toBe(false);
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/production-menu.png', fullPage: true });
  await page.getByRole('button', { name: /iniciar misión/i }).click();
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pausar misión' })).toBeVisible();
  await page.waitForTimeout(500);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
