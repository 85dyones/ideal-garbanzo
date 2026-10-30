import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatarDataHora } from "@/app/_apoio/datas";
import { ESTADO_INICIAL } from "@/app/_apoio/formulario";
import { varrerTexto } from "@/lib/linguagem-proibida";
import type {
  ConsultaRegistrada,
  ImpedimentoRegistrado,
  RegistrosDocumentais,
} from "../queries/registros";
import { AVISO_DO_IMPEDIMENTO, textoDoAviso } from "../rules/avisos";
import {
  ESTADOS_DOCUMENTAIS,
  RESULTADOS_DA_CONSULTA,
  ROTULO_DA_ORIGEM,
  ROTULO_DO_ESTADO,
  ROTULO_DO_RESULTADO,
  ROTULO_DO_TIPO_DE_FONTE,
  ROTULO_DO_VALOR_DECLARADO,
  rotuloDaCategoria,
  type EstadoDocumental,
  type ResultadoDaConsulta,
  type TipoDeFonte,
} from "../rules/estados";
import type {
  ConsultaVigente,
  EstadoDaCategoria,
  EstadosDaOferta,
} from "../server/estados";
import {
  EXPLICACAO_DO_RESULTADO,
  TEXTO_DOCUMENTAL,
  autoriaDaConsulta,
  autoriaDaRevisao,
  consultasSubstituiveis,
  contarConsultasVigentes,
  horaEmBrasilia,
  impedimentosAtivos,
  montarFicha,
  ressalvaDoImpedimento,
  ressalvasSemImpedimento,
  resumoTemSemApontamentos,
  rotuloDoLinkDaEvidencia,
  textoDaRevisaoAberta,
  textoDaSubstituicao,
  textoDoEstado,
  textoDoImpedimentoNaCategoria,
} from "./ficha";
import {
  ANCORA_DO_IMPEDIMENTO,
  ConsultasPorCategoria,
  FichaDocumental,
  ImpedimentosDaOferta,
  PendenciaDoImpedimento,
  ResumoPorCategoria,
} from "./ficha-documental";

const PESSOA_DA_EMPRESA = "a0000000-0000-4000-8000-000000000001";
const PESSOA_DA_EQUIPE = "a0000000-0000-4000-8000-000000000002";
const EVIDENCIA = "e0000000-0000-4000-8000-000000000001";

const acaoDeTeste = () => Promise.resolve(ESTADO_INICIAL);
const semNome = () => undefined;

function consultaVigente(
  id: string,
  dados: Partial<ConsultaVigente> & {
    readonly resultado?: ResultadoDaConsulta;
    readonly tipoDeFonte?: TipoDeFonte;
  } = {},
): ConsultaVigente {
  const resultado = dados.resultado ?? "no_occurrence_in_source";
  const tipoDeFonte = dados.tipoDeFonte ?? "official";
  return {
    id,
    fonte: "DETRAN-SP",
    tipoDeFonte,
    rotuloDoTipoDeFonte: ROTULO_DO_TIPO_DE_FONTE[tipoDeFonte],
    realizadaEm: "2026-10-30T12:00:00.000Z",
    resultado,
    rotuloDoResultado: ROTULO_DO_RESULTADO[resultado],
    resumo: "Sem gravame ativo na consulta.",
    limitacoes: "A fonte cobre só a UF consultada.",
    evidenciaId: null,
    origem: "check_result",
    rotuloDaOrigem: ROTULO_DA_ORIGEM.check_result,
    ...dados,
  };
}

function registroDe(
  consulta: ConsultaVigente,
  categoria: string,
  dados: Partial<ConsultaRegistrada> = {},
): ConsultaRegistrada {
  return {
    id: consulta.id,
    seq: 1,
    categoria,
    fonte: consulta.fonte,
    tipoDeFonte: consulta.tipoDeFonte,
    realizadaEm: consulta.realizadaEm,
    resultado: consulta.resultado,
    resumo: consulta.resumo,
    limitacoes: consulta.limitacoes,
    protocolo: null,
    evidenciaId: consulta.evidenciaId,
    registradaPelaPlataforma: false,
    registradaPor: PESSOA_DA_EMPRESA,
    registradaEm: "2026-10-30T12:05:00.000Z",
    substitui: null,
    ...dados,
  };
}

