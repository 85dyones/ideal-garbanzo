"use server";
/**
 * Passo 1 do envio direto de arquivo (I3.11): a operação de cada destino
 * confere a permissão e devolve a URL assinada. O arquivo não passa por aqui.
 */
import { prepararEnvioDaEvidencia as prepararEnvioDaEvidenciaDaConsulta } from "@/modules/documental/server/consultas";
import { prepararEnvioDaEvidencia as prepararEnvioDaEvidenciaDaAdesao } from "@/modules/membership/server/revisao";
import {
  prepararEnvioDaFoto,
  prepararEnvioDoDocumento,
} from "@/modules/offers/storage/servidor";
import { criarDependencias } from "@/lib/supabase/servidor";

export type DestinoDoEnvio =
  "foto" | "documento" | "evidencia-da-consulta" | "evidencia-da-adesao";

export type RespostaDoEnvio =
  | {
      readonly ok: true;
      readonly bucket: string;
      readonly caminho: string;
      readonly token: string;
    }
  | { readonly ok: false; readonly mensagem: string };

export async function prepararEnvioAcao(
  destino: DestinoDoEnvio,
  alvoId: string,
  tipoDoArquivo: string,
  tamanho: number,
): Promise<RespostaDoEnvio> {
  const dependencias = await criarDependencias();
  const arquivo = { tipoDoArquivo, tamanho };
  const resultado =
    destino === "foto"
      ? await prepararEnvioDaFoto(dependencias, {
          ofertaId: alvoId,
          ...arquivo,
        })
      : destino === "documento"
        ? await prepararEnvioDoDocumento(dependencias, {
            ofertaId: alvoId,
            ...arquivo,
          })
        : destino === "evidencia-da-consulta"
          ? await prepararEnvioDaEvidenciaDaConsulta(dependencias, {
              ofertaId: alvoId,
              ...arquivo,
            })
          : await prepararEnvioDaEvidenciaDaAdesao(dependencias, {
              pedidoId: alvoId,
              ...arquivo,
            });
  if (!resultado.ok) {
    if (resultado.campos?.tipoDoArquivo !== undefined) {
      return {
        ok: false,
        mensagem:
          destino === "foto"
            ? "Use uma foto em JPEG, PNG ou WebP."
            : "Use um arquivo PDF, JPEG, PNG ou WebP.",
      };
    }
    return {
      ok: false,
      mensagem: resultado.campos?.tamanho?.[0] ?? resultado.mensagem,
    };
  }
  return { ok: true, ...resultado.dados };
}
