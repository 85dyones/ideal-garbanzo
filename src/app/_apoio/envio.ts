/**
 * Campos do envio direto de arquivo (I3.11). O navegador envia o arquivo ao
 * Storage e troca, no formulário, o arquivo por estes dois campos; a Server
 * Action lê só o caminho e o tipo, e o servidor confere o arquivo no bucket.
 */
export const CAMPO_DO_ARQUIVO = "arquivo";
export const CAMPO_DO_CAMINHO = "caminhoDoArquivo";
export const CAMPO_DO_TIPO = "tipoDoArquivo";

export interface ArquivoEnviado {
  readonly caminho: string;
  readonly tipoDoArquivo: string;
}

/** O arquivo já enviado ao bucket, ou `null` se o formulário não trouxe nenhum. */
export function arquivoEnviado(dados: FormData): ArquivoEnviado | null {
  const caminho = dados.get(CAMPO_DO_CAMINHO);
  const tipoDoArquivo = dados.get(CAMPO_DO_TIPO);
  return typeof caminho === "string" &&
    caminho !== "" &&
    typeof tipoDoArquivo === "string"
    ? { caminho, tipoDoArquivo }
    : null;
}
