/**
 * Tabela de decisão do estado documental escrita a partir do ADR, sem ler
 * tabela do código (I3.4; ADR-0004 §2.1 a §2.4 e §3; anexo A.2, com a P1).
 *
 * Os dados deste arquivo repetem, à mão, a tabela do anexo A.2: as 40
 * combinações de declaração vigente, consulta vigente e revisão aberta, com
 * o estado esperado. A única mudança é a da P1 (ADR-0004 §6): a linha 25
 * (ocorrência declarada com consulta sem ocorrência, sem revisão) fica com
 * apontamentos, porque não há divergência. Depois vêm os casos com mais de
 * uma consulta vigente e com substituição (E1 a E3, E7 e E8), também com o
 * estado calculado à mão.
 *
 * O teste confere que `estadoDaCategoria` diz exatamente o que o ADR diz. O
 * pgTAP `410-documental-tabela` grava as mesmas linhas no banco e confere
 * `private.estado_documental`, e o teste de integração
 * `estado-documental-paridade` compara os dois lados. Assim, o ADR, o
 * servidor e o banco ficam amarrados.
 */
import { describe, expect, it } from "vitest";
import {
  estadoDaCategoria,
  estadoPelaDeclaracao,
  type EstadoDocumental,
  type ResultadoDaConsulta,
  type ValorDeclarado,
} from "./estados";

/** Abreviações do anexo A.2: `—` é a falta do registro. */
type Declaracao = "—" | "nko" | "dho" | "unk";
type Consulta = "aw" | "nos" | "cho" | "inc";

const VALOR_DECLARADO: Readonly<Record<Declaracao, ValorDeclarado | null>> = {
  "—": null,
  nko: "no_known_occurrence",
  dho: "has_occurrence",
  unk: "unknown",
};

const RESULTADO: Readonly<Record<Consulta, ResultadoDaConsulta>> = {
  aw: "awaiting_result",
  nos: "no_occurrence_in_source",
  cho: "has_occurrence",
  inc: "inconclusive",
};

/** Linha do anexo A.2: número, declaração, consulta vigente, revisão aberta e estado. */
type Linha = readonly [
  numero: number,
  declaracao: Declaracao,
  consulta: Consulta | "—",
  revisaoAberta: "não" | "sim",
  estado: EstadoDocumental,
];

/** Anexo A.2, coluna "Estado". Linha 25 pela P1: sem divergência, com apontamentos. */
const TABELA_DA_ADR: readonly Linha[] = [
  [1, "—", "—", "não", "not_checked"],
  [2, "—", "—", "sim", "under_review"],
  [3, "—", "aw", "não", "pending"],
  [4, "—", "aw", "sim", "under_review"],
  [5, "—", "nos", "não", "no_findings_in_sources"],
  [6, "—", "nos", "sim", "under_review"],
  [7, "—", "cho", "não", "with_findings"],
  [8, "—", "cho", "sim", "under_review"],
  [9, "—", "inc", "não", "pending"],
  [10, "—", "inc", "sim", "under_review"],
  [11, "nko", "—", "não", "declared_unverified"],
  [12, "nko", "—", "sim", "under_review"],
  [13, "nko", "aw", "não", "pending"],
  [14, "nko", "aw", "sim", "under_review"],
  [15, "nko", "nos", "não", "no_findings_in_sources"],
  [16, "nko", "nos", "sim", "under_review"],
  [17, "nko", "cho", "não", "under_review"],
  [18, "nko", "cho", "sim", "under_review"],
  [19, "nko", "inc", "não", "pending"],
  [20, "nko", "inc", "sim", "under_review"],
  [21, "dho", "—", "não", "with_findings"],
  [22, "dho", "—", "sim", "under_review"],
  [23, "dho", "aw", "não", "with_findings"],
  [24, "dho", "aw", "sim", "under_review"],
  [25, "dho", "nos", "não", "with_findings"],
  [26, "dho", "nos", "sim", "under_review"],
  [27, "dho", "cho", "não", "with_findings"],
  [28, "dho", "cho", "sim", "under_review"],
  [29, "dho", "inc", "não", "with_findings"],
  [30, "dho", "inc", "sim", "under_review"],
  [31, "unk", "—", "não", "not_checked"],
  [32, "unk", "—", "sim", "under_review"],
  [33, "unk", "aw", "não", "pending"],
  [34, "unk", "aw", "sim", "under_review"],
  [35, "unk", "nos", "não", "no_findings_in_sources"],
  [36, "unk", "nos", "sim", "under_review"],
  [37, "unk", "cho", "não", "with_findings"],
  [38, "unk", "cho", "sim", "under_review"],
  [39, "unk", "inc", "não", "pending"],
  [40, "unk", "inc", "sim", "under_review"],
];

/**
 * Caso com mais de uma consulta. As cadeias vêm separadas por vírgula, uma
 * por fonte; dentro da cadeia, "a > b" quer dizer que b substitui a, e só a
 * última é vigente (ADR-0004 §2.3). A revisão é a última ação da categoria
 * (§2.5): "fechada" é abrir e fechar; "reaberta" é abrir, fechar e abrir.
 */
