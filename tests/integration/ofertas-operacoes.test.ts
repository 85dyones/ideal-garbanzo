/**
 * Operações de servidor da oferta (I2.6; especificação v1.1, §8; ADR-0003
 * §2.15).
 *
 * Com usuários reais e as sessões deles, confere:
 * - o critério de aceite da I2.6: mudança de preço gera versão e histórico,
 *   e a suspensão exige motivo;
 * - as operações novas da B32 e as recusas por papel (Q2, Q3), por estado e
 *   por empresa (CT2.10, CT2.11, CT12.1, CT12.9), com o servidor recusando
 *   antes de escrever (dependências espiadas);
 * - que o hash de toda versão gravada se recalcula fora do banco (§2.7).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Dependencias } from "@/lib/operacao/dependencias";
import type { Resultado } from "@/lib/operacao/resultado";
import { hashDoSnapshot } from "@/modules/offers/rules/snapshot";
import {
  atualizarOferta,
  confirmarDisponibilidade,
  consultarPendenciasDePublicacao,
  criarOferta,
  declararCategoria,
} from "@/modules/offers/server/ofertas";
import {
  cancelarRevisao,
  liberarReserva,
  publicarOferta,
  reabrirOferta,
  reativarOferta,
  reservarOferta,
  retirarOferta,
  revisarOferta,
  suspenderOferta,
} from "@/modules/offers/server/transicoes";
import {
  enviarFotoDaOferta,
  ordenarFotoDaOferta,
  removerFotoDaOferta,
} from "@/modules/offers/storage/servidor";
import {
  convidarMembro,
  responderConvite,
} from "@/modules/organizations/server/membros";
import {
  SUFIXO,
  TABELAS_DO_CONTEXTO,
  comBanco,
  concederPapelNaPlataforma,
  criarUsuario,
  dependencias,
  dependenciasEspiadas,
  empresaAprovada,
  entrar,
} from "./operacoes/apoio";
import {
  diaDaqui,
  exigir,
  ofertaCompleta,
  ofertaPublicada,
} from "./operacoes/ofertas";

let admin: SupabaseClient;
let oper: SupabaseClient;
let f1: SupabaseClient;
let f2: SupabaseClient;
let g1: SupabaseClient;
const ids = { admin: "", oper: "", f1: "", f2: "" };
let empresaF = "";
const INEXISTENTE = "00000000-0000-4000-8000-000000000000";
/** Ofertas deste arquivo, para recalcular o hash das versões no fim. */
const criadas: string[] = [];

beforeAll(async () => {
  const [ua, uo, u1, u2, ug] = await Promise.all([
    criarUsuario("of-admin"),
    criarUsuario("of-oper"),
    criarUsuario("of-f1"),
    criarUsuario("of-f2"),
    criarUsuario("of-g1"),
  ]);
  await concederPapelNaPlataforma(ua.id, "admin");
  await concederPapelNaPlataforma(uo.id, "operator");
  [admin, oper, f1, f2, g1] = await Promise.all([
    entrar(ua),
    entrar(uo),
    entrar(u1),
    entrar(u2),
    entrar(ug),
  ]);
  Object.assign(ids, { admin: ua.id, oper: uo.id, f1: u1.id, f2: u2.id });
  empresaF = await empresaAprovada(f1, admin, "supplier", "O");
  await empresaAprovada(g1, admin, "supplier", "P");
  exigir(
    await convidarMembro(dependencias(f1), {
      empresaId: empresaF,
      email: u2.email,
      papel: "member",
    }),
    "convite",
  );
  exigir(
    await responderConvite(dependencias(f2), {
      empresaId: empresaF,
      aceitar: true,
    }),
    "aceite",
  );
}, 240_000);

async function consulta<T>(sql: string, parametros: unknown[]): Promise<T[]> {
  return comBanco(async (cliente) => {
    const { rows } = await cliente.query(sql, parametros);
    return rows as T[];
  });
}

async function oferta(ofertaId: string) {
  const [linha] = await consulta<{
    status: string;
    asking_price: string;
    current_version: number;
    publication_authorized_by: string | null;
    published_at: Date | null;
    availability_confirmed_at: Date | null;
    withdrawn_by: string | null;
    withdrawn_reason: string | null;
    suspended_category: string | null;
    suspended_reason: string | null;
    suspended_by: string | null;
  }>("select * from public.offers where id = $1", [ofertaId]);
  if (linha === undefined) throw new Error("oferta não encontrada");
  return linha;
}

