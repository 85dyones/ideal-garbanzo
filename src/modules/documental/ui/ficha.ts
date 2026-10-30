/**
 * Ficha documental para a tela (I3.6; especificação v1.1, §6.4, §6.5 e §6.11;
 * ADR-0004 §2.6 a §2.8 e §2.11). Junta os estados da leitura do servidor
 * (`consultarEstadosDocumentais`) com os registros lidos pela sessão
 * (`queries/registros.ts`) e monta, por categoria, o estado e, separadas, as
 * informações, cada uma com a própria origem.
 *
 * Regras de exibição:
 * - o estado não é origem e não leva rótulo de origem; cada informação
 *   (declaração, consulta vigente, documento) leva a sua; nada de rótulo
 *   combinado (§6.5);
 * - "Sem apontamentos nas fontes consultadas" sai sempre com a fonte e a data
 *   de cada consulta ao lado (§6.4, "Exibição"; E26);
 * - consulta sem evidência diz "sem evidência anexada" (P2);
 * - "Aguardando resultado" e "Inconclusivo" saem por extenso, com a explicação
 *   (E13);
 * - a revisão aberta é fato da categoria, com o motivo, sem origem (E12);
 * - o impedimento de transferência tem aviso próprio, fora das pendências
 *   documentais (§6.11; E24).
 *
 * Só monta texto: quem pode o quê fica em `rules/registro.ts`, e quem decide
 * é a operação e o banco. Todos os textos passam pelo teste de linguagem
 * (§6.6; `ficha.test.ts`).
 */
import { formatarDataHora } from "@/app/_apoio/datas";
import { AVISO_DO_IMPEDIMENTO, textoDoAviso } from "../rules/avisos";
import {
  ROTULO_DA_ORIGEM,
  ROTULO_DO_RESULTADO,
  ROTULO_DO_TIPO_DE_FONTE,
  origemDaConsulta,
  type EstadoDocumental,
  type ResultadoDaConsulta,
  type TipoDeFonte,
} from "../rules/estados";
import type {
  ConsultaRegistrada,
  ImpedimentoRegistrado,
  RegistrosDocumentais,
  RevisaoRegistrada,
} from "../queries/registros";
import type { EstadoDaCategoria, EstadosDaOferta } from "../server/estados";

