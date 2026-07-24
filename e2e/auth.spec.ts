import { test, expect } from '@playwright/test';
import { login, hasTestCredentials } from './fixtures';

test('mostra erro com credenciais inválidas', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('E-mail').fill('nao-existe@exemplo.com');
  await page.getByPlaceholder('Senha').fill('senha-errada-123');
  await page.getByRole('button', { name: 'Entrar' }).click();

  // Qualquer mensagem de erro visível (texto exato depende da resposta do
  // Supabase — "Invalid login credentials" é o mais comum).
  await expect(page.locator('text=/credenciais|inválid|invalid/i')).toBeVisible({ timeout: 10_000 });
});

test('loga com credenciais válidas e chega no Dashboard', async ({ page }) => {
  test.skip(!hasTestCredentials, 'E2E_TEST_EMAIL/E2E_TEST_PASSWORD não configurados — ver e2e/README.md');
  await login(page);
  await expect(page).toHaveURL('/');
});
