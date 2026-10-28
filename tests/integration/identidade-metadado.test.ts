/**
 * CT4.6 e D22 (ADR-0002 §2.1, anexo A.10, teste 4): o usuário grava
 * { role: 'admin' } no próprio user_metadata pela API do Auth, renova a sessão
 * e continua sem acesso administrativo pela API. Contraste: o administrador
 * real faz o mesmo e consegue.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Cliente,
  type UsuarioDeTeste,
  SUFIXO_DA_EXECUCAO,
  claimsDoToken,
  concederPapel,
  criarUsuario,
  entrar,
  enviarPedido,
  exigirDados,
  garantirAdministrador,
  registrarEvidencia,
  tokenAtual,
} from "./apoio/identidade";

describe("CT4.6: papel no user_metadata não dá acesso administrativo", () => {
  let p: UsuarioDeTeste;
  let alvo: UsuarioDeTeste;
  let clienteP: Cliente;
  let clienteX: Cliente;
  let pedidoDeR: string;
  let evidenciaDeR: string;

  beforeAll(async () => {
    const [usuarioP, usuarioX, usuarioR, usuarioAlvo] = await Promise.all([
      criarUsuario("ct46-p"),
      criarUsuario("ct46-admin"),
      criarUsuario("ct46-requerente"),
      criarUsuario("ct46-alvo"),
    ]);
    p = usuarioP;
    alvo = usuarioAlvo;
    await garantirAdministrador(usuarioX);
    clienteP = await entrar(usuarioP);
    clienteX = await entrar(usuarioX);
    const clienteR = await entrar(usuarioR);
    pedidoDeR = await enviarPedido(
      clienteR,
      `CT46 ${SUFIXO_DA_EXECUCAO}`,
      "buyer",
    );
    evidenciaDeR = await registrarEvidencia(clienteX, pedidoDeR);

    // Os dois gravam role admin no próprio user_metadata e renovam a sessão.
    for (const cliente of [clienteP, clienteX]) {
      exigirDados(
        await cliente.auth.updateUser({ data: { role: "admin" } }),
        "gravar role admin no user_metadata",
      );
      exigirDados(
        await cliente.auth.refreshSession(),
        "renovar a sessão depois de gravar o metadado",
      );
    }
  }, 120_000);

  it("o token renovado de P traz role admin no user_metadata", async () => {
    const claims = claimsDoToken(await tokenAtual(clienteP));
    const metadados = claims.user_metadata as
      Record<string, unknown> | undefined;
    expect(metadados?.role).toBe("admin");
  });

  it("P não lê o pedido de outra pessoa; o administrador real lê (contraste)", async () => {
    const deP = await clienteP
      .from("membership_applications")
      .select("id")
      .eq("id", pedidoDeR);
    expect(deP.error).toBeNull();
    expect(deP.data).toEqual([]);

    const deX = await clienteX
      .from("membership_applications")
      .select("id")
      .eq("id", pedidoDeR);
    expect(deX.error).toBeNull();
    expect(deX.data).toHaveLength(1);
  });

  it("P não se insere em platform_staff; o administrador real concede papel (contraste)", async () => {
    const tentativa = await clienteP
      .from("platform_staff")
      .insert({ profile_id: p.id, role: "admin" });
    expect(tentativa.error?.code).toBe("42501");

    const linhasDeP = await clienteP
      .from("platform_staff")
      .select("id")
      .eq("profile_id", p.id);
    expect(linhasDeP.data).toEqual([]);

    await expect(
      concederPapel(clienteX, alvo.id, "operator"),
    ).resolves.toBeUndefined();
  });

  it("P não revisa nem aprova o pedido; o administrador real aprova (contraste)", async () => {
    const aprovacaoDeP = await clienteP
      .from("membership_applications")
      .update({
        status: "approved",
        cnpj_checked_at: new Date(Date.now() - 60_000).toISOString(),
        cnpj_check_source: "tentativa de P",
        cnpj_check_evidence_id: evidenciaDeR,
      })
      .eq("id", pedidoDeR)
      .select("id");
    expect(aprovacaoDeP.error).toBeNull();
    expect(aprovacaoDeP.data).toEqual([]);

    const pedidoIntacto = exigirDados(
      await clienteX
        .from("membership_applications")
        .select("status, reviewed_by")
        .eq("id", pedidoDeR)
        .single(),
      "ler o pedido depois da tentativa de P",
    );
    expect(pedidoIntacto).toEqual({ status: "submitted", reviewed_by: null });

    const aprovacaoDeX = exigirDados(
      await clienteX
        .from("membership_applications")
        .update({
          status: "approved",
          cnpj_checked_at: new Date(Date.now() - 60_000).toISOString(),
          cnpj_check_source: "consulta de teste da integração",
          cnpj_check_evidence_id: evidenciaDeR,
        })
        .eq("id", pedidoDeR)
        .select("status, organization_id")
        .single(),
      "aprovar como administrador",
    );
    expect(aprovacaoDeX.status).toBe("approved");
    expect(aprovacaoDeX.organization_id).not.toBeNull();
  });
});
