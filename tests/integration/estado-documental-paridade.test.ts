/**
 * Tabela de decisão do estado documental: banco e servidor dizem o mesmo
 * (I3.5; ADR-0004 §2.1 a §2.4; anexo A.2).
 *
 * Numa transação desfeita no fim, grava as 40 combinações do anexo A.2
 * (declaração vigente × resultado da consulta vigente × revisão aberta), uma
 * por categoria de quatro ofertas, e casos com mais de uma consulta vigente
 * ou com substituição. Para cada categoria, compara `private.estado_documental`
 * com `estadoDaCategoria` de `rules/estados.ts`. Os registros entram como na
 * API: declaração na sessão do fornecedor, consulta e revisão na sessão do
 * operador, com os gatilhos ligados.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  estadoDaCategoria,
  type ResultadoDaConsulta,
  type ValorDeclarado,
} from "@/modules/documental/rules/estados";
import {
  comBanco,
  concederPapelNaPlataforma,
  criarUsuario,
  empresaAprovada,
  entrar,
} from "./operacoes/apoio";

let empresaF = "";
let fornecedorId = "";
let operadorId = "";

beforeAll(async () => {
  const [admin, fornecedor, operador] = await Promise.all([
    criarUsuario("par-admin"),
    criarUsuario("par-f1"),
    criarUsuario("par-oper"),
  ]);
  await concederPapelNaPlataforma(admin.id, "admin");
  await concederPapelNaPlataforma(operador.id, "operator");
  const [sessaoDoAdmin, f1] = await Promise.all([
    entrar(admin),
    entrar(fornecedor),
  ]);
  empresaF = await empresaAprovada(f1, sessaoDoAdmin, "supplier", "P");
  fornecedorId = fornecedor.id;
  operadorId = operador.id;
}, 180_000);

type ClienteDoBanco = Parameters<Parameters<typeof comBanco>[0]>[0];

const DECLARACOES = [
  null,
  "no_known_occurrence",
  "has_occurrence",
  "unknown",
] as const satisfies readonly (ValorDeclarado | null)[];
const CONSULTAS = [
  null,
  "awaiting_result",
  "no_occurrence_in_source",
  "has_occurrence",
  "inconclusive",
] as const satisfies readonly (ResultadoDaConsulta | null)[];

interface Caso {
  readonly descricao: string;
  readonly declaracao: ValorDeclarado | null;
  /** Cadeia de consultas: cada item substitui o anterior quando `substitui` é verdadeiro. */
  readonly consultas: readonly {
    resultado: ResultadoDaConsulta;
    substitui?: true;
  }[];
  readonly revisaoAberta: boolean;
}

async function como(
  cliente: ClienteDoBanco,
  perfil: string | null,
  sql: string,
  parametros: unknown[] = [],
) {
  await cliente.query("select set_config('request.jwt.claims', $1, true)", [
    perfil === null
      ? ""
      : JSON.stringify({ sub: perfil, role: "authenticated" }),
  ]);
  return cliente.query<Record<string, string>>(sql, parametros);
}

/** Grava os casos, um por categoria de cada oferta, e devolve as divergências. */
async function divergencias(
  cliente: ClienteDoBanco,
  ofertas: readonly (readonly Caso[])[],
): Promise<{ total: number; lista: string[] }> {
  const categorias = (
    await cliente.query<{ categoria: string }>(
      "select jsonb_array_elements_text(value) as categoria from public.platform_settings where key = 'document_categories'",
    )
  ).rows.map((linha) => linha.categoria);
  const lista: string[] = [];
  let total = 0;
  for (const casos of ofertas) {
    expect(casos.length).toBeLessThanOrEqual(categorias.length);
    const { rows } = await como(
      cliente,
      fornecedorId,
      "select public.criar_oferta($1, $2::jsonb, '{}'::jsonb) as id",
      [empresaF, JSON.stringify({ make: "Fiat", model: "Uno" })],
    );
    const oferta = rows[0]?.id ?? "";
    for (const [i, caso] of casos.entries()) {
      const categoria = categorias[i] ?? "";
      if (caso.declaracao !== null) {
        await como(
          cliente,
          fornecedorId,
          "insert into public.supplier_declarations (offer_id, category, declared_value, detail) values ($1, $2, $3, $4)",
          [
            oferta,
            categoria,
            caso.declaracao,
            caso.declaracao === "has_occurrence"
              ? "Ocorrência declarada."
              : null,
          ],
        );
      }
      let anterior: string | null = null;
      for (const consulta of caso.consultas) {
        const inserida = await como(
          cliente,
          operadorId,
          `insert into public.vehicle_checks (offer_id, category, source_name, source_type, method, performed_at,
             result, result_summary, known_limitations, supersedes_check_id)
           values ($1, $2, 'DETRAN-SP', 'official', 'manual', now() - interval '1 hour', $3, 'Resumo.',
             'A fonte cobre só a UF consultada.', $4) returning id`,
          [
            oferta,
            categoria,
            consulta.resultado,
            consulta.substitui === true ? anterior : null,
          ],
        );
        anterior = inserida.rows[0]?.id ?? null;
      }
      if (caso.revisaoAberta) {
        await cliente.query("select set_config('request.headers', $1, true)", [
          JSON.stringify({ "x-audit-reason": "Revisão de teste." }),
        ]);
        await como(
          cliente,
          operadorId,
          "insert into public.documental_reviews (offer_id, category, action) values ($1, $2, 'open_review')",
          [oferta, categoria],
        );
        await cliente.query("select set_config('request.headers', '', true)");
      }
      const banco = (
        await como(
          cliente,
          null,
          "select private.estado_documental($1, $2) as estado",
          [oferta, categoria],
        )
      ).rows[0]?.estado;
      // Só as consultas que nenhuma outra substituiu contam.
      const vigentes = caso.consultas
        .filter((consulta, j) => caso.consultas[j + 1]?.substitui !== true)
        .map((consulta) => consulta.resultado);
      const servidor = estadoDaCategoria({
        declaracao: caso.declaracao,
        consultasVigentes: vigentes,
        revisaoAberta: caso.revisaoAberta,
      });
      total += 1;
      if (banco !== servidor) {
        lista.push(
          `${caso.descricao}: banco ${String(banco)}, servidor ${servidor}`,
        );
      }
    }
  }
  return { total, lista };
}

