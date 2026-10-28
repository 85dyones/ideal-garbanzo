/**
 * Operações sobre a empresa (ADR-0002 §2.3, §2.4 e §2.12).
 *
 * - Suspender, reativar e encerrar: só o administrador da plataforma, com
 *   motivo, que vai para a auditoria pelo cabeçalho `x-audit-reason`. Os
 *   vínculos não mudam em cascata; o acesso dos membros é calculado na hora.
 * - Nome e contatos: o `org_admin` ativo da empresa ativa ou o administrador.
 */
import type { Dependencias } from "@/lib/operacao/dependencias";
import {
  falha,
  sucesso,
  traduzirErroDoBanco,
  type Resultado,
} from "@/lib/operacao/resultado";
import { comRastreio } from "@/modules/audit/server/rastreio";
import {
  ehAdministrador,
  podeGerirEmpresa,
} from "@/modules/auth/rules/permissoes";
import { executarOperacao } from "@/modules/auth/server/operacao";
import {
  esquemaDoStatusDaEmpresa,
  esquemaDosDadosDaEmpresa,
} from "../schemas/empresas";
import type { StatusDaEmpresa } from "../tipos";

const TRANSICOES = {
  suspender: { de: ["active"], para: "suspended" },
  reativar: { de: ["suspended"], para: "active" },
  encerrar: { de: ["active", "suspended"], para: "closed" },
} as const satisfies Record<
  string,
  { de: readonly StatusDaEmpresa[]; para: StatusDaEmpresa }
>;

export function mudarStatusDaEmpresa(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<{ empresaId: string; status: StatusDaEmpresa }>> {
  return executarOperacao(
    dependencias,
    esquemaDoStatusDaEmpresa,
    entrada,
    async ({ empresaId, acao, motivo }, contexto) => {
      if (!ehAdministrador(contexto)) return falha("sem_permissao");
      const { de, para } = TRANSICOES[acao];
      const { data, error } = await comRastreio(
        dependencias.sessao
          .from("organizations")
          .update({ status: para })
          .eq("id", empresaId)
          .in("status", de)
          .select("id"),
        dependencias.requestId,
        motivo,
      ).overrideTypes<{ id: string }[], { merge: false }>();
      if (error !== null) return traduzirErroDoBanco(error);
      if (data.length === 0) {
        return falha(
          "regra_violada",
          "A empresa não está num status que permita esta ação.",
        );
      }
      return sucesso({ empresaId, status: para });
    },
  );
}

export function alterarDadosDaEmpresa(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<{ empresaId: string }>> {
  return executarOperacao(
    dependencias,
    esquemaDosDadosDaEmpresa,
    entrada,
    async (dados, contexto) => {
      if (!podeGerirEmpresa(contexto, dados.empresaId)) {
        return falha("sem_permissao");
      }
      const alteracao: Record<string, string | null> = {};
      if (dados.nome !== undefined) alteracao.name = dados.nome;
      if (dados.emailDeContato !== undefined) {
        alteracao.contact_email = dados.emailDeContato;
      }
      if (dados.telefoneDeContato !== undefined) {
        alteracao.contact_phone = dados.telefoneDeContato;
      }
      const { data, error } = await comRastreio(
        dependencias.sessao
          .from("organizations")
          .update(alteracao)
          .eq("id", dados.empresaId)
          .select("id"),
        dependencias.requestId,
      ).overrideTypes<{ id: string }[], { merge: false }>();
      if (error !== null) return traduzirErroDoBanco(error);
      if (data.length === 0) return falha("sem_permissao");
      return sucesso({ empresaId: dados.empresaId });
    },
  );
}
