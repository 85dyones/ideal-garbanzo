/**
 * Rótulos e textos das telas da oferta do fornecedor (I2.8). Todos passam pelo
 * teste de linguagem proibida (§6.6; `rotulos.test.ts`). A plataforma
 * intermedia: nenhum texto diz que ela compra, vende, guarda, financia ou
 * responde pelo veículo.
 */
import { rotuloDaCategoria } from "@/modules/documental/rules/estados";
import type { TipoDeDocumento } from "../storage/arquivos";
import type { AtorDaOferta, StatusDaOferta } from "../rules/transicoes";

export const ROTULO_DO_TIPO_DE_DOCUMENTO: Readonly<
  Record<TipoDeDocumento, string>
> = {
  crlv: "CRLV",
  laudo_cautelar: "Laudo cautelar",
  certidao: "Certidão",
  relatorio_de_consulta: "Relatório de consulta",
  nota_fiscal: "Nota fiscal",
  outro: "Outro",
};

export const ROTULO_DA_DECISAO_DA_REVISAO: Readonly<
  Record<"published" | "returned", string>
> = {
  published: "Publicada pela plataforma",
  returned: "Devolvida para ajustes",
};

/** Rótulos dos campos do veículo e da oferta nos formulários e no histórico. */
export const ROTULO_DO_CAMPO: Readonly<Record<string, string>> = {
  // Veículo (§5.2)
  make: "Marca",
  model: "Modelo",
  version: "Versão",
  manufacture_year: "Ano de fabricação",
  model_year: "Ano do modelo",
  mileage_km: "Quilometragem",
  fuel_type: "Combustível",
  transmission: "Câmbio",
  color: "Cor",
  body_type: "Carroceria",
  plate: "Placa",
  renavam: "RENAVAM",
  chassis: "Chassi",
  // Oferta (§5.2)
  status: "Situação",
  asking_price: "Preço",
  commercial_conditions: "Condições comerciais",
  location_city: "Cidade",
  location_state: "UF",
  valid_until: "Validade",
  availability_confirmed_at: "Disponibilidade confirmada em",
  publication_authorized_by: "Autorização de divulgação declarada por",
  publication_authorized_at: "Autorização de divulgação declarada em",
  published_at: "Publicada em",
  withdrawn_by: "Retirada por",
  withdrawn_at: "Retirada em",
  withdrawn_reason: "Motivo da retirada",
  suspended_category: "Categoria da suspensão",
  suspended_reason: "Motivo da suspensão",
  suspended_by: "Suspensa por",
  suspended_at: "Suspensa em",
};

/** Rótulo de uma coluna; coluna nova aparece pelo próprio nome. */
export function rotuloDoCampo(campo: string): string {
  return ROTULO_DO_CAMPO[campo] ?? campo;
}

/** Partes do snapshot fora de `fields` e `categories` (ADR-0003 §2.6). */
const ROTULO_DA_SECAO_DO_SNAPSHOT: Readonly<Record<string, string>> = {
  notices: "avisos documentais",
  transfer_impediments: "impedimentos de transferência",
};

/**
 * `change_summary` da versão em português: "fields.asking_price,
 * categories.auction" vira "Preço; declaração em Passagem por leilão".
 */
export function resumoDaMudanca(resumo: string): string {
  if (resumo === "versão inicial") return "Versão inicial";
  if (resumo === "sem mudança") return "Sem mudança";
  const partes = resumo
    .split(",")
    .map((parte) => parte.trim())
    .filter((parte) => parte !== "")
    .map((parte) => {
      if (parte.startsWith("fields.")) {
        return rotuloDoCampo(parte.slice("fields.".length));
      }
      if (parte.startsWith("categories.")) {
        const categoria = parte.slice("categories.".length);
        return `declaração em ${rotuloDaCategoria(categoria)}`;
      }
      return ROTULO_DA_SECAO_DO_SNAPSHOT[parte] ?? parte;
    });
  const texto = partes.join("; ");
  return texto === ""
    ? "Sem mudança"
    : `${texto.charAt(0).toUpperCase()}${texto.slice(1)}`;
}

