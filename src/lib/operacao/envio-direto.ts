/**
 * Envio direto de arquivo ao Storage (I3.11; ADR-0004 §10; R-AG-06).
 *
 * A Vercel recusa corpo de requisição acima de 4,5 MB, então o arquivo não
 * passa pela Server Action:
 * 1. o servidor confere a permissão da operação e pede ao Storage uma URL
 *    assinada de envio, com a sessão de quem age: a política de inclusão do
 *    bucket decide de novo;
 * 2. o navegador envia o arquivo direto ao Storage, com o token;
 * 3. o servidor baixa o arquivo, confere tamanho, tipo pelo conteúdo e sha256,
 *    e só então grava a linha, com a sessão. Arquivo que não confere é apagado.
 *
 * A leitura e a remoção do passo 3 usam a chave secreta, depois da checagem de
 * permissão da operação (ADR-0002 §2.12): o bucket das evidências não tem
 * política de leitura.
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { falha, sucesso, type Resultado } from "./resultado";

export interface EnvioPreparado {
  readonly bucket: string;
  readonly caminho: string;
  readonly token: string;
}

export interface ArquivoConferido {
  readonly sha256: string;
  readonly tamanho: number;
}

const CONTEUDO_TROCADO =
  "O conteúdo do arquivo não corresponde ao tipo informado.";

/** Passo 1: a URL assinada, criada com a sessão (a política de inclusão decide). */
export async function prepararUrlDeEnvio(
  sessao: SupabaseClient,
  bucket: string,
  caminho: string,
): Promise<Resultado<EnvioPreparado>> {
  const { data, error } = await sessao.storage
    .from(bucket)
    .createSignedUploadUrl(caminho);
  if (error !== null) return falha("sem_permissao");
  return sucesso({ bucket, caminho: data.path, token: data.token });
}

/**
 * Passo 3: o arquivo que chegou ao bucket, conferido. Fora do tamanho ou com
 * conteúdo de outro tipo, ele é apagado e a operação recusa.
 */
export async function conferirArquivoEnviado(
  administrativo: SupabaseClient,
  bucket: string,
  caminho: string,
  conferencia: {
    readonly tipo: string;
    readonly tamanhoMaximo: number;
    readonly confere: (conteudo: Uint8Array, tipo: string) => boolean;
  },
): Promise<Resultado<ArquivoConferido>> {
  const { data, error } = await administrativo.storage
    .from(bucket)
    .download(caminho);
  if (error !== null) {
    return falha(
      "regra_violada",
      "O arquivo não chegou ao armazenamento. Envie de novo.",
    );
  }
  const conteudo = new Uint8Array(await data.arrayBuffer());
  const foraDoTamanho =
    conteudo.byteLength === 0 ||
    conteudo.byteLength > conferencia.tamanhoMaximo;
  if (foraDoTamanho || !conferencia.confere(conteudo, conferencia.tipo)) {
    await administrativo.storage.from(bucket).remove([caminho]);
    return falha(
      "entrada_invalida",
      foraDoTamanho ? "O arquivo precisa ter até 10 MB." : CONTEUDO_TROCADO,
    );
  }
  return sucesso({
    sha256: createHash("sha256").update(conteudo).digest("hex"),
    tamanho: conteudo.byteLength,
  });
}
