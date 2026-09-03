import { expect, test } from '@playwright/test';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';

test('imports a synthetic modular sprite and reopens its protected source', async ({ page }) => {
  await page.goto('/?renderer=pixi');
  const pngBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 32;
    const context = canvas.getContext('2d');
    context.fillStyle = '#e53935';
    context.fillRect(5, 6, 16, 20);
    context.fillStyle = '#1e88e5';
    context.fillRect(42, 8, 14, 16);
    return canvas.toDataURL('image/png').split(',')[1];
  });

  await page.getByRole('button', { name: 'Import', exact: true }).first().click();
  await page.getByRole('button', { name: '2D Modular Sprite…' }).click();
  await page.locator('input[type="file"][accept*="image/png"]').setInputFiles({
    name: 'synthetic-sheet.png',
    mimeType: 'image/png',
    buffer: Buffer.from(pngBase64, 'base64'),
  });

  await expect(page.getByText('2 regions')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  const confirmButtons = page.getByRole('button', { name: 'Confirm', exact: true });
  while (await confirmButtons.count()) await confirmButtons.first().click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Import set' }).click();

  await page.locator('#layers-panel span[title="synthetic-sheet"]').click();
  await expect(page.getByText('Modular Source')).toBeVisible();

  await page.getByTitle('Save project').click();
  await page.getByRole('tab', { name: 'Download File' }).click();
  await page.getByLabel('Project Name').fill('modular-roundtrip');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const download = await downloadPromise;
  const archivePath = await download.path();
  expect(archivePath).toBeTruthy();

  await page.getByTitle('Load project').click();
  await page.locator('input[accept=".kk2d"]').setInputFiles({
    name: 'modular-roundtrip.kk2d',
    mimeType: 'application/zip',
    buffer: readFileSync(archivePath),
  });
  await page.getByRole('button', { name: 'Replace Workspace' }).click();
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.locator('#layers-panel span[title="synthetic-sheet"]')).toBeVisible();
  const sourceName = page.locator('span[title="synthetic-sheet Source"]');
  if (!await sourceName.isVisible()) await page.locator('#layers-panel span[title="synthetic-sheet"]').click();
  await expect(page.getByText('Modular Source')).toBeVisible();
  await sourceName.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Edit modular sprite' }).click();
  await expect(page.getByRole('heading', { name: 'Edit synthetic-sheet' })).toBeVisible();
});
