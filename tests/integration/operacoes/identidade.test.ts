/**
 * Integração das operações de servidor do Inc. 1 (I1.5; ADR-0002 anexo A).
 *
 * Cobre os casos "pelo servidor" do anexo A: payload manipulado não concede
 * papel (teste 4), suspenso é barrado na operação seguinte com a sessão
 * antiga (teste 5), operador não altera configuração (teste 13), empresa
 * alheia pelo id no payload (teste 2). Os testes rodam em sequência e
 * compartilham o estado: o fluxo é o de uma adesão de verdade.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { mudarStatusDoPerfil } from "@/modules/auth/server/perfis";
import {
  alterarConfiguracao,
  concederPapel,
} from "@/modules/auth/server/plataforma";
import { enviarPedidoDeAdesao } from "@/modules/membership/server/adesao";
import {
  decidirPedido,
  enviarEvidencia,
  gerarUrlDaEvidencia,
  moverPedidoParaAnalise,
  registrarConferencia,
} from "@/modules/membership/server/revisao";
import { mudarStatusDaEmpresa } from "@/modules/organizations/server/empresas";
import {
  convidarMembro,
  gerirMembro,
  responderConvite,
} from "@/modules/organizations/server/membros";
import {
  SUFIXO,
  clienteAdministrativo,
  TABELAS_DO_CONTEXTO,
  cnpjDeTeste,
  comBanco,
  concederPapelNaPlataforma,
  criarUsuario,
  dependencias,
  dependenciasEspiadas,
  emailDeTeste,
  entrar,
  pdfDeTeste,
  type UsuarioDeTeste,
} from "./apoio";
import type { Dependencias } from "@/lib/operacao/dependencias";
import type { CodigoDeErro, Resultado } from "@/lib/operacao/resultado";

interface Pessoa {
  readonly usuario: UsuarioDeTeste;
  readonly sessao: SupabaseClient;
}

let admin: Pessoa;
let operador: Pessoa;
let requerente: Pessoa;
let convidado: Pessoa;
let estranho: Pessoa;

let pedidoId = "";
let evidenciaId = "";
let empresaId = "";
let vinculoDoConvidado = "";

const CHAVE_DE_CONFIGURACAO = `teste_integracao_${SUFIXO.toLowerCase()}`;

async function pessoa(papel: string): Promise<Pessoa> {
  const usuario = await criarUsuario(papel);
  return { usuario, sessao: await entrar(usuario) };
}

/**
 * Confere que o servidor recusou antes de escrever: só as tabelas do contexto
 * foram abertas e a chave secreta não foi usada. Sem isso, a recusa do banco
 * esconderia a falta da checagem do servidor (ADR-0002 §3).
 */
async function recusadoPeloServidor(
  quem: Pessoa,
  operacao: (dependencias: Dependencias) => Promise<Resultado<unknown>>,
  erro: CodigoDeErro = "sem_permissao",
): Promise<void> {
  const espia = dependenciasEspiadas(quem.sessao);
  const resultado = await operacao(espia.dependencias);
  expect(resultado).toMatchObject({ ok: false, erro });
  expect(espia.tabelas).toEqual(TABELAS_DO_CONTEXTO);
  expect(espia.usosDaChaveSecreta()).toBe(0);
}

beforeAll(async () => {
  admin = await pessoa("admin");
  operador = await pessoa("operador");
  requerente = await pessoa("requerente");
  convidado = await pessoa("convidado");
  estranho = await pessoa("estranho");
  await concederPapelNaPlataforma(admin.usuario.id, "admin");
  await concederPapelNaPlataforma(operador.usuario.id, "operator");
  // Chave crítica criada como na migração (manutenção), só para o teste 13.
  await comBanco((cliente) =>
    cliente.query(
      `insert into public.platform_settings (key, value, description)
       values ($1, '1'::jsonb, 'chave de teste da integração')`,
      [CHAVE_DE_CONFIGURACAO],
    ),
  );
}, 60_000);

