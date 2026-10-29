/**
 * Telas do fornecedor (I2.8): o `org_admin` cria o rascunho, preenche
 * veículo e condições, envia uma foto, declara as dez categorias (uma com
 * ocorrência, uma "desconhece"), envia e abre um documento, vê o aviso
 * documental, marca a autorização de divulgação e envia; o painel mostra "Em
 * revisão" e o histórico registra a mudança. Depois: o `member` prepara um
 * rascunho mas não vê o envio (Q2); outra empresa recebe "Sem permissão", e a
 * oferta alheia é "Registro inexistente", igual a um id que não existe; a
 * empresa só compradora vê que ofertas são de empresa fornecedora.
 *
 * Pré-requisito: `offer_review_required` = true no banco de desenvolvimento
 * (valor provisório da D10, ADR-0003 §2.2), e as dez categorias iniciais em
 * `document_categories`.
 */
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  SUFIXO,
  empresaDe,
  membroDe,
  novoUsuario,
  type UsuarioDeTeste,
} from "./apoio/dados.mjs";
import { abrirSemPermissao, entrarPelaTela } from "./apoio/tela.mjs";

test.describe.configure({ mode: "serial" });

/** PNG de 1×1 pixel. */
const PNG_DE_TESTE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const PDF_DE_TESTE = Buffer.from(
  "%PDF-1.4\n% documento do teste e2e da oferta\n%%EOF\n",
  "utf8",
);

/** As dez categorias iniciais da §5.3, com os rótulos da tela. */
const CATEGORIAS = [
  "Débitos de IPVA",
  "Débitos de licenciamento",
  "Multas",
  "Restrições administrativas",
  "Restrições judiciais",
  "Gravame",
  "Roubo, furto e recuperação",
  "Sinistro e danos relevantes",
  "Passagem por leilão",
  "Condições de transferência",
] as const;

const TITULO = "Fiat Argo Drive 1.0 2022/2023";

interface Cenario {
  readonly fornecedor: UsuarioDeTeste;
  readonly membro: UsuarioDeTeste;
  readonly empresaId: string;
  readonly nomeDaEmpresa: string;
  readonly outro: UsuarioDeTeste;
  readonly outraEmpresaId: string;
  readonly comprador: UsuarioDeTeste;
  readonly compradoraId: string;
}

let cenario: Cenario;
let ofertaId = "";

test.beforeAll(async () => {
  test.setTimeout(240_000);
  const administrador = await novoUsuario("ofertas-admin", true);
  const fornecedor = await novoUsuario("ofertas-fornecedor");
  const nomeDaEmpresa = `E2E Ofertas ${SUFIXO}`;
  const empresaId = await empresaDe(
    administrador,
    fornecedor,
    nomeDaEmpresa,
    "supplier",
  );
  const membro = await novoUsuario("ofertas-membro");
  await membroDe(fornecedor, empresaId, membro);
  const outro = await novoUsuario("ofertas-outro");
  const outraEmpresaId = await empresaDe(
    administrador,
    outro,
    `E2E Outra Fornecedora ${SUFIXO}`,
    "both",
  );
  const comprador = await novoUsuario("ofertas-comprador");
  const compradoraId = await empresaDe(
    administrador,
    comprador,
    `E2E Compradora Ofertas ${SUFIXO}`,
    "buyer",
  );
  cenario = {
    fornecedor,
    membro,
    empresaId,
    nomeDaEmpresa,
    outro,
    outraEmpresaId,
    comprador,
    compradoraId,
  };
});

