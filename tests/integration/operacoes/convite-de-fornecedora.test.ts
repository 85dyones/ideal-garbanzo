/**
 * Integração do convite de fornecedora (I1.9; ADR-0002 §9).
 *
 * Mudança de escopo de 30/10: o cadastro público cria só compradora, e a
 * fornecedora entra por convite do administrador da plataforma. Os testes
 * rodam em sequência e compartilham o estado.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Dependencias } from "@/lib/operacao/dependencias";
import type { CodigoDeErro, Resultado } from "@/lib/operacao/resultado";
import {
  convitesDeFornecedoraDoUsuario,
  listarConvitesDeFornecedora,
} from "@/modules/membership/queries/convites";
import { enviarPedidoDeAdesao } from "@/modules/membership/server/adesao";
import {
  aceitarConviteDeFornecedora,
  convidarFornecedora,
  revogarConviteDeFornecedora,
} from "@/modules/membership/server/convites";
import {
  convidarMembro,
  responderConvite,
} from "@/modules/organizations/server/membros";
import {
  SUFIXO,
  TABELAS_DO_CONTEXTO,
  cnpjDeTeste,
  comBanco,
  concederPapelNaPlataforma,
  criarUsuario,
  dependencias,
  dependenciasEspiadas,
  emailDeTeste,
  empresaAprovada,
  entrar,
  type UsuarioDeTeste,
} from "./apoio";

interface Pessoa {
  readonly usuario: UsuarioDeTeste;
  readonly sessao: SupabaseClient;
}

let admin: Pessoa;
let operador: Pessoa;
let convidada: Pessoa;
let semConvite: Pessoa;
let donoDaCompradora: Pessoa;
let membroDaCompradora: Pessoa;
let compradoraId = "";
let conviteDaConvidada = "";
let conviteDaCompradora = "";

async function pessoa(papel: string): Promise<Pessoa> {
  const usuario = await criarUsuario(papel);
  return { usuario, sessao: await entrar(usuario) };
}

/** O servidor recusou antes de escrever e sem a chave secreta (ADR-0002 §3). */
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

const pedidoDeFornecedora = (variante: string) => ({
  nomeDaEmpresa: `Pátio ${variante} ${SUFIXO}`,
  razaoSocial: `Pátio ${variante} ${SUFIXO} Ltda`,
  cnpj: cnpjDeTeste(variante),
  tipo: "supplier",
});

async function tipoDaEmpresa(empresaId: string): Promise<string | undefined> {
  return comBanco(async (cliente) => {
    const { rows } = await cliente.query<{ kind: string }>(
      "select kind from public.organizations where id = $1",
      [empresaId],
    );
    return rows[0]?.kind;
  });
}

beforeAll(async () => {
  admin = await pessoa("admin-convite");
  operador = await pessoa("operador-convite");
  convidada = await pessoa("convidada");
  semConvite = await pessoa("sem-convite");
  donoDaCompradora = await pessoa("dono-compradora");
  membroDaCompradora = await pessoa("membro-compradora");
  await concederPapelNaPlataforma(admin.usuario.id, "admin");
  await concederPapelNaPlataforma(operador.usuario.id, "operator");
  compradoraId = await empresaAprovada(
    donoDaCompradora.sessao,
    admin.sessao,
    "buyer",
    "CC",
  );
  // O membro comum entra pelo convite de membro, aceito por ele.
  const convite = await convidarMembro(dependencias(donoDaCompradora.sessao), {
    empresaId: compradoraId,
    email: membroDaCompradora.usuario.email,
    papel: "member",
  });
  if (!convite.ok) throw new Error(`convite de membro: ${convite.mensagem}`);
  const aceite = await responderConvite(
    dependencias(membroDaCompradora.sessao),
    { empresaId: compradoraId, aceitar: true },
  );
  if (!aceite.ok) throw new Error(`aceite de membro: ${aceite.mensagem}`);
}, 120_000);