async function versoes(ofertaId: string) {
  return consulta<{
    version_number: number;
    snapshot_hash: string;
    change_summary: string;
    created_by: string | null;
  }>(
    "select version_number, snapshot_hash, change_summary, created_by from public.offer_versions where offer_id = $1 order by version_number",
    [ofertaId],
  );
}

async function historico(ofertaId: string, campo: string) {
  return consulta<{ antes: string; depois: string; autor: string | null }>(
    `select old_value::text as antes, new_value::text as depois, changed_by as autor
     from public.field_history
     where entity_type = 'offers' and entity_id = $1 and field = $2
     order by changed_at`,
    [ofertaId, campo],
  );
}

async function nova(): Promise<string> {
  const ofertaId = await ofertaCompleta(f1, empresaF);
  criadas.push(ofertaId);
  return ofertaId;
}

async function publicada(): Promise<string> {
  const ofertaId = await ofertaPublicada(f1, oper, empresaF);
  criadas.push(ofertaId);
  return ofertaId;
}

function recusa(erro: string): unknown {
  return expect.objectContaining({ ok: false, erro }) as unknown;
}

describe("createOffer e updateOffer", () => {
  it("o member cria o rascunho, com o veículo normalizado e a versão 1; o staff e outra empresa não criam (Q3, CT2.11)", async () => {
    const criada = exigir(
      await criarOferta(dependencias(f2), {
        empresaId: empresaF,
        veiculo: { marca: "Fiat", placa: "abc-1d23", renavam: "638790107" },
        oferta: {
          condicoesComerciais: 'Pagamento "à vista" \\ sem troca 😀',
        },
      }),
      "criação",
    );
    criadas.push(criada.ofertaId);
    expect(await oferta(criada.ofertaId)).toMatchObject({
      status: "draft",
      current_version: 1,
    });
    const [veiculo] = await consulta<{ plate: string; renavam: string }>(
      `select v.plate, v.renavam from public.vehicles v
       join public.offers o on o.vehicle_id = v.id where o.id = $1`,
      [criada.ofertaId],
    );
    expect(veiculo).toEqual({ plate: "ABC1D23", renavam: "00638790107" });

    for (const sessao of [oper, admin, g1]) {
      const espiada = dependenciasEspiadas(sessao);
      expect(
        await criarOferta(espiada.dependencias, {
          empresaId: empresaF,
          veiculo: { marca: "Fiat" },
        }),
      ).toEqual(recusa("sem_permissao"));
      expect(espiada.rpcs).toEqual([]);
    }
  });

  it("mudança de preço na publicada gera versão nova, histórico e auditoria; as versões anteriores ficam intactas", async () => {
    const ofertaId = await publicada();
    const antes = await versoes(ofertaId);
    const d = dependencias(f1);
    exigir(
      await atualizarOferta(d, { ofertaId, oferta: { preco: "70000.00" } }),
      "preço",
    );

    const depois = await versoes(ofertaId);
    expect(depois).toHaveLength(antes.length + 1);
    expect(depois.slice(0, antes.length)).toEqual(antes);
    expect(depois.at(-1)).toMatchObject({
      version_number: antes.length + 1,
      change_summary: "fields.asking_price",
      created_by: ids.f1,
    });
    expect(await oferta(ofertaId)).toMatchObject({
      asking_price: "70000.00",
      current_version: antes.length + 1,
    });
    expect(await historico(ofertaId, "asking_price")).toEqual([
      { antes: "65000.00", depois: "70000.00", autor: ids.f1 },
    ]);
    const auditoria = await consulta<{ ator: string; campos: string[] }>(
      `select actor_profile_id as ator, metadata -> 'campos' as campos from public.audit_logs
       where entity_type = 'offers' and entity_id = $1 and request_id = $2`,
      [ofertaId, d.requestId],
    );
    expect(auditoria).toEqual([{ ator: ids.f1, campos: ["asking_price"] }]);
  });

  it("o member, o operador, o administrador e outra empresa não mudam o preço da publicada (Q2, CT12.9, CT12.1)", async () => {
    const ofertaId = await publicada();
    const antes = await versoes(ofertaId);
    for (const sessao of [f2, oper, admin, g1]) {
      const espiada = dependenciasEspiadas(sessao);
      expect(
        await atualizarOferta(espiada.dependencias, {
          ofertaId,
          oferta: { preco: "1.00" },
        }),
      ).toEqual(recusa("sem_permissao"));
      expect(espiada.rpcs).toEqual([]);
    }
    expect((await oferta(ofertaId)).asking_price).toBe("65000.00");
    expect(await versoes(ofertaId)).toEqual(antes);
    expect(await historico(ofertaId, "asking_price")).toEqual([]);
  });

  it("estender a validade gera histórico sem versão; passar do teto é recusado (§2.9)", async () => {
    const ofertaId = await publicada();
    const antes = await versoes(ofertaId);
    exigir(
      await atualizarOferta(dependencias(f1), {
        ofertaId,
        oferta: { validaAte: diaDaqui(20) },
      }),
      "validade",
    );
    expect(await versoes(ofertaId)).toEqual(antes);
    expect(await historico(ofertaId, "valid_until")).toHaveLength(1);
    expect(
      await atualizarOferta(dependencias(f1), {
        ofertaId,
        oferta: { validaAte: diaDaqui(40) },
      }),
    ).toEqual(
      expect.objectContaining({
        erro: "regra_violada",
        mensagem: "A validade passa do teto de 30 dias.",
      }),
    );
  });

  it("CT12.6: a mudança direta pela API, com o token do dono, gera a mesma versão e o mesmo histórico", async () => {
    const ofertaId = await publicada();
    const antes = await versoes(ofertaId);
    const { error } = await f1
      .from("offers")
      .update({ asking_price: 71000 })
      .eq("id", ofertaId);
    expect(error).toBeNull();
    const depois = await versoes(ofertaId);
    expect(depois.at(-1)).toMatchObject({
      version_number: antes.length + 1,
      change_summary: "fields.asking_price",
    });
    expect(await historico(ofertaId, "asking_price")).toEqual([
      { antes: "65000.00", depois: "71000.00", autor: ids.f1 },
    ]);
  });
});