/** Título da oferta pelo veículo: "Fiat Argo Drive 1.0 2022/2023". */
export function tituloDaOferta(
  veiculo: {
    readonly marca: string | null;
    readonly modelo: string | null;
    readonly versao: string | null;
    readonly anoDeFabricacao: number | null;
    readonly anoDoModelo: number | null;
  } | null,
): string {
  if (veiculo === null) return "Veículo sem identificação";
  const nome = [veiculo.marca, veiculo.modelo, veiculo.versao]
    .filter((parte): parte is string => parte !== null && parte !== "")
    .join(" ");
  const anos =
    veiculo.anoDeFabricacao !== null && veiculo.anoDoModelo !== null
      ? `${String(veiculo.anoDeFabricacao)}/${String(veiculo.anoDoModelo)}`
      : veiculo.anoDoModelo !== null
        ? String(veiculo.anoDoModelo)
        : "";
  const titulo = [nome, anos].filter((parte) => parte !== "").join(" ");
  return titulo === "" ? "Veículo sem identificação" : titulo;
}

/** Etapas do cadastro e páginas da oferta, na ordem da navegação. */
export const ETAPAS_DA_OFERTA = [
  { chave: "resumo", rotulo: "Resumo e envio", caminho: "" },
  { chave: "veiculo", rotulo: "1. Veículo", caminho: "/veiculo" },
  { chave: "fotos", rotulo: "2. Fotos", caminho: "/fotos" },
  { chave: "condicoes", rotulo: "3. Condições", caminho: "/condicoes" },
  { chave: "declaracoes", rotulo: "4. Declarações", caminho: "/declaracoes" },
  { chave: "documentos", rotulo: "5. Documentos", caminho: "/documentos" },
  { chave: "historico", rotulo: "Histórico", caminho: "/historico" },
] as const;
export type EtapaDaOferta = (typeof ETAPAS_DA_OFERTA)[number]["chave"];

export const TEXTO = {
  semEmpresaFornecedora:
    "Ofertas são cadastradas por empresa fornecedora. Esta empresa está registrada só como compradora.",
  painelVazio:
    "Nenhuma oferta cadastrada ainda. Use “Nova oferta” para começar.",
  painelVazioComFiltro: "Nenhuma oferta com este filtro.",
  inicioDoCadastro:
    "Comece pelo veículo e pelas condições. Você pode deixar campos em branco e completar depois: a oferta fica como rascunho até ser enviada.",
  dadosRestritos:
    "Placa, RENAVAM e chassi ficam visíveis só para a sua empresa e para a equipe da plataforma. Não aparecem para compradores.",
  identidadeFixa:
    "Placa, RENAVAM e chassi não mudam depois da primeira publicação.",
  campoEmBrancoNaAlteracao: "Campo deixado em branco mantém o valor gravado.",
  validade: "A oferta vale até 23h59 (horário de Brasília) do dia escolhido.",
  orientacaoDasFotos:
    "Antes de enviar a foto, confira se ela não mostra a placa nem dado pessoal, como nome, documento, telefone ou o rosto de alguém.",
  fotoRemovida:
    "A foto removida sai da oferta, mas o arquivo continua guardado na plataforma.",
  documentosOcultos: "Os documentos ficam ocultos para os compradores.",
  documentoIrreversivel:
    "Confira o arquivo antes de enviar: o documento enviado não pode ser apagado pela tela.",
  documentoGuardado: "Cada abertura de documento fica registrada.",
  documentoSemEfeitoNoEstado:
    "Por enquanto, anexar um documento não muda o estado das categorias.",
  declaracoes:
    "Responda cada categoria com o que você sabe sobre o veículo. “Desconhece” também é uma resposta válida, mas precisa ser escolhida. Só as categorias marcadas são gravadas, e cada resposta vira uma declaração nova.",
  pendenciaNaoImpede:
    "Pendência documental não impede o envio: ela vira aviso na oferta.",
  autorizacao: "Declaro ter autorização para divulgar esta oferta.",
  autorizacaoACadaEnvio:
    "A declaração vale só para este envio e precisa ser marcada de novo a cada envio.",
  envioSoDoAdministrador:
    "Só o administrador da empresa envia, publica, reserva, retira ou reabre a oferta. Avise quando o rascunho estiver pronto.",
  revisaoAtiva:
    "Com a revisão ativa, a equipe da plataforma revisa a oferta antes de ela ficar visível para compradores.",
  revisaoInativa:
    "A revisão antes de publicar está desligada: a oferta fica visível para compradores assim que for publicada.",
  retirarRascunho:
    "Oferta não se exclui: para deixar de usar o rascunho, retire-o. A oferta retirada pode ser reaberta depois.",
  validadeVencida:
    "A validade desta oferta já passou. Ela passa a “Expirada” automaticamente.",
  placaRepetida:
    "Sua empresa tem outra oferta em andamento com a mesma placa. Confira se não é o mesmo veículo cadastrado duas vezes.",
} as const;

