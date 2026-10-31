/**
 * Convite de fornecedora pela tela (I1.10; ADR-0002 §9; mudança de escopo
 * de 30/10):
 * (a) sem convite, `/adesao` diz que a empresa entra como compradora e não
 *     mostra a escolha do tipo;
 * (b) o administrador convida, em `/admin/convites`, o e-mail de um usuário
 *     existente para uma empresa nova; a pessoa vê o convite no início e a
 *     escolha do tipo na adesão, envia o pedido como fornecedora, e o
 *     convite passa a usado;
 * (c) o administrador convida o `org_admin` de uma compradora, que aceita no
 *     início; a empresa passa a fornecedora e compradora;
 * (d) o administrador revoga; o operador vê a lista sem formulário nem
 *     botão; quem não é da equipe recebe "Sem permissão".
 *
 * O login do Auth tem limite de tentativas: cada pessoa entra uma vez só
 * pela tela, e a aba dela segue de um teste ao outro, em série. Os convites
 * vão a e-mails com conta, para o Auth não mandar e-mail.
 */
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import {
  SUFIXO,
  empresaDe,
  novoCnpj,
  novoOperador,
  novoUsuario,
  type UsuarioDeTeste,
} from "./apoio/dados.mjs";
import { abrirSemPermissao, entrarPelaTela } from "./apoio/tela.mjs";

test.describe.configure({ mode: "serial" });

interface Cenario {
  readonly administrador: UsuarioDeTeste;
  readonly operador: UsuarioDeTeste;
  /** Sem convite e sem papel na plataforma. */
  readonly comum: UsuarioDeTeste;
  /** Usuário existente e confirmado, sem empresa, convidado para empresa nova. */
  readonly convidada: UsuarioDeTeste;
  /** `org_admin` da compradora convidada a fornecer também. */
  readonly donoDaCompradora: UsuarioDeTeste;
  readonly compradoraId: string;
  readonly nomeDaCompradora: string;
  /** Convidado e revogado; nunca entra. */
  readonly revogado: UsuarioDeTeste;
}

let cenario: Cenario;
const contextos: BrowserContext[] = [];
const telas = new Map<string, Page>();

/** A aba da pessoa; a entrada pela tela acontece uma vez no arquivo. */
async function telaDe(
  browser: Browser,
  usuario: UsuarioDeTeste,
): Promise<Page> {
  const aberta = telas.get(usuario.email);
  if (aberta !== undefined) return aberta;
  const contexto = await browser.newContext();
  contextos.push(contexto);
  const pagina = await contexto.newPage();
  await entrarPelaTela(pagina, usuario);
  telas.set(usuario.email, pagina);
  return pagina;
}

/** Item da lista da administração; cada e-mail desta execução tem um convite só. */
function itemDoConvite(pagina: Page, email: string): Locator {
  return pagina
    .getByRole("list", { name: "Convites de fornecedora", exact: true })
    .getByRole("listitem")
    .filter({ hasText: email });
}