describe("dados do veículo da publicada (B16)", () => {
  async function veiculoDa(ofertaId: string): Promise<string> {
    const [linha] = await consulta<{ vehicle_id: string }>(
      "select vehicle_id from public.offers where id = $1",
      [ofertaId],
    );
    if (linha === undefined) throw new Error("oferta não encontrada");
    return linha.vehicle_id;
  }

  it("a publicada não perde dado do veículo, nem pela API direta; o rascunho pode ficar incompleto", async () => {
    const ofertaId = await publicada();
    const direta = await f1
      .from("vehicles")
      .update({ make: null })
      .eq("id", await veiculoDa(ofertaId));
    expect(direta.error).toMatchObject({
      code: "P0001",
      message:
        "a oferta publicada ou reservada precisa dos dados do veículo: make",
    });
    // Pela operação, o esquema nem aceita o vazio.
    expect(
      await atualizarOferta(dependencias(f1), {
        ofertaId,
        veiculo: { marca: null },
      }),
    ).toEqual(recusa("entrada_invalida"));
    expect(
      await consulta<{ pendencias: string[] }>(
        "select private.pendencias_de_publicacao($1) as pendencias",
        [ofertaId],
      ),
    ).toEqual([{ pendencias: [] }]);

    const rascunho = await nova();
    const noRascunho = await f1
      .from("vehicles")
      .update({ make: null })
      .eq("id", await veiculoDa(rascunho));
    expect(noRascunho.error).toBeNull();
  });
});

