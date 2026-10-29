/**
 * Tabela de transições: banco e servidor dizem o mesmo (I2.6; ADR-0003
 * §2.3, §2.5 e §3).
 *
 * Percorre todos os pares de estados, todos os atores e os dois valores da
 * D10, com e sem motivo, e confere que o gatilho `private.proteger_oferta`
 * aceita exatamente o que `rules/transicoes.ts` aceita. Faz o mesmo, em cada
 * estado, com a edição da oferta, do veículo, a declaração e a confirmação de
 * disponibilidade (`rules/edicao.ts`). O ator de cada sessão vem do contexto
 * lido do banco (`atorDaOferta`), inclusive o staff com vínculo (B25).
 *
 * As ofertas chegam a cada estado pelas operações de servidor. `expired` e
 * `sold` só existem pelo banco: dentro da transação do teste, desfeita no
 * fim, a validade vencida é simulada com o gatilho desligado (como no
 * `310-ofertas-transicoes`) e a rotina de expiração roda como o pg_cron; a
 * venda, que não tem transição no Inc. 2, é gravada com o gatilho desligado.
 * Cada tentativa roda num bloco que sempre se desfaz.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { carregarContexto } from "@/modules/auth/server/contexto";
import {
  podeConfirmarDisponibilidade,
  podeEditarConteudo,
} from "@/modules/offers/rules/edicao";
import {
  STATUS_DA_OFERTA,
  atorDaOferta,
  motivoObrigatorio,
  transicaoDaOferta,
  type AtorDaOferta,
  type StatusDaOferta,
} from "@/modules/offers/rules/transicoes";
import {
  publicarOferta,
  reservarOferta,
  retirarOferta,
  suspenderOferta,
} from "@/modules/offers/server/transicoes";
import {
  convidarMembro,
  gerirMembro,
  responderConvite,
} from "@/modules/organizations/server/membros";
import {
  comBanco,
  concederPapelNaPlataforma,
  criarUsuario,
  dependencias,
  empresaAprovada,
  entrar,
} from "./operacoes/apoio";
import { exigir, ofertaCompleta, ofertaPublicada } from "./operacoes/ofertas";

interface AtorDeTeste {
  readonly nome: string;
  /** `null` para o sistema: conexão sem sessão, como o pg_cron. */
  readonly id: string | null;
  readonly ator: AtorDaOferta;
}

let atores: AtorDeTeste[] = [];
let ofertas = {} as Record<StatusDaOferta, string>;

/** Estados cuja oferta fica com a validade vencida dentro da transação. */
const VENCIDAS = new Set<StatusDaOferta>(["published", "reserved", "expired"]);

beforeAll(async () => {
  const [admin, oper, f1u, f2u, svu, ssu, g1u] = await Promise.all([
    criarUsuario("tr-admin"),
    criarUsuario("tr-oper"),
    criarUsuario("tr-f1"),
    criarUsuario("tr-f2"),
    criarUsuario("tr-sv"),
    criarUsuario("tr-ss"),
    criarUsuario("tr-g1"),
  ]);
  await concederPapelNaPlataforma(admin.id, "admin");
  for (const staff of [oper, svu, ssu]) {
    await concederPapelNaPlataforma(staff.id, "operator");
  }
  const [sAdmin, sOper, f1, f2, sv, ss, g1] = await Promise.all([
    entrar(admin),
    entrar(oper),
    entrar(f1u),
    entrar(f2u),
    entrar(svu),
    entrar(ssu),
    entrar(g1u),
  ]);
  const empresaF = await empresaAprovada(f1, sAdmin, "supplier", "T");
  await empresaAprovada(g1, sAdmin, "supplier", "U");

  // f2 é member; sv é operador com vínculo ativo; ss, operador com vínculo suspenso.
  let vinculoDoSs = "";
  for (const [usuario, sessao] of [
    [f2u, f2],
    [svu, sv],
    [ssu, ss],
  ] as const) {
    const { vinculoId } = exigir(
      await convidarMembro(dependencias(f1), {
        empresaId: empresaF,
        email: usuario.email,
        papel: "member",
      }),
      "convite",
    );
    exigir(
      await responderConvite(dependencias(sessao), {
        empresaId: empresaF,
        aceitar: true,
      }),
      "aceite",
    );
    if (usuario === ssu) vinculoDoSs = vinculoId;
  }
  exigir(
    await gerirMembro(dependencias(f1), {
      empresaId: empresaF,
      vinculoId: vinculoDoSs,
      acao: "suspender",
    }),
    "suspensão do vínculo",
  );

  const nomes: [string, SupabaseClient, string][] = [
    ["f1", f1, f1u.id],
    ["f2", f2, f2u.id],
    ["sv", sv, svu.id],
    ["ss", ss, ssu.id],
    ["oper", sOper, oper.id],
    ["admin", sAdmin, admin.id],
    ["g1", g1, g1u.id],
  ];
  atores = [];
  for (const [nome, sessao, id] of nomes) {
    const contexto = exigir(await carregarContexto(sessao), `contexto ${nome}`);
    atores.push({ nome, id, ator: atorDaOferta(contexto, empresaF) });
  }
  atores.push({ nome: "sistema", id: null, ator: "sistema" });

  // Uma oferta completa por estado, levada até ele pelas operações.
  const motivo = "Conferência de teste.";
  const publicada = () => ofertaPublicada(f1, sOper, empresaF);
  const [
    rascunho,
    emRevisao,
    publicadaId,
    reservada,
    retirada,
    suspensa,
    expirada,
    vendida,
  ] = await Promise.all([
    ofertaCompleta(f1, empresaF),
    ofertaCompleta(f1, empresaF).then(async (ofertaId) => {
      exigir(
        await publicarOferta(dependencias(f1), {
          ofertaId,
          autorizacaoDeDivulgacao: true,
        }),
        "envio",
      );
      return ofertaId;
    }),
    publicada(),
    publicada().then(async (ofertaId) => {
      exigir(await reservarOferta(dependencias(f1), { ofertaId }), "reserva");
      return ofertaId;
    }),
    ofertaCompleta(f1, empresaF).then(async (ofertaId) => {
      exigir(await retirarOferta(dependencias(f1), { ofertaId }), "retirada");
      return ofertaId;
    }),
    ofertaCompleta(f1, empresaF).then(async (ofertaId) => {
      exigir(
        await suspenderOferta(dependencias(sOper), {
          ofertaId,
          categoria: "serious_risk",
          motivo,
        }),
        "suspensão",
      );
      return ofertaId;
    }),
    publicada(),
    publicada(),
  ]);
  ofertas = {
    draft: rascunho,
    under_review: emRevisao,
    published: publicadaId,
    reserved: reservada,
    withdrawn: retirada,
    suspended: suspensa,
    expired: expirada,
    sold: vendida,
  };
}, 300_000);

