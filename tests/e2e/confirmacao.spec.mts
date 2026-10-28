/**
 * Links dos e-mails do Auth (ADR-0002 §8, R1 e R2). Abrir a página não usa o
 * token, como acontece quando um filtro de e-mail ou a prévia de um aplicativo
 * abre o link; só o botão confirma. O token vem da API administrativa, sem
 * mandar e-mail.
 */
import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import {
  contaSemConfirmacao,
  entrarPelaApi,
  novoUsuario,
  tokenDeCadastro,
  tokenDeRecuperacao,
} from "./apoio/dados.mjs";

function senhaDeTeste(): string {
  return `${randomBytes(18).toString("base64url")}aA1!`;
}

async function criarSenhaPelaTela(page: Page, senha: string): Promise<void> {
  await page.getByLabel("Nova senha", { exact: true }).fill(senha);
  await page.getByLabel("Repita a nova senha").fill(senha);
  await page.getByRole("button", { name: "Gravar a nova senha" }).click();
  await expect(page).toHaveURL(/\/inicio$/);
}

test("R1: abrir o link não usa o token; o botão confirma e leva à nova senha", async ({
  page,
  request,
}) => {
  const usuario = await novoUsuario("confirmacao");
  const token = await tokenDeRecuperacao(usuario.email);
  const link = `/auth/confirmar?proximo=%2Fnova-senha&token_hash=${token}&type=recovery`;

  // Filtro e prévia: duas aberturas, fora do navegador da pessoa e sem clique.
  for (let abertura = 0; abertura < 2; abertura += 1) {
    const resposta = await request.get(link);
    expect(resposta.status()).toBe(200);
    expect(new URL(resposta.url()).pathname).toBe("/auth/confirmar");
    expect(resposta.headers()["cache-control"]).toContain("no-store");
    expect(resposta.headers()["referrer-policy"]).toBe("same-origin");
  }

  await page.goto(link);
  await expect(
    page.getByRole("heading", { name: "Redefinir senha" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page).toHaveURL(/\/nova-senha$/);
  await expect(
    page.getByRole("heading", { name: "Criar nova senha" }),
  ).toBeVisible();
  await expect(page.getByLabel("Nova senha", { exact: true })).toBeVisible();

  // O token vale uma vez: confirmar de novo o mesmo link dá o aviso fixo.
  await page.goto(link);
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page).toHaveURL(/\/entrar\?aviso=link-invalido$/);
});

test("R2: link com o token repetido vai direto para o aviso, sem botão", async ({
  page,
}) => {
  await page.goto(
    "/auth/confirmar?token_hash=alheio&type=recovery&token_hash=h1&type=recovery",
  );
  await expect(page).toHaveURL(/\/entrar\?aviso=link-invalido$/);
});

test("R8: o cadastro pede só nome e e-mail", async ({ page }) => {
  await page.goto("/cadastro");
  await expect(page.getByLabel("E-mail")).toBeVisible();
  await expect(page.getByLabel("Senha", { exact: true })).toHaveCount(0);
});

test("R8: a confirmação tira a senha de quem cadastrou antes; o dono cria a dele", async ({
  page,
}) => {
  const antes = await contaSemConfirmacao("r8-cadastro");
  const token = await tokenDeCadastro(antes.email);
  await page.goto(
    `/auth/confirmar?proximo=%2Finicio&token_hash=${token}&type=signup`,
  );
  await page.getByRole("button", { name: "Confirmar e-mail" }).click();
  await expect(page).toHaveURL(/\/nova-senha$/);

  // Logo depois da confirmação, antes de o dono criar a senha, a de quem
  // cadastrou antes já não entra.
  expect((await entrarPelaApi(antes.email, antes.senha)).erro).toBe(
    "invalid_credentials",
  );

  const senhaDoDono = senhaDeTeste();
  await criarSenhaPelaTela(page, senhaDoDono);
  expect((await entrarPelaApi(antes.email, senhaDoDono)).erro).toBeNull();
});

test("R8: a nova senha encerra as outras sessões da conta", async ({
  page,
}) => {
  const usuario = await novoUsuario("outras-sessoes");
  const outra = await entrarPelaApi(usuario.email, usuario.senha);
  expect(outra.erro).toBeNull();

  const token = await tokenDeRecuperacao(usuario.email);
  await page.goto(
    `/auth/confirmar?proximo=%2Fnova-senha&token_hash=${token}&type=recovery`,
  );
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page).toHaveURL(/\/nova-senha$/);
  await criarSenhaPelaTela(page, senhaDeTeste());

  const renovacao = await outra.cliente.auth.refreshSession();
  expect(renovacao.error).not.toBeNull();
});
