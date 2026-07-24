import { test, expect } from '@playwright/test';
import { login, hasTestCredentials, uniqueTag } from './fixtures';

test('cria uma OS de manutenção pelo wizard e ela aparece na lista', async ({ page }) => {
  test.skip(!hasTestCredentials, 'E2E_TEST_EMAIL/E2E_TEST_PASSWORD não configurados — ver e2e/README.md');

  await login(page);

  await page.goto('/manutencao/nova');

  // Etapa 1 — Motivo: marca ao menos um problema (exigido pra continuar).
  await page.getByText('CTO quebrada').click();
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Etapa 2 — Informações: solicitante é o único campo obrigatório.
  const solicitante = uniqueTag();
  await page.getByPlaceholder('Nome do solicitante ou cliente').fill(solicitante);
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Etapa 3 — Localização: sem permissão de geolocalização no ambiente de
  // teste, o fluxo automático falha rápido e libera "Continuar sem localização".
  await page.getByRole('button', { name: /Continuar sem localização/i }).click({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Criar Ordem de Serviço' }).click();

  // Cai na tela de detalhe da OS recém-criada.
  await expect(page.getByRole('heading', { name: /^OS-/ })).toBeVisible({ timeout: 15_000 });
  const numero = (await page.getByRole('heading', { name: /^OS-/ }).textContent())?.trim();
  expect(numero).toBeTruthy();

  // Confere que aparece na lista de ordens.
  await page.goto('/manutencao/ordens');
  await page.getByPlaceholder(/Buscar por número da OS/i).fill(numero!);
  await expect(page.getByText(numero!)).toBeVisible({ timeout: 10_000 });
});