type ClienteDoBanco = Parameters<Parameters<typeof comBanco>[0]>[0];

/**
 * Abre a transação, leva as ofertas a `expired` e `sold` e cria a função que
 * tenta cada comando com o ator dado, sempre desfazendo. Tudo é desfeito no
 * fim.
 */
async function naTransacao<T>(
  tarefa: (cliente: ClienteDoBanco) => Promise<T>,
): Promise<T> {
  return comBanco(async (cliente) => {
    await cliente.query("begin");
    try {
      await cliente.query("set constraints all immediate");
      await cliente.query(
        "alter table public.offers disable trigger offers_proteger",
      );
      await cliente.query(
        "update public.offers set valid_until = now() - interval '1 minute' where id = $1",
        [ofertas.expired],
      );
      await cliente.query(
        "update public.offers set status = 'sold' where id = $1",
        [ofertas.sold],
      );
      await cliente.query(
        "alter table public.offers enable trigger offers_proteger",
      );
      await cliente.query("select private.expirar_ofertas()");
      await cliente.query(
        "alter table public.offers disable trigger offers_proteger",
      );
      await cliente.query(
        "update public.offers set valid_until = now() - interval '1 minute' where id = any($1::uuid[])",
        [[ofertas.published, ofertas.reserved]],
      );
      await cliente.query(
        "alter table public.offers enable trigger offers_proteger",
      );
      const { rows } = await cliente.query<{ status: StatusDaOferta }>(
        "select status from public.offers where id = any($1::uuid[]) order by array_position($1::uuid[], id)",
        [STATUS_DA_OFERTA.map((status) => ofertas[status])],
      );
      expect(rows.map((linha) => linha.status)).toEqual([...STATUS_DA_OFERTA]);

      await cliente.query(`
        create function pg_temp.tentar(casos jsonb)
        returns table (n integer, resultado text)
        language plpgsql
        as $f$
        declare
          caso jsonb;
          linhas bigint;
        begin
          n := 0;
          for caso in select value from jsonb_array_elements(casos) loop
            n := n + 1;
            begin
              perform set_config('request.jwt.claims', coalesce(caso ->> 'claims', ''), true);
              perform set_config('request.headers', coalesce(caso ->> 'cabecalhos', ''), true);
              if caso ? 'claims' then
                set local role authenticated;
              end if;
              execute caso ->> 'comando';
              get diagnostics linhas = row_count;
              raise exception using errcode = 'RT001', message = 'linhas: ' || linhas;
            exception
              when sqlstate 'RT001' then
                resultado := sqlerrm;
                return next;
              when others then
                resultado := 'erro ' || sqlstate || ': ' || sqlerrm;
                return next;
            end;
          end loop;
        end;
        $f$`);
      return await tarefa(cliente);
    } finally {
      await cliente.query("rollback");
    }
  });
}

interface Caso {
  readonly descricao: string;
  readonly comando: string;
  readonly ator: AtorDeTeste;
  readonly comMotivo: boolean;
  readonly esperado: boolean;
}

