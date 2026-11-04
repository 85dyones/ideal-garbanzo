/**
 * Envio direto de arquivo pelo navegador (I3.11; ADR-0004 §10). Envolve a
 * ação do formulário: se houver arquivo, pede a URL assinada ao servidor,
 * envia o arquivo ao Storage e troca, no formulário, o arquivo pelo caminho
 * e pelo tipo. A Server Action recebe só texto, abaixo do limite de corpo da
 * Vercel (4,5 MB), e o servidor confere o arquivo no bucket antes de gravar.
 *
 * Só componentes de cliente importam este módulo.
 */
import type { DestinoDoEnvio } from "@/app/_acoes/envio";
import { clienteDoNavegador } from "@/lib/supabase/navegador";
import { CAMPO_DO_ARQUIVO, CAMPO_DO_CAMINHO, CAMPO_DO_TIPO } from "./envio";
import { estadoDeErro, type AcaoDoFormulario } from "./formulario";

const TAMANHO_MAXIMO = 10 * 1024 * 1024;

function erroDoArquivo(
  anterior: Parameters<AcaoDoFormulario>[0],
  mensagem: string,
) {
  return estadoDeErro(anterior, "Confira os campos destacados.", {
    campos: { [CAMPO_DO_ARQUIVO]: [mensagem] },
  });
}

export function comEnvioDireto(
  acao: AcaoDoFormulario,
  destino: DestinoDoEnvio,
  /** Campo do formulário com o id da oferta ou do pedido. */
  campoDoAlvo: string,
): AcaoDoFormulario {
  return async (anterior, dados) => {
    const arquivo = dados.get(CAMPO_DO_ARQUIVO);
    dados.delete(CAMPO_DO_ARQUIVO);
    if (!(arquivo instanceof File) || arquivo.size === 0) {
      return acao(anterior, dados);
    }
    if (arquivo.size > TAMANHO_MAXIMO) {
      return erroDoArquivo(anterior, "O arquivo precisa ter até 10 MB.");
    }
    const alvo = dados.get(campoDoAlvo);
    // A Server Action entra só na hora do envio: o módulo do formulário fica
    // sem a cadeia de servidor, e os testes de tela não a carregam.
    const { prepararEnvioAcao } = await import("@/app/_acoes/envio");
    const preparado = await prepararEnvioAcao(
      destino,
      typeof alvo === "string" ? alvo : "",
      arquivo.type,
      arquivo.size,
    );
    if (!preparado.ok) return erroDoArquivo(anterior, preparado.mensagem);
    const { error } = await clienteDoNavegador()
      .storage.from(preparado.bucket)
      .uploadToSignedUrl(preparado.caminho, preparado.token, arquivo, {
        contentType: arquivo.type,
      });
    if (error !== null) {
      return erroDoArquivo(
        anterior,
        "Não foi possível enviar o arquivo agora. Tente de novo.",
      );
    }
    dados.set(CAMPO_DO_CAMINHO, preparado.caminho);
    dados.set(CAMPO_DO_TIPO, arquivo.type);
    return acao(anterior, dados);
  };
}
