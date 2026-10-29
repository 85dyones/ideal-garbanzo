"use server";
/**
 * Ações da oferta do fornecedor (I2.8): criar, alterar e estender a validade,
 * declarar categorias, enviar, remover e reordenar fotos, enviar e abrir
 * documentos, enviar ou publicar, cancelar o envio, reservar, liberar,
 * retirar, reabrir e confirmar a disponibilidade. Revisar, suspender e
 * reativar ficam com a tela administrativa (I2.9).
 *
 * Cada ação chama a operação da I2.6 com a sessão do usuário; a autorização é
 * da operação e do banco. Antes, a ação converte o formato da tela (preço
 * brasileiro, números com ponto de milhar) e confere o payload com o mesmo
 * esquema da operação, só para mostrar o erro no campo certo.
 */
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { criarDependencias } from "@/lib/supabase/servidor";
import {
  esquemaDaAlteracao,
  esquemaDaCriacao,
  esquemaDaDeclaracao,
} from "@/modules/offers/schemas/ofertas";
import {
  atualizarOferta,
  confirmarDisponibilidade,
  criarOferta,
  declararCategorias,
} from "@/modules/offers/server/ofertas";
import {
  cancelarRevisao,
  liberarReserva,
  publicarOferta,
  reabrirOferta,
  reservarOferta,
  retirarOferta,
} from "@/modules/offers/server/transicoes";
import {
  TAMANHO_MAXIMO_DO_ARQUIVO,
  TIPOS_DE_ARQUIVO_DO_DOCUMENTO,
  TIPOS_DE_FOTO,
} from "@/modules/offers/storage/arquivos";
import {
  enviarDocumentoDaOferta,
  enviarFotoDaOferta,
  gerarUrlDoDocumento,
  ordenarFotoDaOferta,
  removerFotoDaOferta,
} from "@/modules/offers/storage/servidor";
import {
  estadoDeErro,
  estadoDeSucesso,
  estadoDoResultado,
  texto,
  textoOpcional,
  valoresDoFormulario,
  type EstadoDoFormulario,
} from "../_apoio/formulario";
import {
  CAMPOS_DO_ESQUEMA_DA_OFERTA,
  errosPorCampo,
  inteiroDoCampo,
  juntarErros,
  lerFormularioDaOferta,
} from "../_apoio/oferta";
import { executarOperacaoDaTela } from "./executar";

const CONFIRA = "Confira os campos destacados.";

function semCampos(objeto: Readonly<Record<string, unknown>>): boolean {
  return Object.keys(objeto).length === 0;
}

/** Primeira etapa: veículo e condições; cria o rascunho e leva à oferta. */
export async function criarOfertaAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const empresaId = texto(dados, "empresaId");
  const lido = lerFormularioDaOferta(dados, { veiculo: true, condicoes: true });
  const entrada = {
    empresaId,
    veiculo: lido.veiculo,
    ...(semCampos(lido.oferta) ? {} : { oferta: lido.oferta }),
  };
  const conferido = esquemaDaCriacao.safeParse(entrada);
  const erros = juntarErros(
    lido.erros,
    conferido.success
      ? {}
      : errosPorCampo(conferido.error, CAMPOS_DO_ESQUEMA_DA_OFERTA),
  );
  if (!semCampos(erros)) {
    return estadoDeErro(anterior, CONFIRA, {
      campos: erros,
      valores: lido.valores,
    });
  }
  const resultado = await criarOferta(await criarDependencias(), entrada);
  if (!resultado.ok) {
    return estadoDoResultado(anterior, resultado, "", {
      valores: lido.valores,
    });
  }
  redirect(
    `/empresa/${encodeURIComponent(empresaId)}/ofertas/${resultado.dados.ofertaId}`,
  );
}

/** Etapas 1 e 3: altera o veículo, as condições ou os dois, numa versão só. */
export async function alterarOfertaAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const partes = texto(dados, "partes").split(",");
  const lido = lerFormularioDaOferta(dados, {
    veiculo: partes.includes("veiculo"),
    condicoes: partes.includes("condicoes"),
  });
  const entrada = {
    ofertaId: texto(dados, "ofertaId"),
    ...(semCampos(lido.veiculo) ? {} : { veiculo: lido.veiculo }),
    ...(semCampos(lido.oferta) ? {} : { oferta: lido.oferta }),
  };
  const conferido = esquemaDaAlteracao.safeParse(entrada);
  const erros = juntarErros(
    lido.erros,
    conferido.success
      ? {}
      : errosPorCampo(conferido.error, CAMPOS_DO_ESQUEMA_DA_OFERTA),
  );
  if (!semCampos(erros)) {
    return estadoDeErro(anterior, CONFIRA, {
      campos: erros,
      valores: lido.valores,
    });
  }
  return executarOperacaoDaTela(
    anterior,
    atualizarOferta,
    entrada,
    "Alterações gravadas.",
    { valores: lido.valores },
  );
}