describe("declareCategory", () => {
  it("o member declara no rascunho, e a declaração nova gera versão; staff e outra empresa não declaram", async () => {
    const ofertaId = await nova();
    const antes = await versoes(ofertaId);
    exigir(
      await declararCategoria(dependencias(f2), {
        ofertaId,
        categoria: "auction",
        valor: "no_known_occurrence",
      }),
      "declaração",
    );
    expect((await versoes(ofertaId)).at(-1)).toMatchObject({
      version_number: antes.length + 1,
      change_summary: "categories.auction, notices",
    });
    for (const sessao of [oper, g1]) {
      expect(
        await declararCategoria(dependencias(sessao), {
          ofertaId,
          categoria: "lien",
          valor: "unknown",
        }),
      ).toEqual(recusa("sem_permissao"));
    }
    expect(
      await declararCategoria(dependencias(f2), {
        ofertaId,
        categoria: "categoria_nova",
        valor: "unknown",
      }),
    ).toEqual(
      expect.objectContaining({
        erro: "regra_violada",
        mensagem: "Categoria documental fora da configuração: categoria_nova.",
      }),
    );
  });

  it("na publicada, só o org_admin declara (Q2)", async () => {
    const ofertaId = await publicada();
    expect(
      await declararCategoria(dependencias(f2), {
        ofertaId,
        categoria: "lien",
        valor: "no_known_occurrence",
      }),
    ).toEqual(recusa("sem_permissao"));
    exigir(
      await declararCategoria(dependencias(f1), {
        ofertaId,
        categoria: "lien",
        valor: "no_known_occurrence",
      }),
      "declaração do org_admin",
    );
  });
});

describe("publicação, revisão e cancelamento", () => {
  it("as pendências vêm do banco; publicar a incompleta é recusado com a lista, sem mudar o estado", async () => {
    const { ofertaId } = exigir(
      await criarOferta(dependencias(f1), {
        empresaId: empresaF,
        veiculo: { marca: "Fiat" },
      }),
      "criação",
    );
    criadas.push(ofertaId);
    const { pendencias } = exigir(
      await consultarPendenciasDePublicacao(dependencias(f2), { ofertaId }),
      "pendências",
    );
    const codigos = pendencias.map((p) => p.codigo);
    expect(codigos).toEqual(
      expect.arrayContaining([
        "model",
        "renavam",
        "location",
        "asking_price",
        "valid_until",
        "declaration:auction",
      ]),
    );
    expect(codigos).not.toContain("make");
    expect(pendencias.find((p) => p.codigo === "location")?.rotulo).toBe(
      "cidade e UF",
    );
    const recusada = await publicarOferta(dependencias(f1), {
      ofertaId,
      autorizacaoDeDivulgacao: true,
    });
    expect(recusada).toEqual(
      expect.objectContaining({
        erro: "regra_violada",
        mensagem: expect.stringMatching(/^Falta preencher: modelo; /) as string,
      }),
    );
    expect((await oferta(ofertaId)).status).toBe("draft");
  });

  it("com revisão exigida, o org_admin envia; o fornecedor cancela; a plataforma devolve com motivo e publica", async () => {
    const ofertaId = await nova();
    expect(
      await publicarOferta(dependencias(f2), {
        ofertaId,
        autorizacaoDeDivulgacao: true,
      }),
    ).toEqual(recusa("sem_permissao"));

    const enviar = async () =>
      exigir(
        await publicarOferta(dependencias(f1), {
          ofertaId,
          autorizacaoDeDivulgacao: true,
        }),
        "envio",
      );
    expect(await enviar()).toEqual({ ofertaId, status: "under_review" });
    expect((await oferta(ofertaId)).publication_authorized_by).toBe(ids.f1);

    // T18: o member cancela o envio; a autorização é limpa.
    exigir(await cancelarRevisao(dependencias(f2), { ofertaId }), "cancelar");
    expect(await oferta(ofertaId)).toMatchObject({
      status: "draft",
      publication_authorized_by: null,
    });

    await enviar();
    expect(
      await revisarOferta(dependencias(oper), {
        ofertaId,
        decisao: "devolver",
      }),
    ).toEqual(recusa("entrada_invalida"));
    expect(
      await revisarOferta(dependencias(f1), { ofertaId, decisao: "publicar" }),
    ).toEqual(recusa("sem_permissao"));
    const motivo = "As fotos mostram a placa.";
    exigir(
      await revisarOferta(dependencias(oper), {
        ofertaId,
        decisao: "devolver",
        motivo,
      }),
      "devolução",
    );
    expect((await oferta(ofertaId)).status).toBe("draft");

    await enviar();
    exigir(
      await revisarOferta(dependencias(oper), {
        ofertaId,
        decisao: "publicar",
      }),
      "publicação",
    );
    const publicadaAgora = await oferta(ofertaId);
    expect(publicadaAgora.status).toBe("published");
    expect(publicadaAgora.published_at).not.toBeNull();
    expect(
      await consulta<{ decision: string; reason: string | null }>(
        "select decision, reason from public.offer_reviews where offer_id = $1 order by reviewed_at",
        [ofertaId],
      ),
    ).toEqual([
      { decision: "returned", reason: motivo },
      { decision: "published", reason: null },
    ]);
    expect(await enviar().catch((erro: unknown) => String(erro))).toMatch(
      /regra_violada Esta ação não vale para oferta em "Publicada"/,
    );
  });
});