describe("convite de fornecedora pelo servidor", () => {
  it("CV01/CV02: operador e administrador de empresa não convidam, e o servidor recusa antes do banco", async () => {
    await recusadoPeloServidor(operador, (d) =>
      convidarFornecedora(d, { email: convidada.usuario.email }),
    );
    await recusadoPeloServidor(donoDaCompradora, (d) =>
      convidarFornecedora(d, { email: convidada.usuario.email }),
    );
  });

  it("CV03 (contraste): o administrador convida conta existente e e-mail sem conta com a mesma resposta", async () => {
    const existente = await convidarFornecedora(dependencias(admin.sessao), {
      email: convidada.usuario.email.toUpperCase(),
    });
    expect(existente.ok).toBe(true);
    if (!existente.ok) return;
    conviteDaConvidada = existente.dados.conviteId;

    // Sem conta: o convite do Auth é trocado por uma criação sem e-mail.
    let pedidosAoAuth = 0;
    const semConta = await convidarFornecedora(
      dependencias(admin.sessao),
      { email: emailDeTeste("fornecedora-sem-conta") },
      {
        convidarNoAuth: async (administrativo, email) => {
          pedidosAoAuth += 1;
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
    expect(pedidosAoAuth).toBe(1);
  });

  it("CV04: o segundo convite pendente para o mesmo e-mail é recusado pelo banco", async () => {
    const repetido = await convidarFornecedora(dependencias(admin.sessao), {
      email: convidada.usuario.email,
    });
    expect(repetido).toMatchObject({
      ok: false,
      erro: "regra_violada",
      mensagem: "Já existe convite pendente para este e-mail.",
    });
  });

  it("CV05: payload com campo a mais é recusado", async () => {
    await recusadoPeloServidor(
      admin,
      (d) =>
        convidarFornecedora(d, {
          email: semConvite.usuario.email,
          status: "used",
        }),
      "entrada_invalida",
    );
  });
});

describe("pedido de adesão como fornecedora", () => {
  it("PD01: sem convite, o pedido como fornecedora é recusado com a mensagem do banco", async () => {
    const resultado = await enviarPedidoDeAdesao(
      dependencias(semConvite.sessao),
      pedidoDeFornecedora("SC"),
    );
    expect(resultado).toMatchObject({
      ok: false,
      erro: "regra_violada",
      mensagem:
        "O pedido como fornecedora exige convite da plataforma para o seu e-mail.",
    });
  });

  it("LE01: a convidada vê o próprio convite pendente; quem não foi convidado, nenhum", async () => {
    const daConvidada = await convitesDeFornecedoraDoUsuario(
      convidada.sessao,
      convidada.usuario.email,
    );
    expect(daConvidada.map((c) => [c.id, c.situacao, c.empresaId])).toEqual([
      [conviteDaConvidada, "pendente", null],
    ]);
    expect(
      await convitesDeFornecedoraDoUsuario(
        semConvite.sessao,
        semConvite.usuario.email,
      ),
    ).toEqual([]);
    // Pedir pelo e-mail de outra pessoa não adianta: a RLS só mostra o próprio.
    expect(
      await convitesDeFornecedoraDoUsuario(
        semConvite.sessao,
        convidada.usuario.email,
      ),
    ).toEqual([]);
    // A equipe lê todos pela RLS, mas a consulta filtra pelo e-mail dela (R-I1.11-08).
    expect(
      await convitesDeFornecedoraDoUsuario(admin.sessao, admin.usuario.email),
    ).toEqual([]);
    expect(
      await convitesDeFornecedoraDoUsuario(convidada.sessao, null),
    ).toEqual([]);
  });

  it("PD05 (contraste): com convite, o pedido como fornecedora entra, e o convite fica usado", async () => {
    const resultado = await enviarPedidoDeAdesao(
      dependencias(convidada.sessao),
      pedidoDeFornecedora("CV"),
    );
    expect(resultado.ok).toBe(true);
    const situacao = (await listarConvitesDeFornecedora(admin.sessao)).find(
      (c) => c.id === conviteDaConvidada,
    )?.situacao;
    expect(situacao).toBe("usado");
    expect(
      await convitesDeFornecedoraDoUsuario(
        convidada.sessao,
        convidada.usuario.email,
      ),
    ).toEqual([]);
  });

  it("PD03 (contraste): o pedido de compradora não pede convite", async () => {
    const resultado = await enviarPedidoDeAdesao(
      dependencias(semConvite.sessao),
      { ...pedidoDeFornecedora("SB"), tipo: "buyer" },
    );
    expect(resultado.ok).toBe(true);
  });
});

describe("revogação", () => {
  it("RV01: o administrador revoga o convite pendente; o revogado não se revoga de novo", async () => {
    const convite = await convidarFornecedora(
      dependencias(admin.sessao),
      {
        email: emailDeTeste("a-revogar"),
      },
      { convidarNoAuth: () => Promise.resolve("sem-conta-no-teste") },
    );
    expect(convite.ok).toBe(true);
    if (!convite.ok) return;
    await recusadoPeloServidor(operador, (d) =>
      revogarConviteDeFornecedora(d, { conviteId: convite.dados.conviteId }),
    );
    const revogado = await revogarConviteDeFornecedora(
      dependencias(admin.sessao),
      { conviteId: convite.dados.conviteId },
    );
    expect(revogado.ok).toBe(true);
    const outraVez = await revogarConviteDeFornecedora(
      dependencias(admin.sessao),
      { conviteId: convite.dados.conviteId },
    );
    expect(outraVez).toMatchObject({
      ok: false,
      erro: "regra_violada",
      mensagem: "O convite não está pendente.",
    });
  });
});

describe("falha do Auth depois da gravação (R-I1.11-06)", () => {
  it("CV12: a resposta é falha_parcial, e o convite pendente pode ser revogado", async () => {
    const email = emailDeTeste("auth-falha");
    const resultado = await convidarFornecedora(
      dependencias(admin.sessao),
      { email },
      { convidarNoAuth: () => Promise.resolve(null) },
    );
    expect(resultado).toMatchObject({
      ok: false,
      erro: "falha_parcial",
      mensagem:
        "Convite registrado, mas o e-mail não saiu agora. Revogue e convide de novo.",
    });
    const pendente = (await listarConvitesDeFornecedora(admin.sessao)).find(
      (c) => c.email === email,
    );
    expect(pendente?.situacao).toBe("pendente");
    if (pendente === undefined) return;
    const revogado = await revogarConviteDeFornecedora(
      dependencias(admin.sessao),
      { conviteId: pendente.id },
    );
    expect(revogado.ok).toBe(true);
  });
});

describe("compradora que passa a fornecer", () => {
  it("CV06: o convite para a compradora não vai a um membro comum", async () => {
    const resultado = await convidarFornecedora(dependencias(admin.sessao), {
      email: membroDaCompradora.usuario.email,
      empresaId: compradoraId,
    });
    expect(resultado).toMatchObject({ ok: false, erro: "regra_violada" });
  });

  it("CV08 (contraste): o convite vai ao administrador da compradora", async () => {
    const resultado = await convidarFornecedora(dependencias(admin.sessao), {
      email: donoDaCompradora.usuario.email,
      empresaId: compradoraId,
    });
    expect(resultado.ok).toBe(true);
    if (resultado.ok) conviteDaCompradora = resultado.dados.conviteId;
  });

  it("AC01/AC03: nem o membro comum nem o administrador da plataforma aceitam", async () => {
    const doMembro = await aceitarConviteDeFornecedora(
      dependencias(membroDaCompradora.sessao),
      { conviteId: conviteDaCompradora },
    );
    expect(doMembro).toMatchObject({ ok: false, erro: "sem_permissao" });
    const doAdmin = await aceitarConviteDeFornecedora(
      dependencias(admin.sessao),
      { conviteId: conviteDaCompradora },
    );
    expect(doAdmin).toMatchObject({ ok: false, erro: "sem_permissao" });
    expect(await tipoDaEmpresa(compradoraId)).toBe("buyer");
  });

  it("AC06 (contraste): o administrador da compradora aceita, e a empresa passa a both", async () => {
    const aceito = await aceitarConviteDeFornecedora(
      dependencias(donoDaCompradora.sessao),
      { conviteId: conviteDaCompradora },
    );
    expect(aceito).toEqual({
      ok: true,
      dados: { conviteId: conviteDaCompradora, empresaId: compradoraId },
    });
    expect(await tipoDaEmpresa(compradoraId)).toBe("both");
  });
});
