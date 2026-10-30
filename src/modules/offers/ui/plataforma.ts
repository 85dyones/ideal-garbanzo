/**
 * Telas administrativas da oferta (I2.9): quais ações de plataforma cada
 * pessoa da equipe vê em cada estado, os textos da revisão, da suspensão e da
 * reativação, a data que importa em cada linha da lista e a mensagem do
 * resultado. A tela só mostra ou esconde; quem decide é o servidor
 * (`server/transicoes.ts`) e o gatilho `private.proteger_oferta`.
 *
 * Todos os textos passam pelo teste de linguagem proibida (§6.6;
 * `plataforma.test.ts`). A plataforma intermedia: nenhum texto diz que ela
 * compra, vende, guarda, financia ou responde pelo veículo.
 */
import { formatarDataHora } from "@/app/_apoio/datas";
import { formatarValidade } from "@/app/_apoio/oferta";
import type { ContextoDoUsuario } from "@/modules/auth/tipos";
import {
  CATEGORIAS_DA_SUSPENSAO,
  ROTULO_DA_CATEGORIA_DA_SUSPENSAO,
} from "../rules/oferta";
import {
  atorDaOferta,
  transicaoDaOferta,
  type AtorDaOferta,
  type CondicoesDaTransicao,
  type IdDaTransicao,
  type StatusDaOferta,
} from "../rules/transicoes";

export interface AcoesDaPlataforma {
  /** T04 e T05: publicar a oferta em revisão ou devolvê-la com motivo. */
  readonly revisar: boolean;
  /** T14: suspender, com categoria e motivo. */
  readonly suspender: boolean;
  /** T15: reativar a suspensa, só o administrador, com motivo. */
  readonly reativar: boolean;
  /** T11 pela plataforma, com motivo. */
  readonly retirar: boolean;
  /** T08 pela plataforma. */
  readonly reservar: boolean;
  /** T09 pela plataforma. */
  readonly liberar: boolean;
}

export interface SituacaoDaPlataforma {
  /** O ator da sessão em relação à empresa dona (ADR-0003 §2.3). */
  readonly ator: AtorDaOferta;
  /**
   * Conflito de interesse (B25): a pessoa é da equipe, mas tem vínculo não
   * removido com a empresa dona; nessa oferta, ela age só pelo painel da
   * empresa.
   */
  readonly conflito: boolean;
  readonly acoes: AcoesDaPlataforma;
  /** O operador vê a oferta suspensa, mas a reativação é do administrador. */
  readonly reativacaoComAdministrador: boolean;
}

const NENHUMA_ACAO: AcoesDaPlataforma = {
  revisar: false,
  suspender: false,
  reativar: false,
  retirar: false,
  reservar: false,
  liberar: false,
};

function ehDaPlataforma(ator: AtorDaOferta): boolean {
  return ator === "operador" || ator === "administrador";
}

/**
 * As ações de plataforma que a tabela de transições permite a quem vê a tela,
 * no estado atual da oferta. Com vínculo não removido com a empresa dona, a
 * pessoa da equipe não vê nenhuma: age só como fornecedora (B25; X16).
 */
export function situacaoDaPlataforma(
  contexto: ContextoDoUsuario,
  empresaId: string,
  status: StatusDaOferta,
  condicoes: CondicoesDaTransicao,
): SituacaoDaPlataforma {
  const ator = atorDaOferta(contexto, empresaId);
  if (!ehDaPlataforma(ator)) {
    return {
      ator,
      conflito: contexto.papelNaPlataforma !== null,
      acoes: NENHUMA_ACAO,
      reativacaoComAdministrador: false,
    };
  }
  const pode = (para: StatusDaOferta, ids: readonly IdDaTransicao[]) => {
    const transicao = transicaoDaOferta(status, para, ator, condicoes);
    return transicao !== undefined && ids.includes(transicao.id);
  };
  return {
    ator,
    conflito: false,
    acoes: {
      revisar: pode("published", ["T04"]) && pode("draft", ["T05"]),
      suspender: pode("suspended", ["T14"]),
      reativar: pode("draft", ["T15"]),
      retirar: pode("withdrawn", ["T11"]),
      reservar: pode("reserved", ["T08"]),
      liberar: pode("published", ["T09"]),
    },
    reativacaoComAdministrador: status === "suspended" && ator === "operador",
  };
}