/** Estende (ou encurta) a validade da oferta, sem mudar a situação. */
export async function alterarValidadeAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const validaAte = textoOpcional(dados, "validaAte");
  const valores = valoresDoFormulario(dados, ["validaAte"]);
  if (validaAte === undefined) {
    return estadoDeErro(anterior, CONFIRA, {
      campos: { validaAte: ["Escolha a nova data de validade."] },
      valores,
    });
  }
  return executarOperacaoDaTela(
    anterior,
    atualizarOferta,
    { ofertaId: texto(dados, "ofertaId"), oferta: { validaAte } },
    "Validade alterada.",
    { valores },
  );
}

/**
 * Etapa 4: grava as declarações das categorias marcadas numa inclusão só, que
 * gera uma versão só. Nada é gravado se alguma marcada estiver incompleta ou
 * se o servidor recusar uma delas.
 */
export async function declararCategoriasAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const ofertaId = texto(dados, "ofertaId");
  const categorias = dados
    .getAll("categoria")
    .filter((valor): valor is string => typeof valor === "string");
  const valores = valoresDoFormulario(
    dados,
    categorias.flatMap((categoria) => [
      `valor-${categoria}`,
      `detalhe-${categoria}`,
    ]),
  );

  const pedidos: {
    categoria: string;
    valor: string;
    detalhe?: string;
  }[] = [];
  let erros: Record<string, string[]> = {};
  for (const categoria of categorias) {
    const valor = texto(dados, `valor-${categoria}`);
    if (valor === "") continue;
    const detalhe = textoOpcional(dados, `detalhe-${categoria}`);
    const entrada = {
      ofertaId,
      categoria,
      valor,
      ...(detalhe === undefined ? {} : { detalhe }),
    };
    const conferido = esquemaDaDeclaracao.safeParse(entrada);
    if (conferido.success) {
      pedidos.push({
        categoria,
        valor,
        ...(detalhe === undefined ? {} : { detalhe }),
      });
    } else {
      erros = juntarErros(
        erros,
        errosPorCampo(conferido.error, {
          valor: {
            nome: `valor-${categoria}`,
            mensagemPadrao: "Escolha uma das respostas.",
          },
          detalhe: { nome: `detalhe-${categoria}` },
        }),
      );
    }
  }
  if (!semCampos(erros)) {
    return estadoDeErro(anterior, "Confira as categorias destacadas.", {
      campos: erros,
      valores,
    });
  }
  if (pedidos.length === 0) {
    return estadoDeErro(
      anterior,
      "Marque a resposta de ao menos uma categoria.",
      { valores },
    );
  }

  const resultado = await declararCategorias(await criarDependencias(), {
    ofertaId,
    declaracoes: pedidos,
  });
  if (!resultado.ok)
    return estadoDoResultado(anterior, resultado, "", { valores });
  refresh();
  return estadoDeSucesso(
    anterior,
    pedidos.length === 1
      ? "Declaração gravada."
      : `${String(pedidos.length)} declarações gravadas.`,
  );
}

function arquivoDoFormulario(dados: FormData): File | null {
  const arquivo = dados.get("arquivo");
  return arquivo instanceof File && arquivo.size > 0 ? arquivo : null;
}

/** Etapa 2: envia a foto ao bucket privado e a inclui na oferta. */
export async function enviarFotoAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const arquivo = arquivoDoFormulario(dados);
  if (arquivo === null) {
    return estadoDeErro(anterior, "Escolha a foto.", {
      campos: { arquivo: ["Escolha um arquivo."] },
    });
  }
  if (arquivo.size > TAMANHO_MAXIMO_DO_ARQUIVO) {
    return estadoDeErro(anterior, CONFIRA, {
      campos: { arquivo: ["A foto precisa ter até 10 MB."] },
    });
  }
  if (!(TIPOS_DE_FOTO as readonly string[]).includes(arquivo.type)) {
    return estadoDeErro(anterior, CONFIRA, {
      campos: { arquivo: ["Use uma foto em JPEG, PNG ou WebP."] },
    });
  }
  const ordem = inteiroDoCampo(texto(dados, "ordem"));
  return executarOperacaoDaTela(
    anterior,
    enviarFotoDaOferta,
    {
      ofertaId: texto(dados, "ofertaId"),
      tipoDoArquivo: arquivo.type,
      conteudo: new Uint8Array(await arquivo.arrayBuffer()),
      ...(ordem === null ? {} : { ordem: Math.min(ordem, 999) }),
    },
    "Foto enviada.",
    { nomesDosCampos: { tipoDoArquivo: "arquivo", conteudo: "arquivo" } },
  );
}

export async function removerFotoAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  return executarOperacaoDaTela(
    anterior,
    removerFotoDaOferta,
    { fotoId: texto(dados, "fotoId") },
    "Foto removida.",
  );
}

/** Lista de `{ fotoId, ordem }` enviada pela tela; o que não for lista vai como veio e o esquema recusa. */
function lerOrdem(valor: string): unknown[] {
  try {
    const lido: unknown = JSON.parse(valor);
    return Array.isArray(lido) ? (lido as unknown[]) : [lido];
  } catch {
    return [valor];
  }
}

