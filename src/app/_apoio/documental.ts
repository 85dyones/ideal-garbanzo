/**
 * Leitura dos formulários do domínio documental (I3.6): registro de consulta,
 * revisão documental e resolução do impedimento. Só confere o que falta, para
 * o erro sair em português no campo certo; o formato, os limites, a lista de
 * linguagem e quem pode agir ficam nos esquemas, na operação e no banco.
 */
import { TAMANHO_MAXIMO_DO_ARQUIVO } from "@/modules/offers/storage/arquivos";
import { texto, textoOpcional, valoresDoFormulario } from "./formulario";
import type { CampoDoEsquema } from "./oferta";
import type { LeituraDoFormulario } from "./oferta-da-plataforma";

/** Campos de texto do formulário da consulta, devolvidos quando há erro. */
export const CAMPOS_DO_FORMULARIO_DA_CONSULTA = [
  "categoria",
  "tipoDeFonte",
  "fonte",
  "realizadaEmLocal",
  "resultado",
  "resumo",
  "limitacoes",
  "protocolo",
  "substitui",
] as const;

/**
 * Caminhos do esquema da consulta para os campos do formulário. A mensagem
 * padrão troca as mensagens genéricas do Zod; as escritas no esquema (como a
 * da linguagem proibida) passam como vieram.
 */
export const CAMPOS_DO_ESQUEMA_DA_CONSULTA: Readonly<
  Record<string, CampoDoEsquema>
> = {
  categoria: { nome: "categoria", mensagemPadrao: "Escolha a categoria." },
  tipoDeFonte: {
    nome: "tipoDeFonte",
    mensagemPadrao: "Escolha o tipo da fonte.",
  },
  fonte: {
    nome: "fonte",
    mensagemPadrao: "Informe a fonte consultada, com até 200 caracteres.",
  },
  realizadaEm: {
    nome: "realizadaEm",
    mensagemPadrao: "Informe a data e a hora da consulta.",
  },
  resultado: {
    nome: "resultado",
    mensagemPadrao: "Escolha o resultado da consulta.",
  },
  resumo: {
    nome: "resumo",
    mensagemPadrao: "Escreva o resumo do resultado, com até 2.000 caracteres.",
  },
  limitacoes: {
    nome: "limitacoes",
    mensagemPadrao:
      "Escreva as limitações conhecidas da fonte, com até 2.000 caracteres.",
  },
  protocolo: {
    nome: "protocolo",
    mensagemPadrao: "Use até 200 caracteres no protocolo.",
  },
  substitui: {
    nome: "substitui",
    mensagemPadrao: "Escolha uma consulta da lista.",
  },
  "evidencia.tipoDoArquivo": {
    nome: "arquivo",
    mensagemPadrao: "Use um arquivo PDF, JPEG, PNG ou WebP.",
  },
  "evidencia.conteudo": {
    nome: "arquivo",
    mensagemPadrao: "O arquivo precisa ter até 10 MB.",
  },
};

/** Os campos que faltam escolher, com a mensagem de cada um. */
const ESCOLHAS_DA_CONSULTA = [
  ["categoria", "Escolha a categoria."],
  ["tipoDeFonte", "Escolha o tipo da fonte."],
  ["resultado", "Escolha o resultado da consulta."],
] as const;

export interface LeituraDaConsulta {
  /** Entrada da operação, sem a evidência (o arquivo é lido na ação). */
  readonly entrada: Readonly<Record<string, string>>;
  readonly erros: Readonly<Record<string, readonly string[]>>;
  readonly valores: Readonly<Record<string, string>>;
}

/**
 * Lê o formulário da consulta. A data chega já em ISO, convertida no
 * navegador; protocolo e substituição só entram quando preenchidos.
 */
export function lerConsulta(dados: FormData): LeituraDaConsulta {
  const erros: Record<string, string[]> = {};
  const entrada: Record<string, string> = {
    ofertaId: texto(dados, "ofertaId"),
  };
  for (const [nome, mensagem] of ESCOLHAS_DA_CONSULTA) {
    const valor = texto(dados, nome);
    if (valor === "") erros[nome] = [mensagem];
    else entrada[nome] = valor;
  }
  const realizadaEm = texto(dados, "realizadaEm");
  if (realizadaEm === "") {
    erros.realizadaEm = ["Informe a data e a hora da consulta."];
  } else {
    entrada.realizadaEm = realizadaEm;
  }
  for (const nome of ["fonte", "resumo", "limitacoes"] as const) {
    entrada[nome] = texto(dados, nome);
  }
  for (const nome of ["protocolo", "substitui"] as const) {
    const valor = textoOpcional(dados, nome);
    if (valor !== undefined) entrada[nome] = valor;
  }
  return {
    entrada,
    erros,
    valores: valoresDoFormulario(dados, CAMPOS_DO_FORMULARIO_DA_CONSULTA),
  };
}

const TIPOS_DA_EVIDENCIA: readonly string[] = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

/** Erro do arquivo da evidência, ou `null` se ele serve (o servidor confere o conteúdo). */
export function erroDoArquivo(
  arquivo: { readonly size: number; readonly type: string } | null,
  obrigatorio: boolean,
): string | null {
  if (arquivo === null) {
    return obrigatorio ? "Anexe a evidência da regularização." : null;
  }
  if (arquivo.size > TAMANHO_MAXIMO_DO_ARQUIVO) {
    return "O arquivo precisa ter até 10 MB.";
  }
  if (!TIPOS_DA_EVIDENCIA.includes(arquivo.type)) {
    return "Use um arquivo PDF, JPEG, PNG ou WebP.";
  }
  return null;
}

/** Revisão documental: categoria e motivo, os dois obrigatórios. */
export function lerRevisao(
  dados: FormData,
  mensagemDoMotivo: string,
): LeituraDoFormulario<{
  ofertaId: string;
  categoria: string;
  motivo: string;
}> {
  const categoria = texto(dados, "categoria");
  const motivo = textoOpcional(dados, "motivo");
  const campos: Record<string, string[]> = {};
  if (categoria === "") campos.categoria = ["Escolha a categoria."];
  if (motivo === undefined) campos.motivo = [mensagemDoMotivo];
  if (categoria === "" || motivo === undefined) {
    return {
      ok: false,
      campos,
      valores: valoresDoFormulario(dados, ["categoria", "motivo"]),
    };
  }
  return {
    ok: true,
    entrada: { ofertaId: texto(dados, "ofertaId"), categoria, motivo },
  };
}

/** Resolução do impedimento: o impedimento e o motivo; o arquivo é conferido na ação. */
export function lerResolucao(
  dados: FormData,
): LeituraDoFormulario<{ impedimentoId: string; motivo: string }> {
  const impedimentoId = texto(dados, "impedimentoId");
  const motivo = textoOpcional(dados, "motivo");
  const campos: Record<string, string[]> = {};
  if (impedimentoId === "") campos.impedimentoId = ["Escolha o impedimento."];
  if (motivo === undefined) campos.motivo = ["Informe o motivo da resolução."];
  if (impedimentoId === "" || motivo === undefined) {
    return {
      ok: false,
      campos,
      valores: valoresDoFormulario(dados, ["impedimentoId", "motivo"]),
    };
  }
  return { ok: true, entrada: { impedimentoId, motivo } };
}
