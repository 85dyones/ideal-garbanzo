/** Passos de tela repetidos nos E2E. */
import { expect, type BrowserContext, type Page } from "@playwright/test";
import type { UsuarioDeTeste } from "./dados.mjs";

type Cookies = Awaited<ReturnType<BrowserContext["cookies"]>>;

/**
 * Sessões já abertas nesta execução, por e-mail. O login da aplicação tem
 * limite de tentativas: 30 por IP e 10 por e-mail a cada 15 minutos (ADR-0002
 * §2.16), e a suíte inteira passava de 30 entradas numa rodada. Cada usuário
 * entra pela tela uma vez; nas vezes seguintes, a aba nova recebe os cookies
 * da sessão já aberta, como quem volta ao site com a sessão salva. O
 * Playwright roda num worker só, e este módulo vive a execução inteira.
 */
const sessoes = new Map<string, Cookies>();

function inicio(pagina: Page) {
  return pagina.getByRole("heading", { name: "Início", exact: true });
}

/**
 * Entra pela tela de login e espera o início. Se o usuário já entrou nesta
 * execução, reaproveita a sessão; se ela não vale mais, entra de novo.
 */
export async function entrarPelaTela(
  pagina: Page,
  usuario: UsuarioDeTeste,
): Promise<void> {
  const sessao = sessoes.get(usuario.email);
  if (sessao !== undefined) {
    await pagina.context().addCookies(sessao);
    await pagina.goto("/inicio");
    if (new URL(pagina.url()).pathname === "/inicio") {
      await expect(inicio(pagina)).toBeVisible();
      return;
    }
    sessoes.delete(usuario.email);
    await pagina.context().clearCookies();
  }
  await pagina.goto("/entrar");
  await pagina.getByLabel("E-mail", { exact: true }).fill(usuario.email);
  await pagina.getByLabel("Senha", { exact: true }).fill(usuario.senha);
  await pagina.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(pagina).toHaveURL(/\/inicio$/u);
  await expect(inicio(pagina)).toBeVisible();
  sessoes.set(usuario.email, await pagina.context().cookies());
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