function categoria(
  codigo: string,
  estado: EstadoDocumental,
  dados: Partial<EstadoDaCategoria> = {},
): EstadoDaCategoria {
  return {
    categoria: codigo,
    rotuloDaCategoria: rotuloDaCategoria(codigo),
    estado,
    rotuloDoEstado: ROTULO_DO_ESTADO[estado],
    origem: "supplier_declaration",
    rotuloDaOrigem: ROTULO_DA_ORIGEM.supplier_declaration,
    declaracao: {
      valor: "no_known_occurrence",
      rotulo: ROTULO_DO_VALOR_DECLARADO.no_known_occurrence,
      detalhe: null,
      declaradaEm: "2026-10-29T15:00:00.000Z",
    },
    consultas: [],
    revisaoAberta: false,
    ...dados,
  };
}

function estadosCom(
  categorias: readonly EstadoDaCategoria[],
  avisos: EstadosDaOferta["avisos"] = [],
): EstadosDaOferta {
  return { categorias, impedimentos: [], avisos, resumo: "" };
}

const SEM_REGISTROS: RegistrosDocumentais = {
  consultas: [],
  revisoes: [],
  impedimentos: [],
};

/** Cenário com as quatro situações que a ficha precisa distinguir. */
function cenario() {
  const gravame = consultaVigente("c0000000-0000-4000-8000-000000000001");
  const outraFonte = consultaVigente("c0000000-0000-4000-8000-000000000002", {
    fonte: "Base comercial X",
    tipoDeFonte: "commercial",
    realizadaEm: "2026-10-28T18:30:00.000Z",
  });
  const daPlataforma = consultaVigente("c0000000-0000-4000-8000-000000000003", {
    fonte: "TJ-SP",
    evidenciaId: EVIDENCIA,
    origem: "independent_evidence",
    rotuloDaOrigem: ROTULO_DA_ORIGEM.independent_evidence,
  });
  const aguardando = consultaVigente("c0000000-0000-4000-8000-000000000004", {
    fonte: "Leiloeiro Y",
    resultado: "awaiting_result",
    tipoDeFonte: "other",
  });
  const substituida: ConsultaRegistrada = {
    ...registroDe(gravame, "lien"),
    id: "c0000000-0000-4000-8000-000000000009",
    seq: 0,
    resultado: "awaiting_result",
  };
  const estados = estadosCom([
    categoria("auction", "pending", { consultas: [aguardando] }),
    categoria("judicial_restrictions", "under_review", {
      consultas: [daPlataforma],
      revisaoAberta: true,
    }),
    categoria("lien", "no_findings_in_sources", {
      consultas: [gravame, outraFonte],
    }),
    categoria("theft_recovery", "not_checked", { declaracao: null }),
  ]);
  const registros: RegistrosDocumentais = {
    consultas: [
      registroDe(gravame, "lien", { seq: 3, substitui: substituida.id }),
      registroDe(outraFonte, "lien", { seq: 2 }),
      registroDe(daPlataforma, "judicial_restrictions", {
        seq: 4,
        registradaPelaPlataforma: true,
        registradaPor: PESSOA_DA_EQUIPE,
      }),
      registroDe(aguardando, "auction", { seq: 5 }),
      substituida,
    ],
    revisoes: [
      {
        id: "r0000000-0000-4000-8000-000000000001",
        seq: 1,
        categoria: "judicial_restrictions",
        acao: "open_review",
        motivo: "Primeira análise.",
        autor: PESSOA_DA_EQUIPE,
        em: "2026-10-29T10:00:00.000Z",
      },
      {
        id: "r0000000-0000-4000-8000-000000000002",
        seq: 2,
        categoria: "judicial_restrictions",
        acao: "close_review",
        motivo: "Análise concluída.",
        autor: PESSOA_DA_EQUIPE,
        em: "2026-10-29T11:00:00.000Z",
      },
      {
        id: "r0000000-0000-4000-8000-000000000003",
        seq: 3,
        categoria: "judicial_restrictions",
        acao: "open_review",
        motivo: "Processo citado no resumo precisa de avaliação.",
        autor: PESSOA_DA_EQUIPE,
        em: "2026-10-30T13:00:00.000Z",
      },
    ],
    impedimentos: [],
  };
  return { estados, registros, gravame, outraFonte, daPlataforma, aguardando };
}

const ORDEM = [
  "lien",
  "judicial_restrictions",
  "theft_recovery",
  "auction",
] as const;