export const TEXTO_DOCUMENTAL = {
  introducaoDaFicha:
    "O estado de cada categoria é calculado a partir da declaração, das consultas e das revisões, e ninguém o digita. Abaixo do estado, cada informação aparece com a própria origem.",
  semInformacao: "Nenhuma declaração nem consulta registrada nesta categoria.",
  semEvidencia: "sem evidência anexada",
  /** Linha própria da consulta sem evidência (P2; TV-I3.6-06). */
  linhaSemEvidencia: "Evidência: sem evidência anexada",
  substituida: "Substituída",
  /** O que falta para enviar, na tela, no lugar da condição (TV-I3.6-04). */
  pendenciaDoImpedimento:
    "Resolver o impedimento de transferência (veja Situação)",
  impedimentoGerado: "Gerou impedimento de transferência",
  vejaSituacao: "veja Situação",
  fontesEDatasNaFicha: "fontes e datas na ficha",
  evidenciasOcultas:
    "As evidências das consultas ficam ocultas para os compradores.",
  aberturaDaEvidencia: "Cada abertura de evidência fica registrada.",
  linkExpirado: "O link temporário expirou. Use o botão para gerar outro.",
  semCategorias: "Nenhuma categoria documental para mostrar.",
  documentosSemCategoria:
    "Os documentos anexados não têm categoria e, por enquanto, não mudam o estado das categorias.",
  semDocumentos: "Nenhum documento anexado.",
  explicacaoDaOrigem:
    "A consulta registrada pela empresa fornecedora aparece como “Resultado de consulta”. “Confirmada por evidência independente” vale só para consulta em fonte oficial, com evidência anexada e resultado conclusivo, registrada pela equipe da plataforma.",
  impedimento: "Impedimento de transferência",
  efeitoDoImpedimento:
    "Enquanto houver impedimento de transferência ativo, a oferta não é enviada, publicada nem reservada, e fica fora do catálogo.",
  resolucaoPelaAdministracao:
    "Só a administração da plataforma resolve o impedimento, com o motivo e a evidência da regularização. Corrigir a declaração ou registrar outra consulta não o resolve.",
  impedimentosResolvidos: "Impedimentos de transferência resolvidos",
  introducaoDasConsultas:
    "Registre as consultas feitas sobre o veículo: a fonte, a data e a hora, o resultado, um resumo e as limitações conhecidas da fonte. A evidência, em PDF ou imagem, é opcional.",
  consultaReal:
    "Registre só consultas feitas de fato. Consulta nova não apaga a anterior: para atualizar um resultado, registre outra que a substitua, e a anterior continua no histórico.",
  dadosDoProprietario:
    "Não escreva dados do proprietário, como nome, CPF, telefone ou endereço, nos textos da consulta.",
  consultaGeraVersao:
    "Na oferta publicada ou reservada, a consulta registrada entra nas informações da oferta e gera versão nova.",
  dicaDasLimitacoes:
    "Obrigatório: o que a fonte não cobre. Exemplos: “fonte não cobre leilões fora do DETRAN”; “certidão válida só para a UF consultada”.",
  dicaDaFonte: "Nome da fonte consultada, como o órgão ou o serviço.",
  dicaDaData: "Quando a consulta foi feita. Não pode ficar no futuro.",
  dicaDaEvidencia: "PDF, JPEG, PNG ou WebP, até 10 MB.",
  dicaDaSubstituicaoDoFornecedor:
    "Escolha a consulta que esta atualiza. A empresa substitui só as consultas que ela mesma registrou.",
  dicaDaSubstituicaoDaPlataforma: "Escolha a consulta que esta atualiza.",
  consultasVazias:
    "Nenhuma consulta registrada. As consultas são opcionais e não impedem o envio.",
  consultasVaziasNaPlataforma: "Nenhuma consulta registrada.",
  consultasSubstituidas: "Consultas substituídas",
  historicoDasRevisoes: "Histórico das revisões",
  introducaoDaRevisao:
    "Abra a revisão quando houver divergência entre declaração, documento e consulta, ou apontamento que exige avaliação. O motivo aparece para a empresa fornecedora. Fechar a revisão não desfaz a divergência entre declaração e consulta: ela acaba com registro novo que concorde.",
  revisaoNaoPorPendencia:
    "A revisão documental não muda a situação da oferta: pendência ou apontamento documental viram aviso.",
  semRevisaoAberta: "Nenhuma categoria com revisão aberta.",
  introducaoDaResolucao:
    "Resolva só com a evidência da regularização. O motivo e a evidência ficam registrados, e a resolução não se desfaz. Ocorrência nova depois da resolução gera outro impedimento.",
  resolucaoComAdministrador:
    "A resolução do impedimento fica com quem administra a plataforma.",
  resolucaoForaDoEstado:
    "Nesta situação, a oferta não recebe evidência, e o impedimento não pode ser resolvido agora.",
  semAcaoDocumental:
    "Nenhuma ação documental vale para a oferta nesta situação.",
  consultaForaDoEstado:
    "Nesta situação, a oferta não recebe consulta nem evidência.",
  revisaoForaDoEstado:
    "Nesta situação, a oferta não recebe revisão documental.",
} as const;

/** Explicação dos resultados sem conclusão, que saem por extenso (E13). */
export const EXPLICACAO_DO_RESULTADO: Readonly<
  Partial<Record<ResultadoDaConsulta, string>>
> = {
  awaiting_result:
    "a consulta foi feita, e o resultado ainda não chegou. Quando chegar, registre uma consulta nova que substitua esta.",
  inconclusive:
    "a consulta não permitiu concluir se há ou não ocorrência na fonte.",
};

export interface ConsultaNaFicha {
  readonly id: string;
  readonly categoria: string;
  readonly fonte: string;
  readonly tipoDeFonte: TipoDeFonte;
  readonly rotuloDoTipoDeFonte: string;
  readonly realizadaEm: string;
  readonly resultado: ResultadoDaConsulta;
  /** Por extenso, sempre (E13). */
  readonly rotuloDoResultado: string;
  readonly explicacaoDoResultado: string | null;
  readonly resumo: string;
  readonly limitacoes: string;
  readonly protocolo: string | null;
  readonly evidenciaId: string | null;
  readonly origem: "check_result" | "independent_evidence";
  readonly rotuloDaOrigem: string;
  /** `null` quando o registro da sessão não trouxe a linha (não deve acontecer). */
  readonly registradaPelaPlataforma: boolean | null;
  readonly registradaPor: string | null;
  readonly registradaEm: string | null;
  /** Só nas substituídas: a consulta que a substituiu. */
  readonly substituidaPor: ConsultaRegistrada | null;
}

export interface RevisaoNaFicha {
  readonly id: string;
  readonly acao: "open_review" | "close_review";
  readonly motivo: string;
  readonly autor: string;
  readonly em: string;
}

