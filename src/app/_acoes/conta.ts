"use server";
/** Ações do próprio usuário: responder convite e enviar o pedido de adesão (I1.5). */
import { enviarPedidoDeAdesao } from "@/modules/membership/server/adesao";
import { responderConvite } from "@/modules/organizations/server/membros";
import {
  texto,
  textoOpcional,
  valoresDoFormulario,
  type EstadoDoFormulario,
} from "../_apoio/formulario";
import { executarOperacaoDaTela } from "./executar";

export async function responderConviteAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const resposta = texto(dados, "resposta");
  const aceitar =
    resposta === "aceitar" ? true : resposta === "recusar" ? false : resposta;
  return executarOperacaoDaTela(
    anterior,
    responderConvite,
    { empresaId: texto(dados, "empresaId"), aceitar },
    aceitar === true ? "Convite aceito." : "Convite recusado.",
  );
}

const CAMPOS_DO_PEDIDO = [
  "nomeDaEmpresa",
  "razaoSocial",
  "cnpj",
  "emailDeContato",
  "telefoneDeContato",
  "tipo",
] as const;

export async function enviarPedidoDeAdesaoAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  return executarOperacaoDaTela(
    anterior,
    enviarPedidoDeAdesao,
    {
      nomeDaEmpresa: texto(dados, "nomeDaEmpresa"),
      razaoSocial: texto(dados, "razaoSocial"),
      cnpj: texto(dados, "cnpj"),
      emailDeContato: textoOpcional(dados, "emailDeContato"),
      telefoneDeContato: textoOpcional(dados, "telefoneDeContato"),
      tipo: texto(dados, "tipo"),
    },
    "Pedido enviado. Acompanhe o status pelo início.",
    { valores: valoresDoFormulario(dados, CAMPOS_DO_PEDIDO) },
  );
}
