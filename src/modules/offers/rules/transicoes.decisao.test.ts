/**
 * Tabela de decisão da oferta escrita a partir do ADR, sem ler a tabela do
 * código (I2.7; ADR-0003 §2.1, §2.3, §2.5 e §2.9; anexo A.2).
 *
 * Os dados deste arquivo repetem, à mão, as tabelas do ADR: as transições,
 * com quem pode, o motivo por ator e a condição da D10 ou da validade
 * vencida; a edição por estado; a confirmação de disponibilidade. O teste
 * percorre todos os pares de estados, os seis atores, a D10 ligada e
 * desligada e a validade vencida ou não, e confere que `transicaoDaOferta`,
 * `motivoObrigatorio`, `podeEditarConteudo` e `podeConfirmarDisponibilidade`
 * dizem exatamente o que o ADR diz. O teste de integração
 * `ofertas-transicoes` confere que o banco diz o mesmo que essas funções.
 * Assim, o ADR, o servidor e o banco ficam amarrados.
 *
 * Os requisitos de publicação da §2.4 (inclusive a validade no futuro para
 * enviar e publicar) não entram aqui: ficam em
 * `private.pendencias_de_publicacao`, fora da tabela de transições.
 */
import { describe, expect, it } from "vitest";
import { podeConfirmarDisponibilidade, podeEditarConteudo } from "./edicao";
import {
  ATORES_DA_OFERTA,
  STATUS_DA_OFERTA,
  motivoObrigatorio,
  transicaoDaOferta,
  type AtorDaOferta,
  type StatusDaOferta,
} from "./transicoes";

/** ADR-0003 §2.1. */
const ESTADOS = [
  "draft",
  "under_review",
  "published",
  "reserved",
  "sold",
  "withdrawn",
  "expired",
  "suspended",
] as const satisfies readonly StatusDaOferta[];

/** Legenda da §2.3, mais `nenhum`: quem não tem papel na oferta. */
const ATORES = [
  "membro",
  "adm_empresa",
  "operador",
  "administrador",
  "sistema",
  "nenhum",
] as const satisfies readonly AtorDaOferta[];

type Quem = readonly AtorDaOferta[];

const NINGUEM: Quem = [];
/** F: membro ativo da empresa dona, com a empresa ativa; inclui o org_admin. */
const F: Quem = ["membro", "adm_empresa"];
/** F-adm: org_admin da empresa dona (Q2). */
const F_ADM: Quem = ["adm_empresa"];
/** ST: operador ou administrador sem vínculo com a empresa dona (B25). */
const ST: Quem = ["operador", "administrador"];
/** AD: só o administrador. */
const AD: Quem = ["administrador"];
/** SIS: a rotina de expiração do banco. */
const SIS: Quem = ["sistema"];

interface LinhaDaAdr {
  readonly id: string;
  readonly de: readonly StatusDaOferta[];
  readonly para: StatusDaOferta;
  readonly quem: Quem;
  /** Quem precisa informar o motivo (cabeçalho `x-audit-reason`, §2.8). */
  readonly motivo: Quem;
  /** Só com a revisão exigida (`true`) ou dispensada (`false`), conforme a D10. */
  readonly d10?: boolean;
  /** Só com `valid_until` vencido. */
  readonly vencida?: true;
  /** Só dentro da validade: a publicada ou reservada vencida se comporta como expirada (§2.9). */
  readonly emVigor?: true;
}

/**
 * ADR-0003 §2.3, na ordem da tabela. A T01 cria a oferta e não é par de
 * estados; T02, T07, T16 e T17 não mudam o estado; a T10 (`sold`) fica para o
 * Inc. 5.
 */
