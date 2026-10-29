/**
 * Estado documental a partir das declarações (I2.5; especificação v1.1, §6.4
 * e §6.5; ADR-0003 §2.12).
 *
 * Confere que o banco e as regras do servidor dizem o mesmo (mapeamento da
 * declaração, precedência e ressalvas) e que a operação devolve estados,
 * origens, ressalvas e resumo para quem lê a oferta, e "sem permissão" para os
 * demais.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { AVISOS, avisoDoEstado } from "@/modules/documental/rules/avisos";
import {
  ESTADOS_DOCUMENTAIS,
  PRECEDENCIA,
  VALORES_DECLARADOS,
  estadoPelaDeclaracao,
} from "@/modules/documental/rules/estados";
import { consultarEstadosDocumentais } from "@/modules/documental/server/estados";
import {
  comBanco,
  concederPapelNaPlataforma,
  criarUsuario,
  dependencias,
  empresaAprovada,
  entrar,
} from "./operacoes/apoio";

let f1: SupabaseClient;
let g1: SupabaseClient;
let ofertaId = "";

beforeAll(async () => {
  const [admin, fornecedor, outro] = await Promise.all([
    criarUsuario("doc-admin"),
    criarUsuario("doc-f1"),
    criarUsuario("doc-g1"),
  ]);
  await concederPapelNaPlataforma(admin.id, "admin");
  const sessaoDoAdmin = await entrar(admin);
  f1 = await entrar(fornecedor);
  g1 = await entrar(outro);
  const empresaF = await empresaAprovada(f1, sessaoDoAdmin, "supplier", "D");
  await empresaAprovada(g1, sessaoDoAdmin, "supplier", "E");

  const criada = await f1.rpc("criar_oferta", {
    p_empresa: empresaF,
    p_veiculo: { make: "Fiat", model: "Uno" },
    p_oferta: {},
  });
  if (criada.error !== null) throw new Error(criada.error.message);
  ofertaId = criada.data as string;
  const declaracoes = await f1.from("supplier_declarations").insert([
    {
      offer_id: ofertaId,
      category: "auction",
      declared_value: "has_occurrence",
      detail: "Passagem por leilão em 2022.",
    },
    {
      offer_id: ofertaId,
      category: "lien",
      declared_value: "no_known_occurrence",
    },
  ]);
  if (declaracoes.error !== null) throw new Error(declaracoes.error.message);
}, 180_000);

describe("banco e regras do servidor dizem o mesmo", () => {
  it("mapeamento da declaração, precedência e ressalvas", async () => {
    const banco = await comBanco(async (cliente) => {
      const declaracao = await cliente.query<{
        valor: string | null;
        estado: string;
      }>(
        "select v as valor, private.estado_pela_declaracao(v) as estado from unnest($1::text[]) as v",
        [[...VALORES_DECLARADOS, null]],
      );
      const precedencia = await cliente.query<{ estado: string }>(
        "select e as estado from unnest($1::text[]) as e order by private.precedencia_documental(e) desc",
        [[...ESTADOS_DOCUMENTAIS]],
      );
      const avisos = await cliente.query<{
        estado: string;
        codigo: string | null;
      }>(
        "select e as estado, private.aviso_do_estado(e) as codigo from unnest($1::text[]) as e",
        [[...ESTADOS_DOCUMENTAIS]],
      );
      return {
        declaracao: declaracao.rows,
        precedencia: precedencia.rows,
        avisos: avisos.rows,
      };
    });
    for (const { valor, estado } of banco.declaracao) {
      expect(estado).toBe(
        estadoPelaDeclaracao(
          valor as (typeof VALORES_DECLARADOS)[number] | null,
        ),
      );
    }
    expect(banco.precedencia.map((linha) => linha.estado)).toEqual(PRECEDENCIA);
    for (const { estado, codigo } of banco.avisos) {
      expect(codigo ?? undefined).toBe(
        avisoDoEstado(estado as (typeof ESTADOS_DOCUMENTAIS)[number]),
      );
    }
  });
});

describe("estados documentais pela operação", () => {
  it("a empresa dona recebe estado, origem, declaração, ressalvas e resumo", async () => {
    const resultado = await consultarEstadosDocumentais(dependencias(f1), {
      ofertaId,
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const { categorias, avisos, resumo } = resultado.dados;
    expect(categorias).toHaveLength(10);
    expect(categorias.find((c) => c.categoria === "auction")).toMatchObject({
      rotuloDaCategoria: "Passagem por leilão",
      estado: "with_findings",
      rotuloDoEstado: "Com apontamentos",
      origem: "supplier_declaration",
      rotuloDaOrigem: "Declarada pelo fornecedor",
      declaracao: {
        valor: "has_occurrence",
        rotulo: "Há ocorrência",
        detalhe: "Passagem por leilão em 2022.",
      },
    });
    expect(categorias.find((c) => c.categoria === "debts_ipva")).toMatchObject({
      estado: "not_checked",
      origem: "unconfirmed",
      rotuloDaOrigem: "Não confirmada",
      declaracao: null,
    });
    expect(resumo).toBe(
      "1 com apontamentos, 1 declarada sem comprovação, 8 não consultadas",
    );
    expect(avisos.map((aviso) => aviso.codigo)).toEqual([
      "categoria_com_apontamentos.v1",
      "categoria_nao_consultada.v1",
      "declaracao_sem_comprovacao.v1",
    ]);
    for (const aviso of avisos) expect(aviso.texto).toBe(AVISOS[aviso.codigo]);

    // As ressalvas da tela são as mesmas que o snapshot da versão vigente grava.
    const doSnapshot = await comBanco(async (cliente) => {
      const { rows } = await cliente.query<{ avisos: string[] }>(
        `select v.material_snapshot -> 'notices' as avisos from public.offers o
         join public.offer_versions v on v.offer_id = o.id and v.version_number = o.current_version
         where o.id = $1`,
        [ofertaId],
      );
      return rows[0]?.avisos;
    });
    expect(doSnapshot).toEqual(avisos.map((aviso) => aviso.codigo));
  });

  it("outra empresa recebe sem permissão, como para id inexistente", async () => {
    const alheia = await consultarEstadosDocumentais(dependencias(g1), {
      ofertaId,
    });
    expect(alheia).toMatchObject({ ok: false, erro: "sem_permissao" });
    const inexistente = await consultarEstadosDocumentais(dependencias(g1), {
      ofertaId: "00000000-0000-4000-8000-000000000000",
    });
    expect(inexistente).toMatchObject({ ok: false, erro: "sem_permissao" });
  });
});