/** Opções do campo da categoria da suspensão: as quatro da §6.10, sem escolha prévia. */
export const OPCOES_DA_CATEGORIA_DA_SUSPENSAO: readonly (readonly [
  string,
  string,
])[] = [
  ["", "Selecione"],
  ...CATEGORIAS_DA_SUSPENSAO.map(
    (categoria) =>
      [categoria, ROTULO_DA_CATEGORIA_DA_SUSPENSAO[categoria]] as const,
  ),
];

/** Situações do filtro da lista: "Em revisão" primeiro, porque é a fila. "Vendida" não chega no Inc. 2. */
export const STATUS_DO_FILTRO_DA_PLATAFORMA = [
  "under_review",
  "draft",
  "published",
  "reserved",
  "withdrawn",
  "expired",
  "suspended",
] as const satisfies readonly StatusDaOferta[];

export type StatusDoFiltroDaPlataforma =
  (typeof STATUS_DO_FILTRO_DA_PLATAFORMA)[number];

/** Só as situações que aparecem no filtro; outra qualquer vale como "Todas". */
export function ehStatusDoFiltroDaPlataforma(
  valor: unknown,
): valor is StatusDoFiltroDaPlataforma {
  return STATUS_DO_FILTRO_DA_PLATAFORMA.some((status) => status === valor);
}

/** Datas de uma linha da lista, para escolher a que importa na situação. */
export interface DatasDaLinha {
  readonly status: StatusDaOferta;
  readonly publicadaEm: string | null;
  readonly suspensaEm: string | null;
  readonly retiradaEm: string | null;
  readonly validaAte: string | null;
  readonly atualizadaEm: string;
}

/**
 * A data que importa em cada situação, já em texto. Em revisão, ninguém altera
 * a oferta (ADR-0003 §2.5), então a última atualização é a entrada na fila.
 */
export function dataRelevante(linha: DatasDaLinha): string {
  switch (linha.status) {
    case "under_review":
      return `em revisão desde ${formatarDataHora(linha.atualizadaEm)}`;
    case "published":
      return linha.publicadaEm === null
        ? `atualizada em ${formatarDataHora(linha.atualizadaEm)}`
        : `publicada em ${formatarDataHora(linha.publicadaEm)}`;
    case "suspended":
      return `suspensa em ${formatarDataHora(linha.suspensaEm ?? linha.atualizadaEm)}`;
    case "withdrawn":
      return `retirada em ${formatarDataHora(linha.retiradaEm ?? linha.atualizadaEm)}`;
    case "expired":
      return `venceu em ${formatarValidade(linha.validaAte)}`;
    case "draft":
    case "reserved":
    case "sold":
      return `atualizada em ${formatarDataHora(linha.atualizadaEm)}`;
  }
}

/** Resultado de uma ação da plataforma, mostrado no topo do detalhe depois de gravar. */
export const RESULTADOS_DA_PLATAFORMA = [
  "publicada",
  "devolvida",
  "suspensa",
  "reativada",
  "retirada",
  "reservada",
  "liberada",
] as const;
export type ResultadoDaPlataforma = (typeof RESULTADOS_DA_PLATAFORMA)[number];

export function ehResultadoDaPlataforma(
  valor: unknown,
): valor is ResultadoDaPlataforma {
  return RESULTADOS_DA_PLATAFORMA.some((resultado) => resultado === valor);
}

/**
 * A situação em que cada ação deixa a oferta (ADR-0003 §2.3): T04, T05, T14,
 * T15, T11, T08 e T09.
 */
export const STATUS_DEPOIS_DO_RESULTADO: Readonly<
  Record<ResultadoDaPlataforma, StatusDaOferta>
> = {
  publicada: "published",
  devolvida: "draft",
  suspensa: "suspended",
  reativada: "draft",
  retirada: "withdrawn",
  reservada: "reserved",
  liberada: "published",
};

/**
 * O resultado confere com a situação atual da oferta. O `?resultado=` vem do
 * link e pode ser forjado ou ficar velho; o detalhe trata o que não confere
 * como ausente, sem mostrar o aviso (ADR-0003 §8, ACH-08).
 */
