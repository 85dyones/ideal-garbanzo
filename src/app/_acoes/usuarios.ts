"use server";
/** Perfis e papéis na plataforma (I1.5). Só o administrador age; a operação recusa os demais. */
import { mudarStatusDoPerfil } from "@/modules/auth/server/perfis";
import {
  alterarLeituraDeAuditoria,
  concederPapel,
  revogarPapel,
} from "@/modules/auth/server/plataforma";
import {
  texto,
  valoresDoFormulario,
  type EstadoDoFormulario,
} from "../_apoio/formulario";
import { executarOperacaoDaTela, simOuNao } from "./executar";

export async function mudarStatusDoPerfilAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const acao = texto(dados, "acao");
  return executarOperacaoDaTela(
    anterior,
    mudarStatusDoPerfil,
    {
      perfilId: texto(dados, "perfilId"),
      acao,
      motivo: texto(dados, "motivo"),
    },
    acao === "suspender" ? "Perfil suspenso." : "Perfil reativado.",
    { valores: valoresDoFormulario(dados, ["motivo"]) },
  );
}

export async function concederPapelAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  return executarOperacaoDaTela(
    anterior,
    concederPapel,
    { perfilId: texto(dados, "perfilId"), papel: texto(dados, "papel") },
    "Papel concedido.",
  );
}

export async function revogarPapelAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  return executarOperacaoDaTela(
    anterior,
    revogarPapel,
    { perfilId: texto(dados, "perfilId") },
    "Papel revogado.",
  );
}

export async function alterarLeituraDeAuditoriaAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const permitir = simOuNao(texto(dados, "permitir"));
  return executarOperacaoDaTela(
    anterior,
    alterarLeituraDeAuditoria,
    { perfilId: texto(dados, "perfilId"), permitir },
    permitir === true
      ? "Leitura da auditoria liberada."
      : "Leitura da auditoria retirada.",
  );
}