export interface CategoriaNaFicha {
  readonly categoria: string;
  readonly rotulo: string;
  readonly estado: EstadoDocumental;
  /** O estado, e, em "sem apontamentos nas fontes consultadas", as fontes e as datas ao lado. */
  readonly textoDoEstado: string;
  /** A revisão aberta, como fato da categoria; `null` sem revisão aberta. */
  readonly revisaoAberta: RevisaoNaFicha | null;
  readonly declaracao: EstadoDaCategoria["declaracao"];
  /** Vigentes, da mais recente para a mais antiga. */
  readonly consultas: readonly ConsultaNaFicha[];
  /** Substituídas, que continuam no histórico (§6.3). */
  readonly anteriores: readonly ConsultaNaFicha[];
  /** Revisões da categoria, da mais recente para a mais antiga. */
  readonly revisoes: readonly RevisaoNaFicha[];
  /**
   * Só na categoria que gera o impedimento (`transfer_conditions`; P3): se há
   * impedimento ativo, ou a data da resolução mais recente. `null` sem
   * impedimento (TV-I3.6-15).
   */
  readonly impedimento: {
    readonly ativo: boolean;
    readonly resolvidoEm: string | null;
  } | null;
  /** Sem declaração nem consulta: a origem é "Não confirmada" (O5). */
  readonly semInformacao: boolean;
}

/**
 * Rótulo do estado. "Sem apontamentos nas fontes consultadas" leva a fonte e
 * a data de cada consulta vigente ao lado (§6.4; E26): por exemplo, "Sem
 * apontamentos nas fontes consultadas: DETRAN-SP (consulta em 30/10/2026,
 * 09:00)".
 */
export function textoDoEstado(
  estado: EstadoDocumental,
  rotuloDoEstado: string,
  consultas: readonly {
    readonly fonte: string;
    readonly realizadaEm: string;
  }[],
): string {
  if (estado !== "no_findings_in_sources" || consultas.length === 0) {
    return rotuloDoEstado;
  }
  const fontes = consultas
    .map(
      (consulta) =>
        `${consulta.fonte} (consulta em ${formatarDataHora(consulta.realizadaEm)})`,
    )
    .join("; ");
  return `${rotuloDoEstado}: ${fontes}`;
}

/** Texto do estado direto da leitura do servidor (declarações e listas curtas). */
export function textoDoEstadoDaCategoria(categoria: EstadoDaCategoria): string {
  return textoDoEstado(
    categoria.estado,
    categoria.rotuloDoEstado,
    categoria.consultas,
  );
}

function paraConsultaNaFicha(
  consulta: {
    readonly id: string;
    readonly fonte: string;
    readonly tipoDeFonte: TipoDeFonte;
    readonly realizadaEm: string;
    readonly resultado: ResultadoDaConsulta;
    readonly resumo: string;
    readonly limitacoes: string;
    readonly evidenciaId: string | null;
  },
  categoria: string,
  registro: ConsultaRegistrada | undefined,
  substituidaPor: ConsultaRegistrada | null,
  /** Nas vigentes, a origem calculada pelo servidor; nas substituídas, a mesma regra aqui. */
  origemDoServidor?: "check_result" | "independent_evidence",
): ConsultaNaFicha {
  const plataforma = registro?.registradaPelaPlataforma ?? null;
  const origem =
    origemDoServidor ??
    origemDaConsulta({
      tipoDeFonte: consulta.tipoDeFonte,
      resultado: consulta.resultado,
      temEvidencia: consulta.evidenciaId !== null,
      registradaPelaPlataforma: plataforma === true,
    });
  return {
    id: consulta.id,
    categoria,
    fonte: consulta.fonte,
    tipoDeFonte: consulta.tipoDeFonte,
    rotuloDoTipoDeFonte: ROTULO_DO_TIPO_DE_FONTE[consulta.tipoDeFonte],
    realizadaEm: consulta.realizadaEm,
    resultado: consulta.resultado,
    rotuloDoResultado: ROTULO_DO_RESULTADO[consulta.resultado],
    explicacaoDoResultado: EXPLICACAO_DO_RESULTADO[consulta.resultado] ?? null,
    resumo: consulta.resumo,
    limitacoes: consulta.limitacoes,
    protocolo: registro?.protocolo ?? null,
    evidenciaId: consulta.evidenciaId,
    origem,
    rotuloDaOrigem: ROTULO_DA_ORIGEM[origem],
    registradaPelaPlataforma: plataforma,
    registradaPor: registro?.registradaPor ?? null,
    registradaEm: registro?.registradaEm ?? null,
    substituidaPor,
  };
}