test("fornecedor: rascunho, etapas, aviso documental, envio, painel e histórico", async ({
  page,
}) => {
  test.setTimeout(300_000);
  // A página de resumo também lista as etapas; os cliques vão pela navegação.
  const etapas = page.getByRole("navigation", { name: "Etapas da oferta" });
  await entrarPelaTela(page, cenario.fornecedor);

  // Da empresa ao painel vazio.
  await page.goto(`/empresa/${cenario.empresaId}`);
  await page.getByRole("link", { name: "Ofertas", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: `Ofertas de ${cenario.nomeDaEmpresa}`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Nenhuma oferta cadastrada ainda.", { exact: false }),
  ).toBeVisible();

  // Primeira etapa: veículo e condições.
  await page.getByRole("link", { name: "Nova oferta", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Nova oferta", exact: true }),
  ).toBeVisible();
  const campos: readonly (readonly [string, string])[] = [
    ["Marca", "Fiat"],
    ["Modelo", "Argo"],
    ["Versão", "Drive 1.0"],
    ["Cor", "Prata"],
    ["Ano de fabricação", "2022"],
    ["Ano do modelo", "2023"],
    ["Quilometragem", "45.000"],
    ["Combustível", "Flex"],
    ["Câmbio", "Manual"],
    ["Carroceria", "Hatch"],
    ["Placa", "abc-1d23"],
    ["RENAVAM", "12345678900"],
    ["Chassi", "9BWZZZ377VT004251"],
    ["Preço (R$)", "65.000,00"],
    ["Cidade", "Campinas"],
    ["Condições comerciais", "Pagamento à vista na transferência."],
  ];
  for (const [rotulo, valor] of campos) {
    await page.getByLabel(rotulo, { exact: true }).fill(valor);
  }
  await page.getByLabel("UF", { exact: true }).selectOption("SP");
  // A validade vem sugerida pelo padrão da configuração.
  await expect(page.getByLabel("Válida até", { exact: true })).not.toHaveValue(
    "",
  );
  await page
    .getByRole("button", { name: "Criar rascunho", exact: true })
    .click();

  await expect(page).toHaveURL(
    new RegExp(`/empresa/${cenario.empresaId}/ofertas/[0-9a-f-]{36}$`, "u"),
  );
  ofertaId = page.url().split("/").at(-1) ?? "";
  await expect(
    page.getByRole("heading", { level: 1, name: TITULO, exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-situacao]")).toHaveText("Rascunho");
  await expect(
    page.getByRole("heading", { name: "O que falta para enviar", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Declaração em Multas", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enviar para revisão", exact: true }),
  ).toBeDisabled();

  // Etapa 2: uma foto.
  await etapas.getByRole("link", { name: "2. Fotos", exact: true }).click();
  await expect(
    page.getByText("não mostra a placa nem dado pessoal", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Foto do veículo", { exact: true }).setInputFiles({
    name: "frente.png",
    mimeType: "image/png",
    buffer: PNG_DE_TESTE,
  });
  await page.getByRole("button", { name: "Enviar foto", exact: true }).click();
  await expect(page.getByText("Foto enviada.")).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Foto 1 do veículo", exact: true }),
  ).toBeVisible();

  // Etapa 4: as dez categorias, sem resposta marcada de início.
  await etapas
    .getByRole("link", { name: "4. Declarações", exact: true })
    .click();
  await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);
  for (const categoria of CATEGORIAS) {
    const resposta =
      categoria === "Multas"
        ? "Há ocorrência"
        : categoria === "Passagem por leilão"
          ? "Desconhece"
          : "Não conhece ocorrência";
    await page
      .getByRole("group", { name: categoria, exact: true })
      .getByLabel(resposta, { exact: true })
      .check();
  }
  await page
    .getByRole("group", { name: "Multas", exact: true })
    .getByLabel("Detalhe da ocorrência", { exact: true })
    .fill("Uma multa de trânsito em aberto.");
  await page
    .getByRole("button", { name: "Gravar declarações", exact: true })
    .click();
  await expect(page.getByText("10 declarações gravadas.")).toBeVisible({
    timeout: 90_000,
  });
  await expect(
    page
      .getByRole("group", { name: "Multas", exact: true })
      .getByText("Estado: Com apontamentos", { exact: false }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("group", { name: "Passagem por leilão", exact: true })
      .getByText("Estado: Não consultado", { exact: false }),
  ).toBeVisible();

  // Etapa 5: um documento, que fica oculto ao comprador e abre com registro.
  await etapas
    .getByRole("link", { name: "5. Documentos", exact: true })
    .click();
  await expect(
    page.getByText("Os documentos ficam ocultos para os compradores.", {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByLabel("Tipo do documento", { exact: true })
    .selectOption("laudo_cautelar");
  await page.getByLabel("Arquivo do documento", { exact: true }).setInputFiles({
    name: "laudo.pdf",
    mimeType: "application/pdf",
    buffer: PDF_DE_TESTE,
  });
  await page
    .getByLabel("Descrição do documento (opcional)", { exact: true })
    .fill("Laudo do teste E2E");
  await page
    .getByRole("button", { name: "Enviar documento", exact: true })
    .click();
  await expect(page.getByText("Documento enviado.")).toBeVisible();
  await page
    .getByRole("button", { name: "Abrir o documento 1", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Abrir o arquivo", exact: true }),
  ).toBeVisible();

  // Resumo e envio: nada obrigatório falta, e o aviso documental aparece.
  await etapas
    .getByRole("link", { name: "Resumo e envio", exact: true })
    .click();
  await expect(
    page.getByText("Nada falta: os dados obrigatórios estão preenchidos."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Aviso documental", exact: true }),
  ).toBeVisible();
  for (const ressalva of [
    "Há categorias com apontamentos. Leia o detalhe de cada uma antes de seguir.",
    "Há informações declaradas pelo fornecedor, sem consulta nem documento que as confirme.",
    "Há categorias sem consulta registrada. A plataforma não confirmou essas informações.",
  ]) {
    await expect(page.getByText(ressalva, { exact: true })).toBeVisible();
  }
  await expect(
    page.getByText(
      "1 com apontamentos, 8 declaradas sem comprovação, 1 não consultada",
      { exact: true },
    ),
  ).toBeVisible();

  // Pendência documental não bloqueia o botão; a autorização é exigida.
  const enviar = page.getByRole("button", {
    name: "Enviar para revisão",
    exact: true,
  });
  await expect(enviar).toBeEnabled();
  await enviar.click();
  await expect(
    page.getByText("Declare a autorização de divulgação para publicar."),
  ).toBeVisible();
  await expect(page.locator("[data-situacao]")).toHaveText("Rascunho");
  await page
    .getByLabel("Declaro ter autorização para divulgar esta oferta.", {
      exact: true,
    })
    .check();
  await enviar.click();
  await expect(page.locator("[data-situacao]")).toHaveText("Em revisão");
  await expect(
    page.getByText("A oferta está em revisão pela plataforma", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cancelar o envio", exact: true }),
  ).toBeVisible();

  // Painel: a oferta aparece "Em revisão".
  await page
    .getByRole("link", { name: "Voltar às ofertas", exact: true })
    .click();
  const item = page
    .getByRole("list", { name: "Ofertas da empresa" })
    .getByRole("listitem")
    .filter({ hasText: TITULO });
  await expect(item.getByText("Em revisão", { exact: true })).toBeVisible();
  await expect(item.getByText("· R$ 65.000,00", { exact: true })).toBeVisible();

  // Histórico: versões e a mudança de situação.
  await item.getByRole("link", { name: TITULO, exact: true }).click();
  await etapas.getByRole("link", { name: "Histórico", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Versões", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Versão inicial", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Situação: Rascunho → Em revisão", { exact: true }),
  ).toBeVisible();
});

test("member prepara o rascunho, mas o envio fica com o administrador da empresa (Q2)", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await entrarPelaTela(page, cenario.membro);
  await page.goto(`/empresa/${cenario.empresaId}/ofertas/nova`);
  await page.getByLabel("Marca", { exact: true }).fill("Volkswagen");
  await page.getByLabel("Modelo", { exact: true }).fill("Gol");
  await page
    .getByRole("button", { name: "Criar rascunho", exact: true })
    .click();
  await expect(page.locator("[data-situacao]")).toHaveText("Rascunho");
  await expect(
    page.getByText("Só o administrador da empresa envia", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enviar para revisão", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Retirar a oferta", exact: true }),
  ).toHaveCount(0);

  // A oferta enviada pelo administrador: o membro pode cancelar o envio, não retirar.
  await page.goto(`/empresa/${cenario.empresaId}/ofertas/${ofertaId}`);
  await expect(page.locator("[data-situacao]")).toHaveText("Em revisão");
  await expect(
    page.getByRole("button", { name: "Retirar a oferta", exact: true }),
  ).toHaveCount(0);
});

test("outra empresa: 'Sem permissão' igual para o painel, a oferta e um id inexistente", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await entrarPelaTela(page, cenario.outro);
  const base = `/empresa/${cenario.empresaId}/ofertas`;
  const painel = await abrirSemPermissao(page, base);
  const respostas = [
    await abrirSemPermissao(page, `${base}/${ofertaId}`),
    await abrirSemPermissao(page, `${base}/${ofertaId}/documentos`),
    await abrirSemPermissao(page, `${base}/${randomUUID()}`),
    await abrirSemPermissao(page, `${base}/nao-e-um-id`),
    await abrirSemPermissao(page, `${base}/nova`),
  ];
  for (const resposta of respostas) {
    expect(resposta.status).toBe(painel.status);
    expect(resposta.texto).toBe(painel.texto);
  }
  await expect(page.getByText(TITULO)).toHaveCount(0);

  // Pela própria empresa, a oferta alheia é igual a um id que não existe.
  const daOutra = `/empresa/${cenario.outraEmpresaId}/ofertas`;
  await page.goto(`${daOutra}/${ofertaId}`);
  await expect(
    page.getByRole("heading", { name: "Registro inexistente", exact: true }),
  ).toBeVisible();
  const alheia = await page.locator("main").innerText();
  await page.goto(`${daOutra}/${randomUUID()}`);
  await expect(
    page.getByRole("heading", { name: "Registro inexistente", exact: true }),
  ).toBeVisible();
  expect(await page.locator("main").innerText()).toBe(alheia);

  // O painel da própria empresa não mostra a oferta da outra.
  await page.goto(daOutra);
  await expect(
    page.getByText("Nenhuma oferta cadastrada ainda.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText(TITULO)).toHaveCount(0);
});

test("empresa só compradora: sem link de ofertas e a explicação no painel", async ({
  page,
}) => {
  await entrarPelaTela(page, cenario.comprador);
  await page.goto(`/empresa/${cenario.compradoraId}`);
  await expect(
    page.getByRole("heading", { name: "Membros", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Ofertas", exact: true }),
  ).toHaveCount(0);
  await page.goto(`/empresa/${cenario.compradoraId}/ofertas`);
  await expect(
    page.getByText("Ofertas são cadastradas por empresa fornecedora.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Nova oferta", exact: true }),
  ).toHaveCount(0);
});