describe("estado da categoria na ficha (§6.4; E26)", () => {
  it("“Sem apontamentos nas fontes consultadas” sai com a fonte e a data de cada consulta ao lado", () => {
    const { estados, registros, gravame, outraFonte } = cenario();
    const lien = montarFicha(estados, registros, ORDEM).find(
      (item) => item.categoria === "lien",
    );
    expect(lien?.textoDoEstado).toBe(
      `Sem apontamentos nas fontes consultadas: DETRAN-SP (consulta em ${formatarDataHora(gravame.realizadaEm)}); Base comercial X (consulta em ${formatarDataHora(outraFonte.realizadaEm)})`,
    );
  });

  it("em toda categoria com esse estado, cada fonte e cada data aparecem no mesmo texto do estado", () => {
    const { estados, registros } = cenario();
    const ficha = montarFicha(estados, registros, ORDEM);
    const semApontamentos = ficha.filter(
      (item) => item.estado === "no_findings_in_sources",
    );
    expect(semApontamentos.length).toBeGreaterThan(0);
    for (const item of semApontamentos) {
      expect(item.consultas.length).toBeGreaterThan(0);
      for (const consulta of item.consultas) {
        expect(item.textoDoEstado).toContain(consulta.fonte);
        expect(item.textoDoEstado).toContain(
          formatarDataHora(consulta.realizadaEm),
        );
      }
    }
  });

  it("os demais estados saem só com o rótulo da §6.4, sem rótulo de origem", () => {
    const consulta = [{ fonte: "DETRAN-SP", realizadaEm: "2026-10-30T12:00Z" }];
    for (const estado of ESTADOS_DOCUMENTAIS) {
      const texto = textoDoEstado(estado, ROTULO_DO_ESTADO[estado], consulta);
      if (estado !== "no_findings_in_sources") {
        expect(texto).toBe(ROTULO_DO_ESTADO[estado]);
      }
      for (const rotulo of Object.values(ROTULO_DA_ORIGEM)) {
        expect(texto).not.toContain(rotulo);
      }
      expect(texto).not.toContain("Origem");
    }
  });
});