export function resultadoConfereComStatus(
  resultado: ResultadoDaPlataforma,
  status: StatusDaOferta,
): boolean {
  return STATUS_DEPOIS_DO_RESULTADO[resultado] === status;
}

export const MENSAGEM_DO_RESULTADO: Readonly<
  Record<ResultadoDaPlataforma, string>
> = {
  publicada: "Oferta publicada.",
  devolvida:
    "Oferta devolvida à empresa fornecedora, com o motivo. Ela voltou a rascunho.",
  suspensa: "Oferta suspensa. A empresa fornecedora vê a categoria e o motivo.",
  reativada: "Oferta reativada. Ela voltou a rascunho.",
  retirada: "Oferta retirada pela plataforma.",
  reservada: "Oferta reservada.",
  liberada: "Reserva liberada. A oferta voltou a publicada.",
};

export const TEXTO_DA_PLATAFORMA = {
  descricaoDaLista:
    "Ofertas de todas as empresas fornecedoras. As que aguardam revisão ficam em “Em revisão”.",
  descricaoDaFila:
    "Fila de revisão: as ofertas que esperam há mais tempo aparecem primeiro.",
  filaVazia: "Nenhuma oferta aguarda revisão.",
  abrirAFila: "Abrir a fila de revisão",
  voltarAFila: "Voltar à fila de revisão",
  listaVazia: "Nenhuma oferta cadastrada ainda.",
  listaVaziaComFiltro: "Nenhuma oferta com este filtro.",
  limiteDaLista:
    "A lista chegou ao limite de ofertas exibidas. Use o filtro por situação para encontrar as demais.",
  dadosRestritos:
    "Placa, RENAVAM e chassi são de acesso restrito: aparecem só para a empresa dona e para a equipe da plataforma, nunca no catálogo nem em notificação.",
  conflito:
    "Você tem vínculo com a empresa dona desta oferta. Para evitar conflito de interesse, você não age nela como plataforma: revisão, suspensão, reativação, reserva e retirada ficam com outra pessoa da equipe. Se precisar agir como empresa fornecedora, use o painel da empresa.",
  revisao:
    "A revisão confere completude, linguagem e indício de fraude. Publique a oferta ou devolva-a à empresa fornecedora com o motivo.",
  devolucaoNaoPorPendencia:
    "Pendência, apontamento ou divergência documental não justificam a devolução: elas viram aviso na oferta.",
  publicacaoBloqueada:
    "Faltam dados obrigatórios para publicar. Se a empresa fornecedora precisar completar, devolva com o motivo.",
  motivoDaDevolucao: "O motivo aparece para a empresa fornecedora.",
  suspensao:
    "Suspenda só diante de indício de fraude, falsificação, informação deliberadamente enganosa ou risco grave. A categoria e o motivo ficam registrados e aparecem para a empresa fornecedora.",
  suspensaoNaoPorPendencia:
    "Pendência documental, sozinha, não é motivo de suspensão.",
  reativacao:
    "A oferta reativada volta a rascunho. Para publicar de novo, a empresa fornecedora passa outra vez pelos requisitos e, com a revisão ativa, pela revisão.",
  motivoDaReativacao: "O motivo fica registrado na auditoria da plataforma.",
  reativacaoComAdministrador:
    "A reativação fica com quem administra a plataforma. Se a suspensão foi um engano, peça a reativação a quem tem esse papel.",
  semAcaoNoEstado:
    "Nenhuma ação da plataforma vale para a oferta nesta situação.",
  retirada:
    "A retirada pela plataforma exige motivo, que aparece para a empresa fornecedora. A empresa pode reabrir a oferta retirada como rascunho.",
  reserva:
    "A equipe da plataforma pode reservar a oferta publicada e liberar a reservada.",
  pendenciasNaoImpedem:
    "Pendência documental não entra nesta lista: ela vira aviso na oferta e não impede publicar.",
  semPendencias: "Nada falta: os dados obrigatórios estão preenchidos.",
  documentos:
    "Os documentos ficam ocultos para os compradores. Cada abertura fica registrada.",
  historicoSemAcesso:
    "O histórico de campos fica disponível para quem administra a plataforma e para quem opera com acesso à auditoria.",
} as const;
