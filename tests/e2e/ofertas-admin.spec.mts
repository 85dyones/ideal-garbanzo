/**
 * Telas administrativas da oferta (I2.9):
 * (a) o operador encontra a oferta na lista, devolve com motivo (e sem motivo
 *     recebe o erro), a empresa fornecedora vê o motivo e reenvia, e o
 *     operador publica;
 * (b) a suspensão sem motivo mostra o erro e não suspende; com categoria e
 *     motivo, suspende, e a empresa vê a oferta suspensa no painel;
 * (c) o operador não tem a ação de reativar; o administrador reativa com
 *     motivo, e a oferta volta a rascunho;
 * (d) a pessoa da equipe com vínculo com a empresa dona não vê ações de
 *     plataforma (B25);
 * (e) quem não é da equipe recebe "Sem permissão" em `/admin/ofertas`, e um
 *     id inexistente mostra "Registro inexistente".
 *
 * As ofertas são preparadas pela API, com a sessão de quem age
 * (`apoio/ofertas.mts`); as ações da plataforma passam pela tela.
 *
 * Pré-requisito: `offer_review_required` = true no banco de desenvolvimento
 * (valor provisório da D10, ADR-0003 §2.2), e as dez categorias iniciais em
 * `document_categories`.
 */
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import {
  SUFIXO,
  empresaDe,
  membroDe,
  novoOperador,
  novoUsuario,
  tornarOperador,
  type UsuarioDeTeste,
} from "./apoio/dados.mjs";
import {
  ofertaEmRevisao,
  publicarPelaPlataforma,
  type OfertaDeTeste,
} from "./apoio/ofertas.mjs";
import { abrirSemPermissao, entrarPelaTela } from "./apoio/tela.mjs";

test.describe.configure({ mode: "serial" });

const MOTIVO_DA_DEVOLUCAO = `Fotos mostram a placa do veículo (${SUFIXO}).`;
const MOTIVO_DA_SUSPENSAO = `Documento com sinais de adulteração (${SUFIXO}).`;
const MOTIVO_DA_REATIVACAO = `Documento original conferido (${SUFIXO}).`;

interface Cenario {
  readonly administrador: UsuarioDeTeste;
  readonly operador: UsuarioDeTeste;
  readonly operadorComVinculo: UsuarioDeTeste;
  readonly fornecedor: UsuarioDeTeste;
  readonly empresaId: string;
  readonly nomeDaEmpresa: string;
  /** (a): em revisão; o operador devolve, a empresa reenvia e o operador publica. */
  readonly devolvida: OfertaDeTeste;
  /** (b) e (c): publicada; o operador suspende e o administrador reativa. */
  readonly suspensa: OfertaDeTeste;
  /** (d): em revisão, vista por quem tem vínculo com a empresa. */
  readonly comVinculo: OfertaDeTeste;
}

let cenario: Cenario;

test.beforeAll(async () => {
  test.setTimeout(240_000);
  const administrador = await novoUsuario("ofadm-admin", true);
  const fornecedor = await novoUsuario("ofadm-fornecedor");
  const nomeDaEmpresa = `E2E Ofertas Administração ${SUFIXO}`;
  const empresaId = await empresaDe(
    administrador,
    fornecedor,
    nomeDaEmpresa,
    "supplier",
  );
  const operador = await novoOperador("ofadm-operador", administrador);
  // Vínculo primeiro, papel depois: a pessoa é membro da empresa e operadora.
  const operadorComVinculo = await novoUsuario("ofadm-operador-vinculo");
  await membroDe(fornecedor, empresaId, operadorComVinculo);
  await tornarOperador(administrador, operadorComVinculo);

  const devolvida = await ofertaEmRevisao(fornecedor, empresaId, "Devolucao");
  const suspensa = await ofertaEmRevisao(fornecedor, empresaId, "Suspensao");
  await publicarPelaPlataforma(operador, suspensa.id);
  const comVinculo = await ofertaEmRevisao(fornecedor, empresaId, "Vinculo");
  cenario = {
    administrador,
    operador,
    operadorComVinculo,
    fornecedor,
    empresaId,
    nomeDaEmpresa,
    devolvida,
    suspensa,
    comVinculo,
  };
});

function situacao(pagina: Page) {
  return pagina.locator("[data-situacao]");
}

async function abrirNaAdministracao(
  pagina: Page,
  oferta: OfertaDeTeste,
): Promise<void> {
  await pagina.goto(`/admin/ofertas/${oferta.id}`);
  await expect(
    pagina.getByRole("heading", { level: 1, name: oferta.titulo, exact: true }),
  ).toBeVisible();
}