/** O que a pessoa pode fazer, pela situação da oferta e pelo papel na empresa (ADR-0003 §2.3 e §2.5). */
export function orientacaoDoStatus(
  status: StatusDaOferta,
  ator: AtorDaOferta,
): string {
  const administrador = ator === "adm_empresa";
  switch (status) {
    case "draft":
      return administrador
        ? "Rascunho em preenchimento. Complete as etapas e envie a oferta no fim desta página."
        : "Rascunho em preenchimento. Você pode completar as etapas; o envio fica com o administrador da empresa.";
    case "under_review":
      return "A oferta está em revisão pela plataforma e não pode ser alterada. Para editar, cancele o envio: ela volta a rascunho e precisa ser enviada de novo.";
    case "published":
      return administrador
        ? "A oferta está publicada. Você pode alterar o conteúdo, estender a validade, confirmar a disponibilidade, reservar ou retirar. Algumas mudanças, como preço e declarações, geram versão nova da oferta."
        : "A oferta está publicada. Você pode confirmar a disponibilidade; as alterações ficam com o administrador da empresa.";
    case "reserved":
      return administrador
        ? "A oferta está reservada. Você pode liberar a reserva, alterar o conteúdo, estender a validade, confirmar a disponibilidade ou retirar."
        : "A oferta está reservada. Você pode confirmar a disponibilidade; as alterações ficam com o administrador da empresa.";
    case "withdrawn":
      return administrador
        ? "A oferta foi retirada e não pode ser alterada. Para usá-la de novo, reabra como rascunho e envie outra vez."
        : "A oferta foi retirada e não pode ser alterada. Só o administrador da empresa pode reabri-la.";
    case "expired":
      return administrador
        ? "A validade venceu e a oferta não pode ser alterada. Para renovar, reabra como rascunho e envie outra vez."
        : "A validade venceu e a oferta não pode ser alterada. Só o administrador da empresa pode reabri-la.";
    case "suspended":
      return "A oferta foi suspensa pela plataforma e não pode ser alterada, retirada nem reaberta pela empresa. Só a administração da plataforma pode reativá-la.";
    case "sold":
      return "A oferta foi marcada como vendida e não pode ser alterada.";
  }
}

/** Por que a etapa não pode ser alterada agora (ADR-0003 §2.5). */
export function motivoDaEtapaSoLeitura(
  status: StatusDaOferta,
  ator: AtorDaOferta,
): string {
  if (status === "published" || status === "reserved") {
    return ator === "adm_empresa"
      ? "Esta etapa não pode ser alterada agora."
      : "Só o administrador da empresa altera oferta publicada ou reservada.";
  }
  if (status === "under_review") {
    return "A oferta está em revisão. Para alterar, cancele o envio no resumo.";
  }
  if (status === "withdrawn" || status === "expired") {
    return "A oferta precisa ser reaberta como rascunho antes de ser alterada.";
  }
  if (status === "suspended") {
    return "A oferta está suspensa pela plataforma e não pode ser alterada.";
  }
  return "Esta etapa não pode ser alterada agora.";
}
