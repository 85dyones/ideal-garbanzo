"use server";
/**
 * Revisão do pedido de adesão pela equipe da plataforma (I1.5): mover para
 * análise, conferência, evidência, URL temporária e decisão. As operações
 * recusam o operador onde só o administrador age, mesmo que a tela mostre o
 * botão.
 */
import {
  decidirPedido,
  enviarEvidencia,
  gerarUrlDaEvidencia,
  moverPedidoParaAnalise,
  registrarConferencia,
} from "@/modules/membership/server/revisao";
import {
  estadoDeErro,
  estadoDeSucesso,
  estadoDoResultado,
  texto,
  textoOpcional,
  valoresDoFormulario,
  type EstadoDoFormulario,
} from "../_apoio/formulario";
import { criarDependencias } from "@/lib/supabase/servidor";
import { arquivoEnviado } from "../_apoio/envio";
import { executarOperacaoDaTela } from "./executar";

export async function moverParaAnaliseAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  return executarOperacaoDaTela(
    anterior,
    moverPedidoParaAnalise,
    { pedidoId: texto(dados, "pedidoId") },
    "Pedido movido para análise.",
  );
}

/** A lista vem do formulário como JSON; texto que não é JSON vai como veio e o esquema recusa. */
function lerItens(valor: string): unknown {
  try {
    return JSON.parse(valor) as unknown;
  } catch {
    return valor;
  }
}

export async function registrarConferenciaAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  return executarOperacaoDaTela(
    anterior,
    registrarConferencia,
    {
      pedidoId: texto(dados, "pedidoId"),
      itens: lerItens(texto(dados, "itens")),
    },
    "Conferência gravada.",
  );
}

export async function enviarEvidenciaAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const valores = valoresDoFormulario(dados, ["descricao"]);
  // O navegador já enviou o arquivo ao bucket (I3.11); aqui chega só o caminho.
  const enviado = arquivoEnviado(dados);
  if (enviado === null) {
    return estadoDeErro(anterior, "Escolha o arquivo da evidência.", {
      campos: { arquivo: ["Escolha um arquivo."] },
      valores,
    });
  }
  return executarOperacaoDaTela(
    anterior,
    enviarEvidencia,
    {
      pedidoId: texto(dados, "pedidoId"),
      tipoDoArquivo: enviado.tipoDoArquivo,
      caminho: enviado.caminho,
      descricao: textoOpcional(dados, "descricao"),
    },
    "Evidência enviada.",
    {
      nomesDosCampos: { tipoDoArquivo: "arquivo", caminho: "arquivo" },
      valores,
    },
  );
}

/** Gera a URL temporária; o acesso fica registrado antes de a URL voltar. */
export async function verEvidenciaAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const resultado = await gerarUrlDaEvidencia(await criarDependencias(), {
    evidenciaId: texto(dados, "evidenciaId"),
  });
  if (!resultado.ok) return estadoDoResultado(anterior, resultado, "");
  const minutos = Math.max(
    1,
    Math.floor(resultado.dados.validadeEmSegundos / 60),
  );
  return estadoDeSucesso(
    anterior,
    `Link temporário gerado; vale por ${String(minutos)} minutos.`,
    { url: resultado.dados.url },
  );
}

export async function decidirPedidoAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const decisao = texto(dados, "decisao");
  const dadosDeTeste =
    texto(dados, "dadosDeTeste") === "sim" ? { dadosDeTeste: true } : {};
  const entrada =
    decisao === "rejeitar"
      ? {
          pedidoId: texto(dados, "pedidoId"),
          decisao,
          motivo: texto(dados, "motivo"),
          ...dadosDeTeste,
        }
      : {
          pedidoId: texto(dados, "pedidoId"),
          decisao,
          cnpjConferidoEm: texto(dados, "cnpjConferidoEm"),
          fonteDaConferencia: texto(dados, "fonteDaConferencia"),
          evidenciaId: texto(dados, "evidenciaId"),
          ...dadosDeTeste,
        };
  return executarOperacaoDaTela(
    anterior,
    decidirPedido,
    entrada,
    decisao === "rejeitar"
      ? "Pedido recusado."
      : "Pedido aceito. A empresa e o vínculo do requerente foram criados.",
    {
      valores: valoresDoFormulario(dados, [
        "decisao",
        "fonteDaConferencia",
        "motivo",
      ]),
    },
  );
}
