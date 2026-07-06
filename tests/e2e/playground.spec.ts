import { expect, test } from '@playwright/test';

test('explicit consent, content exclusion, and cleanup', async ({ page }) => {
  const posts: string[] = [];
  page.on('request', request => { if (request.method() === 'POST') posts.push(request.url()); });
  await page.goto('/');
  await expect(page.locator('.state')).toHaveText('idle');
  await expect(page.locator('.snapshot')).toContainText('Start collection');
  expect(posts).toEqual([]);
  await page.getByRole('button', { name: 'Start collection' }).click();
  await expect(page.locator('.state')).toHaveText('running');
  await page.locator('.sandbox').focus();
  await page.keyboard.press('A');
  await page.getByRole('textbox', { name: 'Excluded input' }).fill('SECRET-CONTENT');
  await expect.poll(async () => JSON.parse(await page.locator('.snapshot').innerText()).behavior.keyboardEventCount).toBe(1);
  const snapshot = await page.locator('.snapshot').innerText();
  expect(snapshot).not.toContain('SECRET-CONTENT');
  expect(snapshot).not.toContain('clientX');
  expect(posts).toEqual([]);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.locator('.state')).toHaveText('stopped');
  await page.getByRole('button', { name: 'Clear session' }).click();
  await expect(page.locator('.state')).toHaveText('idle');
});

test('mobile layout shows all controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start collection' })).toBeVisible();
  await expect(page.getByText('What can leave the browser?')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