test("(a) operador: a fila e a devolução com motivo", async ({ page }) => {
  test.setTimeout(180_000);
  await entrarPelaTela(page, cenario.operador);

  // Do menu à lista: a fila em destaque e a oferta com empresa e situação.
  await page.goto("/admin");
  await page
    .getByRole("navigation", { name: "Administração" })
    .getByRole("link", { name: "Ofertas", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Ofertas", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/^\d+ ofertas? aguardam? revisão\.$/u),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Abrir a fila de revisão", exact: true }),
  ).toBeVisible();
  const item = page
    .getByRole("list", { name: "Ofertas", exact: true })
    .getByRole("listitem")
    .filter({ hasText: cenario.devolvida.titulo });
  await expect(item.getByText("Em revisão", { exact: true })).toBeVisible();
  await expect(item.getByText(`· ${cenario.nomeDaEmpresa}`)).toBeVisible();
  await item
    .getByRole("link", { name: cenario.devolvida.titulo, exact: true })
    .click();

  // Detalhe: leitura e revisão, com o lembrete do X07.
  await expect(situacao(page)).toHaveText("Em revisão");
  await expect(page.getByText("RENAVAM", { exact: true })).toBeVisible();
  await expect(page.getByText("12345678900", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Revisão", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("não justificam a devolução", { exact: false }).first(),
  ).toBeVisible();

  // Sem motivo, a devolução é recusada e a oferta segue em revisão.
  const devolver = page.getByRole("button", {
    name: "Devolver à empresa fornecedora",
    exact: true,
  });
  await devolver.click();
  await expect(page.getByText("Informe o motivo da devolução.")).toBeVisible();
  await expect(situacao(page)).toHaveText("Em revisão");

  // Com motivo, volta a rascunho, e a revisão fica registrada.
  await page
    .getByLabel("Motivo da devolução", { exact: true })
    .fill(MOTIVO_DA_DEVOLUCAO);
  await devolver.click();
  await expect(page).toHaveURL(/\?resultado=devolvida$/u);
  await expect(situacao(page)).toHaveText("Rascunho");
  // Depois de agir no fim da página, a mensagem do resultado aparece sem rolar.
  await expect(
    page.getByText("Oferta devolvida à empresa fornecedora", { exact: false }),
  ).toBeInViewport();
  await expect(
    page
      .getByRole("status")
      .getByRole("link", { name: "Voltar à fila de revisão", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("list", { name: "Revisões da oferta", exact: true })
      .getByText(`Motivo: ${MOTIVO_DA_DEVOLUCAO}`, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Revisão", exact: true }),
  ).toHaveCount(0);
});

test("(a) a empresa fornecedora vê o motivo e reenvia", async ({ page }) => {
  test.setTimeout(120_000);
  await entrarPelaTela(page, cenario.fornecedor);
  await page.goto(
    `/empresa/${cenario.empresaId}/ofertas/${cenario.devolvida.id}`,
  );
  await expect(situacao(page)).toHaveText("Rascunho");
  await expect(
    page.getByText(`Motivo: ${MOTIVO_DA_DEVOLUCAO}`, { exact: false }),
  ).toBeVisible();
  await page
    .getByLabel("Declaro ter autorização para divulgar esta oferta.", {
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Enviar para revisão", exact: true })
    .click();
  await expect(situacao(page)).toHaveText("Em revisão");
});

test("(a) operador publica a oferta reenviada", async ({ page }) => {
  test.setTimeout(120_000);
  await entrarPelaTela(page, cenario.operador);
  await abrirNaAdministracao(page, cenario.devolvida);
  await expect(situacao(page)).toHaveText("Em revisão");
  await page
    .getByRole("button", { name: "Publicar a oferta", exact: true })
    .click();
  await expect(page).toHaveURL(/\?resultado=publicada$/u);
  await expect(situacao(page)).toHaveText("Publicada");
  await expect(
    page.getByText("Oferta publicada.", { exact: true }),
  ).toBeInViewport();

  // De volta à fila, onde a oferta publicada já não aparece.
  await page
    .getByRole("status")
    .getByRole("link", { name: "Voltar à fila de revisão", exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/ofertas\?status=under_review$/u);
  await expect(
    page.getByRole("link", { name: "Em revisão", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("link", { name: cenario.devolvida.titulo, exact: true }),
  ).toHaveCount(0);
});

test("(b) suspensão: sem motivo não suspende; com categoria e motivo, suspende", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await entrarPelaTela(page, cenario.operador);
  await abrirNaAdministracao(page, cenario.suspensa);
  await expect(situacao(page)).toHaveText("Publicada");
  await expect(
    page
      .getByText("Pendência documental, sozinha, não é motivo de suspensão.", {
        exact: true,
      })
      .first(),
  ).toBeVisible();

  const categoria = page.getByLabel("Categoria da suspensão", { exact: true });
  const suspender = page.getByRole("button", {
    name: "Suspender a oferta",
    exact: true,
  });
  await categoria.selectOption("fraud_indication");
  await suspender.click();
  await expect(page.getByText("Informe o motivo da suspensão.")).toBeVisible();
  await expect(situacao(page)).toHaveText("Publicada");

  await categoria.selectOption("fraud_indication");
  await page
    .getByLabel("Motivo da suspensão", { exact: true })
    .fill(MOTIVO_DA_SUSPENSAO);
  await suspender.click();
  await expect(page).toHaveURL(/\?resultado=suspensa$/u);
  await expect(situacao(page)).toHaveText("Suspensa");
  await expect(
    page.getByText(
      `Categoria: Indício de fraude. Motivo: ${MOTIVO_DA_SUSPENSAO}`,
      {
        exact: false,
      },
    ),
  ).toBeVisible();
});

test("(b) a empresa fornecedora vê a oferta suspensa no painel", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await entrarPelaTela(page, cenario.fornecedor);
  await page.goto(`/empresa/${cenario.empresaId}/ofertas`);
  const item = page
    .getByRole("list", { name: "Ofertas da empresa" })
    .getByRole("listitem")
    .filter({ hasText: cenario.suspensa.titulo });
  await expect(item.getByText("Suspensa", { exact: true })).toBeVisible();
  await expect(
    item.getByText("Suspensa pela plataforma em", { exact: false }),
  ).toBeVisible();
  await item
    .getByRole("link", { name: cenario.suspensa.titulo, exact: true })
    .click();
  await expect(situacao(page)).toHaveText("Suspensa");
  await expect(
    page.getByText(`Motivo: ${MOTIVO_DA_SUSPENSAO}`, { exact: false }),
  ).toBeVisible();
});

test("(c) o operador não reativa: a reativação fica com o administrador", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await entrarPelaTela(page, cenario.operador);
  await abrirNaAdministracao(page, cenario.suspensa);
  await expect(situacao(page)).toHaveText("Suspensa");
  await expect(
    page.getByText("A reativação fica com quem administra a plataforma.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reativar a oferta", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Suspender a oferta", exact: true }),
  ).toHaveCount(0);
});

test("(c) o administrador reativa com motivo, e a oferta volta a rascunho", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await entrarPelaTela(page, cenario.administrador);
  await abrirNaAdministracao(page, cenario.suspensa);
  await expect(situacao(page)).toHaveText("Suspensa");
  const reativar = page.getByRole("button", {
    name: "Reativar a oferta",
    exact: true,
  });
  await reativar.click();
  await expect(page.getByText("Informe o motivo da reativação.")).toBeVisible();
  await expect(situacao(page)).toHaveText("Suspensa");
  await page
    .getByLabel("Motivo da reativação", { exact: true })
    .fill(MOTIVO_DA_REATIVACAO);
  await reativar.click();
  await expect(page).toHaveURL(/\?resultado=reativada$/u);
  await expect(situacao(page)).toHaveText("Rascunho");
});

test("(d) quem é da equipe e tem vínculo com a empresa dona não vê ações de plataforma", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await entrarPelaTela(page, cenario.operadorComVinculo);
  await abrirNaAdministracao(page, cenario.comVinculo);
  await expect(situacao(page)).toHaveText("Em revisão");
  await expect(
    page.getByText("Você tem vínculo com a empresa dona desta oferta.", {
      exact: false,
    }),
  ).toBeVisible();
  for (const botao of [
    "Publicar a oferta",
    "Devolver à empresa fornecedora",
    "Suspender a oferta",
    "Reativar a oferta",
    "Retirar a oferta",
    "Reservar",
    "Liberar a reserva",
  ]) {
    await expect(
      page.getByRole("button", { name: botao, exact: true }),
      botao,
    ).toHaveCount(0);
  }
  await expect(
    page.getByRole("heading", { name: "Revisão", exact: true }),
  ).toHaveCount(0);
});

test("(e) quem não é da equipe recebe 'Sem permissão' para a lista e para qualquer id", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await entrarPelaTela(page, cenario.fornecedor);
  const lista = await abrirSemPermissao(page, "/admin/ofertas");
  const respostas = [
    await abrirSemPermissao(page, "/admin/ofertas?status=under_review"),
    await abrirSemPermissao(page, `/admin/ofertas/${cenario.devolvida.id}`),
    await abrirSemPermissao(page, `/admin/ofertas/${randomUUID()}`),
    await abrirSemPermissao(page, "/admin/ofertas/nao-e-um-id"),
  ];
  for (const resposta of respostas) {
    expect(resposta.status).toBe(lista.status);
    expect(resposta.texto).toBe(lista.texto);
  }
  await expect(page.getByText(cenario.devolvida.titulo)).toHaveCount(0);
});

test("(e) id inexistente ou inválido mostra 'Registro inexistente' à equipe", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await entrarPelaTela(page, cenario.operador);
  await page.goto(`/admin/ofertas/${randomUUID()}`);
  await expect(
    page.getByRole("heading", { name: "Registro inexistente", exact: true }),
  ).toBeVisible();
  const inexistente = await page.locator("main").innerText();
  await page.goto("/admin/ofertas/nao-e-um-id");
  await expect(
    page.getByRole("heading", { name: "Registro inexistente", exact: true }),
  ).toBeVisible();
  expect(await page.locator("main").innerText()).toBe(inexistente);
  await page
    .getByRole("link", { name: "Voltar às ofertas", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Ofertas", exact: true }),
  ).toBeVisible();
});
