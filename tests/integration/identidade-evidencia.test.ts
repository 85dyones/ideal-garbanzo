/**
 * Storage do bucket privado membership-evidence (ADR-0002 §2.5 e §2.14; D10,
 * D09b, D16): só administrador da plataforma envia, para <id do pedido>/<arquivo>
 * de pedido aberto de outra pessoa; ninguém sobrescreve nem apaga; só o
 * administrador baixa ou gera URL assinada.
 *
 * O registro da URL assinada em restricted_access_logs é do servidor (I1.5) e
 * não é testado aqui.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  BUCKET_DA_EVIDENCIA,
  type Cliente,
  SUFIXO_DA_EXECUCAO,
  caminhoDaEvidencia,
  clienteAnonimo,
  concederPapel,
  conteudoDeTeste,
  criarUsuario,
  entrar,
  enviarPedido,
  exigirDados,
  garantirAdministrador,
} from "./apoio/identidade";

function pdf(conteudo: string): Blob {
  return new Blob([conteudo], { type: "application/pdf" });
}

async function enviar(
  cliente: Cliente,
  caminho: string,
  conteudo: string,
  upsert = false,
) {
  return cliente.storage
    .from(BUCKET_DA_EVIDENCIA)
    .upload(caminho, pdf(conteudo), { contentType: "application/pdf", upsert });
}

async function baixar(cliente: Cliente, caminho: string) {
  return cliente.storage.from(BUCKET_DA_EVIDENCIA).download(caminho);
}

describe("Storage: bucket membership-evidence", () => {
  let clienteX: Cliente;
  let clienteX2: Cliente;
  let clienteO: Cliente;
  let clienteR: Cliente;
  let pedidoDeR: string;
  let pedidoDeX2: string;
  let pedidoDecidido: string;
  let caminhoEnviado: string;
  const conteudoOriginal = conteudoDeTeste(`original ${SUFIXO_DA_EXECUCAO}`);

  beforeAll(async () => {
    const [x, x2, o, r, d] = await Promise.all([
      criarUsuario("ev-admin"),
      criarUsuario("ev-admin-requerente"),
      criarUsuario("ev-operador"),
      criarUsuario("ev-requerente"),
      criarUsuario("ev-decidido"),
    ]);
    await garantirAdministrador(x);
    clienteX = await entrar(x);
    await concederPapel(clienteX, x2.id, "admin");
    await concederPapel(clienteX, o.id, "operator");
    clienteX2 = await entrar(x2);
    clienteO = await entrar(o);
    clienteR = await entrar(r);
    const clienteD = await entrar(d);
    // Fornecedora só entra por convite (ADR-0002 §9).
    for (const convidado of [x2, d]) {
      exigirDados(
        await clienteX
          .from("supplier_invitations")
          .insert({ email: convidado.email })
          .select("id")
          .single(),
        `convidar ${convidado.email}`,
      );
    }

    pedidoDeR = await enviarPedido(
      clienteR,
      `EV R ${SUFIXO_DA_EXECUCAO}`,
      "buyer",
    );
    pedidoDeX2 = await enviarPedido(
      clienteX2,
      `EV X2 ${SUFIXO_DA_EXECUCAO}`,
      "supplier",
    );
    pedidoDecidido = await enviarPedido(
      clienteD,
      `EV D ${SUFIXO_DA_EXECUCAO}`,
      "both",
    );
    exigirDados(
      await clienteX
        .from("membership_applications")
        .update({
          status: "rejected",
          decision_reason: "pedido de teste rejeitado",
        })
        .eq("id", pedidoDecidido)
        .select("id")
        .single(),
      "rejeitar o pedido decidido",
    );
    caminhoEnviado = caminhoDaEvidencia(pedidoDeR, "consulta");
  }, 180_000);

  it("o administrador envia para <id do pedido aberto de outra pessoa>/arquivo.pdf", async () => {
    const { error } = await enviar(clienteX, caminhoEnviado, conteudoOriginal);
    expect(error).toBeNull();
  });

  it("não administrador não envia: o requerente, o operador e o anônimo", async () => {
    const doRequerente = await enviar(
      clienteR,
      caminhoDaEvidencia(pedidoDeR, "requerente"),
      conteudoOriginal,
    );
    expect(doRequerente.error).not.toBeNull();

    const doOperador = await enviar(
      clienteO,
      caminhoDaEvidencia(pedidoDeR, "operador"),
      conteudoOriginal,
    );
    expect(doOperador.error).not.toBeNull();

    const doAnonimo = await enviar(
      clienteAnonimo(),
      caminhoDaEvidencia(pedidoDeR, "anonimo"),
      conteudoOriginal,
    );
    expect(doAnonimo.error).not.toBeNull();
  });

  it("D09b: o administrador que é o requerente não envia para o próprio pedido; outro administrador envia (contraste)", async () => {
    const doProprio = await enviar(
      clienteX2,
      caminhoDaEvidencia(pedidoDeX2, "propria"),
      conteudoOriginal,
    );
    expect(doProprio.error).not.toBeNull();

    const deOutro = await enviar(
      clienteX,
      caminhoDaEvidencia(pedidoDeX2, "consulta"),
      conteudoOriginal,
    );
    expect(deOutro.error).toBeNull();
  });

  it("D16: pedido já decidido não recebe evidência", async () => {
    const { error } = await enviar(
      clienteX,
      caminhoDaEvidencia(pedidoDecidido, "tarde"),
      conteudoOriginal,
    );
    expect(error).not.toBeNull();
  });

  it("caminho fora de <id do pedido>/<arquivo> é recusado", async () => {
    const caminhos = [
      `solto-${SUFIXO_DA_EXECUCAO}.pdf`,
      `${pedidoDeR}/pasta/arquivo-${SUFIXO_DA_EXECUCAO}.pdf`,
      `pasta-${SUFIXO_DA_EXECUCAO}/arquivo.pdf`,
      `${pedidoDeR.toUpperCase()}/arquivo-${SUFIXO_DA_EXECUCAO}.pdf`,
    ];
    for (const caminho of caminhos) {
      const { error } = await enviar(clienteX, caminho, conteudoOriginal);
      expect(error, `o caminho ${caminho} deveria ser recusado`).not.toBeNull();
    }
  });

  it("ninguém sobrescreve: com ou sem upsert, o arquivo continua o original", async () => {
    const comUpsert = await enviar(
      clienteX,
      caminhoEnviado,
      conteudoDeTeste("sobrescrito com upsert"),
      true,
    );
    expect(comUpsert.error).not.toBeNull();

    const semUpsert = await enviar(
      clienteX,
      caminhoEnviado,
      conteudoDeTeste("sobrescrito sem upsert"),
    );
    expect(semUpsert.error).not.toBeNull();

    const atual = exigirDados(
      await baixar(clienteX, caminhoEnviado),
      "baixar depois das tentativas de sobrescrever",
    );
    expect(await atual.text()).toBe(conteudoOriginal);
  });

  it("ninguém apaga: o arquivo continua depois de remove() do administrador e do requerente", async () => {
    await clienteX.storage.from(BUCKET_DA_EVIDENCIA).remove([caminhoEnviado]);
    await clienteR.storage.from(BUCKET_DA_EVIDENCIA).remove([caminhoEnviado]);

    const atual = exigirDados(
      await baixar(clienteX, caminhoEnviado),
      "baixar depois das tentativas de apagar",
    );
    expect(await atual.text()).toBe(conteudoOriginal);
  });

  it("só o administrador baixa ou gera URL assinada", async () => {
    const doAdministrador = exigirDados(
      await baixar(clienteX, caminhoEnviado),
      "baixar como administrador",
    );
    expect(await doAdministrador.text()).toBe(conteudoOriginal);
    const assinada = exigirDados(
      await clienteX.storage
        .from(BUCKET_DA_EVIDENCIA)
        .createSignedUrl(caminhoEnviado, 60),
      "gerar URL assinada como administrador",
    );
    expect(assinada.signedUrl).toContain(BUCKET_DA_EVIDENCIA);

    for (const [quem, cliente] of [
      ["requerente", clienteR],
      ["operador", clienteO],
      ["anônimo", clienteAnonimo()],
    ] as const) {
      const download = await baixar(cliente, caminhoEnviado);
      expect(download.error, `${quem} não deveria baixar`).not.toBeNull();
      const url = await cliente.storage
        .from(BUCKET_DA_EVIDENCIA)
        .createSignedUrl(caminhoEnviado, 60);
      expect(
        url.error,
        `${quem} não deveria gerar URL assinada`,
      ).not.toBeNull();
    }
  });
});
