/**
 * Revisão do pedido de adesão (§8 `reviewMembershipApplication`; ADR-0002
 * §2.5, §2.9 e §2.12; respostas Q2).
 *
 * - O operador e o administrador movem o pedido para análise.
 * - Só o administrador grava a conferência, envia evidência, decide e gera a
 *   URL temporária da evidência.
 * - Na aprovação, o gatilho do banco cria a empresa e o vínculo `org_admin`
 *   na mesma transação; o servidor só altera o pedido.
 *
 * O servidor confere o papel antes (camada 2); o banco decide de novo com as
 * políticas e os gatilhos, com o ator da sessão.
 */
import { createHash, randomUUID } from "node:crypto";
import type { Dependencias } from "@/lib/operacao/dependencias";
import {
  falha,
  sucesso,
  traduzirErroDoBanco,
  type Resultado,
} from "@/lib/operacao/resultado";
import { registrarAcessoRestrito } from "@/modules/audit/server/acesso-restrito";
import { comRastreio } from "@/modules/audit/server/rastreio";
import {
  ehAdministrador,
  ehDaEquipeDaPlataforma,
} from "@/modules/auth/rules/permissoes";
import { executarOperacao } from "@/modules/auth/server/operacao";
import {
  BUCKET_DA_EVIDENCIA,
  EXTENSAO_DO_TIPO,
  conteudoConfereComOTipo,
} from "../rules/evidencia";
import {
  esquemaDaConferencia,
  esquemaDaDecisao,
  esquemaDaEvidencia,
  esquemaDaUrlDaEvidencia,
  esquemaDoPedidoEmAnalise,
} from "../schemas/adesao";

/** Validade da URL temporária da evidência, em segundos. */
const VALIDADE_DA_URL = 300;

