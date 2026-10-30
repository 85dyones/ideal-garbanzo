"use server";
/**
 * Ações do domínio documental (I3.6), na etapa "Consultas" do fornecedor e no
 * detalhe da oferta da administração: registrar consulta com evidência
 * opcional, abrir a evidência, abrir e fechar a revisão documental e resolver
 * o impedimento de transferência.
 *
 * Cada ação chama a operação da I3.5 com a sessão do usuário; quem decide é a
 * operação e o banco (ADR-0004 §2.15). Antes, a ação só confere o que falta no
 * formulário e o arquivo, e passa o payload pelo mesmo esquema da operação,
 * para o erro sair no campo certo. A URL da evidência só volta depois do
 * registro do acesso, e nunca vai para o HTML antes do clique.
 */
import { criarDependencias } from "@/lib/supabase/servidor";
import { esquemaDaConsulta } from "@/modules/documental/schemas/consultas";
import {
  abrirRevisaoDocumental,
  fecharRevisaoDocumental,
  gerarUrlDaEvidencia,
  registrarConsulta,
  resolverImpedimento,
} from "@/modules/documental/server/consultas";
import {
  CAMPOS_DO_ESQUEMA_DA_CONSULTA,
  erroDoArquivo,
  lerConsulta,
  lerResolucao,
  lerRevisao,
} from "../_apoio/documental";
import {
  estadoDeErro,
  estadoDeSucesso,
  estadoDoResultado,
  texto,
  valoresDoFormulario,
  type EstadoDoFormulario,
} from "../_apoio/formulario";
import { errosPorCampo, juntarErros } from "../_apoio/oferta";
import { executarOperacaoDaTela } from "./executar";

const CONFIRA = "Confira os campos destacados.";

function arquivoDoFormulario(dados: FormData): File | null {
  const arquivo = dados.get("arquivo");
  return arquivo instanceof File && arquivo.size > 0 ? arquivo : null;
}

async function evidenciaDoArquivo(arquivo: File): Promise<{
  tipoDoArquivo: string;
  conteudo: Uint8Array;
}> {
  return {
    tipoDoArquivo: arquivo.type,
    conteudo: new Uint8Array(await arquivo.arrayBuffer()),
  };
}

/** Registro manual da consulta (§6.3), com a evidência quando houver. */
export async function registrarConsultaAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const lido = lerConsulta(dados);
  const arquivo = arquivoDoFormulario(dados);
  const erroDoAnexo = erroDoArquivo(arquivo, false);
  const entrada: Record<string, unknown> = { ...lido.entrada };
  if (arquivo !== null && erroDoAnexo === null) {
    entrada.evidencia = await evidenciaDoArquivo(arquivo);
  }
  const conferido = esquemaDaConsulta.safeParse(entrada);
  const erros = juntarErros(
    lido.erros,
    erroDoAnexo === null ? {} : { arquivo: [erroDoAnexo] },
    conferido.success
      ? {}
      : errosPorCampo(conferido.error, CAMPOS_DO_ESQUEMA_DA_CONSULTA),
  );
  if (Object.keys(erros).length > 0) {
    return estadoDeErro(anterior, CONFIRA, {
      campos: erros,
      valores: lido.valores,
    });
  }
  return executarOperacaoDaTela(
    anterior,
    registrarConsulta,
    entrada,
    entrada.evidencia === undefined
      ? "Consulta registrada, sem evidência anexada."
      : "Consulta registrada, com a evidência.",
    { nomesDosCampos: { evidencia: "arquivo" }, valores: lido.valores },
  );
}

/**
 * URL temporária da evidência; o acesso fica registrado antes de a URL voltar.
 * O instante em que ela deixa de valer vai em `valores.expiraEm`, contado de
 * antes da chamada, para a tela nunca prometer mais do que a URL vale
 * (TV-I3.6-09).
 */
export async function abrirEvidenciaAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const pedidoEm = Date.now();
  const resultado = await gerarUrlDaEvidencia(await criarDependencias(), {
    evidenciaId: texto(dados, "evidenciaId"),
  });
  if (!resultado.ok) return estadoDoResultado(anterior, resultado, "");
  const expiraEm = new Date(
    pedidoEm + resultado.dados.validadeEmSegundos * 1000,
  ).toISOString();
  return estadoDeSucesso(anterior, "Link temporário gerado.", {
    url: resultado.dados.url,
    valores: { expiraEm },
  });
}

/** A equipe abre a revisão documental de uma categoria, com motivo. */
export async function abrirRevisaoDocumentalAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const lido = lerRevisao(dados, "Informe o motivo da abertura.");
  if (!lido.ok) {
    return estadoDeErro(anterior, CONFIRA, {
      campos: lido.campos,
      valores: lido.valores,
    });
  }
  return executarOperacaoDaTela(
    anterior,
    abrirRevisaoDocumental,
    lido.entrada,
    "Revisão aberta. A categoria fica em análise até a revisão ser fechada.",
    { valores: valoresDoFormulario(dados, ["categoria", "motivo"]) },
  );
}

/** A equipe fecha a revisão documental de uma categoria, com motivo. */
export async function fecharRevisaoDocumentalAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const lido = lerRevisao(dados, "Informe o motivo do fechamento.");
  if (!lido.ok) {
    return estadoDeErro(anterior, CONFIRA, {
      campos: lido.campos,
      valores: lido.valores,
    });
  }
  return executarOperacaoDaTela(
    anterior,
    fecharRevisaoDocumental,
    lido.entrada,
    "Revisão fechada. O motivo ficou registrado.",
    { valores: valoresDoFormulario(dados, ["categoria", "motivo"]) },
  );
}

/** Só o administrador resolve o impedimento, com motivo e evidência (E21). */
export async function resolverImpedimentoAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const lido = lerResolucao(dados);
  const arquivo = arquivoDoFormulario(dados);
  const erroDoAnexo = erroDoArquivo(arquivo, true);
  if (!lido.ok || erroDoAnexo !== null || arquivo === null) {
    return estadoDeErro(anterior, CONFIRA, {
      campos: juntarErros(
        lido.ok ? {} : lido.campos,
        erroDoAnexo === null ? {} : { arquivo: [erroDoAnexo] },
      ),
      valores: valoresDoFormulario(dados, ["impedimentoId", "motivo"]),
    });
  }
  return executarOperacaoDaTela(
    anterior,
    resolverImpedimento,
    { ...lido.entrada, evidencia: await evidenciaDoArquivo(arquivo) },
    "Impedimento resolvido. O motivo e a evidência ficaram registrados.",
    {
      nomesDosCampos: { evidencia: "arquivo" },
      valores: valoresDoFormulario(dados, ["impedimentoId", "motivo"]),
    },
  );
}