/** Grava a nova posição de cada foto que mudou, uma por vez. */
export async function ordenarFotosAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const mudancas = lerOrdem(texto(dados, "ordem"));
  if (mudancas.length === 0) {
    return estadoDeErro(anterior, "Nada para reordenar.");
  }
  const dependencias = await criarDependencias();
  let gravou = false;
  for (const mudanca of mudancas) {
    const resultado = await ordenarFotoDaOferta(dependencias, mudanca);
    if (!resultado.ok) {
      if (gravou) refresh();
      return estadoDoResultado(anterior, resultado, "");
    }
    gravou = true;
  }
  refresh();
  return estadoDeSucesso(anterior, "Ordem das fotos gravada.");
}

/** Etapa 5: envia o documento ao bucket privado; ele fica oculto ao comprador (D5). */
export async function enviarDocumentoAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const valores = valoresDoFormulario(dados, ["tipo", "descricao"]);
  const erros: Record<string, string[]> = {};
  if (texto(dados, "tipo") === "") {
    erros.tipo = ["Escolha o tipo do documento."];
  }
  const arquivo = arquivoDoFormulario(dados);
  if (arquivo === null) {
    erros.arquivo = ["Escolha um arquivo."];
  } else if (arquivo.size > TAMANHO_MAXIMO_DO_ARQUIVO) {
    erros.arquivo = ["O arquivo precisa ter até 10 MB."];
  } else if (
    !(TIPOS_DE_ARQUIVO_DO_DOCUMENTO as readonly string[]).includes(arquivo.type)
  ) {
    erros.arquivo = ["Use um arquivo PDF, JPEG, PNG ou WebP."];
  }
  if (arquivo === null || !semCampos(erros)) {
    return estadoDeErro(anterior, CONFIRA, { campos: erros, valores });
  }
  return executarOperacaoDaTela(
    anterior,
    enviarDocumentoDaOferta,
    {
      ofertaId: texto(dados, "ofertaId"),
      tipo: texto(dados, "tipo"),
      tipoDoArquivo: arquivo.type,
      conteudo: new Uint8Array(await arquivo.arrayBuffer()),
      descricao: textoOpcional(dados, "descricao"),
    },
    "Documento enviado.",
    {
      nomesDosCampos: { tipoDoArquivo: "arquivo", conteudo: "arquivo" },
      valores,
    },
  );
}

/** URL temporária do documento; o acesso fica registrado antes de a URL voltar. */
export async function abrirDocumentoAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const resultado = await gerarUrlDoDocumento(await criarDependencias(), {
    documentoId: texto(dados, "documentoId"),
  });
  if (!resultado.ok) return estadoDoResultado(anterior, resultado, "");
  const minutos = Math.max(
    1,
    Math.floor(resultado.dados.validadeEmSegundos / 60),
  );
  return estadoDeSucesso(
    anterior,
    `Link temporário gerado; vale por ${String(minutos)} ${minutos === 1 ? "minuto" : "minutos"}.`,
    { url: resultado.dados.url },
  );
}

/**
 * Envio à revisão ou publicação: a operação escolhe pela D10. A autorização
 * de divulgação vem da caixa marcada neste envio.
 */
export async function publicarOfertaAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const resultado = await publicarOferta(await criarDependencias(), {
    ofertaId: texto(dados, "ofertaId"),
    autorizacaoDeDivulgacao: texto(dados, "autorizacao") === "sim",
  });
  if (resultado.ok) refresh();
  return estadoDoResultado(
    anterior,
    resultado,
    resultado.ok && resultado.dados.status === "published"
      ? "Oferta publicada."
      : "Oferta enviada para revisão.",
    { nomesDosCampos: { autorizacaoDeDivulgacao: "autorizacao" } },
  );
}

export async function cancelarEnvioAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  return executarOperacaoDaTela(
    anterior,
    cancelarRevisao,
    { ofertaId: texto(dados, "ofertaId") },
    "Envio cancelado. A oferta voltou a rascunho.",
  );
}

export async function reservarOfertaAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  return executarOperacaoDaTela(
    anterior,
    reservarOferta,
    { ofertaId: texto(dados, "ofertaId") },
    "Oferta reservada.",
  );
}

export async function liberarReservaAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  return executarOperacaoDaTela(
    anterior,
    liberarReserva,
    { ofertaId: texto(dados, "ofertaId") },
    "Reserva liberada. A oferta voltou a publicada.",
  );
}

export async function retirarOfertaAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const motivo = textoOpcional(dados, "motivo");
  return executarOperacaoDaTela(
    anterior,
    retirarOferta,
    {
      ofertaId: texto(dados, "ofertaId"),
      ...(motivo === undefined ? {} : { motivo }),
    },
    "Oferta retirada.",
    { valores: valoresDoFormulario(dados, ["motivo"]) },
  );
}

export async function reabrirOfertaAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  return executarOperacaoDaTela(
    anterior,
    reabrirOferta,
    { ofertaId: texto(dados, "ofertaId") },
    "Oferta reaberta como rascunho.",
  );
}

export async function confirmarDisponibilidadeAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  return executarOperacaoDaTela(
    anterior,
    confirmarDisponibilidade,
    { ofertaId: texto(dados, "ofertaId") },
    "Disponibilidade confirmada.",
  );
}
