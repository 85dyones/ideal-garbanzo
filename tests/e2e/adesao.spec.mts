/**
 * Fluxo da adesão pela tela (I1.6): o requerente envia o pedido; o
 * administrador move para análise, grava a conferência, envia a evidência,
 * abre o link temporário e aceita; o requerente passa a ver a empresa.
 */
import { expect, test } from "@playwright/test";
import { SUFIXO, novoCnpj, novoUsuario } from "./apoio/dados.mjs";
import { entrarPelaTela } from "./apoio/tela.mjs";

const PDF_DE_TESTE = Buffer.from(
  "%PDF-1.4\n% evidencia do teste e2e da adesao\n%%EOF\n",
  "utf8",
);

test("adesão: envio, revisão, evidência e aceite; a empresa aparece para o requerente", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const nomeDaEmpresa = `E2E Adesao ${SUFIXO}`;
  const requerente = await novoUsuario("adesao-requerente");
  const administrador = await novoUsuario("adesao-admin", true);
  const cnpj = novoCnpj();

  // Requerente envia o pedido.
  const contextoDoRequerente = await browser.newContext();
  const telaDoRequerente = await contextoDoRequerente.newPage();
  await entrarPelaTela(telaDoRequerente, requerente);
  await telaDoRequerente.goto("/adesao");
  await telaDoRequerente
    .getByLabel("Nome da empresa", { exact: true })
    .fill(nomeDaEmpresa);
  await telaDoRequerente
    .getByLabel("Razão social", { exact: true })
    .fill(`${nomeDaEmpresa} Ltda`);
  await telaDoRequerente.getByLabel("CNPJ", { exact: true }).fill(cnpj);
  // Sem convite de fornecedora, o pedido é de compradora e não há escolha
  // de tipo (ADR-0002 §9; `convite-de-fornecedora.spec.mts`).
  await telaDoRequerente
    .getByRole("button", { name: "Enviar pedido", exact: true })
    .click();
  await expect(
    telaDoRequerente.getByRole("heading", { name: "Pedido em andamento" }),
  ).toBeVisible();
  await expect(
    telaDoRequerente.getByText("Enviado", { exact: true }),
  ).toBeVisible();
  await expect(
    telaDoRequerente.getByText("Compradora", { exact: true }),
  ).toBeVisible();

  // Administrador revisa.
  const contextoDoAdministrador = await browser.newContext();
  const telaDoAdministrador = await contextoDoAdministrador.newPage();
  await entrarPelaTela(telaDoAdministrador, administrador);
  await telaDoAdministrador.goto("/admin/adesoes?status=submitted");
  await telaDoAdministrador
    .getByRole("link", { name: nomeDaEmpresa, exact: true })
    .click();
  await expect(
    telaDoAdministrador.getByRole("heading", {
      name: `Pedido: ${nomeDaEmpresa}`,
    }),
  ).toBeVisible();

  await telaDoAdministrador
    .getByRole("button", { name: "Mover para análise", exact: true })
    .click();
  await expect(
    telaDoAdministrador.getByText("Em análise", { exact: true }),
  ).toBeVisible();

  await telaDoAdministrador
    .getByLabel("Item conferido", { exact: true })
    .fill("Situação cadastral do CNPJ");
  await telaDoAdministrador
    .getByLabel("Resultado", { exact: true })
    .fill("Ativa");
  await telaDoAdministrador
    .getByRole("button", { name: "Gravar conferência", exact: true })
    .click();
  await expect(
    telaDoAdministrador.getByText("Conferência gravada."),
  ).toBeVisible();

  await telaDoAdministrador
    .getByLabel("Arquivo da evidência", { exact: true })
    .setInputFiles({
      name: "evidencia-e2e.pdf",
      mimeType: "application/pdf",
      buffer: PDF_DE_TESTE,
    });
  await telaDoAdministrador
    .getByLabel("Descrição (opcional)", { exact: true })
    .fill("Consulta do teste E2E");
  await telaDoAdministrador
    .getByRole("button", { name: "Enviar evidência", exact: true })
    .click();
  await expect(
    telaDoAdministrador.getByText("Evidência enviada."),
  ).toBeVisible();

  await telaDoAdministrador
    .getByRole("button", { name: "Ver", exact: true })
    .click();
  await expect(
    telaDoAdministrador.getByRole("link", { name: "Abrir o arquivo" }),
  ).toBeVisible();

  await telaDoAdministrador
    .getByRole("radio", { name: "Aceitar o pedido" })
    .check();
  // Dez minutos antes, no fuso do navegador: o banco recusa conferência no
  // futuro, sem tolerância, e o relógio desta máquina pode estar adiantado.
  const conferidoEm = await telaDoAdministrador.evaluate(() => {
    const data = new Date(Date.now() - 10 * 60_000);
    const dois = (numero: number) => String(numero).padStart(2, "0");
    return `${String(data.getFullYear())}-${dois(data.getMonth() + 1)}-${dois(data.getDate())}T${dois(data.getHours())}:${dois(data.getMinutes())}`;
  });
  await telaDoAdministrador
    .getByLabel("Data e hora da conferência do CNPJ", { exact: true })
    .fill(conferidoEm);
  await telaDoAdministrador
    .getByLabel("Fonte da conferência", { exact: true })
    .fill("Consulta pública do teste E2E");
  await telaDoAdministrador
    .getByLabel("Marcar como dados de teste", { exact: true })
    .check();
  await telaDoAdministrador
    .getByRole("button", { name: "Registrar decisão", exact: true })
    .click();
  await expect(
    telaDoAdministrador.getByRole("link", { name: "Abrir a empresa" }),
  ).toBeVisible();
  await expect(
    telaDoAdministrador.getByText("Aceito", { exact: true }).first(),
  ).toBeVisible();
  await contextoDoAdministrador.close();

  // Requerente passa a ver a empresa.
  await telaDoRequerente.goto("/inicio");
  await telaDoRequerente
    .getByRole("link", { name: nomeDaEmpresa, exact: true })
    .click();
  await expect(
    telaDoRequerente.getByRole("heading", { name: nomeDaEmpresa, exact: true }),
  ).toBeVisible();
  await expect(
    telaDoRequerente.getByRole("heading", { name: "Membros", exact: true }),
  ).toBeVisible();
  await contextoDoRequerente.close();
});