function paraRevisao(revisao: RevisaoRegistrada): RevisaoNaFicha {
  return {
    id: revisao.id,
    acao: revisao.acao,
    motivo: revisao.motivo,
    autor: revisao.autor,
    em: revisao.em,
  };
}

/** A categoria em que a ocorrência gera o impedimento de transferência (P3). */
export const CATEGORIA_DO_IMPEDIMENTO = "transfer_conditions";

/** Situação do impedimento para o card da categoria que o gera. */
function impedimentoDaCategoria(
  categoria: string,
  impedimentos: readonly ImpedimentoRegistrado[],
): CategoriaNaFicha["impedimento"] {
  if (categoria !== CATEGORIA_DO_IMPEDIMENTO || impedimentos.length === 0) {
    return null;
  }
  if (impedimentos.some((impedimento) => impedimento.ativo)) {
    return { ativo: true, resolvidoEm: null };
  }
  const resolucoes = impedimentos
    .map((impedimento) => impedimento.resolvidoEm)
    .filter((data): data is string => data !== null)
    .sort((a, b) => Date.parse(b) - Date.parse(a));
  return { ativo: false, resolvidoEm: resolucoes[0] ?? null };
}

/** Linha do card de "Condições de transferência" com o impedimento (TV-I3.6-15). */
export function textoDoImpedimentoNaCategoria(
  impedimento: NonNullable<CategoriaNaFicha["impedimento"]>,
): string {
  return impedimento.ativo
    ? TEXTO_DOCUMENTAL.impedimentoGerado
    : `Impedimento resolvido em ${formatarDataHora(impedimento.resolvidoEm)}`;
}

/**
 * Monta a ficha. A ordem é a da configuração (`document_categories`); as
 * categorias fora dela vêm depois, na ordem do banco.
 */
export function montarFicha(
  estados: EstadosDaOferta,
  registros: RegistrosDocumentais,
  ordem: readonly string[] = [],
): CategoriaNaFicha[] {
  const porId = new Map(
    registros.consultas.map((consulta) => [consulta.id, consulta]),
  );
  const substituta = new Map<string, ConsultaRegistrada>();
  for (const consulta of registros.consultas) {
    if (consulta.substitui !== null) {
      substituta.set(consulta.substitui, consulta);
    }
  }
  const posicao = (categoria: string) => {
    const indice = ordem.indexOf(categoria);
    return indice === -1 ? ordem.length : indice;
  };
  const categorias = [...estados.categorias].sort(
    (a, b) => posicao(a.categoria) - posicao(b.categoria),
  );

  return categorias.map((item) => {
    const vigentes = new Set(item.consultas.map((consulta) => consulta.id));
    const consultas = item.consultas.map((consulta) =>
      paraConsultaNaFicha(
        consulta,
        item.categoria,
        porId.get(consulta.id),
        null,
        consulta.origem,
      ),
    );
    const anteriores = registros.consultas
      .filter(
        (consulta) =>
          consulta.categoria === item.categoria && !vigentes.has(consulta.id),
      )
      .map((consulta) =>
        paraConsultaNaFicha(
          consulta,
          item.categoria,
          consulta,
          substituta.get(consulta.id) ?? null,
        ),
      );
    const daCategoria = registros.revisoes.filter(
      (revisao) => revisao.categoria === item.categoria,
    );
    const ultima = daCategoria.at(-1);
    // O servidor diz se a revisão está aberta; o registro traz o motivo e a data.
    const revisaoAberta =
      item.revisaoAberta && ultima?.acao === "open_review"
        ? paraRevisao(ultima)
        : null;
    return {
      categoria: item.categoria,
      rotulo: item.rotuloDaCategoria,
      estado: item.estado,
      textoDoEstado: textoDoEstado(item.estado, item.rotuloDoEstado, consultas),
      revisaoAberta,
      declaracao: item.declaracao,
      consultas,
      anteriores,
      revisoes: [...daCategoria].reverse().map(paraRevisao),
      semInformacao: item.declaracao === null && consultas.length === 0,
      impedimento: impedimentoDaCategoria(
        item.categoria,
        registros.impedimentos,
      ),
    };
  });
}

/**
 * "Substituída pela consulta de <fonte> feita em <data e hora> (registrada
 * em <data e hora>)." (TV-I3.6-14).
 */
export function textoDaSubstituicao(substituta: ConsultaRegistrada): string {
  return `Substituída pela consulta de ${substituta.fonte} feita em ${formatarDataHora(substituta.realizadaEm)} (registrada em ${formatarDataHora(substituta.registradaEm)}).`;
}

