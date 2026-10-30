/**
 * Operações do domínio documental (I3.5; especificação v1.1, §6.3, §6.11 e
 * §8; ADR-0004 §2.5, §2.7 a §2.12).
 *
 * Registro de consulta com evidência, pelo fornecedor e pela equipe; versão
 * nova e histórico preservado na substituição; recusas por papel, por estado
 * e por linguagem (no servidor e no gatilho); revisão documental; impedimento
 * automático, com a ressalva igual à do snapshot, e a resolução só pelo
 * administrador; URL da evidência só com registro de acesso; e a lista de
 * linguagem do banco igual à da configuração.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import listaConfigurada from "../../config/linguagem-proibida.json";
import { AVISO_DO_IMPEDIMENTO } from "@/modules/documental/rules/avisos";
import {
  abrirRevisaoDocumental,
  fecharRevisaoDocumental,
  gerarUrlDaEvidencia,
  registrarConsulta,
  resolverImpedimento,
} from "@/modules/documental/server/consultas";
import { consultarEstadosDocumentais } from "@/modules/documental/server/estados";
import {
  convidarMembro,
  responderConvite,
} from "@/modules/organizations/server/membros";
import {
  comBanco,
  concederPapelNaPlataforma,
  criarUsuario,
  dependencias,
  empresaAprovada,
  entrar,
  pdfDeTeste,
} from "./operacoes/apoio";
import { exigir, ofertaCompleta, ofertaPublicada } from "./operacoes/ofertas";

let admin: SupabaseClient;
let operador: SupabaseClient;
let f1: SupabaseClient;
let f2: SupabaseClient;
let g1: SupabaseClient;
let rascunho = "";
let publicada = "";

beforeAll(async () => {
  const [ua, uo, u1, u2, ug] = await Promise.all([
    criarUsuario("docop-admin"),
    criarUsuario("docop-oper"),
    criarUsuario("docop-f1"),
    criarUsuario("docop-f2"),
    criarUsuario("docop-g1"),
  ]);
  await concederPapelNaPlataforma(ua.id, "admin");
  await concederPapelNaPlataforma(uo.id, "operator");
  [admin, operador, f1, f2, g1] = await Promise.all([
    entrar(ua),
    entrar(uo),
    entrar(u1),
    entrar(u2),
    entrar(ug),
  ]);
  const empresaF = await empresaAprovada(f1, admin, "supplier", "Q");
  await empresaAprovada(g1, admin, "supplier", "R");
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
  [rascunho, publicada] = await Promise.all([
    ofertaCompleta(f1, empresaF),
    ofertaPublicada(f1, operador, empresaF),
  ]);
}, 300_000);

const HORA_ATRAS = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();

function consulta(ofertaId: string, dados: Record<string, unknown> = {}) {
  return {
    ofertaId,
    categoria: "lien",
    fonte: "DETRAN-SP",
    tipoDeFonte: "official",
    realizadaEm: HORA_ATRAS(),
    resultado: "no_occurrence_in_source",
    resumo: "Sem gravame ativo na consulta.",
    limitacoes: "A fonte cobre só a UF consultada.",
    ...dados,
  };
}

async function versoes(ofertaId: string): Promise<number> {
  return comBanco(async (cliente) => {
    const { rows } = await cliente.query<{ total: number }>(
      "select count(*)::int as total from public.offer_versions where offer_id = $1",
      [ofertaId],
    );
    return rows[0]?.total ?? 0;
  });
}

describe("registro de consulta (recordCheck)", () => {
  it("o member registra no rascunho, com evidência; a consulta do fornecedor fica como resultado de consulta", async () => {
    const { evidenciaId } = exigir(
      await registrarConsulta(
        dependencias(f2),
        consulta(rascunho, {
          evidencia: {
            tipoDoArquivo: "application/pdf",
            conteudo: pdfDeTeste(),
          },
        }),
      ),
      "consulta do member",
    );
    expect(evidenciaId).not.toBeNull();
    const estados = exigir(
      await consultarEstadosDocumentais(dependencias(f1), {
        ofertaId: rascunho,
      }),
      "estados",
    );
    const gravame = estados.categorias.find((c) => c.categoria === "lien");
    expect(gravame?.estado).toBe("no_findings_in_sources");
    expect(gravame?.consultas).toHaveLength(1);
    expect(gravame?.consultas[0]).toMatchObject({
      origem: "check_result",
      rotuloDaOrigem: "Resultado de consulta",
      evidenciaId,
    });
  });

  it("a equipe registra na publicada com evidência oficial: origem independente, versão nova; a substituição cria outra e mantém a anterior", async () => {
    const antes = await versoes(publicada);
    const primeira = exigir(
      await registrarConsulta(
        dependencias(operador),
        consulta(publicada, {
          evidencia: {
            tipoDoArquivo: "application/pdf",
            conteudo: pdfDeTeste(),
          },
        }),
      ),
      "consulta da equipe",
    );
    expect(await versoes(publicada)).toBe(antes + 1);
    let estados = exigir(
      await consultarEstadosDocumentais(dependencias(f1), {
        ofertaId: publicada,
      }),
      "estados",
    );
    expect(
      estados.categorias.find((c) => c.categoria === "lien")?.consultas[0],
    ).toMatchObject({
      origem: "independent_evidence",
      rotuloDaOrigem: "Confirmada por evidência independente",
    });

    exigir(
      await registrarConsulta(
        dependencias(operador),
        consulta(publicada, {
          resultado: "has_occurrence",
          resumo: "Gravame ativo de financiamento.",
          substitui: primeira.consultaId,
        }),
      ),
      "substituição",
    );
    expect(await versoes(publicada)).toBe(antes + 2);
    estados = exigir(
      await consultarEstadosDocumentais(dependencias(f1), {
        ofertaId: publicada,
      }),
      "estados",
    );
    const gravame = estados.categorias.find((c) => c.categoria === "lien");
    // A declaração da oferta é "desconhece" em lien: com ocorrência na consulta, fica com apontamentos.
    expect(gravame?.estado).toBe("with_findings");
    expect(gravame?.consultas.map((c) => c.resultado)).toEqual([
      "has_occurrence",
    ]);
    const anterior = await comBanco(async (cliente) => {
      const { rows } = await cliente.query<{ result: string }>(
        "select result from public.vehicle_checks where id = $1",
        [primeira.consultaId],
      );
      return rows[0]?.result;
    });
    expect(anterior).toBe("no_occurrence_in_source");
  });

  it("o member não registra na publicada; outra empresa não registra; o payload não leva campos do banco", async () => {
    const doMember = await registrarConsulta(
      dependencias(f2),
      consulta(publicada),
    );
    expect(doMember).toMatchObject({ ok: false, erro: "regra_violada" });
    const deOutra = await registrarConsulta(
      dependencias(g1),
      consulta(publicada),
    );
    expect(deOutra).toMatchObject({ ok: false, erro: "sem_permissao" });
    const comCampoDoBanco = await registrarConsulta(
      dependencias(operador),
      consulta(publicada, { isTest: true }),
    );
    expect(comCampoDoBanco).toMatchObject({
      ok: false,
      erro: "entrada_invalida",
    });
  });

  it("linguagem proibida e data futura são recusadas no servidor; o gatilho recusa o termo pela API direta", async () => {
    const termo = await registrarConsulta(
      dependencias(operador),
      consulta(publicada, { resumo: "Nada consta na certidão." }),
    );
    expect(termo).toMatchObject({ ok: false, erro: "entrada_invalida" });
    if (!termo.ok) expect(Object.keys(termo.campos ?? {})).toEqual(["resumo"]);
    const futura = await registrarConsulta(
      dependencias(operador),
      consulta(publicada, {
        realizadaEm: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    );
    expect(futura).toMatchObject({ ok: false, erro: "entrada_invalida" });

    const direta = await operador.from("vehicle_checks").insert({
      offer_id: publicada,
      category: "debts_fines",
      source_name: "DETRAN-SP",
      source_type: "official",
      method: "manual",
      performed_at: HORA_ATRAS(),
      result: "no_occurrence_in_source",
      result_summary: "Nada consta.",
      known_limitations: "A fonte cobre só a UF consultada.",
    });
    expect(direta.error?.message).toContain("sem a qualificação exigida");
    const qualificada = await operador.from("vehicle_checks").insert({
      offer_id: publicada,
      category: "debts_fines",
      source_name: "DETRAN-SP",
      source_type: "official",
      method: "manual",
      performed_at: HORA_ATRAS(),
      result: "no_occurrence_in_source",
      result_summary: "Nada consta nas fontes consultadas, em 30/10/2026.",
      known_limitations: "A fonte cobre só a UF consultada.",
    });
    expect(qualificada.error).toBeNull();
  });
});

describe("revisão documental", () => {
  it("a equipe abre e fecha com motivo; o fornecedor não abre", async () => {
    const doFornecedor = await abrirRevisaoDocumental(dependencias(f1), {
      ofertaId: publicada,
      categoria: "auction",
      motivo: "Documento diverge da declaração.",
    });
    expect(doFornecedor).toMatchObject({ ok: false, erro: "sem_permissao" });
    exigir(
      await abrirRevisaoDocumental(dependencias(operador), {
        ofertaId: publicada,
        categoria: "auction",
        motivo: "Documento diverge da declaração.",
      }),
      "abrir",
    );
    let estados = exigir(
      await consultarEstadosDocumentais(dependencias(f1), {
        ofertaId: publicada,
      }),
      "estados",
    );
    expect(
      estados.categorias.find((c) => c.categoria === "auction"),
    ).toMatchObject({ estado: "under_review", revisaoAberta: true });
    exigir(
      await fecharRevisaoDocumental(dependencias(operador), {
        ofertaId: publicada,
        categoria: "auction",
        motivo: "Conferido com o fornecedor.",
      }),
      "fechar",
    );
    estados = exigir(
      await consultarEstadosDocumentais(dependencias(f1), {
        ofertaId: publicada,
      }),
      "estados",
    );
    expect(
      estados.categorias.find((c) => c.categoria === "auction"),
    ).toMatchObject({ estado: "with_findings", revisaoAberta: false });
  });
});

describe("impedimento de transferência", () => {
  it("nasce da declaração em transfer_conditions, com a ressalva igual à do snapshot; só o administrador resolve, com evidência", async () => {
    const { error } = await f1.from("supplier_declarations").insert({
      offer_id: rascunho,
      category: "transfer_conditions",
      declared_value: "has_occurrence",
      detail: "Dano de média monta sem regularização.",
    });
    expect(error).toBeNull();
    const estados = exigir(
      await consultarEstadosDocumentais(dependencias(f1), {
        ofertaId: rascunho,
      }),
      "estados",
    );
    expect(estados.impedimentos).toHaveLength(1);
    expect(estados.impedimentos[0]?.ativo).toBe(true);
    expect(estados.avisos.map((a) => a.codigo)).toContain(AVISO_DO_IMPEDIMENTO);
    const doSnapshot = await comBanco(async (cliente) => {
      const { rows } = await cliente.query<{ avisos: string[] }>(
        `select v.material_snapshot -> 'notices' as avisos from public.offers o
         join public.offer_versions v on v.offer_id = o.id and v.version_number = o.current_version
         where o.id = $1`,
        [rascunho],
      );
      return rows[0]?.avisos;
    });
    expect(doSnapshot).toEqual(estados.avisos.map((a) => a.codigo));

    const impedimentoId = estados.impedimentos[0]?.id ?? "";
    const evidencia = {
      tipoDoArquivo: "application/pdf",
      conteudo: pdfDeTeste(),
    };
    const doOperador = await resolverImpedimento(dependencias(operador), {
      impedimentoId,
      motivo: "Regularização apresentada.",
      evidencia,
    });
    expect(doOperador).toMatchObject({ ok: false, erro: "sem_permissao" });
    exigir(
      await resolverImpedimento(dependencias(admin), {
        impedimentoId,
        motivo: "Regularização apresentada.",
        evidencia,
      }),
      "resolução",
    );
    const deNovo = await resolverImpedimento(dependencias(admin), {
      impedimentoId,
      motivo: "Regularização apresentada.",
      evidencia,
    });
    expect(deNovo).toMatchObject({ ok: false, erro: "regra_violada" });
    const depois = exigir(
      await consultarEstadosDocumentais(dependencias(f1), {
        ofertaId: rascunho,
      }),
      "estados",
    );
    expect(depois.impedimentos[0]?.ativo).toBe(false);
    expect(depois.avisos.map((a) => a.codigo)).not.toContain(
      AVISO_DO_IMPEDIMENTO,
    );
  });
});

describe("evidência e lista de linguagem", () => {
  it("a URL da evidência só sai com registro de acesso; outra empresa recebe sem permissão", async () => {
    const { evidenciaId } = exigir(
      await registrarConsulta(
        dependencias(f1),
        consulta(rascunho, {
          categoria: "debts_ipva",
          evidencia: {
            tipoDoArquivo: "application/pdf",
            conteudo: pdfDeTeste(),
          },
        }),
      ),
      "consulta",
    );
    const id = evidenciaId ?? "";
    const url = exigir(
      await gerarUrlDaEvidencia(dependencias(f1), { evidenciaId: id }),
      "url",
    );
    expect(url.url).toContain("check-evidence");
    const registros = await comBanco(async (cliente) => {
      const { rows } = await cliente.query<{ total: number }>(
        "select count(*)::int as total from public.restricted_access_logs where resource_type = 'check_evidence' and resource_id = $1",
        [id],
      );
      return rows[0]?.total ?? 0;
    });
    expect(registros).toBe(1);
    const deOutra = await gerarUrlDaEvidencia(dependencias(g1), {
      evidenciaId: id,
    });
    expect(deOutra).toMatchObject({ ok: false, erro: "sem_permissao" });
  });

  it("a lista de linguagem do banco é a mesma da configuração (E28)", async () => {
    const doBanco = await comBanco(async (cliente) => {
      const { rows } = await cliente.query<{ value: unknown }>(
        "select value from public.platform_settings where key = 'forbidden_terms'",
      );
      return rows[0]?.value;
    });
    expect(doBanco).toEqual({
      qualificacao: listaConfigurada.qualificacao,
      marcadorDeExcecao: listaConfigurada.marcadorDeExcecao,
      termos: listaConfigurada.termos,
    });
  });
});