const TABELA_DA_ADR: readonly LinhaDaAdr[] = [
  {
    id: "T03",
    de: ["draft"],
    para: "under_review",
    quem: F_ADM,
    motivo: NINGUEM,
    d10: true,
  },
  {
    id: "T18",
    de: ["under_review"],
    para: "draft",
    quem: F,
    motivo: NINGUEM,
  },
  {
    id: "T04",
    de: ["under_review"],
    para: "published",
    quem: ST,
    motivo: NINGUEM,
  },
  { id: "T05", de: ["under_review"], para: "draft", quem: ST, motivo: ST },
  {
    id: "T06",
    de: ["draft"],
    para: "published",
    quem: F_ADM,
    motivo: NINGUEM,
    d10: false,
  },
  {
    id: "T08",
    de: ["published"],
    para: "reserved",
    quem: ["adm_empresa", "operador", "administrador"],
    motivo: NINGUEM,
    emVigor: true,
  },
  {
    id: "T09",
    de: ["reserved"],
    para: "published",
    quem: ["adm_empresa", "operador", "administrador"],
    motivo: NINGUEM,
    emVigor: true,
  },
  {
    // "F-adm; ST com motivo"
    id: "T11",
    de: ["draft", "under_review", "published", "reserved", "expired"],
    para: "withdrawn",
    quem: ["adm_empresa", "operador", "administrador"],
    motivo: ST,
  },
  {
    id: "T19",
    de: ["withdrawn"],
    para: "draft",
    quem: F_ADM,
    motivo: NINGUEM,
  },
  {
    id: "T12",
    de: ["published", "reserved"],
    para: "expired",
    quem: SIS,
    motivo: NINGUEM,
    vencida: true,
  },
  {
    id: "T13",
    de: ["expired"],
    para: "draft",
    quem: F_ADM,
    motivo: NINGUEM,
  },
  {
    // "qualquer um, menos sold e suspended"; categoria e motivo (§2.10)
    id: "T14",
    de: [
      "draft",
      "under_review",
      "published",
      "reserved",
      "withdrawn",
      "expired",
    ],
    para: "suspended",
    quem: ST,
    motivo: ST,
  },
  { id: "T15", de: ["suspended"], para: "draft", quem: AD, motivo: AD },
];

/** ADR-0003 §2.5: quem edita o conteúdo (oferta, veículo, declarações, fotos e documentos). */
const EDICAO_DA_ADR: Readonly<Record<StatusDaOferta, Quem>> = {
  draft: F,
  under_review: NINGUEM,
  published: F_ADM,
  reserved: F_ADM,
  sold: NINGUEM,
  withdrawn: NINGUEM,
  expired: NINGUEM,
  suspended: NINGUEM,
};

/** ADR-0003 §2.9: quem confirma a disponibilidade ("qualquer F, em published e reserved", dentro da validade). */
const DISPONIBILIDADE_DA_ADR: Readonly<Record<StatusDaOferta, Quem>> = {
  draft: NINGUEM,
  under_review: NINGUEM,
  published: F,
  reserved: F,
  sold: NINGUEM,
  withdrawn: NINGUEM,
  expired: NINGUEM,
  suspended: NINGUEM,
};

/** §2.9: a publicada ou reservada com a validade vencida se comporta como expirada. */
function comoNaAdr(status: StatusDaOferta, vencida: boolean): StatusDaOferta {
  return vencida && (status === "published" || status === "reserved")
    ? "expired"
    : status;
}

interface Condicoes {
  readonly d10: boolean;
  readonly vencida: boolean;
}

const CONDICOES: readonly Condicoes[] = [
  { d10: true, vencida: false },
  { d10: true, vencida: true },
  { d10: false, vencida: false },
  { d10: false, vencida: true },
];

function noServidor(c: Condicoes) {
  return { revisaoExigida: c.d10, validadeVencida: c.vencida };
}

function descrever(
  de: StatusDaOferta,
  para: StatusDaOferta,
  ator: AtorDaOferta,
  c: Condicoes,
): string {
  return `${de}>${para} ${ator} ${c.d10 ? "com" : "sem"} revisão${c.vencida ? ", vencida" : ""}`;
}

