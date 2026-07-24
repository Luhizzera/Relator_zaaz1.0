import fs from 'fs';
import os from 'os';
import path from 'path';
import { test, expect } from '@playwright/test';
import { login, hasTestCredentials, uniqueTag } from './fixtures';

// PNG 1x1 vermelho, só pra ter um arquivo de imagem válido pra upload.
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('cria relatório, anexa foto, exporta PDF e a tela vira somente-leitura', async ({ page }) => {
  test.skip(!hasTestCredentials, 'E2E_TEST_EMAIL/E2E_TEST_PASSWORD não configurados — ver e2e/README.md');

  await login(page);

  // Nova OS → Relatório de Projetos
  await page.getByRole('button', { name: 'Nova OS' }).click();
  await page.getByText('Relatório de Projetos').click();
  await expect(page).toHaveURL(/\/ordens\/[^/]+$/, { timeout: 15_000 });

  // Config: só código de referência e local são obrigatórios pra continuar.
  const referencia = uniqueTag();
  await page.locator('#codigoReferencia').fill(referencia);
  await page.locator('#local').fill('Local de teste E2E');
  await page.getByRole('button', { name: /Continuar para Fotos/i }).click();
  await expect(page).toHaveURL(/\/ordens\/[^/]+\/fotos$/, { timeout: 15_000 });

  // Anexa uma foto (input de arquivo oculto, sem precisar simular câmera).
  const imgPath = path.join(os.tmpdir(), `e2e-foto-${Date.now()}.png`);
  fs.writeFileSync(imgPath, Buffer.from(TINY_PNG_BASE64, 'base64'));
  await page.locator('input[type="file"]').first().setInputFiles(imgPath);
  await expect(page.getByText(/Processando/i)).toHaveCount(0, { timeout: 15_000 });

  // Gera o PDF — isso já deve marcar a OS como 'exportada' no banco.
  await page.getByRole('button', { name: 'Gerar Relatório' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByText('PDF (.pdf)').click();
  await downloadPromise;

  // Recarrega a mesma OS: a tela de coleta deve ter dado lugar à visão
  // somente-leitura "Relatório finalizado".
  await page.reload();
  await expect(page.getByText('Relatório finalizado')).toBeVisible({ timeout: 15_000 });
});