async function naTransacao<T>(
  tarefa: (cliente: ClienteDoBanco) => Promise<T>,
): Promise<T> {
  return comBanco(async (cliente) => {
    await cliente.query("begin");
    try {
      return await tarefa(cliente);
    } finally {
      await cliente.query("rollback");
    }
  });
}

describe("banco e rules/estados.ts dizem o mesmo", () => {
  it("as 40 linhas da tabela de decisão (anexo A.2, com a P1)", async () => {
    const ofertas: Caso[][] = DECLARACOES.map((declaracao) =>
      CONSULTAS.flatMap((resultado) =>
        [false, true].map((revisaoAberta) => ({
          descricao: `${String(declaracao)} × ${String(resultado)}${revisaoAberta ? " com revisão" : ""}`,
          declaracao,
          consultas: resultado === null ? [] : [{ resultado }],
          revisaoAberta,
        })),
      ),
    );
    const { total, lista } = await naTransacao((cliente) =>
      divergencias(cliente, ofertas),
    );
    expect(total).toBe(40);
    expect(lista).toEqual([]);
  }, 180_000);

  it("mais de uma consulta vigente e substituição (E1 a E3)", async () => {
    const nko = "no_known_occurrence" as const;
    const casos: Caso[] = [
      {
        descricao: "nko com duas fontes: sem ocorrência e com ocorrência",
        declaracao: nko,
        consultas: [
          { resultado: "no_occurrence_in_source" },
          { resultado: "has_occurrence" },
        ],
        revisaoAberta: false,
      },
      {
        descricao: "nko com duas fontes: sem ocorrência e aguardando",
        declaracao: nko,
        consultas: [
          { resultado: "no_occurrence_in_source" },
          { resultado: "awaiting_result" },
        ],
        revisaoAberta: false,
      },
      {
        descricao: "nko com duas fontes sem ocorrência",
        declaracao: nko,
        consultas: [
          { resultado: "no_occurrence_in_source" },
          { resultado: "no_occurrence_in_source" },
        ],
        revisaoAberta: false,
      },
      {
        descricao: "nko: sem ocorrência substituída por aguardando",
        declaracao: nko,
        consultas: [
          { resultado: "no_occurrence_in_source" },
          { resultado: "awaiting_result", substitui: true },
        ],
        revisaoAberta: false,
      },
      {
        descricao: "nko: aguardando substituída por com ocorrência",
        declaracao: nko,
        consultas: [
          { resultado: "awaiting_result" },
          { resultado: "has_occurrence", substitui: true },
        ],
        revisaoAberta: false,
      },
      {
        descricao: "dho com duas fontes sem ocorrência (P1)",
        declaracao: "has_occurrence",
        consultas: [
          { resultado: "no_occurrence_in_source" },
          { resultado: "no_occurrence_in_source" },
        ],
        revisaoAberta: false,
      },
      {
        descricao: "unk: com ocorrência substituída por sem ocorrência",
        declaracao: "unknown",
        consultas: [
          { resultado: "has_occurrence" },
          { resultado: "no_occurrence_in_source", substitui: true },
        ],
        revisaoAberta: false,
      },
      {
        descricao: "unk com inconclusiva e sem ocorrência, com revisão",
        declaracao: "unknown",
        consultas: [
          { resultado: "inconclusive" },
          { resultado: "no_occurrence_in_source" },
        ],
        revisaoAberta: true,
      },
    ];
    const { total, lista } = await naTransacao((cliente) =>
      divergencias(cliente, [casos]),
    );
    expect(total).toBe(casos.length);
    expect(lista).toEqual([]);
  }, 180_000);
});
