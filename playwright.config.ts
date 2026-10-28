/**
 * E2E com Playwright (ADR-0001 §4; I1.6). Roda contra o servidor de
 * desenvolvimento local, que fala com o projeto Supabase de `dev` do `.env`.
 * Um worker só: os testes gravam no banco compartilhado, sob a mesma trava
 * (advisory lock) do reset e dos testes de banco (preparação global).
 *
 * O widget anti-robô fica desligado no servidor dos testes
 * (`NEXT_PUBLIC_TURNSTILE_SITE_KEY` vazia): a tela não envia token. Se o
 * captcha estiver ligado no Auth do projeto, o login dos testes falha.
 *
 * Os arquivos dos E2E são ESM (`.mts`): num pacote sem `"type": "module"`, o
 * Playwright transforma em CommonJS os `.ts` e os `.mjs` que eles importam, e
 * os scripts de `scripts/lib/` usam `import.meta` (ver
 * `tests/e2e/apoio/dados.mts`).
 */
import { defineConfig, devices } from "@playwright/test";

const PORTA = 3000;
const ENDERECO = `http://localhost:${String(PORTA)}`;
const NO_CI = process.env.CI !== undefined && process.env.CI !== "";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.mts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: NO_CI,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  outputDir: "test-results",
  globalSetup: "./tests/e2e/preparacao-global.mts",
  use: {
    baseURL: ENDERECO,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: ENDERECO,
    reuseExistingServer: !NO_CI,
    timeout: 180_000,
    env: { NEXT_PUBLIC_TURNSTILE_SITE_KEY: "" },
  },
});