/** Roda os casos e devolve as divergências entre o banco e o esperado. */
async function divergencias(
  cliente: ClienteDoBanco,
  casos: readonly Caso[],
): Promise<string[]> {
  const { rows } = await cliente.query<{ n: number; resultado: string }>(
    "select n, resultado from pg_temp.tentar($1::jsonb) order by n",
    [
      JSON.stringify(
        casos.map((caso) => ({
          comando: caso.comando,
          ...(caso.ator.id === null
            ? {}
            : {
                claims: JSON.stringify({
                  sub: caso.ator.id,
                  role: "authenticated",
                }),
              }),
          ...(caso.comMotivo
            ? {
                cabecalhos: JSON.stringify({
                  "x-audit-reason": "Motivo de teste.",
                }),
              }
            : {}),
        })),
      ),
    ],
  );
  expect(rows).toHaveLength(casos.length);
  return casos.flatMap((caso, i) => {
    const resultado = rows[i]?.resultado ?? "";
    const aceito = resultado === "linhas: 1";
    return aceito === caso.esperado
      ? []
      : [
          `${caso.descricao} (${caso.ator.nome} como ${caso.ator.ator}): esperado ${caso.esperado ? "aceitar" : "recusar"}, banco: ${resultado}`,
        ];
  });
}

function comandoDaTransicao(
  de: StatusDaOferta,
  para: StatusDaOferta,
  ator: AtorDeTeste,
): string {
  // As colunas que a operação manda junto com a transição.
  const colunas = [`status = '${para}'`];
  if (
    de === "draft" &&
    (para === "under_review" || para === "published") &&
    ator.id !== null
  ) {
    colunas.push(`publication_authorized_by = '${ator.id}'`);
  }
  if (para === "suspended") colunas.push("suspended_category = 'forgery'");
  return `update public.offers set ${colunas.join(", ")} where id = '${ofertas[de]}'`;
}

describe("banco e rules/transicoes.ts dizem o mesmo", () => {
  it("os atores de teste cobrem todos os papéis, inclusive o B25", () => {
    expect(atores.map((a) => `${a.nome}:${a.ator}`)).toEqual([
      "f1:adm_empresa",
      "f2:membro",
      "sv:membro",
      "ss:nenhum",
      "oper:operador",
      "admin:administrador",
      "g1:nenhum",
      "sistema:sistema",
    ]);
  });

  it("todo par de estados, todo ator, os dois valores da D10, com e sem motivo", async () => {
    const encontradas = await naTransacao(async (cliente) => {
      const lista: string[] = [];
      for (const revisaoExigida of [true, false]) {
        await cliente.query(
          "update public.platform_settings set value = $1::jsonb where key = 'offer_review_required'",
          [JSON.stringify(revisaoExigida)],
        );
        const casos: Caso[] = [];
        for (const de of STATUS_DA_OFERTA) {
          for (const para of STATUS_DA_OFERTA) {
            if (de === para) continue;
            for (const ator of atores) {
              const transicao = transicaoDaOferta(de, para, ator.ator, {
                revisaoExigida,
                validadeVencida: VENCIDAS.has(de),
              });
              for (const comMotivo of [true, false]) {
                casos.push({
                  descricao: `D10=${String(revisaoExigida)} ${de} → ${para} ${comMotivo ? "com" : "sem"} motivo`,
                  comando: comandoDaTransicao(de, para, ator),
                  ator,
                  comMotivo,
                  esperado:
                    transicao !== undefined &&
                    (comMotivo || !motivoObrigatorio(transicao, ator.ator)),
                });
              }
            }
          }
        }
        expect(casos).toHaveLength(8 * 7 * atores.length * 2);
        expect(casos.filter((caso) => caso.esperado).length).toBeGreaterThan(0);
        lista.push(...(await divergencias(cliente, casos)));
      }
      return lista;
    });
    expect(encontradas).toEqual([]);
  }, 180_000);

  it("edição da oferta, do veículo, declaração e disponibilidade em cada estado", async () => {
    const encontradas = await naTransacao(async (cliente) => {
      const casos: Caso[] = [];
      for (const status of STATUS_DA_OFERTA) {
        const oferta = ofertas[status];
        for (const ator of atores) {
          const conteudo = podeEditarConteudo(status, ator.ator);
          const comandos: [string, string, boolean][] = [
            [
              "preço",
              `update public.offers set asking_price = asking_price + 1 where id = '${oferta}'`,
              conteudo,
            ],
            [
              "quilometragem",
              `update public.vehicles set mileage_km = mileage_km + 1
               where id = (select o.vehicle_id from public.offers o where o.id = '${oferta}')`,
              conteudo,
            ],
            [
              "declaração",
              `insert into public.supplier_declarations (offer_id, category, declared_value)
               values ('${oferta}', 'auction', 'unknown')`,
              conteudo,
            ],
            [
              "disponibilidade",
              `update public.offers set availability_confirmed_at = now() where id = '${oferta}'`,
              podeConfirmarDisponibilidade(status, ator.ator),
            ],
          ];
          for (const [nome, comando, esperado] of comandos) {
            casos.push({
              descricao: `${nome} em ${status}`,
              comando,
              ator,
              comMotivo: false,
              esperado,
            });
          }
        }
      }
      expect(casos.filter((caso) => caso.esperado).length).toBeGreaterThan(0);
      return divergencias(cliente, casos);
    });
    expect(encontradas).toEqual([]);
  }, 180_000);
});