/** `submitted` → `under_review`, por administrador ou operador (Q2). */
export function moverPedidoParaAnalise(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<{ pedidoId: string }>> {
  return executarOperacao(
    dependencias,
    esquemaDoPedidoEmAnalise,
    entrada,
    async ({ pedidoId }, contexto) => {
      if (!ehDaEquipeDaPlataforma(contexto)) return falha("sem_permissao");
      const { data, error } = await comRastreio(
        dependencias.sessao
          .from("membership_applications")
          .update({ status: "under_review" })
          .eq("id", pedidoId)
          .eq("status", "submitted")
          .select("id"),
        dependencias.requestId,
      ).overrideTypes<{ id: string }[], { merge: false }>();
      if (error !== null) return traduzirErroDoBanco(error);
      if (data.length === 0) {
        return falha("regra_violada", "O pedido não está aguardando análise.");
      }
      return sucesso({ pedidoId });
    },
  );
}

/** Grava ou substitui a lista do que foi conferido, enquanto o pedido está aberto. */
export function registrarConferencia(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<{ pedidoId: string }>> {
  return executarOperacao(
    dependencias,
    esquemaDaConferencia,
    entrada,
    async ({ pedidoId, itens }, contexto) => {
      if (!ehAdministrador(contexto)) return falha("sem_permissao");
      const existente = await dependencias.sessao
        .from("membership_application_reviews")
        .select("application_id")
        .eq("application_id", pedidoId)
        .maybeSingle();
      if (existente.error !== null) return traduzirErroDoBanco(existente.error);

      // Sem upsert: o PostgREST incluiria `application_id` no UPDATE do
      // conflito, e o GRANT de alteração cobre só `checklist`.
      const gravacao =
        existente.data === null
          ? dependencias.sessao
              .from("membership_application_reviews")
              .insert({ application_id: pedidoId, checklist: itens })
          : dependencias.sessao
              .from("membership_application_reviews")
              .update({ checklist: itens })
              .eq("application_id", pedidoId);
      const { error } = await comRastreio(gravacao, dependencias.requestId);
      if (error !== null) {
        // Pedido inexistente cai na chave estrangeira: mesma resposta de "sem permissão".
        if (error.code === "23503") return falha("sem_permissao");
        return traduzirErroDoBanco(error);
      }
      return sucesso({ pedidoId });
    },
  );
}

export interface EvidenciaEnviada {
  readonly evidenciaId: string;
  readonly sha256: string;
}

/**
 * Envia o arquivo ao bucket privado e registra a evidência. O arquivo vai
 * primeiro, porque o gatilho exige o objeto no Storage. Se o registro falhar
 * depois do envio, o arquivo fica sem referência (ninguém apaga no bucket);
 * a evidência só vale pela linha em `membership_evidence_files`.
 */
export function enviarEvidencia(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<EvidenciaEnviada>> {
  return executarOperacao(
    dependencias,
    esquemaDaEvidencia,
    entrada,
    async (dados, contexto) => {
      if (!ehAdministrador(contexto)) return falha("sem_permissao");
      if (!conteudoConfereComOTipo(dados.conteudo, dados.tipoDoArquivo)) {
        return falha(
          "entrada_invalida",
          "O conteúdo do arquivo não corresponde ao tipo informado.",
        );
      }
      const caminho = `${dados.pedidoId}/${randomUUID()}.${EXTENSAO_DO_TIPO[dados.tipoDoArquivo]}`;
      const sha256 = createHash("sha256").update(dados.conteudo).digest("hex");

      const envio = await dependencias.sessao.storage
        .from(BUCKET_DA_EVIDENCIA)
        .upload(caminho, dados.conteudo, {
          contentType: dados.tipoDoArquivo,
          upsert: false,
        });
      if (envio.error !== null) return falha("sem_permissao");

      const { data, error } = await comRastreio(
        dependencias.sessao
          .from("membership_evidence_files")
          .insert({
            application_id: dados.pedidoId,
            storage_path: caminho,
            sha256,
            content_type: dados.tipoDoArquivo,
            size_bytes: dados.conteudo.byteLength,
            description: dados.descricao ?? null,
          })
          .select("id")
          .single(),
        dependencias.requestId,
      ).overrideTypes<{ id: string }, { merge: false }>();
      if (error !== null) return traduzirErroDoBanco(error);
      return sucesso({ evidenciaId: data.id, sha256 });
    },
  );
}

export interface Decisao {
  readonly pedidoId: string;
  readonly status: "approved" | "rejected";
  /** Empresa criada na aprovação; `null` na rejeição. */
  readonly organizationId: string | null;
}

/**
 * Aprova ou rejeita. Revisor e data vêm do banco (`auth.uid()` e `now()`);
 * na aprovação, o gatilho exige a conferência, a evidência deste pedido e o
 * CNPJ livre, e cria a empresa e o vínculo, ou não grava nada.
 */
export function decidirPedido(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<Decisao>> {
  return executarOperacao(
    dependencias,
    esquemaDaDecisao,
    entrada,
    async (dados, contexto) => {
      if (!ehAdministrador(contexto)) return falha("sem_permissao");
      const alteracao =
        dados.decisao === "aprovar"
          ? {
              status: "approved",
              cnpj_checked_at: dados.cnpjConferidoEm,
              cnpj_check_source: dados.fonteDaConferencia,
              cnpj_check_evidence_id: dados.evidenciaId,
            }
          : { status: "rejected", decision_reason: dados.motivo };
      const { data, error } = await comRastreio(
        dependencias.sessao
          .from("membership_applications")
          .update(
            dados.dadosDeTeste === undefined
              ? alteracao
              : { ...alteracao, is_test: dados.dadosDeTeste },
          )
          .eq("id", dados.pedidoId)
          .select("id, status, organization_id"),
        dependencias.requestId,
      ).overrideTypes<
        {
          id: string;
          status: "approved" | "rejected";
          organization_id: string | null;
        }[],
        { merge: false }
      >();
      if (error !== null) {
        if (error.code === "23503") {
          return falha(
            "regra_violada",
            "A evidência precisa ser deste pedido.",
          );
        }
        return traduzirErroDoBanco(error);
      }
      const linha = data[0];
      if (linha === undefined) return falha("sem_permissao");
      return sucesso({
        pedidoId: linha.id,
        status: linha.status,
        organizationId: linha.organization_id,
      });
    },
  );
}

/**
 * URL temporária para o administrador ver a evidência. O acesso é registrado
 * em `restricted_access_logs` antes de a URL ser devolvida; sem registro, sem
 * URL (ADR-0002 §2.5).
 */
export function gerarUrlDaEvidencia(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<{ url: string; validadeEmSegundos: number }>> {
  return executarOperacao(
    dependencias,
    esquemaDaUrlDaEvidencia,
    entrada,
    async ({ evidenciaId }, contexto) => {
      if (!ehAdministrador(contexto)) return falha("sem_permissao");
      const evidencia = await dependencias.sessao
        .from("membership_evidence_files")
        .select("storage_path")
        .eq("id", evidenciaId)
        .maybeSingle()
        .overrideTypes<{ storage_path: string }, { merge: false }>();
      if (evidencia.error !== null) return traduzirErroDoBanco(evidencia.error);
      if (evidencia.data === null) return falha("sem_permissao");

      const assinada = await dependencias.sessao.storage
        .from(BUCKET_DA_EVIDENCIA)
        .createSignedUrl(evidencia.data.storage_path, VALIDADE_DA_URL);
      if (assinada.error !== null) return falha("sem_permissao");

      const registrado = await registrarAcessoRestrito(
        dependencias.administrativo(),
        {
          atorPerfilId: contexto.perfilId,
          atorEmpresaId: null,
          tipoDoRecurso: "membership_evidence_file",
          recursoId: evidenciaId,
          requestId: dependencias.requestId,
        },
      );
      if (!registrado) return falha("falha");
      return sucesso({
        url: assinada.data.signedUrl,
        validadeEmSegundos: VALIDADE_DA_URL,
      });
    },
  );
}