const pedido = () => ({
  nomeDaEmpresa: `Loja ${SUFIXO}`,
  razaoSocial: `Loja ${SUFIXO} Ltda`,
  cnpj: cnpjDeTeste(),
  tipo: "buyer",
});

async function contarPedidosDe(perfilId: string): Promise<number> {
  return comBanco(async (cliente) => {
    const { rows } = await cliente.query<{ total: number }>(
      "select count(*)::int as total from public.membership_applications where applicant_profile_id = $1",
      [perfilId],
    );
    return rows[0]?.total ?? -1;
  });
}

describe("adesão pelo servidor", () => {
  it("CT4.4: pedido com status ou papel no payload é recusado e não grava nada", async () => {
    for (const extra of [
      { status: "approved" },
      { role: "admin" },
      { reviewed_by: admin.usuario.id },
      { applicant_profile_id: estranho.usuario.id },
    ]) {
      await recusadoPeloServidor(
        requerente,
        (d) => enviarPedidoDeAdesao(d, { ...pedido(), ...extra }),
        "entrada_invalida",
      );
    }
    expect(await contarPedidosDe(requerente.usuario.id)).toBe(0);
  });

  it("D02 (contraste): pedido válido nasce submitted para o próprio requerente", async () => {
    const resultado = await enviarPedidoDeAdesao(
      dependencias(requerente.sessao),
      pedido(),
    );
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    pedidoId = resultado.dados.pedidoId;
    const linha = await comBanco(async (cliente) => {
      const { rows } = await cliente.query<{
        status: string;
        applicant_profile_id: string;
      }>(
        "select status, applicant_profile_id from public.membership_applications where id = $1",
        [pedidoId],
      );
      return rows[0];
    });
    expect(linha).toEqual({
      status: "submitted",
      applicant_profile_id: requerente.usuario.id,
    });
  });

  it("D07b: segundo pedido aberto do mesmo requerente dá conflito", async () => {
    const resultado = await enviarPedidoDeAdesao(
      dependencias(requerente.sessao),
      { ...pedido(), cnpj: cnpjDeTeste("C") },
    );
    expect(resultado).toMatchObject({ ok: false, erro: "conflito" });
  });

  it("CT4.5/D11: requerente e operador não decidem; pedido inalterado", async () => {
    const decisao = {
      pedidoId,
      decisao: "rejeitar",
      motivo: "tentativa sem papel",
    };
    for (const quem of [requerente, operador, estranho]) {
      await recusadoPeloServidor(quem, (d) => decidirPedido(d, decisao));
    }
    const status = await comBanco(async (cliente) => {
      const { rows } = await cliente.query<{ status: string }>(
        "select status from public.membership_applications where id = $1",
        [pedidoId],
      );
      return rows[0]?.status;
    });
    expect(status).toBe("submitted");
  });

  it("D10: operador move para análise, mas não grava conferência nem evidência", async () => {
    await recusadoPeloServidor(operador, (d) =>
      registrarConferencia(d, { pedidoId, itens: [] }),
    );
    await recusadoPeloServidor(operador, (d) =>
      enviarEvidencia(d, {
        pedidoId,
        tipoDoArquivo: "application/pdf",
        conteudo: pdfDeTeste(),
      }),
    );

    const movido = await moverPedidoParaAnalise(dependencias(operador.sessao), {
      pedidoId,
    });
    expect(movido).toEqual({ ok: true, dados: { pedidoId } });
  });

  it("D13/D17: administrador grava a conferência e a evidência com sha256", async () => {
    const conferencia = await registrarConferencia(dependencias(admin.sessao), {
      pedidoId,
      itens: [
        {
          item: "Situação cadastral",
          resultado: "ativa nas fontes consultadas",
        },
      ],
    });
    expect(conferencia.ok).toBe(true);

    const trocado = await enviarEvidencia(dependencias(admin.sessao), {
      pedidoId,
      tipoDoArquivo: "image/png",
      conteudo: pdfDeTeste(),
    });
    expect(trocado).toMatchObject({ ok: false, erro: "entrada_invalida" });

    const evidencia = await enviarEvidencia(dependencias(admin.sessao), {
      pedidoId,
      tipoDoArquivo: "application/pdf",
      conteudo: pdfDeTeste(),
      descricao: "comprovante de inscrição",
    });
    expect(evidencia.ok).toBe(true);
    if (!evidencia.ok) return;
    evidenciaId = evidencia.dados.evidenciaId;
    expect(evidencia.dados.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("URL temporária só para o administrador, com registro de acesso restrito", async () => {
    await recusadoPeloServidor(operador, (d) =>
      gerarUrlDaEvidencia(d, { evidenciaId }),
    );

    const rastreio = dependencias(admin.sessao);
    const url = await gerarUrlDaEvidencia(rastreio, { evidenciaId });
    expect(url.ok).toBe(true);
    const registros = await comBanco(async (cliente) => {
      const { rows } = await cliente.query<{ actor_profile_id: string }>(
        "select actor_profile_id from public.restricted_access_logs where resource_id = $1 and request_id = $2",
        [evidenciaId, rastreio.requestId],
      );
      return rows;
    });
    expect(registros).toEqual([{ actor_profile_id: admin.usuario.id }]);
  });

  it("D12/D14: aprovação cria a empresa e o requerente como org_admin ativo", async () => {
    const resultado = await decidirPedido(dependencias(admin.sessao), {
      pedidoId,
      decisao: "aprovar",
      cnpjConferidoEm: new Date(Date.now() - 60_000).toISOString(),
      fonteDaConferencia: "Comprovante de inscrição no site da Receita",
      evidenciaId,
      dadosDeTeste: true,
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.dados.status).toBe("approved");
    empresaId = resultado.dados.organizationId ?? "";
    const vinculo = await comBanco(async (cliente) => {
      const { rows } = await cliente.query<{
        role: string;
        status: string;
        is_test: boolean;
      }>(
        `select m.role, m.status, o.is_test from public.organization_members m
         join public.organizations o on o.id = m.organization_id
         where m.organization_id = $1 and m.profile_id = $2`,
        [empresaId, requerente.usuario.id],
      );
      return rows[0];
    });
    expect(vinculo).toEqual({
      role: "org_admin",
      status: "active",
      is_test: true,
    });
  });
});

describe("membros pelo servidor", () => {
  it("CT2.5/D27: quem não gere a empresa não convida, nem com o id dela no payload", async () => {
    // A checagem do servidor vem antes da chave secreta, que lê perfis sem RLS.
    for (const quem of [estranho, operador]) {
      await recusadoPeloServidor(quem, (d) =>
        convidarMembro(d, {
          empresaId,
          email: convidado.usuario.email,
          papel: "member",
        }),
      );
    }
  });

  it("D26 (contraste): org_admin convida conta existente e e-mail sem conta com a mesma resposta", async () => {
    const existente = await convidarMembro(dependencias(requerente.sessao), {
      empresaId,
      email: convidado.usuario.email,
      papel: "member",
    });
    expect(existente.ok).toBe(true);
    if (!existente.ok) return;
    vinculoDoConvidado = existente.dados.vinculoId;

    // Sem conta: o convite do Auth é trocado por uma criação sem e-mail, porque
    // o envio depende do SMTP decidido na I1.6.
    const semConta = await convidarMembro(
      dependencias(requerente.sessao),
      { empresaId, email: emailDeTeste("sem-conta"), papel: "member" },
      {
        convidarNoAuth: async (administrativo, email) => {
          const { data, error } = await administrativo.auth.admin.createUser({
            email,
            email_confirm: false,
          });
          return error === null ? data.user.id : null;
        },
      },
    );
    expect(semConta.ok).toBe(true);
    expect(Object.keys(semConta)).toEqual(Object.keys(existente));
  });

  it("CT4.10: o convidado não aceita mudando o papel", async () => {
    await recusadoPeloServidor(
      convidado,
      (d) =>
        responderConvite(d, { empresaId, aceitar: true, role: "org_admin" }),
      "entrada_invalida",
    );
  });

  it("D26b: org_admin não ativa o convite no lugar do convidado", async () => {
    const resultado = await gerirMembro(dependencias(requerente.sessao), {
      empresaId,
      vinculoId: vinculoDoConvidado,
      acao: "reativar",
    });
    expect(resultado).toMatchObject({ ok: false, erro: "regra_violada" });
  });

  it("D26d (contraste): o convidado aceita e fica member ativo", async () => {
    const resultado = await responderConvite(dependencias(convidado.sessao), {
      empresaId,
      aceitar: true,
    });
    expect(resultado).toEqual({
      ok: true,
      dados: { empresaId, status: "active" },
    });
  });

  it("D28: member não gere membros", async () => {
    await recusadoPeloServidor(convidado, (d) =>
      gerirMembro(d, {
        empresaId,
        vinculoId: vinculoDoConvidado,
        acao: "suspender",
      }),
    );
  });
});

describe("suspensão com a sessão antiga (teste 5)", () => {
  it("D41: operador não suspende perfil nem empresa", async () => {
    await recusadoPeloServidor(operador, (d) =>
      mudarStatusDoPerfil(d, {
        perfilId: requerente.usuario.id,
        acao: "suspender",
        motivo: "tentativa do operador",
      }),
    );
    await recusadoPeloServidor(operador, (d) =>
      mudarStatusDaEmpresa(d, {
        empresaId,
        acao: "suspender",
        motivo: "tentativa do operador",
      }),
    );
  });

  it("CT5.2: org_admin suspenso é barrado na operação seguinte, com o mesmo token", async () => {
    const suspensao = await mudarStatusDoPerfil(dependencias(admin.sessao), {
      perfilId: requerente.usuario.id,
      acao: "suspender",
      motivo: "Suspensão de teste da integração",
    });
    expect(suspensao.ok).toBe(true);

    const barrado = await gerirMembro(dependencias(requerente.sessao), {
      empresaId,
      vinculoId: vinculoDoConvidado,
      acao: "suspender",
    });
    expect(barrado).toMatchObject({ ok: false, erro: "sem_permissao" });
    expect(barrado.ok ? "" : barrado.mensagem).toMatch(/suspenso/);

    const pedidoNovo = await enviarPedidoDeAdesao(
      dependencias(requerente.sessao),
      { ...pedido(), cnpj: cnpjDeTeste("D") },
    );
    expect(pedidoNovo).toMatchObject({ ok: false, erro: "sem_permissao" });
  });

  it("CT5.2b: sem o bloqueio no Auth, o servidor barra pelo status do banco", async () => {
    // Simula a falha do bloqueio no Auth (ADR-0002 §2.3): só a camada 2 decide.
    const { error } = await clienteAdministrativo().auth.admin.updateUserById(
      requerente.usuario.id,
      { ban_duration: "none" },
    );
    expect(error).toBeNull();
    const barrado = await gerirMembro(dependencias(requerente.sessao), {
      empresaId,
      vinculoId: vinculoDoConvidado,
      acao: "suspender",
    });
    expect(barrado).toMatchObject({ ok: false, erro: "sem_permissao" });
    expect(barrado.ok ? "" : barrado.mensagem).toMatch(/suspenso/);
  });

  it("contraste: o colega com token do mesmo instante continua lendo a empresa", async () => {
    const { data, error } = await convidado.sessao
      .from("organizations")
      .select("id")
      .eq("id", empresaId);
    expect(error).toBeNull();
    expect(data).toEqual([{ id: empresaId }]);
  });

  it("reativado, o org_admin volta a operar na operação seguinte", async () => {
    const reativacao = await mudarStatusDoPerfil(dependencias(admin.sessao), {
      perfilId: requerente.usuario.id,
      acao: "reativar",
      motivo: "Reativação de teste da integração",
    });
    expect(reativacao.ok).toBe(true);
    const suspensaoDoMembro = await gerirMembro(
      dependencias(requerente.sessao),
      { empresaId, vinculoId: vinculoDoConvidado, acao: "suspender" },
    );
    expect(suspensaoDoMembro.ok).toBe(true);
    const reativacaoDoMembro = await gerirMembro(
      dependencias(requerente.sessao),
      { empresaId, vinculoId: vinculoDoConvidado, acao: "reativar" },
    );
    expect(reativacaoDoMembro.ok).toBe(true);
  });

  it("CT5.4/D32: empresa suspensa barra o org_admin; reativada, volta", async () => {
    const suspensao = await mudarStatusDaEmpresa(dependencias(admin.sessao), {
      empresaId,
      acao: "suspender",
      motivo: "Suspensão de teste da empresa",
    });
    expect(suspensao.ok).toBe(true);
    await recusadoPeloServidor(requerente, (d) =>
      gerirMembro(d, {
        empresaId,
        vinculoId: vinculoDoConvidado,
        acao: "suspender",
      }),
    );

    const reativacao = await mudarStatusDaEmpresa(dependencias(admin.sessao), {
      empresaId,
      acao: "reativar",
      motivo: "Reativação de teste da empresa",
    });
    expect(reativacao.ok).toBe(true);
  });
});

describe("papel e configuração pelo servidor", () => {
  it("CT4.6: user_metadata com papel de administrador não concede nada", async () => {
    const { error } = await estranho.sessao.auth.updateUser({
      data: { role: "admin" },
    });
    expect(error).toBeNull();
    await estranho.sessao.auth.refreshSession();
    await recusadoPeloServidor(estranho, (d) =>
      concederPapel(d, { perfilId: convidado.usuario.id, papel: "admin" }),
    );
    const papeis = await comBanco(async (cliente) => {
      const { rows } = await cliente.query<{ total: number }>(
        "select count(*)::int as total from public.platform_staff where profile_id = any($1)",
        [[estranho.usuario.id, convidado.usuario.id]],
      );
      return rows[0]?.total;
    });
    expect(papeis).toBe(0);
  });

  it("CT13.3: operador não altera configuração pela operação", async () => {
    await recusadoPeloServidor(operador, (d) =>
      alterarConfiguracao(d, { chave: CHAVE_DE_CONFIGURACAO, valor: 2 }),
    );
  });

  it("D52 (contraste): administrador altera, com updated_by e histórico", async () => {
    const resultado = await alterarConfiguracao(dependencias(admin.sessao), {
      chave: CHAVE_DE_CONFIGURACAO,
      valor: 3,
    });
    expect(resultado.ok).toBe(true);
    const conferencia = await comBanco(async (cliente) => {
      const { rows } = await cliente.query<{
        value: number;
        updated_by: string;
        historico: { old_value: number; new_value: number }[];
      }>(
        `select s.value, s.updated_by,
           (select json_agg(json_build_object('old_value', h.old_value, 'new_value', h.new_value))
            from public.field_history h
            where h.entity_type = 'platform_settings' and h.field = s.key
              and h.changed_by = $2) as historico
         from public.platform_settings s where s.key = $1`,
        [CHAVE_DE_CONFIGURACAO, admin.usuario.id],
      );
      return rows[0];
    });
    expect(conferencia).toEqual({
      value: 3,
      updated_by: admin.usuario.id,
      historico: [{ old_value: 1, new_value: 3 }],
    });
  });

  it("CT4.7: concessão grava o administrador da sessão como granted_by", async () => {
    const resultado = await concederPapel(dependencias(admin.sessao), {
      perfilId: estranho.usuario.id,
      papel: "operator",
    });
    expect(resultado.ok).toBe(true);
    const concessao = await comBanco(async (cliente) => {
      const { rows } = await cliente.query<{ granted_by: string }>(
        "select granted_by from public.platform_staff where profile_id = $1",
        [estranho.usuario.id],
      );
      return rows[0]?.granted_by;
    });
    expect(concessao).toBe(admin.usuario.id);
  });
});