describe("reserva e disponibilidade", () => {
  it("o org_admin e a plataforma reservam e liberam; qualquer F confirma a disponibilidade, sem versão", async () => {
    const ofertaId = await publicada();
    // Q2: o servidor recusa o member pelo papel antes de escrever, embora o
    // banco também recusasse.
    const espiada = dependenciasEspiadas(f2);
    expect(await reservarOferta(espiada.dependencias, { ofertaId })).toEqual(
      recusa("sem_permissao"),
    );
    expect(espiada.tabelas).toEqual([...TABELAS_DO_CONTEXTO, "offers"]);
    exigir(await reservarOferta(dependencias(f1), { ofertaId }), "reserva");
    exigir(await liberarReserva(dependencias(oper), { ofertaId }), "liberação");
    expect((await oferta(ofertaId)).status).toBe("published");

    const antes = await versoes(ofertaId);
    const inicio = Date.now();
    const { confirmadaEm } = exigir(
      await confirmarDisponibilidade(dependencias(f2), { ofertaId }),
      "disponibilidade",
    );
    expect(Math.abs(Date.parse(confirmadaEm) - inicio)).toBeLessThan(60_000);
    expect(await versoes(ofertaId)).toEqual(antes);
    expect(await historico(ofertaId, "availability_confirmed_at")).toHaveLength(
      1,
    );
    expect(
      await confirmarDisponibilidade(dependencias(oper), { ofertaId }),
    ).toEqual(recusa("sem_permissao"));

    const rascunho = await nova();
    expect(
      await confirmarDisponibilidade(dependencias(f1), { ofertaId: rascunho }),
    ).toEqual(recusa("regra_violada"));
  });
});

describe("retirada e reabertura", () => {
  it("o org_admin retira sem motivo e reabre; a plataforma retira só com motivo", async () => {
    const ofertaId = await nova();
    expect(await retirarOferta(dependencias(f2), { ofertaId })).toEqual(
      recusa("sem_permissao"),
    );
    exigir(await retirarOferta(dependencias(f1), { ofertaId }), "retirada");
    expect(await oferta(ofertaId)).toMatchObject({
      status: "withdrawn",
      withdrawn_by: ids.f1,
      withdrawn_reason: null,
    });
    expect(await reabrirOferta(dependencias(f2), { ofertaId })).toEqual(
      recusa("sem_permissao"),
    );
    exigir(await reabrirOferta(dependencias(f1), { ofertaId }), "reabertura");
    expect((await oferta(ofertaId)).status).toBe("draft");

    expect(await retirarOferta(dependencias(oper), { ofertaId })).toEqual(
      expect.objectContaining({
        erro: "entrada_invalida",
        campos: { motivo: ["Informe o motivo."] },
      }),
    );
    const motivo = "Oferta duplicada no painel.";
    exigir(
      await retirarOferta(dependencias(oper), { ofertaId, motivo }),
      "retirada pela plataforma",
    );
    expect(await oferta(ofertaId)).toMatchObject({
      status: "withdrawn",
      withdrawn_by: ids.oper,
      withdrawn_reason: motivo,
    });
  });
});

