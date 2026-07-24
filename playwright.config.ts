import { defineConfig, devices } from '@playwright/test';

/**
 * Suíte de fumaça (não cobertura exaustiva) — roda contra o app de verdade
 * (`npm run dev`), que por sua vez fala com o Supabase configurado no
 * `.env`. Alguns specs exigem uma conta de teste dedicada — ver e2e/README.md.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // specs criam/alteram dados reais no banco — evita corrida entre eles
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