/** As linhas da ADR que valem para a tentativa. */
function pelaAdr(
  de: StatusDaOferta,
  para: StatusDaOferta,
  ator: AtorDaOferta,
  c: Condicoes,
): LinhaDaAdr[] {
  return TABELA_DA_ADR.filter(
    (linha) =>
      linha.de.includes(de) &&
      linha.para === para &&
      linha.quem.includes(ator) &&
      (linha.d10 === undefined || linha.d10 === c.d10) &&
      (linha.vencida === undefined || c.vencida) &&
      (linha.emVigor === undefined || !c.vencida),
  );
}

interface Aceita {
  readonly de: StatusDaOferta;
  readonly para: StatusDaOferta;
  readonly ator: AtorDaOferta;
  readonly c: Condicoes;
  readonly id: string;
}

/** Tudo o que o servidor aceita dentro do recorte. */
function aceitas(recorte: {
  readonly de?: readonly StatusDaOferta[];
  readonly para?: readonly StatusDaOferta[];
  readonly atores?: Quem;
  readonly condicoes?: readonly Condicoes[];
}): Aceita[] {
  const resultado: Aceita[] = [];
  for (const de of recorte.de ?? ESTADOS) {
    for (const para of recorte.para ?? ESTADOS) {
      for (const ator of recorte.atores ?? ATORES) {
        for (const c of recorte.condicoes ?? CONDICOES) {
          const transicao = transicaoDaOferta(de, para, ator, noServidor(c));
          if (transicao !== undefined) {
            resultado.push({ de, para, ator, c, id: transicao.id });
          }
        }
      }
    }
  }
  return resultado;
}

describe("dados da ADR", () => {
  it("os estados e os atores do código são os da ADR (§2.1 e legenda da §2.3)", () => {
    expect([...STATUS_DA_OFERTA].sort()).toEqual([...ESTADOS].sort());
    expect([...ATORES_DA_OFERTA].sort()).toEqual([...ATORES].sort());
  });

  it("cada linha tem id próprio, muda o estado e só pede motivo a quem pode", () => {
    const ids = TABELA_DA_ADR.map((linha) => linha.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const linha of TABELA_DA_ADR) {
      expect(linha.de, linha.id).not.toContain(linha.para);
      for (const ator of linha.motivo) {
        expect(linha.quem, linha.id).toContain(ator);
      }
    }
  });
});