describe("suspensão e reativação", () => {
  it("a suspensão exige motivo e categoria; o fornecedor não suspende nem mexe na suspensa; só o administrador reativa", async () => {
    const ofertaId = await publicada();
    expect(
      await suspenderOferta(dependencias(oper), {
        ofertaId,
        categoria: "forgery",
      }),
    ).toEqual(recusa("entrada_invalida"));
    // Pela API, sem o motivo no cabeçalho, o banco recusa (X08).
    const direta = await oper
      .from("offers")
      .update({ status: "suspended", suspended_category: "forgery" })
      .eq("id", ofertaId);
    expect(direta.error).toMatchObject({
      code: "P0001",
      message: "informe o motivo",
    });
    expect(
      await suspenderOferta(dependencias(f1), {
        ofertaId,
        categoria: "forgery",
        motivo: "Teste.",
      }),
    ).toEqual(recusa("sem_permissao"));
    expect((await oferta(ofertaId)).status).toBe("published");

    const motivo = "Documento com sinais de adulteração.";
    const d = dependencias(oper);
    exigir(
      await suspenderOferta(d, { ofertaId, categoria: "forgery", motivo }),
      "suspensão",
    );
    expect(await oferta(ofertaId)).toMatchObject({
      status: "suspended",
      suspended_category: "forgery",
      suspended_reason: motivo,
      suspended_by: ids.oper,
    });
    const [auditoria] = await consulta<{
      motivo: string;
      status: { de: string; para: string };
    }>(
      `select metadata ->> 'motivo' as motivo, metadata -> 'status' as status from public.audit_logs
       where entity_type = 'offers' and entity_id = $1 and request_id = $2`,
      [ofertaId, d.requestId],
    );
    expect(auditoria).toEqual({
      motivo,
      status: { de: "published", para: "suspended" },
    });

    // Suspensa: o fornecedor só lê.
    expect(
      await atualizarOferta(dependencias(f1), {
        ofertaId,
        oferta: { preco: "1.00" },
      }),
    ).toEqual(recusa("regra_violada"));
    expect(await retirarOferta(dependencias(f1), { ofertaId })).toEqual(
      recusa("regra_violada"),
    );
    expect(await reabrirOferta(dependencias(f1), { ofertaId })).toEqual(
      recusa("regra_violada"),
    );

    expect(
      await reativarOferta(dependencias(oper), { ofertaId, motivo: "Engano." }),
    ).toEqual(recusa("sem_permissao"));
    expect(await reativarOferta(dependencias(admin), { ofertaId })).toEqual(
      recusa("entrada_invalida"),
    );
    exigir(
      await reativarOferta(dependencias(admin), {
        ofertaId,
        motivo: "Documento conferido com o fornecedor.",
      }),
      "reativação",
    );
    expect((await oferta(ofertaId)).status).toBe("draft");

    // Uma nova suspensão, com a mesma categoria da anterior.
    exigir(
      await suspenderOferta(dependencias(oper), {
        ofertaId,
        categoria: "forgery",
        motivo: "Nova suspeita de adulteração.",
      }),
      "nova suspensão",
    );
    expect((await oferta(ofertaId)).status).toBe("suspended");
  });
});

describe("fotos", () => {
  it("o fornecedor reordena e remove a foto no rascunho; o objeto fica no bucket; staff e outra empresa não mexem", async () => {
    const ofertaId = await nova();
    const png = new Uint8Array([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
      ...new TextEncoder().encode(`foto ${SUFIXO}`),
    ]);
    const { fotoId } = exigir(
      await enviarFotoDaOferta(dependencias(f2), {
        ofertaId,
        tipoDoArquivo: "image/png",
        conteudo: png,
      }),
      "envio da foto",
    );
    for (const sessao of [oper, g1]) {
      expect(
        await ordenarFotoDaOferta(dependencias(sessao), { fotoId, ordem: 1 }),
      ).toEqual(recusa("sem_permissao"));
      expect(
        await removerFotoDaOferta(dependencias(sessao), { fotoId }),
      ).toEqual(recusa("sem_permissao"));
    }
    exigir(
      await ordenarFotoDaOferta(dependencias(f2), { fotoId, ordem: 3 }),
      "ordem",
    );
    exigir(await removerFotoDaOferta(dependencias(f2), { fotoId }), "remoção");
    const [foto] = await consulta<{
      display_order: number;
      removido: boolean;
      removed_by: string;
      objeto: boolean;
    }>(
      `select m.display_order, m.removed_at is not null as removido, m.removed_by,
              exists (select 1 from storage.objects s
                      where s.bucket_id = 'offer-photos' and s.name = m.storage_path) as objeto
       from public.offer_media m where m.id = $1`,
      [fotoId],
    );
    expect(foto).toEqual({
      display_order: 3,
      removido: true,
      removed_by: ids.f2,
      objeto: true,
    });
    expect(await removerFotoDaOferta(dependencias(f2), { fotoId })).toEqual(
      expect.objectContaining({
        erro: "regra_violada",
        mensagem: "A foto já foi removida.",
      }),
    );
  });
});