/** Convite pela tela do administrador; confere a mensagem e o convite pendente. */
async function convidar(
  pagina: Page,
  email: string,
  compradoraId?: string,
): Promise<void> {
  await pagina.goto("/admin/convites");
  const formulario = pagina.getByRole("form", {
    name: "Novo convite de fornecedora",
    exact: true,
  });
  await formulario.getByLabel("E-mail convidado", { exact: true }).fill(email);
  if (compradoraId !== undefined) {
    await formulario
      .getByLabel("Compradora que passa a fornecer também (opcional)", {
        exact: true,
      })
      .selectOption(compradoraId);
  }
  await formulario
    .getByRole("button", { name: "Convidar", exact: true })
    .click();
  await expect(
    formulario.getByText(
      "Convite registrado. A pessoa vê o convite ao entrar na plataforma; quem ainda não tem conta recebe um e-mail para criar a senha.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    itemDoConvite(pagina, email).getByText("Pendente", { exact: true }),
  ).toBeVisible();
}

test.beforeAll(async () => {
  test.setTimeout(180_000);
  const administrador = await novoUsuario("convforn-admin", true);
  const operador = await novoOperador("convforn-operador", administrador);
  const comum = await novoUsuario("convforn-comum");
  const convidada = await novoUsuario("convforn-convidada");
  const revogado = await novoUsuario("convforn-revogado");
  const donoDaCompradora = await novoUsuario("convforn-compradora");
  const nomeDaCompradora = `E2E Compradora Convidada ${SUFIXO}`;
  const compradoraId = await empresaDe(
    administrador,
    donoDaCompradora,
    nomeDaCompradora,
    "buyer",
  );
  cenario = {
    administrador,
    operador,
    comum,
    convidada,
    donoDaCompradora,
    compradoraId,
    nomeDaCompradora,
    revogado,
  };
});

test.afterAll(async () => {
  for (const contexto of contextos) await contexto.close();
});

test("(a) sem convite, a adesão é de compradora, sem escolha de tipo", async ({
  browser,
}) => {
  const pagina = await telaDe(browser, cenario.comum);
  await pagina.goto("/adesao");
  await expect(
    pagina.getByRole("heading", { name: "Dados da empresa", exact: true }),
  ).toBeVisible();
  await expect(
    pagina.getByText(
      "A empresa entra como compradora. Empresas fornecedoras entram por convite da plataforma.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    pagina.getByLabel("Nome da empresa", { exact: true }),
  ).toBeVisible();
  await expect(
    pagina.getByLabel("A empresa vai atuar como", { exact: true }),
  ).toHaveCount(0);
  await expect(
    pagina.getByText("Você tem convite da plataforma", { exact: false }),
  ).toHaveCount(0);
});

test("(b) convite para empresa nova: do convite ao pedido como fornecedora", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const administracao = await telaDe(browser, cenario.administrador);
  await convidar(administracao, cenario.convidada.email);
  await expect(
    itemDoConvite(administracao, cenario.convidada.email),
  ).toContainText("Empresa nova");

  // A convidada vê o convite no início.
  const convidada = await telaDe(browser, cenario.convidada);
  await convidada.goto("/inicio");
  const convites = convidada.getByRole("list", {
    name: "Convites para fornecer",
    exact: true,
  });
  await expect(convites).toContainText(
    "A plataforma convidou você para cadastrar uma empresa fornecedora. O convite vale até",
  );
  await expect(convidada.getByText("Nenhum convite pendente.")).toHaveCount(0);
  await convites
    .getByRole("link", {
      name: "Enviar o pedido como fornecedora",
      exact: true,
    })
    .click();

  // Na adesão, o aviso do convite e a escolha do tipo.
  await expect(convidada).toHaveURL(/\/adesao$/u);
  await expect(
    convidada.getByText(
      "Você tem convite da plataforma para a empresa fornecer.",
      { exact: false },
    ),
  ).toBeVisible();
  const nomeDaEmpresa = `E2E Fornecedora Convidada ${SUFIXO}`;
  await convidada
    .getByLabel("Nome da empresa", { exact: true })
    .fill(nomeDaEmpresa);
  await convidada
    .getByLabel("Razão social", { exact: true })
    .fill(`${nomeDaEmpresa} Ltda`);
  await convidada.getByLabel("CNPJ", { exact: true }).fill(novoCnpj());
  await convidada
    .getByLabel("A empresa vai atuar como", { exact: true })
    .selectOption("supplier");
  await convidada
    .getByRole("button", { name: "Enviar pedido", exact: true })
    .click();
  await expect(
    convidada.getByRole("heading", { name: "Pedido em andamento" }),
  ).toBeVisible();
  await expect(
    convidada.getByText("Fornecedora", { exact: true }),
  ).toBeVisible();

  // Na administração, o convite passou a usado e não tem mais revogação.
  await administracao.goto("/admin/convites");
  const item = itemDoConvite(administracao, cenario.convidada.email);
  await expect(item.getByText("Usado", { exact: true })).toBeVisible();
  await expect(item).toContainText("usado em");
  await expect(
    item.getByRole("button", { name: "Revogar convite" }),
  ).toHaveCount(0);
});

test("(c) compradora passa a fornecer também pelo aceite no início", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const administracao = await telaDe(browser, cenario.administrador);
  await convidar(
    administracao,
    cenario.donoDaCompradora.email,
    cenario.compradoraId,
  );
  await expect(
    itemDoConvite(administracao, cenario.donoDaCompradora.email),
  ).toContainText(cenario.nomeDaCompradora);

  const dono = await telaDe(browser, cenario.donoDaCompradora);
  await dono.goto("/inicio");
  const minhaEmpresa = dono.getByRole("listitem").filter({
    has: dono.getByRole("link", {
      name: cenario.nomeDaCompradora,
      exact: true,
    }),
  });
  await expect(minhaEmpresa).toContainText("(Compradora;");

  const convites = dono.getByRole("list", {
    name: "Convites para fornecer",
    exact: true,
  });
  await expect(convites).toContainText(
    `Convite para ${cenario.nomeDaCompradora} fornecer também. O convite vale até`,
  );
  await dono
    .getByRole("form", {
      name: `Convite para ${cenario.nomeDaCompradora} fornecer também`,
      exact: true,
    })
    .getByRole("button", { name: "Aceitar e fornecer também", exact: true })
    .click();
  await expect(
    dono.getByText(
      "Convite aceito. A empresa passa a atuar como fornecedora e compradora.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(minhaEmpresa).toContainText("(Fornecedora e compradora;");
  await expect(dono.getByText("Nenhum convite pendente.")).toBeVisible();

  // Na página da empresa, o tipo novo e a área de ofertas.
  await dono.goto(`/empresa/${cenario.compradoraId}`);
  await expect(
    dono.getByText("Fornecedora e compradora", { exact: true }),
  ).toBeVisible();
  await expect(
    dono
      .getByRole("navigation", { name: "Áreas da empresa", exact: true })
      .getByRole("link", { name: "Ofertas", exact: true }),
  ).toBeVisible();

  await administracao.goto("/admin/convites");
  await expect(
    itemDoConvite(administracao, cenario.donoDaCompradora.email).getByText(
      "Usado",
      { exact: true },
    ),
  ).toBeVisible();
});

test("(d) revogação; o operador só vê a lista; quem não é da equipe não entra", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const administracao = await telaDe(browser, cenario.administrador);
  await convidar(administracao, cenario.revogado.email);
  const item = itemDoConvite(administracao, cenario.revogado.email);
  await item
    .getByRole("button", { name: "Revogar convite", exact: true })
    .click();
  await expect(
    item.getByText("Convite revogado.", { exact: true }),
  ).toBeVisible();
  await expect(item.getByText("Revogado", { exact: true })).toBeVisible();
  await expect(item).toContainText("revogado em");
  await expect(
    item.getByRole("button", { name: "Revogar convite" }),
  ).toHaveCount(0);

  // O operador chega pela navegação e vê a lista, sem formulário nem botão.
  const operador = await telaDe(browser, cenario.operador);
  await operador.goto("/admin");
  await operador
    .getByRole("navigation", { name: "Administração" })
    .getByRole("link", { name: "Convites", exact: true })
    .click();
  await expect(
    operador.getByRole("heading", {
      level: 1,
      name: "Convites de fornecedora",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    operador.getByText("Só o administrador convida e revoga.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    itemDoConvite(operador, cenario.revogado.email).getByText("Revogado", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    itemDoConvite(operador, cenario.convidada.email).getByText("Usado", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    operador.getByRole("form", { name: "Novo convite de fornecedora" }),
  ).toHaveCount(0);
  await expect(operador.getByLabel("E-mail convidado")).toHaveCount(0);
  await expect(operador.getByRole("button", { name: "Convidar" })).toHaveCount(
    0,
  );
  await expect(
    operador.getByRole("button", { name: "Revogar convite" }),
  ).toHaveCount(0);

  // Quem não é da equipe recebe "Sem permissão", sem a lista.
  const comum = await telaDe(browser, cenario.comum);
  await abrirSemPermissao(comum, "/admin/convites");
  await expect(comum.getByText(cenario.revogado.email)).toHaveCount(0);
});