describe("origem de cada informação (§6.5; E10, E12, E13)", () => {
  it("as consultas vigentes ficam com a origem do servidor; a do fornecedor é “Resultado de consulta”", () => {
    const { estados, registros } = cenario();
    const ficha = montarFicha(estados, registros, ORDEM);
    const judicial = ficha.find(
      (item) => item.categoria === "judicial_restrictions",
    );
    expect(judicial?.consultas[0]?.rotuloDaOrigem).toBe(
      "Confirmada por evidência independente",
    );
    expect(judicial?.consultas[0]?.registradaPelaPlataforma).toBe(true);
    const lien = ficha.find((item) => item.categoria === "lien");
    expect(lien?.consultas.map((consulta) => consulta.rotuloDaOrigem)).toEqual([
      "Resultado de consulta",
      "Resultado de consulta",
    ]);
  });

  it("a substituída continua no histórico, com quem a substituiu", () => {
    const { estados, registros, gravame } = cenario();
    const lien = montarFicha(estados, registros, ORDEM).find(
      (item) => item.categoria === "lien",
    );
    expect(lien?.anteriores).toHaveLength(1);
    expect(lien?.anteriores[0]?.substituidaPor?.id).toBe(gravame.id);
    expect(lien?.anteriores[0]?.rotuloDoResultado).toBe("Aguardando resultado");
  });

  it("“Não confirmada” só na categoria sem declaração e sem consulta", () => {
    const { estados, registros } = cenario();
    const ficha = montarFicha(estados, registros, ORDEM);
    expect(
      ficha.filter((item) => item.semInformacao).map((item) => item.categoria),
    ).toEqual(["theft_recovery"]);
  });

  it("aguardando resultado e inconclusivo saem por extenso, com a explicação", () => {
    for (const resultado of RESULTADOS_DA_CONSULTA) {
      const conclusivo =
        resultado === "no_occurrence_in_source" ||
        resultado === "has_occurrence";
      expect(EXPLICACAO_DO_RESULTADO[resultado] === undefined).toBe(conclusivo);
    }
    const { estados, registros } = cenario();
    const leilao = montarFicha(estados, registros, ORDEM).find(
      (item) => item.categoria === "auction",
    );
    expect(leilao?.consultas[0]?.rotuloDoResultado).toBe(
      "Aguardando resultado",
    );
    expect(leilao?.consultas[0]?.explicacaoDoResultado).toBe(
      EXPLICACAO_DO_RESULTADO.awaiting_result,
    );
  });

  it("a revisão aberta é fato da categoria, com o motivo da última abertura", () => {
    const { estados, registros } = cenario();
    const judicial = montarFicha(estados, registros, ORDEM).find(
      (item) => item.categoria === "judicial_restrictions",
    );
    expect(judicial?.revisaoAberta?.motivo).toBe(
      "Processo citado no resumo precisa de avaliação.",
    );
    const fato = judicial?.revisaoAberta
      ? textoDaRevisaoAberta(judicial.revisaoAberta)
      : "";
    expect(fato).toContain("Em análise pela plataforma desde");
    expect(fato).toContain(
      "Motivo: Processo citado no resumo precisa de avaliação.",
    );
    expect(fato).not.toContain("Origem");
    // O histórico vem da mais recente para a mais antiga.
    expect(judicial?.revisoes.map((revisao) => revisao.acao)).toEqual([
      "open_review",
      "close_review",
      "open_review",
    ]);
  });

  it("revisão fechada não aparece como fato", () => {
    const estados = estadosCom([categoria("lien", "declared_unverified")]);
    const ficha = montarFicha(estados, {
      ...SEM_REGISTROS,
      revisoes: [
        {
          id: "r1",
          seq: 1,
          categoria: "lien",
          acao: "open_review",
          motivo: "Abertura.",
          autor: PESSOA_DA_EQUIPE,
          em: "2026-10-29T10:00:00.000Z",
        },
        {
          id: "r2",
          seq: 2,
          categoria: "lien",
          acao: "close_review",
          motivo: "Fechamento.",
          autor: PESSOA_DA_EQUIPE,
          em: "2026-10-29T11:00:00.000Z",
        },
      ],
    });
    expect(ficha[0]?.revisaoAberta).toBeNull();
    expect(ficha[0]?.revisoes).toHaveLength(2);
  });

  it("segue a ordem da configuração, e a categoria fora dela vai para o fim", () => {
    const estados = estadosCom([
      categoria("auction", "declared_unverified"),
      categoria("categoria_antiga", "declared_unverified"),
      categoria("lien", "declared_unverified"),
    ]);
    expect(
      montarFicha(estados, SEM_REGISTROS, ["lien", "auction"]).map(
        (item) => item.categoria,
      ),
    ).toEqual(["lien", "auction", "categoria_antiga"]);
  });
});

describe("substituição e autoria", () => {
  it("o fornecedor substitui só as consultas da própria empresa; a plataforma, qualquer uma", () => {
    const { estados, registros, daPlataforma } = cenario();
    const ficha = montarFicha(estados, registros, ORDEM);
    const doFornecedor = consultasSubstituiveis(ficha, "fornecedor");
    const daEquipe = consultasSubstituiveis(ficha, "plataforma");
    expect(doFornecedor.map((opcao) => opcao.id)).not.toContain(
      daPlataforma.id,
    );
    expect(daEquipe.map((opcao) => opcao.id)).toContain(daPlataforma.id);
    expect(daEquipe).toHaveLength(4);
    expect(doFornecedor).toHaveLength(3);
    expect(daEquipe.find((opcao) => opcao.id === daPlataforma.id)).toEqual({
      id: daPlataforma.id,
      categoria: "judicial_restrictions",
      rotulo: `TJ-SP · ${formatarDataHora(daPlataforma.realizadaEm)} · Sem ocorrência na fonte`,
    });
  });

  it("a autoria diz o lado de quem registrou e o nome só quando a sessão o lê", () => {
    const { estados, registros } = cenario();
    const ficha = montarFicha(estados, registros, ORDEM);
    const daEquipe = ficha.find(
      (item) => item.categoria === "judicial_restrictions",
    )?.consultas[0];
    const daEmpresa = ficha.find((item) => item.categoria === "lien")
      ?.consultas[0];
    if (daEquipe === undefined || daEmpresa === undefined) {
      throw new Error("cenário sem as consultas");
    }
    expect(autoriaDaConsulta(daEquipe, semNome)).toBe(
      `Registrada pela equipe da plataforma, em ${formatarDataHora("2026-10-30T12:05:00.000Z")}.`,
    );
    expect(autoriaDaConsulta(daEmpresa, () => "Ana")).toBe(
      `Registrada pela empresa fornecedora (Ana), em ${formatarDataHora("2026-10-30T12:05:00.000Z")}.`,
    );
    const revisao = ficha.find(
      (item) => item.categoria === "judicial_restrictions",
    )?.revisoes[0];
    if (revisao === undefined) throw new Error("cenário sem revisão");
    expect(autoriaDaRevisao(revisao, semNome)).toContain(
      "Aberta pela equipe da plataforma, em",
    );
  });
});

