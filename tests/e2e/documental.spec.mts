/**
 * Telas do domínio documental (I3.6):
 * (a) o fornecedor registra, na etapa "Consultas", uma consulta com evidência
 *     e vê a origem e o estado; a recusa por linguagem (§6.6) cai no campo; a
 *     consulta sem evidência diz "sem evidência anexada", e "Aguardando
 *     resultado" sai por extenso; a substituição deixa a anterior no
 *     histórico; o resumo mostra a ficha, com "sem apontamentos nas fontes
 *     consultadas" ao lado da fonte e da data (E26), e cada informação com a
 *     própria origem;
 * (b) a equipe registra consulta no detalhe da administração (com evidência e
 *     fonte oficial, "Confirmada por evidência independente"), abre e fecha a
 *     revisão documental com motivo;
 * (c) o impedimento de transferência aparece separado das pendências
 *     documentais e bloqueia o envio; o fornecedor vê a revisão com o motivo;
 *     o operador não vê a ação de resolver; o administrador resolve com
 *     motivo e evidência;
 * (d) outra empresa recebe "Sem permissão" na etapa "Consultas", igual ao
 *     painel, e a oferta alheia é "Registro inexistente".
 *
 * As ofertas são preparadas pela API, com a sessão de quem age
 * (`apoio/ofertas.mts`); as ações documentais passam pela tela.
 *
 * Pré-requisito: `offer_review_required` = true e as dez categorias iniciais
 * em `document_categories` no banco de desenvolvimento.
 */
import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  SUFIXO,
  empresaDe,
  novoOperador,
  novoUsuario,
  type UsuarioDeTeste,
} from "./apoio/dados.mjs";
import {
  ofertaEmRascunho,
  ofertaEmRevisao,
  type OfertaDeTeste,
} from "./apoio/ofertas.mjs";
import { abrirSemPermissao, entrarPelaTela } from "./apoio/tela.mjs";

test.describe.configure({ mode: "serial" });

const PDF_DE_TESTE = Buffer.from(
  "%PDF-1.4\n% evidencia do teste e2e documental\n%%EOF\n",
  "utf8",
);
const MOTIVO_DA_ABERTURA = `Resumo da consulta cita processo a avaliar (${SUFIXO}).`;
const MOTIVO_DO_FECHAMENTO = `Processo sem relação com o veículo (${SUFIXO}).`;
const MOTIVO_DA_RESOLUCAO = `Laudo de regularização apresentado (${SUFIXO}).`;
const OCORRENCIA_NA_TRANSFERENCIA = `Dano de média monta sem regularização (${SUFIXO}).`;

interface Cenario {
  readonly administrador: UsuarioDeTeste;
  readonly operador: UsuarioDeTeste;
  readonly fornecedor: UsuarioDeTeste;
  readonly empresaId: string;
  readonly outro: UsuarioDeTeste;
  readonly outraEmpresaId: string;
  /** (a): rascunho em que o fornecedor registra as consultas. */
  readonly rascunho: OfertaDeTeste;
  /** (b): em revisão; a equipe registra consulta e revisa. */
  readonly emRevisao: OfertaDeTeste;
  /** (c): rascunho com ocorrência em `transfer_conditions`, que gera o impedimento. */
  readonly comImpedimento: OfertaDeTeste;
}

let cenario: Cenario;

test.beforeAll(async () => {
  test.setTimeout(240_000);
  const administrador = await novoUsuario("doc-admin", true);
  const fornecedor = await novoUsuario("doc-fornecedor");
  const empresaId = await empresaDe(
    administrador,
    fornecedor,
    `E2E Documental ${SUFIXO}`,
    "supplier",
  );
  const operador = await novoOperador("doc-operador", administrador);
  const outro = await novoUsuario("doc-outro");
  const outraEmpresaId = await empresaDe(
    administrador,
    outro,
    `E2E Outra Documental ${SUFIXO}`,
    "supplier",
  );
  const rascunho = await ofertaEmRascunho(fornecedor, empresaId, "Consultas");
  const emRevisao = await ofertaEmRevisao(fornecedor, empresaId, "Revisao doc");
  const comImpedimento = await ofertaEmRascunho(
    fornecedor,
    empresaId,
    "Impedimento",
    { transfer_conditions: OCORRENCIA_NA_TRANSFERENCIA },
  );
  cenario = {
    administrador,
    operador,
    fornecedor,
    empresaId,
    outro,
    outraEmpresaId,
    rascunho,
    emRevisao,
    comImpedimento,
  };
});