/** O resumo proporcional cita "sem apontamentos nas fontes consultadas" (TV-I3.6-07). */
export function resumoTemSemApontamentos(estados: EstadosDaOferta): boolean {
  return estados.categorias.some(
    (categoria) => categoria.estado === "no_findings_in_sources",
  );
}

const HORA_EM_BRASILIA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "HH:MM" no horário de Brasília; `null` se o instante for inválido. */
export function horaEmBrasilia(instante: string): string | null {
  const data = new Date(instante);
  return Number.isNaN(data.getTime()) ? null : HORA_EM_BRASILIA.format(data);
}

/** Texto do link da evidência, com a validade (TV-I3.6-09): "Abrir o arquivo (vale até 12:34)". */
export function rotuloDoLinkDaEvidencia(expiraEm: string | undefined): string {
  const hora = expiraEm === undefined ? null : horaEmBrasilia(expiraEm);
  return hora === null
    ? "Abrir o arquivo"
    : `Abrir o arquivo (vale até ${hora})`;
}

/** Quantas consultas vigentes a oferta tem, em todas as categorias. */
export function contarConsultasVigentes(estados: EstadosDaOferta): number {
  return estados.categorias.reduce(
    (total, categoria) => total + categoria.consultas.length,
    0,
  );
}

/** Ressalvas documentais da versão, sem a do impedimento, que tem aviso próprio (§6.11). */
export function ressalvasSemImpedimento(
  avisos: EstadosDaOferta["avisos"],
): EstadosDaOferta["avisos"] {
  return avisos.filter((aviso) => aviso.codigo !== AVISO_DO_IMPEDIMENTO);
}

/** A ressalva do impedimento, a mesma do snapshot. */
export function ressalvaDoImpedimento(): string {
  return textoDoAviso(AVISO_DO_IMPEDIMENTO);
}

export function impedimentosAtivos(
  impedimentos: readonly ImpedimentoRegistrado[],
): ImpedimentoRegistrado[] {
  return impedimentos.filter((impedimento) => impedimento.ativo);
}

export interface OpcaoDeSubstituicao {
  readonly id: string;
  readonly categoria: string;
  readonly rotulo: string;
}

/**
 * Consultas vigentes que quem registra pode substituir (E3): a equipe da
 * plataforma, qualquer uma; o fornecedor, só as registradas pela própria
 * empresa. O banco confere de novo.
 */
export function consultasSubstituiveis(
  ficha: readonly CategoriaNaFicha[],
  quem: "fornecedor" | "plataforma",
): OpcaoDeSubstituicao[] {
  return ficha.flatMap((categoria) =>
    categoria.consultas
      .filter(
        (consulta) =>
          quem === "plataforma" || consulta.registradaPelaPlataforma === false,
      )
      .map((consulta) => ({
        id: consulta.id,
        categoria: categoria.categoria,
        rotulo: `${consulta.fonte} · ${formatarDataHora(consulta.realizadaEm)} · ${consulta.rotuloDoResultado}`,
      })),
  );
}

/** "Registrada pela equipe da plataforma (Nome), em 30/10/2026, 09:00." */
export function autoriaDaConsulta(
  consulta: ConsultaNaFicha,
  nomeDe: (perfilId: string) => string | undefined,
): string {
  const lado =
    consulta.registradaPelaPlataforma === true
      ? "Registrada pela equipe da plataforma"
      : consulta.registradaPelaPlataforma === false
        ? "Registrada pela empresa fornecedora"
        : "Registrada";
  const nome =
    consulta.registradaPor === null
      ? undefined
      : nomeDe(consulta.registradaPor);
  const quando =
    consulta.registradaEm === null
      ? ""
      : `, em ${formatarDataHora(consulta.registradaEm)}`;
  return `${lado}${nome === undefined ? "" : ` (${nome})`}${quando}.`;
}

/** "Aberta pela equipe da plataforma (Nome), em 30/10/2026, 09:00." */
export function autoriaDaRevisao(
  revisao: RevisaoNaFicha,
  nomeDe: (perfilId: string) => string | undefined,
): string {
  const nome = nomeDe(revisao.autor);
  const verbo = revisao.acao === "open_review" ? "Aberta" : "Fechada";
  return `${verbo} pela equipe da plataforma${nome === undefined ? "" : ` (${nome})`}, em ${formatarDataHora(revisao.em)}.`;
}

/** Fato da categoria com revisão aberta (E12): "Em análise pela plataforma desde …". */
export function textoDaRevisaoAberta(revisao: RevisaoNaFicha): string {
  return `Em análise pela plataforma desde ${formatarDataHora(revisao.em)}. Motivo: ${revisao.motivo}`;
}
