import { Page, expect } from '@playwright/test';

export const TEST_EMAIL = process.env.E2E_TEST_EMAIL;
export const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD;

/** true quando as credenciais de teste não foram configuradas — usar com `test.skip(!hasTestCredentials, ...)`. */
export const hasTestCredentials = !!(TEST_EMAIL && TEST_PASSWORD);

/** Loga com a conta de teste (ver e2e/README.md) e espera chegar no Dashboard. */
export async function login(page: Page): Promise<void> {
  if (!hasTestCredentials) {
    throw new Error('E2E_TEST_EMAIL/E2E_TEST_PASSWORD não configurados — ver e2e/README.md');
  }
  await page.goto('/');
  await page.getByPlaceholder('E-mail').fill(TEST_EMAIL!);
  await page.getByPlaceholder('Senha').fill(TEST_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('Dashboard')).toBeVisible({ timeout: 15_000 });
}

/** Um sufixo único por execução, pra não colidir com dados de runs anteriores. */
export function uniqueTag(): string {
  return `e2e-${Date.now()}`;
}