interface Caso {
  readonly id: string;
  readonly declaracao: Declaracao;
  readonly cadeias: string;
  readonly revisao: "aberta" | "fechada" | "reaberta" | null;
  readonly estado: EstadoDocumental;
  readonly regra: string;
}

/** Os mesmos casos do pgTAP `410-documental-tabela`, com o estado calculado à mão. */
const CASOS: readonly Caso[] = [
  {
    id: "A1",
    declaracao: "nko",
    cadeias: "nos, cho",
    revisao: null,
    estado: "under_review",
    regra: "E1 e R4b: duas fontes vigentes, uma com ocorrência, é divergência",
  },
  {
    id: "A2",
    declaracao: "nko",
    cadeias: "nos, aw",
    revisao: null,
    estado: "pending",
    regra: "E1: uma fonte aguardando deixa a categoria pendente",
  },
  {
    id: "A3",
    declaracao: "nko",
    cadeias: "nos, nos",
    revisao: null,
    estado: "no_findings_in_sources",
    regra: "E1: todas as vigentes sem ocorrência",
  },
  {
    id: "A4",
    declaracao: "nko",
    cadeias: "nos > aw",
    revisao: null,
    estado: "pending",
    regra: "E2 e E3: a sem ocorrência substituída deixa de contar",
  },
  {
    id: "A5",
    declaracao: "nko",
    cadeias: "aw > nos",
    revisao: null,
    estado: "no_findings_in_sources",
    regra: "E2: a aguardando substituída pelo resultado deixa de ser pendente",
  },
  {
    id: "A6",
    declaracao: "nko",
    cadeias: "aw > cho",
    revisao: null,
    estado: "under_review",
    regra: "E2 e R4b: o resultado com ocorrência substitui a aguardando",
  },
  {
    id: "A7",
    declaracao: "nko",
    cadeias: "cho > nos",
    revisao: null,
    estado: "no_findings_in_sources",
    regra: "E7: a consulta nova que concorda acaba a divergência",
  },
  {
    id: "A8",
    declaracao: "dho",
    cadeias: "nos, nos",
    revisao: null,
    estado: "with_findings",
    regra: "P1: duas fontes sem ocorrência não desfazem a ocorrência declarada",
  },
  {
    id: "A9",
    declaracao: "unk",
    cadeias: "cho > nos",
    revisao: null,
    estado: "no_findings_in_sources",
    regra: "E3: a consulta com ocorrência substituída não conta",
  },
  {
    id: "A10",
    declaracao: "unk",
    cadeias: "inc, nos",
    revisao: null,
    estado: "pending",
    regra: "E1: inconclusiva e sem ocorrência ficam pendentes",
  },
  {
    id: "B1",
    declaracao: "unk",
    cadeias: "inc, nos",
    revisao: "aberta",
    estado: "under_review",
    regra: "R4a: com revisão aberta, em análise",
  },
  {
    id: "B2",
    declaracao: "—",
    cadeias: "aw > inc > nos",
    revisao: null,
    estado: "no_findings_in_sources",
    regra: "E3: numa cadeia de três, só a última conta",
  },
  {
    id: "B3",
    declaracao: "—",
    cadeias: "nos, inc > cho",
    revisao: null,
    estado: "with_findings",
    regra: "E1 e E3: a segunda fonte foi substituída por uma com ocorrência",
  },
  {
    id: "B4",
    declaracao: "unk",
    cadeias: "nos > cho",
    revisao: null,
    estado: "with_findings",
    regra: "E5: desconhece não diverge da consulta com ocorrência",
  },
  {
    id: "B5",
    declaracao: "nko",
    cadeias: "nos, cho > nos",
    revisao: null,
    estado: "no_findings_in_sources",
    regra: "E1 e E3: a ocorrência substituída de uma das fontes não conta",
  },
  {
    id: "B6",
    declaracao: "dho",
    cadeias: "cho, nos",
    revisao: null,
    estado: "with_findings",
    regra: "P1 e E6: ocorrência declarada com duas fontes não é divergência",
  },
  {
    id: "B7",
    declaracao: "nko",
    cadeias: "nos, nos",
    revisao: "aberta",
    estado: "under_review",
    regra: "R4a: a R6 cai com a revisão aberta",
  },
  {
    id: "B8",
    declaracao: "nko",
    cadeias: "inc, inc",
    revisao: null,
    estado: "pending",
    regra: "R3: duas inconclusivas",
  },
  {
    id: "B9",
    declaracao: "—",
    cadeias: "nos, nos, nos",
    revisao: null,
    estado: "no_findings_in_sources",
    regra: "E1: três fontes sem ocorrência, sem declaração",
  },
  {
    id: "B10",
    declaracao: "nko",
    cadeias: "nos > nos, aw",
    revisao: null,
    estado: "pending",
    regra: "E1 e E3: a substituta sem ocorrência e outra fonte aguardando",
  },
  {
    id: "C1",
    declaracao: "nko",
    cadeias: "cho",
    revisao: "fechada",
    estado: "under_review",
    regra: "E7: fechar a revisão não desfaz a divergência",
  },
  {
    id: "C2",
    declaracao: "—",
    cadeias: "nos",
    revisao: "fechada",
    estado: "no_findings_in_sources",
    regra: "E8: fechada a revisão, a R6 volta",
  },
  {
    id: "C3",
    declaracao: "unk",
    cadeias: "nos",
    revisao: "reaberta",
    estado: "under_review",
    regra: "E8: a última ação é abrir",
  },
];

