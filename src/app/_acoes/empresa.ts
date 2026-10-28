"use server";
/**
 * Ações sobre a empresa e os membros (I1.5): dados da empresa, convite,
 * gestão e troca de papel, e o status da empresa (só administrador). Usadas
 * pela tela da empresa e pela administração.
 */
import {
  mudarStatusDaEmpresa,
  alterarDadosDaEmpresa,
} from "@/modules/organizations/server/empresas";
import {
  convidarMembro,
  gerirMembro,
  trocarPapelDoMembro,
} from "@/modules/organizations/server/membros";
import {
  texto,
  textoOuNulo,
  valoresDoFormulario,
  type EstadoDoFormulario,
} from "../_apoio/formulario";
import { executarOperacaoDaTela } from "./executar";

export async function alterarDadosDaEmpresaAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  return executarOperacaoDaTela(
    anterior,
    alterarDadosDaEmpresa,
    {
      empresaId: texto(dados, "empresaId"),
      nome: texto(dados, "nome"),
      emailDeContato: textoOuNulo(dados, "emailDeContato"),
      telefoneDeContato: textoOuNulo(dados, "telefoneDeContato"),
    },
    "Dados da empresa gravados.",
    {
      valores: valoresDoFormulario(dados, [
        "nome",
        "emailDeContato",
        "telefoneDeContato",
      ]),
    },
  );
}

export async function convidarMembroAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  return executarOperacaoDaTela(
    anterior,
    convidarMembro,
    {
      empresaId: texto(dados, "empresaId"),
      email: texto(dados, "email"),
      papel: texto(dados, "papel"),
    },
    "Convite registrado. A pessoa vê o convite ao entrar na plataforma; quem ainda não tem conta recebe um e-mail para criar a senha.",
    { valores: valoresDoFormulario(dados, ["email", "papel"]) },
  );
}

const MENSAGEM_DA_GESTAO: Readonly<Record<string, string>> = {
  suspender: "Membro suspenso.",
  reativar: "Membro reativado.",
  remover: "Membro removido.",
  cancelar_convite: "Convite cancelado.",
};

export async function gerirMembroAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const acao = texto(dados, "acao");
  return executarOperacaoDaTela(
    anterior,
    gerirMembro,
    {
      empresaId: texto(dados, "empresaId"),
      vinculoId: texto(dados, "vinculoId"),
      acao,
    },
    MENSAGEM_DA_GESTAO[acao] ?? "Feito.",
  );
}

export async function trocarPapelDoMembroAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  return executarOperacaoDaTela(
    anterior,
    trocarPapelDoMembro,
    {
      empresaId: texto(dados, "empresaId"),
      vinculoId: texto(dados, "vinculoId"),
      papel: texto(dados, "papel"),
    },
    "Papel alterado.",
  );
}

const MENSAGEM_DO_STATUS: Readonly<Record<string, string>> = {
  suspender: "Empresa suspensa.",
  reativar: "Empresa reativada.",
  encerrar: "Empresa encerrada.",
};

export async function mudarStatusDaEmpresaAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const acao = texto(dados, "acao");
  return executarOperacaoDaTela(
    anterior,
    mudarStatusDaEmpresa,
    {
      empresaId: texto(dados, "empresaId"),
      acao,
      motivo: texto(dados, "motivo"),
    },
    MENSAGEM_DO_STATUS[acao] ?? "Feito.",
    { valores: valoresDoFormulario(dados, ["motivo"]) },
  );
}