/** "AAAA-MM-DDTHH:MM" de uma hora atrás, no horário de Brasília, o fuso do navegador dos testes. */
function umaHoraAtras(): string {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(Date.now() - 60 * 60 * 1000))
      .map((parte) => [parte.type, parte.value]),
  );
  return `${partes.year ?? ""}-${partes.month ?? ""}-${partes.day ?? ""}T${partes.hour ?? ""}:${partes.minute ?? ""}`;
}

interface DadosDaConsulta {
  readonly categoria: string;
  readonly tipo: "official" | "commercial" | "other";
  readonly fonte: string;
  /** Rótulo do resultado na tela. */
  readonly resultado: string;
  readonly resumo: string;
  readonly limitacoes: string;
  readonly evidencia?: boolean;
}

/** Preenche o formulário inteiro: depois de um erro, os campos são preenchidos de novo. */
async function preencherConsulta(
  formulario: Locator,
  dados: DadosDaConsulta,
): Promise<void> {
  await formulario
    .getByLabel("Categoria da consulta", { exact: true })
    .selectOption(dados.categoria);
  await formulario
    .getByLabel("Tipo da fonte", { exact: true })
    .selectOption(dados.tipo);
  await formulario
    .getByLabel("Fonte consultada", { exact: true })
    .fill(dados.fonte);
  await formulario
    .getByLabel("Data e hora da consulta", { exact: true })
    .fill(umaHoraAtras());
  await formulario.getByLabel(dados.resultado, { exact: true }).check();
  await formulario
    .getByLabel("Resumo do resultado", { exact: true })
    .fill(dados.resumo);
  await formulario
    .getByLabel("Limitações conhecidas da fonte", { exact: true })
    .fill(dados.limitacoes);
  if (dados.evidencia === true) {
    await formulario
      .getByLabel("Evidência (opcional)", { exact: true })
      .setInputFiles({
        name: "consulta.pdf",
        mimeType: "application/pdf",
        buffer: PDF_DE_TESTE,
      });
  }
}

function formularioDaConsulta(pagina: Page): Locator {
  return pagina.getByRole("form", { name: "Registrar consulta", exact: true });
}

async function registrar(pagina: Page, mensagem: string): Promise<void> {
  const formulario = formularioDaConsulta(pagina);
  await formulario
    .getByRole("button", { name: "Registrar consulta", exact: true })
    .click();
  await expect(formulario.getByText(mensagem, { exact: true })).toBeVisible({
    timeout: 60_000,
  });
}

const GRAVAME = {
  categoria: "lien",
  tipo: "official",
  fonte: "DETRAN-SP",
  resultado: "Sem ocorrência na fonte",
  resumo: "Sem gravame ativo na consulta.",
  limitacoes: "A fonte cobre só a UF consultada.",
} as const satisfies DadosDaConsulta;