describe("ressalvas e impedimento (§6.11; E24)", () => {
  it("a ressalva do impedimento sai da lista das pendências documentais e fica no aviso próprio", () => {
    const avisos = [
      {
        codigo: "categoria_com_apontamentos.v1",
        texto: textoDoAviso("categoria_com_apontamentos.v1"),
      },
      {
        codigo: AVISO_DO_IMPEDIMENTO,
        texto: textoDoAviso(AVISO_DO_IMPEDIMENTO),
      },
    ] as const;
    expect(
      ressalvasSemImpedimento(avisos).map((aviso) => aviso.codigo),
    ).toEqual(["categoria_com_apontamentos.v1"]);
    expect(ressalvaDoImpedimento()).toBe(textoDoAviso(AVISO_DO_IMPEDIMENTO));
  });

  it("separa os impedimentos ativos dos resolvidos", () => {
    const ativo = impedimento("i1", true);
    const resolvido = impedimento("i2", false);
    expect(impedimentosAtivos([ativo, resolvido])).toEqual([ativo]);
  });

  it("conta as consultas vigentes de todas as categorias", () => {
    expect(contarConsultasVigentes(cenario().estados)).toBe(4);
  });
});

function impedimento(id: string, ativo: boolean): ImpedimentoRegistrado {
  return {
    id,
    base: "Declaração do fornecedor em transfer_conditions: dano de média monta.",
    ativo,
    identificadoEm: "2026-10-30T12:00:00.000Z",
    consultaDeOrigem: null,
    declaracaoDeOrigem: "d0000000-0000-4000-8000-000000000001",
    resolvidoEm: ativo ? null : "2026-10-30T14:00:00.000Z",
    resolvidoPor: ativo ? null : PESSOA_DA_EQUIPE,
    motivoDaResolucao: ativo ? null : "Regularização apresentada.",
    evidenciaDaResolucao: ativo ? null : EVIDENCIA,
  };
}

/** HTML da ficha, do jeito que o servidor o envia. */
function htmlDaFicha(): string {
  const { estados, registros } = cenario();
  return renderToStaticMarkup(
    createElement(FichaDocumental, {
      ficha: montarFicha(estados, registros, ORDEM),
      documentos: [
        {
          id: "d1",
          tipo: "Laudo cautelar",
          descricao: "Laudo do teste",
          enviadoEm: "2026-10-30T12:00:00.000Z",
        },
      ],
      nomeDe: semNome,
      abrirEvidencia: acaoDeTeste,
    }),
  );
}

