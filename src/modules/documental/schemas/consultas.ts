/**
 * Esquemas das operações documentais (ADR-0004 §2.8 a §2.11; especificação
 * v1.1, §6.3). Todos são estritos: campo a mais no payload é erro. Os limites
 * repetem os CHECKs de `vehicle_checks`, e os textos livres passam pela lista
 * de linguagem proibida, como o gatilho do banco (E28).
 *
 * No piloto, o registro é manual e não leva `details`: a lista positiva de
 * chaves começa vazia e cresce com a integração automática (C7; ADR-0004
 * §2.10). O payload também não leva `is_test`, o veículo nem os autores: o
 * banco os grava.
 */
import { z } from "zod";
import { id, motivo, textoDeLinha, textoLivre } from "@/lib/operacao/campos";
import { varrerTexto } from "@/lib/linguagem-proibida";
import {
  TAMANHO_MAXIMO_DO_ARQUIVO,
  TIPOS_DE_ARQUIVO_DO_DOCUMENTO,
} from "@/modules/offers/storage/arquivos";
import { RESULTADOS_DA_CONSULTA, TIPOS_DE_FONTE } from "../rules/estados";

/** "“a”", "“a” e “b”", "“a”, “b” e “c”". */
function listaComE(itens: readonly string[]): string {
  const ultimo = itens.at(-1) ?? "";
  return itens.length <= 1
    ? ultimo
    : `${itens.slice(0, -1).join(", ")} e ${ultimo}`;
}

/**
 * Mensagem da recusa por linguagem (§6.6; TV-I3.6-01): nomeia cada termo
 * achado, como foi digitado, e diz como reescrever. Os termos vêm do
 * varredor; nenhum fica escrito aqui.
 */
export function mensagemDaLinguagem(trechos: readonly string[]): string {
  const citados = listaComE(trechos.map((trecho) => `“${trecho}”`));
  const verbo =
    trechos.length === 1
      ? "não pode aparecer sozinho"
      : "não podem aparecer sozinhos";
  return `${citados} ${verbo}. Descreva o que a fonte mostrou ou acrescente “nas fontes consultadas, em <data>”.`;
}

/** Os trechos com termo da §6.6 sem a qualificação, como digitados e sem repetir. */
export function trechosProibidos(valor: string): string[] {
  return [
    ...new Set(varrerTexto(valor).map((ocorrencia) => ocorrencia.trecho)),
  ];
}

function semLinguagemProibida<T extends z.ZodType<string>>(campo: T) {
  return campo.superRefine((valor, contexto) => {
    const trechos = trechosProibidos(valor);
    if (trechos.length > 0) {
      contexto.addIssue({
        code: "custom",
        message: mensagemDaLinguagem(trechos),
      });
    }
  });
}

const categoria = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,63}$/u, { error: "Categoria inválida." });

const conteudo = z
  .instanceof(Uint8Array)
  .refine(
    (arquivo) =>
      arquivo.byteLength > 0 && arquivo.byteLength <= TAMANHO_MAXIMO_DO_ARQUIVO,
    { error: "O arquivo precisa ter até 10 MB." },
  );

export const esquemaDaEvidencia = z.strictObject({
  tipoDoArquivo: z.enum(TIPOS_DE_ARQUIVO_DO_DOCUMENTO),
  conteudo,
});

export const esquemaDaConsulta = z.strictObject({
  ofertaId: id,
  categoria,
  fonte: semLinguagemProibida(textoDeLinha(200)),
  tipoDeFonte: z.enum(TIPOS_DE_FONTE),
  realizadaEm: z.iso
    .datetime({ offset: true, error: "Data e hora inválidas." })
    .refine((valor) => Date.parse(valor) <= Date.now(), {
      error: "A data da consulta não pode estar no futuro.",
    }),
  resultado: z.enum(RESULTADOS_DA_CONSULTA),
  resumo: semLinguagemProibida(textoLivre(2000)),
  limitacoes: semLinguagemProibida(textoLivre(2000)),
  protocolo: semLinguagemProibida(textoDeLinha(200)).optional(),
  substitui: id.optional(),
  evidencia: esquemaDaEvidencia.optional(),
});

export const esquemaDaRevisao = z.strictObject({
  ofertaId: id,
  categoria,
  motivo: semLinguagemProibida(motivo),
});

export const esquemaDaResolucao = z.strictObject({
  impedimentoId: id,
  motivo: semLinguagemProibida(motivo),
  evidencia: esquemaDaEvidencia,
});

export const esquemaDaUrlDaEvidencia = z.strictObject({ evidenciaId: id });
