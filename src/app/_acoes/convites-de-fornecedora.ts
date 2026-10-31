"use server";
/**
 * Convite de fornecedora (I1.10; ADR-0002 §9): o administrador da plataforma
 * convida e revoga; o `org_admin` da compradora convidada aceita no início.
 * As operações recusam quem não pode agir, mesmo que a tela mostre o botão,
 * e o banco decide de novo.
 */
import {
  aceitarConviteDeFornecedora,
  convidarFornecedora,
  revogarConviteDeFornecedora,
} from "@/modules/membership/server/convites";
import {
  texto,
  textoOpcional,
  valoresDoFormulario,
  type EstadoDoFormulario,
} from "../_apoio/formulario";
import { executarOperacaoDaTela } from "./executar";

/** A mesma resposta para e-mail com ou sem conta, para não revelar quem já está na plataforma. */
export async function convidarFornecedoraAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  return executarOperacaoDaTela(
    anterior,
    convidarFornecedora,
    {
      email: texto(dados, "email"),
      empresaId: textoOpcional(dados, "empresaId"),
    },
    "Convite registrado. A pessoa vê o convite ao entrar na plataforma; quem ainda não tem conta recebe um e-mail para criar a senha.",
    { valores: valoresDoFormulario(dados, ["email", "empresaId"]) },
  );
}

export async function revogarConviteDeFornecedoraAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  return executarOperacaoDaTela(
    anterior,
    revogarConviteDeFornecedora,
    { conviteId: texto(dados, "conviteId") },
    "Convite revogado.",
  );
}

export async function aceitarConviteDeFornecedoraAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  return executarOperacaoDaTela(
    anterior,
    aceitarConviteDeFornecedora,
    { conviteId: texto(dados, "conviteId") },
    "Convite aceito. A empresa passa a atuar como fornecedora e compradora.",
  );
}