describe("CT2.10: outra empresa recebe sem permissão, e o servidor recusa antes de escrever", () => {
  type Operacao = (d: Dependencias, e: unknown) => Promise<Resultado<unknown>>;
  const operacoes: [string, Operacao, (ofertaId: string) => object][] = [
    [
      "updateOffer",
      atualizarOferta,
      (ofertaId) => ({ ofertaId, oferta: { preco: "1.00" } }),
    ],
    [
      "declareCategory",
      declararCategoria,
      (ofertaId) => ({ ofertaId, categoria: "lien", valor: "unknown" }),
    ],
    [
      "publishOffer",
      publicarOferta,
      (ofertaId) => ({ ofertaId, autorizacaoDeDivulgacao: true }),
    ],
    ["cancelReview", cancelarRevisao, (ofertaId) => ({ ofertaId })],
    [
      "reviewOffer",
      revisarOferta,
      (ofertaId) => ({ ofertaId, decisao: "publicar" }),
    ],
    ["reserveOffer", reservarOferta, (ofertaId) => ({ ofertaId })],
    ["releaseReservation", liberarReserva, (ofertaId) => ({ ofertaId })],
    [
      "withdrawOffer",
      retirarOferta,
      (ofertaId) => ({ ofertaId, motivo: "Teste." }),
    ],
    ["reopenOffer", reabrirOferta, (ofertaId) => ({ ofertaId })],
    [
      "suspendOffer",
      suspenderOferta,
      (ofertaId) => ({ ofertaId, categoria: "forgery", motivo: "Teste." }),
    ],
    [
      "reactivateOffer",
      reativarOferta,
      (ofertaId) => ({ ofertaId, motivo: "Teste." }),
    ],
    [
      "confirmAvailability",
      confirmarDisponibilidade,
      (ofertaId) => ({ ofertaId }),
    ],
  ];

  it.each(operacoes)("%s", async (nome, operacao, entrada) => {
    const ofertaId = await nova();
    // Só o contexto e a leitura da oferta (0 linhas); nenhuma escrita nem RPC.
    // A publicação lê antes a D10, para saber o estado de destino.
    const tabelas =
      nome === "publishOffer"
        ? [...TABELAS_DO_CONTEXTO, "platform_settings", "offers"]
        : [...TABELAS_DO_CONTEXTO, "offers"];
    for (const alvo of [ofertaId, INEXISTENTE]) {
      const espiada = dependenciasEspiadas(g1);
      expect(await operacao(espiada.dependencias, entrada(alvo))).toEqual(
        recusa("sem_permissao"),
      );
      expect(espiada.tabelas).toEqual(tabelas);
      expect(espiada.rpcs).toEqual([]);
    }
    expect(await oferta(ofertaId)).toMatchObject({ status: "draft" });
  });

  it("consulta das pendências: a mesma resposta para a alheia e a inexistente", async () => {
    const ofertaId = await nova();
    for (const alvo of [ofertaId, INEXISTENTE]) {
      expect(
        await consultarPendenciasDePublicacao(dependencias(g1), {
          ofertaId: alvo,
        }),
      ).toEqual(recusa("sem_permissao"));
    }
  });
});

describe("hash das versões (ADR-0003 §2.7)", () => {
  it("o hash de toda versão gravada neste arquivo se recalcula fora do banco", async () => {
    const linhas = await consulta<{
      material_snapshot: unknown;
      snapshot_hash: string;
    }>(
      "select material_snapshot, snapshot_hash from public.offer_versions where offer_id = any($1::uuid[])",
      [criadas],
    );
    expect(linhas.length).toBeGreaterThan(criadas.length);
    for (const linha of linhas) {
      expect(hashDoSnapshot(linha.material_snapshot)).toBe(linha.snapshot_hash);
    }
    // A versão com aspas, barra invertida, acento e emoji nas condições.
    expect(
      linhas.some((linha) =>
        JSON.stringify(linha.material_snapshot).includes("😀"),
      ),
    ).toBe(true);
  });
});
