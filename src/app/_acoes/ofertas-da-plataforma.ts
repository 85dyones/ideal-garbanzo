"use server";
/**
 * Ações da plataforma sobre a oferta (I2.9), pela tela administrativa:
 * revisar (publicar ou devolver com motivo), suspender com categoria e motivo,
 * reativar com motivo, retirar com motivo, reservar e liberar a reserva.
 *
 * Cada ação chama a operação da I2.6 com a sessão do usuário; quem decide é a
 * operação e o gatilho do banco, inclusive o conflito de interesse (B25). Antes,
 * a ação só confere o que falta no formulário, para o erro sair em português no
 * campo certo. Depois de gravar, revalida as telas da oferta da administração
 * e do fornecedor e volta ao detalhe com a mensagem do resultado.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Resultado } from "@/lib/operacao/resultado";
import { criarDependencias } from "@/lib/supabase/servidor";
import {
  liberarReserva,
  reativarOferta,
  reservarOferta,
  retirarOferta,
  revisarOferta,
  suspenderOferta,
  type MudancaDeStatus,
} from "@/modules/offers/server/transicoes";
import type { ResultadoDaPlataforma } from "@/modules/offers/ui/plataforma";
import {
  estadoDeErro,
  estadoDoResultado,
  texto,
  valoresDoFormulario,
  type EstadoDoFormulario,
} from "../_apoio/formulario";
import {
  lerMotivoObrigatorio,
  lerSuspensao,
  type LeituraDoFormulario,
} from "../_apoio/oferta-da-plataforma";

const CONFIRA = "Confira os campos destacados.";

/**
 * Lista e detalhe da administração e todas as telas da oferta do fornecedor
 * (os caminhos seguem os arquivos, com o grupo da rota).
 */
function revalidarAsTelasDaOferta(): void {
  revalidatePath("/(admin)/admin/ofertas", "layout");
  revalidatePath("/(conta)/empresa/[empresaId]/ofertas", "layout");
}

/** Com sucesso, revalida e volta ao detalhe com o resultado; com falha, mostra o erro no formulário. */
function concluir(
  anterior: EstadoDoFormulario,
  resultado: Resultado<MudancaDeStatus>,
  feito: ResultadoDaPlataforma,
  valores?: Readonly<Record<string, string>>,
): EstadoDoFormulario {
  if (!resultado.ok) {
    return estadoDoResultado(
      anterior,
      resultado,
      "",
      valores === undefined ? {} : { valores },
    );
  }
  revalidarAsTelasDaOferta();
  redirect(
    `/admin/ofertas/${encodeURIComponent(resultado.dados.ofertaId)}?resultado=${feito}`,
  );
}

function faltaCampo(
  anterior: EstadoDoFormulario,
  lido: Extract<LeituraDoFormulario<unknown>, { ok: false }>,
): EstadoDoFormulario {
  return estadoDeErro(anterior, CONFIRA, {
    campos: lido.campos,
    valores: lido.valores,
  });
}

/** Revisão (T04 e T05): publicar, ou devolver à empresa fornecedora com motivo. */
export async function revisarOfertaAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const decisao = texto(dados, "decisao");
  if (decisao === "devolver") {
    const lido = lerMotivoObrigatorio(dados, "Informe o motivo da devolução.");
    if (!lido.ok) return faltaCampo(anterior, lido);
    const resultado = await revisarOferta(await criarDependencias(), {
      ...lido.entrada,
      decisao,
    });
    return concluir(
      anterior,
      resultado,
      "devolvida",
      valoresDoFormulario(dados, ["motivo"]),
    );
  }
  // "publicar", ou um valor fora da lista, que o esquema da operação recusa.
  const resultado = await revisarOferta(await criarDependencias(), {
    ofertaId: texto(dados, "ofertaId"),
    decisao,
  });
  return concluir(anterior, resultado, "publicada");
}

/** Suspensão (T14): categoria da §6.10 e motivo, os dois obrigatórios. */
export async function suspenderOfertaAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const lido = lerSuspensao(dados);
  if (!lido.ok) return faltaCampo(anterior, lido);
  const resultado = await suspenderOferta(
    await criarDependencias(),
    lido.entrada,
  );
  return concluir(
    anterior,
    resultado,
    "suspensa",
    valoresDoFormulario(dados, ["categoria", "motivo"]),
  );
}

/** Reativação (T15): só o administrador, com motivo; a oferta volta a rascunho. */
export async function reativarOfertaAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const lido = lerMotivoObrigatorio(dados, "Informe o motivo da reativação.");
  if (!lido.ok) return faltaCampo(anterior, lido);
  const resultado = await reativarOferta(
    await criarDependencias(),
    lido.entrada,
  );
  return concluir(
    anterior,
    resultado,
    "reativada",
    valoresDoFormulario(dados, ["motivo"]),
  );
}

/** Retirada pela plataforma (T11): o motivo é obrigatório para a equipe. */
export async function retirarOfertaPelaPlataformaAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const lido = lerMotivoObrigatorio(dados, "Informe o motivo da retirada.");
  if (!lido.ok) return faltaCampo(anterior, lido);
  const resultado = await retirarOferta(
    await criarDependencias(),
    lido.entrada,
  );
  return concluir(
    anterior,
    resultado,
    "retirada",
    valoresDoFormulario(dados, ["motivo"]),
  );
}

/** Reserva pela plataforma (T08). */
export async function reservarOfertaPelaPlataformaAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const resultado = await reservarOferta(await criarDependencias(), {
    ofertaId: texto(dados, "ofertaId"),
  });
  return concluir(anterior, resultado, "reservada");
}

/** Liberação da reserva pela plataforma (T09). */
export async function liberarReservaPelaPlataformaAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const resultado = await liberarReserva(await criarDependencias(), {
    ofertaId: texto(dados, "ofertaId"),
  });
  return concluir(anterior, resultado, "liberada");
}