describe("transições (ADR-0003 §2.3)", () => {
  it("todos os pares, atores e condições: o servidor devolve a linha da ADR, ou nenhuma, e o mesmo motivo", () => {
    const divergencias: string[] = [];
    const alcancadas = new Set<string>();
    let tentativas = 0;
    for (const de of ESTADOS) {
      for (const para of ESTADOS) {
        for (const ator of ATORES) {
          for (const c of CONDICOES) {
            tentativas += 1;
            const caso = descrever(de, para, ator, c);
            const linhas = pelaAdr(de, para, ator, c);
            if (linhas.length > 1) {
              divergencias.push(`${caso}: a ADR tem mais de uma linha`);
              continue;
            }
            const esperada = linhas.at(0);
            const obtida = transicaoDaOferta(de, para, ator, noServidor(c));
            if (obtida?.id !== esperada?.id) {
              divergencias.push(
                `${caso}: a ADR diz ${esperada?.id ?? "nenhuma"}, o servidor diz ${obtida?.id ?? "nenhuma"}`,
              );
              continue;
            }
            if (obtida === undefined || esperada === undefined) continue;
            alcancadas.add(esperada.id);
            const motivo = motivoObrigatorio(obtida, ator);
            if (motivo !== esperada.motivo.includes(ator)) {
              divergencias.push(
                `${caso}: motivo ${motivo ? "exigido" : "dispensado"} no servidor`,
              );
            }
          }
        }
      }
    }
    expect(tentativas).toBe(8 * 8 * 6 * 4);
    expect(divergencias).toEqual([]);
    expect([...alcancadas].sort()).toEqual(
      TABELA_DA_ADR.map((linha) => linha.id).sort(),
    );
  });

  it("cada estado tem ao menos um destino que nenhum ator alcança, em condição nenhuma", () => {
    const semDestinoInvalido = ESTADOS.filter(
      (de) =>
        !ESTADOS.some(
          (para) =>
            para !== de && aceitas({ de: [de], para: [para] }).length === 0,
        ),
    );
    expect(semDestinoInvalido).toEqual([]);
  });

  it.each([
    {
      de: "draft",
      para: "reserved",
      ator: "adm_empresa",
      caso: "o rascunho não vai direto a reservada",
    },
    {
      de: "under_review",
      para: "published",
      ator: "adm_empresa",
      caso: "T04: o fornecedor não publica a própria oferta em revisão",
    },
    {
      de: "published",
      para: "draft",
      ator: "adm_empresa",
      caso: "a publicada não volta a rascunho sem ser retirada",
    },
    {
      de: "reserved",
      para: "draft",
      ator: "operador",
      caso: "a reservada não volta a rascunho",
    },
    {
      de: "sold",
      para: "published",
      ator: "administrador",
      caso: "X17: nada sai de vendida no Inc. 2",
    },
    {
      de: "withdrawn",
      para: "published",
      ator: "adm_empresa",
      caso: "T19: a retirada volta só a rascunho",
    },
    {
      de: "expired",
      para: "published",
      ator: "adm_empresa",
      caso: "T13: renovar a vencida é reabrir e publicar de novo",
    },
    {
      de: "suspended",
      para: "withdrawn",
      ator: "adm_empresa",
      caso: "B11: o fornecedor não retira a suspensa",
    },
  ] as const)("inválida a partir de $de: $caso", ({ de, para, ator }) => {
    expect(aceitas({ de: [de], para: [para], atores: [ator] })).toEqual([]);
  });

  it("X01: o fornecedor nunca suspende, nem a própria oferta; o staff suspende de seis estados", () => {
    expect(aceitas({ para: ["suspended"], atores: F })).toEqual([]);
    expect(
      [
        ...new Set(
          aceitas({ para: ["suspended"], atores: ST }).map((a) => a.de),
        ),
      ].sort(),
    ).toEqual(
      [
        "draft",
        "under_review",
        "published",
        "reserved",
        "withdrawn",
        "expired",
      ].sort(),
    );
  });

  it("X04: só o sistema leva a expired, só de published ou reserved e só com a validade vencida", () => {
    const chegam = aceitas({ para: ["expired"] });
    expect(
      chegam.every(
        (a) => a.ator === "sistema" && a.c.vencida && a.id === "T12",
      ),
    ).toBe(true);
    expect([...new Set(chegam.map((a) => a.de))].sort()).toEqual(
      ["published", "reserved"].sort(),
    );
    expect(
      aceitas({
        para: ["expired"],
        condicoes: CONDICOES.filter((c) => !c.vencida),
      }),
    ).toEqual([]);
  });

  it("X10: com a revisão dispensada, ninguém leva a oferta a under_review", () => {
    expect(
      aceitas({
        para: ["under_review"],
        condicoes: CONDICOES.filter((c) => !c.d10),
      }),
    ).toEqual([]);
    expect([
      ...new Set(
        aceitas({ para: ["under_review"] }).map(
          (a) => `${a.de} ${a.ator} ${a.id}`,
        ),
      ),
    ]).toEqual(["draft adm_empresa T03"]);
  });

  it("X11: com a revisão exigida, ninguém publica direto do rascunho; sem ela, só o org_admin", () => {
    expect(
      aceitas({
        de: ["draft"],
        para: ["published"],
        condicoes: CONDICOES.filter((c) => c.d10),
      }),
    ).toEqual([]);
    expect([
      ...new Set(
        aceitas({ de: ["draft"], para: ["published"] }).map(
          (a) => `${a.ator} ${a.id}`,
        ),
      ),
    ]).toEqual(["adm_empresa T06"]);
  });

  it("X17: nenhuma transição leva a sold nem sai dela no Inc. 2", () => {
    expect(aceitas({ para: ["sold"] })).toEqual([]);
    expect(aceitas({ de: ["sold"] })).toEqual([]);
  });

  it("quem não tem papel na oferta não faz transição nenhuma", () => {
    expect(aceitas({ atores: ["nenhum"] })).toEqual([]);
  });
});

