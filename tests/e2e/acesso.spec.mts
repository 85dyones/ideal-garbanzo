/**
 * Acesso às telas (I1.6): anônimo, login e o teste 1 pela página do comprador
 * (ADR-0002, anexo A, CT1.1, CT1.3 por amostragem e CT1.4, com contraste).
 */
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  SUFIXO,
  empresaDe,
  novoUsuario,
  pedidoDe,
  suspenderEmpresa,
  type UsuarioDeTeste,
} from "./apoio/dados.mjs";
import { abrirSemPermissao, entrarPelaTela } from "./apoio/tela.mjs";

test.describe.configure({ mode: "serial" });

interface Cenario {
  /** Perfil ativo, sem empresa, com pedido de adesão enviado. */
  readonly p1: UsuarioDeTeste;
  readonly pedidoDeP1: string;
  /** Membro ativo só de empresa fornecedora. */
  readonly fornecedor: UsuarioDeTeste;
  /** Membro ativo de empresa compradora suspensa. */
  readonly daSuspensa: UsuarioDeTeste;
  /** Contraste: membro ativo de empresa compradora ativa. */
  readonly comprador: UsuarioDeTeste;
}

let cenario: Cenario;

test.beforeAll(async () => {
  test.setTimeout(180_000);
  const marca = SUFIXO;
  const administrador = await novoUsuario("acesso-admin", true);
  const p1 = await novoUsuario("acesso-p1");
  const pedidoDeP1 = await pedidoDe(p1, `E2E P1 ${marca}`);
  const fornecedor = await novoUsuario("acesso-fornecedor");
  await empresaDe(
    administrador,
    fornecedor,
    `E2E Fornecedora ${marca}`,
    "supplier",
  );
  const daSuspensa = await novoUsuario("acesso-suspensa");
  const suspensa = await empresaDe(
    administrador,
    daSuspensa,
    `E2E Suspensa ${marca}`,
    "buyer",
  );
  await suspenderEmpresa(administrador, suspensa);
  const comprador = await novoUsuario("acesso-comprador");
  await empresaDe(administrador, comprador, `E2E Compradora ${marca}`, "buyer");
  cenario = { p1, pedidoDeP1, fornecedor, daSuspensa, comprador };
});

test("anônimo em /inicio vai para a entrada, com o caminho de volta", async ({
  page,
}) => {
  await page.goto("/inicio");
  await expect(page).toHaveURL(/\/entrar\?proximo=%2Finicio$/u);
  await expect(
    page.getByRole("heading", { name: "Entrar", exact: true }),
  ).toBeVisible();
});

test("login com senha errada mostra erro; com a certa cai no início", async ({
  page,
}) => {
  await page.goto("/entrar");
  await page.getByLabel("E-mail", { exact: true }).fill(cenario.p1.email);
  await page.getByLabel("Senha", { exact: true }).fill("senha-errada-E2E-1");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
  await expect(page).toHaveURL(/\/entrar$/u);

  await page.getByLabel("E-mail", { exact: true }).fill(cenario.p1.email);
  await page.getByLabel("Senha", { exact: true }).fill(cenario.p1.senha);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/inicio$/u);
  await expect(
    page.getByRole("heading", { name: "Início", exact: true }),
  ).toBeVisible();
});

test("CT1.1 e CT1.4: sem empresa, o comprador e qualquer id dão o mesmo 'Sem permissão'", async ({
  page,
}) => {
  await entrarPelaTela(page, cenario.p1);
  const lista = await abrirSemPermissao(page, "/comprador");
  // Um id que existe (o do pedido de P1, em outra tabela) e dois que não existem.
  const fichas = [
    await abrirSemPermissao(page, `/comprador/ofertas/${cenario.pedidoDeP1}`),
    await abrirSemPermissao(page, `/comprador/ofertas/${randomUUID()}`),
    await abrirSemPermissao(page, `/comprador/ofertas/${randomUUID()}`),
    await abrirSemPermissao(page, "/comprador/ofertas/nao-e-um-id"),
  ];
  for (const ficha of fichas) {
    expect(ficha.status).toBe(lista.status);
    expect(ficha.texto).toBe(lista.texto);
  }
  await expect(page.getByText("Registro inexistente")).toHaveCount(0);
});

test("CT1.3 (amostra): membro só de fornecedora e membro de empresa suspensa não veem o comprador", async ({
  browser,
}) => {
  for (const usuario of [cenario.fornecedor, cenario.daSuspensa]) {
    const contexto = await browser.newContext();
    const page = await contexto.newPage();
    await entrarPelaTela(page, usuario);
    const lista = await abrirSemPermissao(page, "/comprador");
    const ficha = await abrirSemPermissao(
      page,
      `/comprador/ofertas/${randomUUID()}`,
    );
    expect(ficha.texto).toBe(lista.texto);
    await contexto.close();
  }
});

test("contraste: membro ativo de compradora ativa vê o comprador e 'Registro inexistente' na ficha", async ({
  page,
}) => {
  await entrarPelaTela(page, cenario.comprador);
  await page.goto("/comprador");
  await expect(
    page.getByRole("heading", { name: "Catálogo", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("O catálogo chega no Inc. 4.")).toBeVisible();
  await expect(page.getByText("Sem permissão")).toHaveCount(0);

  await page.goto(`/comprador/ofertas/${randomUUID()}`);
  await expect(
    page.getByRole("heading", { name: "Registro inexistente", exact: true }),
  ).toBeVisible();
});
