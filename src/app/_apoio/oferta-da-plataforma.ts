/**
 * Leitura dos formulários das ações da plataforma sobre a oferta (I2.9). Só
 * confere o que falta, para o erro sair em português no campo certo: a
 * categoria fora da lista e o motivo em branco. As regras (quem age, em que
 * estado, formato do motivo) ficam na operação e no banco.
 */
import {
  CATEGORIAS_DA_SUSPENSAO,
  type CategoriaDaSuspensao,
} from "@/modules/offers/rules/oferta";
import { texto, textoOpcional, valoresDoFormulario } from "./formulario";

export type LeituraDoFormulario<T> =
  | { readonly ok: true; readonly entrada: T }
  | {
      readonly ok: false;
      readonly campos: Readonly<Record<string, readonly string[]>>;
      readonly valores: Readonly<Record<string, string>>;
    };

export const MENSAGEM_DA_CATEGORIA = "Escolha a categoria da suspensão.";

function ehCategoriaDaSuspensao(valor: string): valor is CategoriaDaSuspensao {
  return CATEGORIAS_DA_SUSPENSAO.some((categoria) => categoria === valor);
}

/** Oferta e motivo obrigatório (devolução, reativação, retirada pela plataforma). */
export function lerMotivoObrigatorio(
  dados: FormData,
  mensagem: string,
): LeituraDoFormulario<{ ofertaId: string; motivo: string }> {
  const motivo = textoOpcional(dados, "motivo");
  if (motivo === undefined) {
    return {
      ok: false,
      campos: { motivo: [mensagem] },
      valores: valoresDoFormulario(dados, ["motivo"]),
    };
  }
  return { ok: true, entrada: { ofertaId: texto(dados, "ofertaId"), motivo } };
}

/** Suspensão: categoria fechada da §6.10 e motivo, os dois obrigatórios. */
export function lerSuspensao(dados: FormData): LeituraDoFormulario<{
  ofertaId: string;
  categoria: CategoriaDaSuspensao;
  motivo: string;
}> {
  const categoria = texto(dados, "categoria");
  const motivo = textoOpcional(dados, "motivo");
  const campos: Record<string, string[]> = {};
  if (!ehCategoriaDaSuspensao(categoria)) {
    campos.categoria = [MENSAGEM_DA_CATEGORIA];
  }
  if (motivo === undefined) {
    campos.motivo = ["Informe o motivo da suspensão."];
  }
  if (!ehCategoriaDaSuspensao(categoria) || motivo === undefined) {
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