/** Texto visível de um trecho de HTML, sem as marcas; as quebras de linha ficam. */
function textoDe(html: string): string {
  return html
    .replace(/<[^>]+>/gu, " ")
    .replace(/&quot;/gu, '"')
    .replace(/&#x27;/gu, "'")
    .replace(/&amp;/gu, "&")
    .replace(/[^\S\n]+/gu, " ");
}

describe("ficha renderizada", () => {
  it("cada informação tem um rótulo de origem, e o estado não tem nenhum", () => {
    const html = htmlDaFicha();
    // Declarações (3), consultas vigentes (4) e substituídas (1), a categoria sem informação (1) e o documento (1).
    expect(html.match(/data-origem="/gu)).toHaveLength(10);
    for (const estado of html.match(
      /<p[^>]*data-estado="[^"]+"[^>]*>.*?<\/p>/gu,
    ) ?? []) {
      expect(textoDe(estado)).not.toContain("Origem");
    }
    expect(html).toContain('data-origem="attached_document"');
    expect(html).toContain('data-origem="unconfirmed"');
    expect(html).toContain('data-origem="independent_evidence"');
  });

  it("a consulta sem evidência tem a linha “Evidência: sem evidência anexada” no lugar do botão (P2; TV-I3.6-06)", () => {
    const html = htmlDaFicha();
    const consultas = html.match(/data-consulta="/gu) ?? [];
    const semEvidencia =
      html.match(
        /<p data-evidencia="sem">Evidência: sem evidência anexada<\/p>/gu,
      ) ?? [];
    const botoes = html.match(/>Abrir a evidência</gu) ?? [];
    // Só a consulta da plataforma tem evidência; cada consulta tem uma das duas.
    expect(consultas).toHaveLength(5);
    expect(semEvidencia).toHaveLength(4);
    expect(botoes).toHaveLength(1);
    // A linha do resultado não leva mais o aviso.
    for (const linha of html.match(/<p data-resultado="[^"]+">.*?<\/p>/gu) ??
      []) {
      expect(linha).not.toContain(TEXTO_DOCUMENTAL.semEvidencia);
    }
  });

  it("a substituída leva a marca no início, em neutro e com o negrito atenuado (TV-I3.6-05)", () => {
    const html = htmlDaFicha();
    const marcadas =
      html.match(
        /text-neutral-600" data-consulta="[^"]+" data-substituida=""><p><span[^>]*>Substituída<\/span><\/p>/gu,
      ) ?? [];
    // Uma substituída no cenário; as vigentes ficam sem a marca.
    expect(marcadas).toHaveLength(1);
    expect(html.match(/>Substituída</gu)).toHaveLength(1);
    const substituida = html.slice(html.indexOf('data-substituida=""'));
    expect(substituida).toContain('<strong class="font-medium">');
  });

  it("a substituída diz qual consulta a substituiu, quando foi feita e quando foi registrada (TV-I3.6-14)", () => {
    const { estados, registros, gravame } = cenario();
    const anterior = montarFicha(estados, registros, ORDEM).find(
      (item) => item.categoria === "lien",
    )?.anteriores[0];
    if (anterior?.substituidaPor === null || anterior === undefined) {
      throw new Error("cenário sem a substituída");
    }
    const frase = `Substituída pela consulta de DETRAN-SP feita em ${formatarDataHora(gravame.realizadaEm)} (registrada em ${formatarDataHora("2026-10-30T12:05:00.000Z")}).`;
    expect(textoDaSubstituicao(anterior.substituidaPor)).toBe(frase);
    expect(textoDe(htmlDaFicha())).toContain(frase);
  });

  it("o card de “Condições de transferência” diz se gerou impedimento, ou quando foi resolvido (TV-I3.6-15)", () => {
    const estados = estadosCom([
      categoria("transfer_conditions", "with_findings"),
      categoria("lien", "declared_unverified"),
    ]);
    const comAtivo = montarFicha(estados, {
      ...SEM_REGISTROS,
      impedimentos: [impedimento("i1", true), impedimento("i2", false)],
    });
    expect(comAtivo[0]?.impedimento).toEqual({
      ativo: true,
      resolvidoEm: null,
    });
    expect(comAtivo[1]?.impedimento).toBeNull();
    const html = renderToStaticMarkup(
      createElement(FichaDocumental, {
        ficha: comAtivo,
        documentos: [],
        nomeDe: semNome,
        abrirEvidencia: acaoDeTeste,
      }),
    );
    expect(textoDe(html)).toContain(
      "Gerou impedimento de transferência ( veja Situação )",
    );
    expect(html).toContain(`href="${ANCORA_DO_IMPEDIMENTO}"`);

    const resolvidos = montarFicha(estados, {
      ...SEM_REGISTROS,
      impedimentos: [
        impedimento("i2", false),
        {
          ...impedimento("i3", false),
          resolvidoEm: "2026-10-30T18:00:00.000Z",
        },
      ],
    });
    const linha = resolvidos[0]?.impedimento;
    if (linha === null || linha === undefined) {
      throw new Error("cenário sem impedimento");
    }
    expect(textoDoImpedimentoNaCategoria(linha)).toBe(
      `Impedimento resolvido em ${formatarDataHora("2026-10-30T18:00:00.000Z")}`,
    );
    expect(montarFicha(estados, SEM_REGISTROS)[0]?.impedimento).toBeNull();
  });

  it("a pendência do impedimento diz o que fazer, com o link para o aviso, no tom de bloqueio (TV-I3.6-04)", () => {
    const html = renderToStaticMarkup(createElement(PendenciaDoImpedimento));
    expect(html).toContain(`href="${ANCORA_DO_IMPEDIMENTO}"`);
    expect(html).toContain("text-red-900");
    expect(textoDe(html).trim()).toBe(
      "Resolver o impedimento de transferência (veja Situação)",
    );
  });

  it("o resumo leva à ficha quando cita “sem apontamentos nas fontes consultadas” (TV-I3.6-07)", () => {
    const resumo = (comSemApontamentos: boolean, texto = "1 pendente") =>
      renderToStaticMarkup(
        createElement(ResumoPorCategoria, {
          resumo: texto,
          comSemApontamentos,
          hrefDaFicha: "#ficha-documental",
        }),
      );
    expect(resumoTemSemApontamentos(cenario().estados)).toBe(true);
    expect(
      resumoTemSemApontamentos(
        estadosCom([categoria("lien", "declared_unverified")]),
      ),
    ).toBe(false);
    const com = resumo(true, "1 sem apontamentos nas fontes consultadas");
    expect(com).toContain('href="#ficha-documental"');
    expect(textoDe(com)).toContain("( fontes e datas na ficha )");
    expect(resumo(false)).not.toContain("<a ");
    expect(resumo(false, "")).toBe("");
  });

  it("a evidência abre por botão; nenhuma URL vai para o HTML", () => {
    const html = htmlDaFicha();
    expect(html).toContain("Abrir a evidência");
    expect(html).toContain(`value="${EVIDENCIA}"`);
    expect(html).not.toMatch(/https?:\/\//u);
    expect(html).not.toContain("<a ");
  });

  it("a etapa de consultas sem consulta mostra o estado vazio", () => {
    const html = renderToStaticMarkup(
      createElement(ConsultasPorCategoria, {
        ficha: montarFicha(
          estadosCom([categoria("lien", "declared_unverified")]),
          SEM_REGISTROS,
        ),
        nomeDe: semNome,
        abrirEvidencia: acaoDeTeste,
        vazio: TEXTO_DOCUMENTAL.consultasVazias,
      }),
    );
    expect(textoDe(html)).toContain(TEXTO_DOCUMENTAL.consultasVazias);
  });

  it("o impedimento ativo tem aviso próprio, com o efeito sobre a oferta; sem impedimento, nada aparece", () => {
    const html = renderToStaticMarkup(
      createElement(ImpedimentosDaOferta, {
        impedimentos: [impedimento("i1", true), impedimento("i2", false)],
        nomeDe: semNome,
        abrirEvidencia: acaoDeTeste,
      }),
    );
    const texto = textoDe(html);
    expect(texto).toContain("Impedimento de transferência");
    expect(texto).toContain(
      "a oferta não é enviada, publicada nem reservada, e fica fora do catálogo",
    );
    expect(texto).toContain(ressalvaDoImpedimento());
    expect(texto).toContain("Impedimentos de transferência resolvidos");
    expect(texto).toContain("Motivo: Regularização apresentada.");
    expect(
      renderToStaticMarkup(
        createElement(ImpedimentosDaOferta, {
          impedimentos: [],
          nomeDe: semNome,
          abrirEvidencia: acaoDeTeste,
        }),
      ),
    ).toBe("");
  });
});

describe("link temporário da evidência (TV-I3.6-09)", () => {
  it("diz até que horas vale, no horário de Brasília", () => {
    expect(horaEmBrasilia("2026-10-30T15:34:50.000Z")).toBe("12:34");
    expect(rotuloDoLinkDaEvidencia("2026-10-30T15:34:50.000Z")).toBe(
      "Abrir o arquivo (vale até 12:34)",
    );
  });

  it("sem a validade, o link fica só com o nome", () => {
    expect(horaEmBrasilia("não é data")).toBeNull();
    expect(rotuloDoLinkDaEvidencia(undefined)).toBe("Abrir o arquivo");
  });
});

describe("linguagem dos textos documentais (§6.6)", () => {
  it("nenhum texto usa termo proibido sem a qualificação", () => {
    const { estados, registros } = cenario();
    const ficha = montarFicha(estados, registros, ORDEM);
    const textos = [
      ...Object.values(TEXTO_DOCUMENTAL),
      ...Object.values(EXPLICACAO_DO_RESULTADO),
      ...ficha.map((item) => item.textoDoEstado),
      ...ficha.flatMap((item) =>
        item.consultas.map((consulta) => autoriaDaConsulta(consulta, semNome)),
      ),
      // Um nó de texto por linha: a qualificação de uma linha não cobre as outras.
      ...textoDe(htmlDaFicha().replace(/<[^>]+>/gu, "\n")).split("\n"),
    ];
    for (const texto of textos) {
      expect(varrerTexto(texto), texto).toEqual([]);
    }
  });
});