describe("edição e disponibilidade (ADR-0003 §2.5 e §2.9)", () => {
  it("edição de conteúdo: todos os estados e atores, com e sem a validade vencida, como na ADR", () => {
    const divergencias: string[] = [];
    for (const status of ESTADOS) {
      for (const ator of ATORES) {
        for (const vencida of [false, true]) {
          const esperado =
            EDICAO_DA_ADR[comoNaAdr(status, vencida)].includes(ator);
          if (podeEditarConteudo(status, ator, vencida) !== esperado) {
            divergencias.push(
              `${status} ${ator}${vencida ? ", vencida" : ""}: a ADR diz ${esperado ? "edita" : "não edita"}`,
            );
          }
        }
      }
    }
    expect(divergencias).toEqual([]);
  });

  it("disponibilidade: todos os estados e atores, com e sem a validade vencida, como na ADR", () => {
    const divergencias: string[] = [];
    for (const status of ESTADOS) {
      for (const ator of ATORES) {
        for (const vencida of [false, true]) {
          const esperado =
            DISPONIBILIDADE_DA_ADR[comoNaAdr(status, vencida)].includes(ator);
          if (
            podeConfirmarDisponibilidade(status, ator, vencida) !== esperado
          ) {
            divergencias.push(
              `${status} ${ator}${vencida ? ", vencida" : ""}: a ADR diz ${esperado ? "confirma" : "não confirma"}`,
            );
          }
        }
      }
    }
    expect(divergencias).toEqual([]);
  });

  it("Q3: o staff não edita conteúdo nem confirma disponibilidade em estado nenhum", () => {
    for (const status of ESTADOS) {
      for (const ator of ST) {
        for (const vencida of [false, true]) {
          expect(
            podeEditarConteudo(status, ator, vencida),
            `${status} ${ator}`,
          ).toBe(false);
          expect(
            podeConfirmarDisponibilidade(status, ator, vencida),
            `${status} ${ator}`,
          ).toBe(false);
        }
      }
    }
  });

  it("Q2 e B31: o member edita só o rascunho; ninguém edita em revisão, vendida, retirada, expirada ou suspensa", () => {
    expect(
      ESTADOS.filter((status) => podeEditarConteudo(status, "membro", false)),
    ).toEqual(["draft"]);
    expect(
      ESTADOS.filter((status) =>
        ATORES.some((ator) => podeEditarConteudo(status, ator, false)),
      ),
    ).toEqual(["draft", "published", "reserved"]);
  });

  it("ACH-I2.10-01: com a validade vencida, só o rascunho segue editável, e só a retirada, a suspensão e a expiração saem da publicada ou reservada", () => {
    expect(
      ESTADOS.filter((status) =>
        ATORES.some(
          (ator) =>
            podeEditarConteudo(status, ator, true) ||
            podeConfirmarDisponibilidade(status, ator, true),
        ),
      ),
    ).toEqual(["draft"]);
    expect([
      ...new Set(
        aceitas({
          de: ["published", "reserved"],
          condicoes: CONDICOES.filter((c) => c.vencida),
        }).map((a) => a.id),
      ),
    ]).toEqual(["T11", "T12", "T14"]);
    expect([
      ...new Set(
        aceitas({
          de: ["published", "reserved"],
          condicoes: CONDICOES.filter((c) => !c.vencida),
        }).map((a) => a.id),
      ),
    ]).toEqual(["T08", "T11", "T14", "T09"]);
  });
});
