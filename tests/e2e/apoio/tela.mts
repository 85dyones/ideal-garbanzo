/** Passos de tela repetidos nos E2E. */
import { expect, type Page } from "@playwright/test";
import type { UsuarioDeTeste } from "./dados.mjs";

/** Entra pela tela de login e espera o início. */
export async function entrarPelaTela(
  pagina: Page,
  usuario: UsuarioDeTeste,
): Promise<void> {
  await pagina.goto("/entrar");
  await pagina.getByLabel("E-mail", { exact: true }).fill(usuario.email);
  await pagina.getByLabel("Senha", { exact: true }).fill(usuario.senha);
  await pagina.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(pagina).toHaveURL(/\/inicio$/u);
  await expect(
    pagina.getByRole("heading", { name: "Início", exact: true }),
  ).toBeVisible();
}

/** Abre o caminho e confere o "Sem permissão"; devolve o status e o texto do conteúdo. */
export async function abrirSemPermissao(
  pagina: Page,
  caminho: string,
): Promise<{ status: number | undefined; texto: string }> {
  const resposta = await pagina.goto(caminho);
  await expect(
    pagina.getByRole("heading", { name: "Sem permissão", exact: true }),
  ).toBeVisible();
  return {
    status: resposta?.status(),
    texto: await pagina.locator("main").innerText(),
  };
}