function consulta(abreviacao: string): ResultadoDaConsulta {
  const resultado = RESULTADO[abreviacao as Consulta] as
    ResultadoDaConsulta | undefined;
  if (resultado === undefined) {
    throw new Error(`Consulta desconhecida na tabela: ${abreviacao}`);
  }
  return resultado;
}

/** Só a última consulta de cada cadeia é vigente (ADR-0004 §2.3). */
function vigentes(cadeias: string): ResultadoDaConsulta[] {
  return cadeias.split(",").map((cadeia) => {
    const passos = cadeia.split(">").map((passo) => passo.trim());
    return consulta(passos[passos.length - 1] ?? "");
  });
}

function estadoDaLinha([
  ,
  declaracao,
  resultado,
  revisaoAberta,
]: Linha): EstadoDocumental {
  return estadoDaCategoria({
    declaracao: VALOR_DECLARADO[declaracao],
    consultasVigentes: resultado === "—" ? [] : [consulta(resultado)],
    revisaoAberta: revisaoAberta === "sim",
  });
}

describe("tabela de decisão do anexo A.2, com a P1 (ADR-0004 §2.1 a §2.4)", () => {
  it("tem as 40 combinações, numeradas na ordem do anexo, cada uma uma vez", () => {
    expect(TABELA_DA_ADR.map(([numero]) => numero)).toEqual(
      Array.from({ length: 40 }, (_, i) => i + 1),
    );
    expect(
      new Set(TABELA_DA_ADR.map(([, d, c, r]) => `${d}|${c}|${r}`)).size,
    ).toBe(40);
  });

  it.each(TABELA_DA_ADR)(
    "linha %i: declaração %s, consulta %s, revisão aberta %s → %s",
    (...linha) => {
      expect(estadoDaLinha(linha)).toBe(linha[4]);
    },
  );

  it("teste 10: sem apontamentos nas fontes consultadas só nas linhas 5, 15 e 35", () => {
    expect(
      TABELA_DA_ADR.filter(
        (linha) => estadoDaLinha(linha) === "no_findings_in_sources",
      ).map(([numero]) => numero),
    ).toEqual([5, 15, 35]);
  });

  it("em relação ao Inc. 2 (só a declaração), mudam 32 linhas; a 25 não muda pela P1", () => {
    const mudam = TABELA_DA_ADR.filter(
      (linha) =>
        estadoDaLinha(linha) !==
        estadoPelaDeclaracao(VALOR_DECLARADO[linha[1]]),
    ).map(([numero]) => numero);
    expect(mudam).toHaveLength(32);
    expect(
      TABELA_DA_ADR.map(([numero]) => numero).filter((n) => !mudam.includes(n)),
    ).toEqual([1, 11, 21, 23, 25, 27, 29, 31]);
  });
});

describe("mais de uma consulta vigente e substituição (E1 a E3, E7 e E8)", () => {
  it("os casos têm identificador único", () => {
    expect(new Set(CASOS.map((caso) => caso.id)).size).toBe(CASOS.length);
  });

  it.each(CASOS)(
    "$id: $declaracao com $cadeias, revisão $revisao → $estado ($regra)",
    ({ declaracao, cadeias, revisao, estado }) => {
      expect(
        estadoDaCategoria({
          declaracao: VALOR_DECLARADO[declaracao],
          consultasVigentes: vigentes(cadeias),
          revisaoAberta: revisao === "aberta" || revisao === "reaberta",
        }),
      ).toBe(estado);
    },
  );

  it("E1: sem apontamentos nas fontes consultadas só quando todas as vigentes são sem ocorrência, sem revisão aberta", () => {
    const fora = CASOS.filter((caso) => {
      const consultas = vigentes(caso.cadeias);
      const aberta = caso.revisao === "aberta" || caso.revisao === "reaberta";
      const estado = estadoDaCategoria({
        declaracao: VALOR_DECLARADO[caso.declaracao],
        consultasVigentes: consultas,
        revisaoAberta: aberta,
      });
      return (
        estado === "no_findings_in_sources" &&
        (aberta ||
          !consultas.every(
            (resultado) => resultado === "no_occurrence_in_source",
          ))
      );
    }).map((caso) => caso.id);
    expect(fora).toEqual([]);
    expect(
      CASOS.filter((caso) => caso.estado === "no_findings_in_sources"),
    ).toHaveLength(8);
  });
});