test("(a) fornecedor: consulta com evidência, origem, estado e a ficha no resumo", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const etapas = page.getByRole("navigation", { name: "Etapas da oferta" });
  const base = `/empresa/${cenario.empresaId}/ofertas/${cenario.rascunho.id}`;
  await entrarPelaTela(page, cenario.fornecedor);
  await page.goto(base);
  await etapas.getByRole("link", { name: "6. Consultas", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${base}/consultas$`, "u"));
  await expect(
    page.getByRole("heading", { name: "6. Consultas", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Nenhuma consulta registrada.", { exact: false }),
  ).toBeVisible();

  // A recusa por linguagem cai no campo, e nada é gravado.
  const formulario = formularioDaConsulta(page);
  await preencherConsulta(formulario, {
    ...GRAVAME,
    resumo: "Nada consta para o veículo.", // linguagem-permitida: exemplo negativo do teste
  });
  await formulario
    .getByRole("button", { name: "Registrar consulta", exact: true })
    .click();
  await expect(
    formulario.getByText("Reescreva sem os termos da §6.6", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Nenhuma consulta registrada.", { exact: false }),
  ).toBeVisible();

  // Com evidência: a consulta do fornecedor fica como "Resultado de consulta".
  await preencherConsulta(formulario, { ...GRAVAME, evidencia: true });
  await registrar(page, "Consulta registrada, com a evidência.");
  const lista = page.getByRole("list", {
    name: "Consultas por categoria",
    exact: true,
  });
  const gravame = lista.locator('[data-categoria="lien"]');
  await expect(gravame.locator("[data-estado]")).toContainText(
    "Sem apontamentos nas fontes consultadas: DETRAN-SP (consulta em ",
  );
  await expect(gravame.locator("[data-estado]")).toContainText(
    /\(consulta em \d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}\)/u,
  );
  await expect(gravame.locator("[data-origem]")).toHaveText([
    "Origem: Resultado de consulta",
  ]);
  await expect(gravame.locator("[data-resultado]")).toHaveText(
    "Resultado: Sem ocorrência na fonte",
  );
  await expect(
    gravame.getByText("DETRAN-SP · Fonte oficial · consulta em", {
      exact: false,
    }),
  ).toBeVisible();
  // A evidência abre por botão; o link só existe depois do clique.
  await expect(
    gravame.getByRole("link", { name: "Abrir o arquivo", exact: true }),
  ).toHaveCount(0);
  await gravame
    .getByRole("button", { name: "Abrir a evidência", exact: true })
    .click();
  await expect(
    gravame.getByRole("link", { name: "Abrir o arquivo", exact: true }),
  ).toBeVisible();

  // Sem evidência e aguardando resultado: escrito por extenso, ao lado da consulta.
  await preencherConsulta(formulario, {
    categoria: "auction",
    tipo: "other",
    fonte: "Leiloeiro E2E",
    resultado: "Aguardando resultado",
    resumo: "Pedido de histórico enviado ao leiloeiro.",
    limitacoes: "Cobre só os leilões desse leiloeiro.",
  });
  await registrar(page, "Consulta registrada, sem evidência anexada.");
  const leilao = lista.locator('[data-categoria="auction"]');
  await expect(leilao.locator("[data-estado]")).toHaveText(
    "Estado: Pendente ou incompleto",
  );
  await expect(leilao.locator("[data-resultado]")).toHaveText(
    "Resultado: Aguardando resultado · sem evidência anexada",
  );
  await expect(
    leilao.getByText("o resultado ainda não chegou", { exact: false }),
  ).toBeVisible();

  // O resultado chega: a consulta nova substitui a anterior, que fica no histórico.
  await preencherConsulta(formulario, {
    categoria: "auction",
    tipo: "other",
    fonte: "Leiloeiro E2E",
    resultado: "Sem ocorrência na fonte",
    resumo: "Sem passagem por leilão no histórico do leiloeiro.",
    limitacoes: "Cobre só os leilões desse leiloeiro.",
  });
  await formulario
    .getByLabel("Esta consulta substitui (opcional)", { exact: true })
    .selectOption({ index: 1 });
  await registrar(page, "Consulta registrada, sem evidência anexada.");
  await expect(leilao.locator("[data-estado]")).toContainText(
    "Sem apontamentos nas fontes consultadas: Leiloeiro E2E (consulta em ",
  );
  await leilao.getByText("Consultas substituídas (1)", { exact: true }).click();
  await expect(leilao.locator("details [data-resultado]")).toHaveText(
    "Resultado: Aguardando resultado · sem evidência anexada",
  );

  // Resumo: a etapa conta as consultas, e a ficha mostra cada origem separada.
  await etapas
    .getByRole("link", { name: "Resumo e envio", exact: true })
    .click();
  await expect(
    page.getByText("2 consultas vigentes", { exact: true }),
  ).toBeVisible();
  const ficha = page.getByRole("list", {
    name: "Categorias documentais",
    exact: true,
  });
  const gravameNaFicha = ficha.locator('[data-categoria="lien"]');
  await expect(gravameNaFicha.locator("[data-estado]")).toContainText(
    "Sem apontamentos nas fontes consultadas: DETRAN-SP (consulta em ",
  );
  await expect(gravameNaFicha.locator("[data-origem]")).toHaveText([
    "Origem: Declarada pelo fornecedor",
    "Origem: Resultado de consulta",
  ]);
  await expect(gravameNaFicha.locator("[data-estado]")).not.toContainText(
    "Origem",
  );
  await expect(
    ficha.locator('[data-categoria="theft_recovery"] [data-estado]'),
  ).toHaveText("Estado: Informação declarada, sem comprovação");
  await expect(
    page.getByRole("heading", { name: "Impedimento de transferência" }),
  ).toHaveCount(0);
});

test("(b) a equipe registra consulta, abre e fecha a revisão documental", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await entrarPelaTela(page, cenario.operador);
  await page.goto(`/admin/ofertas/${cenario.emRevisao.id}`);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: cenario.emRevisao.titulo,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Seções da oferta" })
      .getByRole("link", { name: "Ações documentais", exact: true }),
  ).toBeVisible();

  // Fonte oficial, evidência e registro pela equipe: evidência independente (E10).
  await preencherConsulta(formularioDaConsulta(page), {
    categoria: "judicial_restrictions",
    tipo: "official",
    fonte: "TJ-SP",
    resultado: "Sem ocorrência na fonte",
    resumo: "Sem processo que cite o veículo.",
    limitacoes: "Cobre só o Tribunal de Justiça de São Paulo.",
    evidencia: true,
  });
  await registrar(page, "Consulta registrada, com a evidência.");
  const ficha = page.getByRole("list", {
    name: "Categorias documentais",
    exact: true,
  });
  const judicial = ficha.locator('[data-categoria="judicial_restrictions"]');
  await expect(judicial.locator("[data-origem]")).toHaveText([
    "Origem: Declarada pelo fornecedor",
    "Origem: Confirmada por evidência independente",
  ]);
  await expect(judicial.locator("[data-estado]")).toContainText(
    "Sem apontamentos nas fontes consultadas: TJ-SP (consulta em ",
  );

  // Abrir sem motivo é recusado; com motivo, a revisão vira fato da categoria.
  const abrir = page.getByRole("form", {
    name: "Abrir revisão documental",
    exact: true,
  });
  const categoriaDaAbertura = abrir.getByLabel(
    "Categoria para abrir a revisão",
    { exact: true },
  );
  await categoriaDaAbertura.selectOption("judicial_restrictions");
  await abrir
    .getByRole("button", { name: "Abrir a revisão", exact: true })
    .click();
  await expect(
    abrir.getByText("Informe o motivo da abertura.", { exact: true }),
  ).toBeVisible();
  await expect(judicial.locator("[data-revisao-aberta]")).toHaveCount(0);
  await categoriaDaAbertura.selectOption("judicial_restrictions");
  await abrir
    .getByLabel("Motivo da abertura", { exact: true })
    .fill(MOTIVO_DA_ABERTURA);
  await abrir
    .getByRole("button", { name: "Abrir a revisão", exact: true })
    .click();
  await expect(
    abrir.getByText("Revisão aberta.", { exact: false }),
  ).toBeVisible();
  await expect(judicial.locator("[data-estado]")).toHaveText(
    "Estado: Em análise",
  );
  await expect(judicial.locator("[data-revisao-aberta]")).toContainText(
    `Em análise pela plataforma desde`,
  );
  await expect(judicial.locator("[data-revisao-aberta]")).toContainText(
    `Motivo: ${MOTIVO_DA_ABERTURA}`,
  );

  // Fechar, com motivo: o fato sai, e a revisão fica no histórico.
  const fechar = page.getByRole("form", {
    name: "Fechar revisão documental",
    exact: true,
  });
  await fechar
    .getByLabel("Categoria para fechar a revisão", { exact: true })
    .selectOption("judicial_restrictions");
  await fechar
    .getByLabel("Motivo do fechamento", { exact: true })
    .fill(MOTIVO_DO_FECHAMENTO);
  await fechar
    .getByRole("button", { name: "Fechar a revisão", exact: true })
    .click();
  await expect(
    fechar.getByText("Revisão fechada.", { exact: false }),
  ).toBeVisible();
  await expect(judicial.locator("[data-revisao-aberta]")).toHaveCount(0);
  await expect(judicial.locator("[data-estado]")).toContainText(
    "Sem apontamentos nas fontes consultadas: TJ-SP (consulta em ",
  );
  await judicial
    .getByText("Histórico das revisões (2)", { exact: true })
    .click();
  await expect(
    judicial.getByText(`Motivo: ${MOTIVO_DO_FECHAMENTO}`, { exact: true }),
  ).toBeVisible();
});

test("(c) o fornecedor vê o impedimento separado das pendências e a revisão com o motivo", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await entrarPelaTela(page, cenario.fornecedor);
  await page.goto(
    `/empresa/${cenario.empresaId}/ofertas/${cenario.comImpedimento.id}`,
  );
  const impedimento = page.locator("#impedimento-de-transferencia");
  await expect(
    impedimento.getByRole("heading", {
      name: "Impedimento de transferência",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    impedimento.getByText(
      "a oferta não é enviada, publicada nem reservada, e fica fora do catálogo",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(
    impedimento.getByText(OCORRENCIA_NA_TRANSFERENCIA, { exact: false }),
  ).toBeVisible();
  // O aviso documental (pendências documentais) não fala do impedimento.
  await expect(
    page.locator('section[aria-labelledby="titulo-aviso-documental"]'),
  ).not.toContainText("impedimento de transferência", { ignoreCase: true });
  // O impedimento bloqueia o envio, e a pendência leva ao aviso.
  await expect(
    page.getByRole("link", {
      name: "Sem impedimento de transferência ativo",
      exact: true,
    }),
  ).toHaveAttribute("href", "#impedimento-de-transferencia");
  await expect(
    page.getByRole("button", { name: "Enviar para revisão", exact: true }),
  ).toBeDisabled();

  // Na outra oferta, a revisão da equipe aparece com o motivo do fechamento.
  await page.goto(
    `/empresa/${cenario.empresaId}/ofertas/${cenario.emRevisao.id}`,
  );
  const judicial = page
    .getByRole("list", { name: "Categorias documentais", exact: true })
    .locator('[data-categoria="judicial_restrictions"]');
  await expect(judicial.locator("[data-origem]")).toHaveText([
    "Origem: Declarada pelo fornecedor",
    "Origem: Confirmada por evidência independente",
  ]);
  await judicial
    .getByText("Histórico das revisões (2)", { exact: true })
    .click();
  await expect(
    judicial.getByText(`Motivo: ${MOTIVO_DO_FECHAMENTO}`, { exact: true }),
  ).toBeVisible();
  await expect(
    judicial.getByText("Fechada pela equipe da plataforma", { exact: false }),
  ).toBeVisible();
});

test("(c) o operador vê o impedimento, mas não a ação de resolver", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await entrarPelaTela(page, cenario.operador);
  await page.goto(`/admin/ofertas/${cenario.comImpedimento.id}`);
  await expect(
    page.locator("#impedimento-de-transferencia").getByRole("heading", {
      name: "Impedimento de transferência",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "A resolução do impedimento fica com quem administra a plataforma.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Resolver o impedimento", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("form", {
      name: "Resolver impedimento de transferência",
      exact: true,
    }),
  ).toHaveCount(0);
});

test("(c) o administrador resolve o impedimento com motivo e evidência", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await entrarPelaTela(page, cenario.administrador);
  await page.goto(`/admin/ofertas/${cenario.comImpedimento.id}`);
  const resolucao = page.getByRole("form", {
    name: "Resolver impedimento de transferência",
    exact: true,
  });
  const resolver = resolucao.getByRole("button", {
    name: "Resolver o impedimento",
    exact: true,
  });

  // Sem motivo nem evidência, nada muda.
  await resolver.click();
  await expect(
    resolucao.getByText("Informe o motivo da resolução.", { exact: true }),
  ).toBeVisible();
  await expect(
    resolucao.getByText("Anexe a evidência da regularização.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("#impedimento-de-transferencia").getByRole("heading", {
      name: "Impedimento de transferência",
      exact: true,
    }),
  ).toBeVisible();

  await resolucao
    .getByLabel("Motivo da resolução", { exact: true })
    .fill(MOTIVO_DA_RESOLUCAO);
  await resolucao
    .getByLabel("Evidência da regularização", { exact: true })
    .setInputFiles({
      name: "regularizacao.pdf",
      mimeType: "application/pdf",
      buffer: PDF_DE_TESTE,
    });
  await resolver.click();
  await expect(
    resolucao.getByText(
      "Impedimento resolvido. O motivo e a evidência ficaram registrados.",
      { exact: true },
    ),
  ).toBeVisible({ timeout: 60_000 });
  const impedimento = page.locator("#impedimento-de-transferencia");
  await expect(
    impedimento.getByRole("heading", {
      name: "Impedimento de transferência",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    impedimento.getByRole("heading", {
      name: "Impedimentos de transferência resolvidos",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    impedimento.getByText(`Motivo: ${MOTIVO_DA_RESOLUCAO}`, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Nada falta: os dados obrigatórios estão preenchidos.", {
      exact: true,
    }),
  ).toBeVisible();
});

test("(d) outra empresa: 'Sem permissão' na etapa Consultas, igual ao painel", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await entrarPelaTela(page, cenario.outro);
  const base = `/empresa/${cenario.empresaId}/ofertas`;
  const painel = await abrirSemPermissao(page, base);
  const respostas = [
    await abrirSemPermissao(page, `${base}/${cenario.rascunho.id}/consultas`),
    await abrirSemPermissao(page, `${base}/${randomUUID()}/consultas`),
  ];
  for (const resposta of respostas) {
    expect(resposta.status).toBe(painel.status);
    expect(resposta.texto).toBe(painel.texto);
  }
  await expect(page.getByText(cenario.rascunho.titulo)).toHaveCount(0);
  // A ficha da administração também fica fechada para quem não é da equipe.
  await abrirSemPermissao(page, `/admin/ofertas/${cenario.rascunho.id}`);
  await expect(page.getByText(cenario.rascunho.titulo)).toHaveCount(0);

  // Pela própria empresa, a oferta alheia é igual a um id que não existe.
  const daOutra = `/empresa/${cenario.outraEmpresaId}/ofertas`;
  await page.goto(`${daOutra}/${cenario.rascunho.id}/consultas`);
  await expect(
    page.getByRole("heading", { name: "Registro inexistente", exact: true }),
  ).toBeVisible();
  const alheia = await page.locator("main").innerText();
  await page.goto(`${daOutra}/${randomUUID()}/consultas`);
  await expect(
    page.getByRole("heading", { name: "Registro inexistente", exact: true }),
  ).toBeVisible();
  expect(await page.locator("main").innerText()).toBe(alheia);
  await expect(page.getByText("DETRAN-SP")).toHaveCount(0);
});
