/**
 * Teste 5 pela API real (ADR-0002 §2.3 e §2.11; anexo A.6 e A.10): CT5.1,
 * D43, CT5.4, D44, D51 e D40b.
 *
 * Os tokens de u1 e u2 são emitidos antes da suspensão e não são renovados
 * (autoRefreshToken desligado): o que muda a resposta é o banco, que lê o
 * status a cada requisição. O bloqueio no Auth (§2.3, camada 3) não é usado
 * aqui: o teste prova a camada do banco. Motivos só em ASCII: o gateway
 * repassa o cabeçalho como bytes, e o motivo acentuado exige conversão.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Cliente,
  type UsuarioDeTeste,
  SUFIXO_DA_EXECUCAO,
  aceitarConvite,
  cnpjDeTeste,
  convidar,
  criarEmpresa,
  criarUsuario,
  entrar,
  exigirDados,
  garantirAdministrador,
  tokenAtual,
} from "./apoio/identidade";
import type { Json } from "./apoio/tipos-do-banco";

const MOTIVO = "suspensao de teste da integracao";

async function lerEmpresa(cliente: Cliente, empresaId: string) {
  const { data, error } = await cliente
    .from("organizations")
    .select("id, status")
    .eq("id", empresaId);
  expect(error).toBeNull();
  return data ?? [];
}

async function contarVinculos(
  cliente: Cliente,
  empresaId: string,
  excetoPerfil?: string,
) {
  let consulta = cliente
    .from("organization_members")
    .select("id")
    .eq("organization_id", empresaId);
  if (excetoPerfil) consulta = consulta.neq("profile_id", excetoPerfil);
  const { data, error } = await consulta;
  expect(error).toBeNull();
  return (data ?? []).length;
}

function campo(metadata: Json, chave: string): Json | undefined {
  return typeof metadata === "object" &&
    metadata !== null &&
    !Array.isArray(metadata)
    ? metadata[chave]
    : undefined;
}

describe("teste 5: suspensão com sessão antiga, pela API", () => {
  let u1: UsuarioDeTeste;
  let u2: UsuarioDeTeste;
  let convidado: UsuarioDeTeste;
  let clienteX: Cliente;
  let clienteU1: Cliente;
  let clienteU2: Cliente;
  let tokenU1: string;
  let tokenU2: string;
  let empresaE: string;
  let empresaF: string;

  beforeAll(async () => {
    const [x, usuario1, usuario2, f1, outro] = await Promise.all([
      criarUsuario("t5-admin"),
      criarUsuario("t5-u1"),
      criarUsuario("t5-u2"),
      criarUsuario("t5-f1"),
      criarUsuario("t5-convidado"),
    ]);
    u1 = usuario1;
    u2 = usuario2;
    convidado = outro;
    await garantirAdministrador(x);
    clienteX = await entrar(x);
    clienteU1 = await entrar(u1);
    clienteU2 = await entrar(u2);
    const clienteF1 = await entrar(f1);

    // E: u1 org_admin, u2 member. F: f1 org_admin, u2 member.
    ({ empresaId: empresaE } = await criarEmpresa(
      clienteX,
      clienteU1,
      `T5 E ${SUFIXO_DA_EXECUCAO}`,
      "supplier",
    ));
    ({ empresaId: empresaF } = await criarEmpresa(
      clienteX,
      clienteF1,
      `T5 F ${SUFIXO_DA_EXECUCAO}`,
      "buyer",
    ));
    await aceitarConvite(
      clienteU2,
      await convidar(clienteU1, empresaE, u2.id, "member"),
    );
    await aceitarConvite(
      clienteU2,
      await convidar(clienteF1, empresaF, u2.id, "member"),
    );

    // Tokens emitidos antes de qualquer suspensão, no mesmo instante.
    tokenU1 = await tokenAtual(clienteU1);
    tokenU2 = await tokenAtual(clienteU2);
  }, 180_000);

  it("antes: u1 e u2 leem E e os dois vínculos de E", async () => {
    expect(await lerEmpresa(clienteU1, empresaE)).toHaveLength(1);
    expect(await contarVinculos(clienteU1, empresaE)).toBe(2);
    expect(await lerEmpresa(clienteU2, empresaE)).toHaveLength(1);
  });

  it("D40b: pela API, suspender perfil ou empresa sem x-audit-reason é recusado", async () => {
    const perfil = await clienteX
      .from("profiles")
      .update({ status: "suspended" })
      .eq("id", u1.id)
      .setHeader("x-request-id", `req-${SUFIXO_DA_EXECUCAO}-sem-motivo`)
      .select("id");
    expect(perfil.error?.code).toBe("P0001");
    expect(perfil.error?.message).toBe("informe o motivo da mudança de status");

    const empresa = await clienteX
      .from("organizations")
      .update({ status: "suspended" })
      .eq("id", empresaE)
      .select("id");
    expect(empresa.error?.code).toBe("P0001");
    expect(empresa.error?.message).toBe(
      "informe o motivo da mudança de status",
    );

    const situacao = exigirDados(
      await clienteX.from("profiles").select("status").eq("id", u1.id).single(),
      "ler o perfil de u1",
    );
    expect(situacao.status).toBe("active");
    expect(await lerEmpresa(clienteX, empresaE)).toEqual([
      { id: empresaE, status: "active" },
    ]);
  });

  it("D39/D40b/D46: com x-audit-reason a suspensão passa, e a auditoria guarda o motivo e o x-request-id", async () => {
    const idDaRequisicao = `req-${SUFIXO_DA_EXECUCAO}-suspende-u1`;
    const suspensao = await clienteX
      .from("profiles")
      .update({ status: "suspended" })
      .eq("id", u1.id)
      .setHeader("x-audit-reason", MOTIVO)
      .setHeader("x-request-id", idDaRequisicao)
      .select("id");
    expect(suspensao.error).toBeNull();
    expect(suspensao.data).toHaveLength(1);

    const registros = exigirDados(
      await clienteX
        .from("audit_logs")
        .select("metadata, request_id")
        .eq("action", "profiles.update")
        .eq("entity_id", u1.id),
      "ler a auditoria da suspensão",
    );
    const registro = registros.find(
      (r) => campo(campo(r.metadata, "status") ?? null, "para") === "suspended",
    );
    expect(registro, "a suspensão de u1 não está em audit_logs").toBeDefined();
    expect(campo(registro?.metadata ?? null, "motivo")).toBe(MOTIVO);
    expect(
      registro?.request_id,
      "ACHADO: o x-request-id enviado não chegou igual a audit_logs.request_id (o gateway descartou ou reescreveu o cabeçalho)",
    ).toBe(idDaRequisicao);
  });

  it("CT5.1/D43: com o token antigo, u1 suspenso não lê E nem os vínculos e não envia pedido", async () => {
    expect(await tokenAtual(clienteU1)).toBe(tokenU1);
    expect(await lerEmpresa(clienteU1, empresaE)).toEqual([]);
    expect(await contarVinculos(clienteU1, empresaE)).toBe(0);

    const pedido = await clienteU1.from("membership_applications").insert({
      organization_name: `T5 u1 ${SUFIXO_DA_EXECUCAO}`,
      legal_name: `T5 u1 ${SUFIXO_DA_EXECUCAO} Ltda`,
      cnpj: cnpjDeTeste(),
      requested_kind: "buyer",
    });
    expect(pedido.error?.code).toBe("42501");
    expect(pedido.error?.message).toBe(
      "o pedido exige sessão de usuário com perfil ativo",
    );

    const convite = await clienteU1.from("organization_members").insert({
      organization_id: empresaE,
      profile_id: convidado.id,
      role: "member",
    });
    expect(convite.error?.code).toBe("42501");
  });

  it("CT5.1 (contraste): u2, com token do mesmo instante, continua lendo E e os vínculos", async () => {
    expect(await tokenAtual(clienteU2)).toBe(tokenU2);
    expect(await lerEmpresa(clienteU2, empresaE)).toHaveLength(1);
    expect(await contarVinculos(clienteU2, empresaE)).toBe(2);
  });

  it("D42: reativado, u1 volta a ler na requisição seguinte, com o mesmo token", async () => {
    const reativacao = await clienteX
      .from("profiles")
      .update({ status: "active" })
      .eq("id", u1.id)
      .setHeader("x-audit-reason", "reativacao de teste da integracao")
      .select("id");
    expect(reativacao.error).toBeNull();
    expect(reativacao.data).toHaveLength(1);

    expect(await tokenAtual(clienteU1)).toBe(tokenU1);
    expect(await lerEmpresa(clienteU1, empresaE)).toHaveLength(1);
    expect(await contarVinculos(clienteU1, empresaE)).toBe(2);
  });

  it("CT5.4/D44/D51: com E suspensa, u2 lê a linha de E com status suspended, mas não os vínculos; F continua", async () => {
    const suspensao = await clienteX
      .from("organizations")
      .update({ status: "suspended" })
      .eq("id", empresaE)
      .setHeader("x-audit-reason", "empresa suspensa em teste da integracao")
      .select("id");
    expect(suspensao.error).toBeNull();
    expect(suspensao.data).toHaveLength(1);

    expect(await tokenAtual(clienteU2)).toBe(tokenU2);
    expect(await lerEmpresa(clienteU2, empresaE)).toEqual([
      { id: empresaE, status: "suspended" },
    ]);
    expect(await contarVinculos(clienteU2, empresaE, u2.id)).toBe(0);

    const convite = await clienteU1.from("organization_members").insert({
      organization_id: empresaE,
      profile_id: convidado.id,
      role: "member",
    });
    expect(convite.error?.code).toBe("42501");

    // Contraste: a outra empresa ativa de u2 e a visão do administrador.
    expect(await contarVinculos(clienteU2, empresaF, u2.id)).toBe(1);
    expect(await contarVinculos(clienteX, empresaE)).toBe(2);
  });

  it("D42: com E reativada, u2 volta a ler os vínculos de E", async () => {
    const reativacao = await clienteX
      .from("organizations")
      .update({ status: "active" })
      .eq("id", empresaE)
      .setHeader("x-audit-reason", "empresa reativada em teste da integracao")
      .select("id");
    expect(reativacao.error).toBeNull();
    expect(await contarVinculos(clienteU2, empresaE, u2.id)).toBe(1);
  });
});
