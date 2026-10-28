/**
 * Links dos e-mails do Auth (ADR-0002 §8, R1 e R2). Abrir a página não usa o
 * token, como acontece quando um filtro de e-mail ou a prévia de um aplicativo
 * abre o link; só o botão confirma. O token vem da API administrativa, sem
 * mandar e-mail.
 */
import { expect, test } from "@playwright/test";
import { novoUsuario, tokenDeRecuperacao } from "./apoio/dados.mjs";

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
