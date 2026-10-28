/**
 * Moldura das operações de servidor (ADR-0002 §2.3 e §2.4): revalida o
 * usuário no banco, valida o payload com esquema estrito e só então executa.
 * Exceção inesperada vira `falha`, sem detalhe para a interface.
 */
import type { z } from "zod";
import type { Dependencias } from "@/lib/operacao/dependencias";
import {
  entradaInvalida,
  falha,
  type Resultado,
} from "@/lib/operacao/resultado";
import type { ContextoDoUsuario } from "../tipos";
import { carregarContexto } from "./contexto";

export async function executarOperacao<Esquema extends z.ZodType, Saida>(
  dependencias: Dependencias,
  esquema: Esquema,
  entrada: unknown,
  acao: (
    dados: z.output<Esquema>,
    contexto: ContextoDoUsuario,
  ) => Promise<Resultado<Saida>>,
): Promise<Resultado<Saida>> {
  try {
    const contexto = await carregarContexto(dependencias.sessao);
    if (!contexto.ok) return contexto;
    const lido = esquema.safeParse(entrada);
    if (!lido.success) return entradaInvalida(lido.error);
    return await acao(lido.data, contexto.dados);
  } catch {
    return falha("falha");
  }
}
