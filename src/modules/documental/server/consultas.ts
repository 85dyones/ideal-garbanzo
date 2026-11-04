/**
 * Consultas, evidências, revisões e impedimentos (especificação v1.1, §6.3,
 * §6.11 e §8; ADR-0004 §2.5, §2.8, §2.9, §2.11 e §2.15).
 *
 * - Tudo usa a sessão do usuário: a RLS, a política do bucket e os gatilhos
 *   decidem, com o ator verdadeiro. O servidor confere antes o ator e o estado
 *   da oferta, para responder cedo com erro previsível.
 * - A evidência vai primeiro ao bucket `check-evidence` e à tabela
 *   `check_evidence_files`; a consulta (ou a resolução do impedimento) aponta
 *   para ela depois. Se a segunda escrita falhar, a evidência fica registrada
 *   sem uso, como o arquivo da oferta na I2.4.
 * - A URL da evidência sai só pelo servidor, com registro em
 *   `restricted_access_logs` antes; sem registro, sem URL.
 * - O motivo da revisão e da resolução vai no cabeçalho `x-audit-reason`, e o
 *   gatilho o grava na linha (ADR-0002 §2.11).
 */
import { randomUUID } from "node:crypto";
import type { Dependencias } from "@/lib/operacao/dependencias";
import {
  conferirArquivoEnviado,
  prepararUrlDeEnvio,
  type EnvioPreparado,
} from "@/lib/operacao/envio-direto";
import {
  falha,
  sucesso,
  traduzirErroDoBanco,
  type Resultado,
} from "@/lib/operacao/resultado";
import { registrarAcessoRestrito } from "@/modules/audit/server/acesso-restrito";
import { comRastreio } from "@/modules/audit/server/rastreio";
import { vinculoAtivo } from "@/modules/auth/rules/permissoes";
import { executarOperacao } from "@/modules/auth/server/operacao";
import {
  MENSAGEM_DA_VALIDADE_VENCIDA,
  vencidaAntesDaExpiracao,
} from "@/modules/offers/rules/edicao";
import {
  ROTULO_DO_STATUS,
  atorDaOferta,
  validadeVencida,
} from "@/modules/offers/rules/transicoes";
import { lerOferta, type OfertaLida } from "@/modules/offers/server/leitura";
import {
  TAMANHO_MAXIMO_DO_ARQUIVO,
  caminhoConfere,
  caminhoDoArquivo,
  conteudoConfere,
  type TipoDeArquivoDoDocumento,
} from "@/modules/offers/storage/arquivos";
import {
  ehDaEquipeSemVinculo,
  podeRegistrarConsulta,
  podeResolverImpedimento,
  podeRevisarDocumentacao,
} from "../rules/registro";
import {
  esquemaDaConsulta,
  esquemaDoEnvioDaEvidencia,
  esquemaDaResolucao,
  esquemaDaRevisao,
  esquemaDaUrlDaEvidencia,
} from "../schemas/consultas";
import type { z } from "zod";

export const BUCKET_DAS_EVIDENCIAS = "check-evidence";
/** Validade da URL da evidência, em segundos. Técnica e provisória, como a do documento. */
export const VALIDADE_DA_URL_DA_EVIDENCIA = 60;

type Evidencia = z.infer<typeof esquemaDaConsulta>["evidencia"] & object;

/** Recusa por estado: a vencida tem mensagem própria (ADR-0003 §2.9). */
function estadoRecusado(oferta: OfertaLida, acao: string) {
  if (
    vencidaAntesDaExpiracao(oferta.status, validadeVencida(oferta.validaAte))
  ) {
    return falha("regra_violada", MENSAGEM_DA_VALIDADE_VENCIDA);
  }
  return falha(
    "regra_violada",
    `A oferta em "${ROTULO_DO_STATUS[oferta.status]}" não ${acao}.`,
  );
}

/**
 * Passo 1 do envio direto da evidência (I3.11): a URL assinada nasce com a
 * sessão, e a política do bucket (`check_evidence_envio`) decide quem envia,
 * nos estados da E17.
 */
export function prepararEnvioDaEvidencia(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<EnvioPreparado>> {
  return executarOperacao(
    dependencias,
    esquemaDoEnvioDaEvidencia,
    entrada,
    async (dados, contexto) => {
      const lida = await lerOferta(dependencias, dados.ofertaId);
      if (!lida.ok) return lida;
      const ator = atorDaOferta(contexto, lida.dados.empresaId);
      if (ator === "nenhum" || ator === "sistema") {
        return falha("sem_permissao");
      }
      return prepararUrlDeEnvio(
        dependencias.sessao,
        BUCKET_DAS_EVIDENCIAS,
        caminhoDoArquivo(
          lida.dados.empresaId,
          lida.dados.id,
          randomUUID(),
          dados.tipoDoArquivo,
        ),
      );
    },
  );
}

/** Passo 3: confere a evidência que chegou ao bucket e registra a linha, com o sha256. */
async function enviarEvidencia(
  dependencias: Dependencias,
  oferta: OfertaLida,
  evidencia: Evidencia,
): Promise<Resultado<{ evidenciaId: string }>> {
  if (
    !caminhoConfere(
      evidencia.caminho,
      oferta.empresaId,
      oferta.id,
      evidencia.tipoDoArquivo,
    )
  ) {
    return falha("sem_permissao");
  }
  const arquivo = await conferirArquivoEnviado(
    dependencias.administrativo(),
    BUCKET_DAS_EVIDENCIAS,
    evidencia.caminho,
    {
      tipo: evidencia.tipoDoArquivo,
      tamanhoMaximo: TAMANHO_MAXIMO_DO_ARQUIVO,
      confere: (conteudo, tipo) =>
        conteudoConfere(conteudo, tipo as TipoDeArquivoDoDocumento),
    },
  );
  if (!arquivo.ok) return arquivo;
  const { data, error } = await comRastreio(
    dependencias.sessao
      .from("check_evidence_files")
      .insert({
        offer_id: oferta.id,
        storage_path: evidencia.caminho,
        sha256: arquivo.dados.sha256,
        content_type: evidencia.tipoDoArquivo,
        size_bytes: arquivo.dados.tamanho,
      })
      .select("id")
      .single(),
    dependencias.requestId,
  ).overrideTypes<{ id: string }, { merge: false }>();
  if (error !== null) return traduzirErroDoBanco(error);
  return sucesso({ evidenciaId: data.id });
}

/** `recordCheck`: consulta manual, com a evidência quando houver. */
export function registrarConsulta(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<{ consultaId: string; evidenciaId: string | null }>> {
  return executarOperacao(
    dependencias,
    esquemaDaConsulta,
    entrada,
    async (dados, contexto) => {
      const lida = await lerOferta(dependencias, dados.ofertaId);
      if (!lida.ok) return lida;
      const oferta = lida.dados;
      const ator = atorDaOferta(contexto, oferta.empresaId);
      if (ator === "nenhum" || ator === "sistema") {
        return falha("sem_permissao");
      }
      if (
        !podeRegistrarConsulta(
          oferta.status,
          ator,
          validadeVencida(oferta.validaAte),
        )
      ) {
        return estadoRecusado(oferta, "recebe consulta nem evidência");
      }

      let evidenciaId: string | null = null;
      if (dados.evidencia !== undefined) {
        const enviada = await enviarEvidencia(
          dependencias,
          oferta,
          dados.evidencia,
        );
        if (!enviada.ok) return enviada;
        evidenciaId = enviada.dados.evidenciaId;
      }

      const { data, error } = await comRastreio(
        dependencias.sessao
          .from("vehicle_checks")
          .insert({
            offer_id: oferta.id,
            category: dados.categoria,
            source_name: dados.fonte,
            source_type: dados.tipoDeFonte,
            method: "manual",
            performed_at: dados.realizadaEm,
            result: dados.resultado,
            result_summary: dados.resumo,
            known_limitations: dados.limitacoes,
            protocol: dados.protocolo ?? null,
            supersedes_check_id: dados.substitui ?? null,
            evidence_document_id: evidenciaId,
          })
          .select("id")
          .single(),
        dependencias.requestId,
      ).overrideTypes<{ id: string }, { merge: false }>();
      if (error !== null) return traduzirErroDoBanco(error);
      return sucesso({ consultaId: data.id, evidenciaId });
    },
  );
}

function mudarRevisao(
  acao: "open_review" | "close_review",
): (
  dependencias: Dependencias,
  entrada: unknown,
) => Promise<Resultado<{ revisaoId: string }>> {
  return (dependencias, entrada) =>
    executarOperacao(
      dependencias,
      esquemaDaRevisao,
      entrada,
      async (dados, contexto) => {
        const lida = await lerOferta(dependencias, dados.ofertaId);
        if (!lida.ok) return lida;
        const oferta = lida.dados;
        const ator = atorDaOferta(contexto, oferta.empresaId);
        if (!ehDaEquipeSemVinculo(ator)) return falha("sem_permissao");
        if (
          !podeRevisarDocumentacao(
            oferta.status,
            ator,
            validadeVencida(oferta.validaAte),
          )
        ) {
          return estadoRecusado(oferta, "recebe revisão documental");
        }
        const { data, error } = await comRastreio(
          dependencias.sessao
            .from("documental_reviews")
            .insert({
              offer_id: oferta.id,
              category: dados.categoria,
              action: acao,
            })
            .select("id")
            .single(),
          dependencias.requestId,
          dados.motivo,
        ).overrideTypes<{ id: string }, { merge: false }>();
        if (error !== null) return traduzirErroDoBanco(error);
        return sucesso({ revisaoId: data.id });
      },
    );
}

/** `openDocumentalReview`: a equipe abre a análise da categoria, com motivo. */
export const abrirRevisaoDocumental = mudarRevisao("open_review");

/** `closeDocumentalReview`: a equipe fecha a análise da categoria, com motivo. */
export const fecharRevisaoDocumental = mudarRevisao("close_review");

/** Resolução do impedimento: só o administrador, com motivo e evidência (E21). */
export function resolverImpedimento(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<{ impedimentoId: string; evidenciaId: string }>> {
  return executarOperacao(
    dependencias,
    esquemaDaResolucao,
    entrada,
    async (dados, contexto) => {
      const { data: impedimento, error: erroDaLeitura } =
        await dependencias.sessao
          .from("transfer_impediments")
          .select("id, offer_id, status")
          .eq("id", dados.impedimentoId)
          .maybeSingle()
          .overrideTypes<
            { id: string; offer_id: string; status: string },
            { merge: false }
          >();
      if (erroDaLeitura !== null) return traduzirErroDoBanco(erroDaLeitura);
      if (impedimento === null) return falha("sem_permissao");
      const lida = await lerOferta(dependencias, impedimento.offer_id);
      if (!lida.ok) return lida;
      const oferta = lida.dados;
      const ator = atorDaOferta(contexto, oferta.empresaId);
      if (!podeResolverImpedimento(ator)) {
        return falha(
          "sem_permissao",
          "Só o administrador da plataforma resolve impedimento.",
        );
      }
      if (impedimento.status !== "identified") {
        return falha("regra_violada", "O impedimento já foi resolvido.");
      }
      // A evidência da resolução entra pelo mesmo bucket das consultas, que só
      // aceita envio nos estados da E17 (ADR-0004 §2.9).
      if (
        !podeRegistrarConsulta(
          oferta.status,
          ator,
          validadeVencida(oferta.validaAte),
        )
      ) {
        return estadoRecusado(
          oferta,
          "recebe a evidência da resolução; reabra a oferta antes",
        );
      }

      const enviada = await enviarEvidencia(
        dependencias,
        oferta,
        dados.evidencia,
      );
      if (!enviada.ok) return enviada;

      const { data, error } = await comRastreio(
        dependencias.sessao
          .from("transfer_impediments")
          .update({
            status: "resolved",
            resolution_evidence_id: enviada.dados.evidenciaId,
          })
          .eq("id", impedimento.id)
          .eq("status", "identified")
          .select("id"),
        dependencias.requestId,
        dados.motivo,
      ).overrideTypes<{ id: string }[], { merge: false }>();
      if (error !== null) return traduzirErroDoBanco(error);
      if (data.length === 0) {
        return falha("regra_violada", "O impedimento já foi resolvido.");
      }
      return sucesso({
        impedimentoId: impedimento.id,
        evidenciaId: enviada.dados.evidenciaId,
      });
    },
  );
}

/** URL temporária da evidência: só pelo servidor, com registro antes. */
export function gerarUrlDaEvidencia(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<{ url: string; validadeEmSegundos: number }>> {
  return executarOperacao(
    dependencias,
    esquemaDaUrlDaEvidencia,
    entrada,
    async ({ evidenciaId }, contexto) => {
      const { data, error } = await dependencias.sessao
        .from("check_evidence_files")
        .select("storage_path, offer_id")
        .eq("id", evidenciaId)
        .maybeSingle()
        .overrideTypes<
          { storage_path: string; offer_id: string },
          { merge: false }
        >();
      if (error !== null) return traduzirErroDoBanco(error);
      if (data === null) return falha("sem_permissao");
      const lida = await lerOferta(dependencias, data.offer_id);
      if (!lida.ok) return lida;

      // Segunda camada antes da chave secreta: membro ativo da empresa dona ou equipe.
      const empresaId = lida.dados.empresaId;
      const membro = vinculoAtivo(contexto, empresaId) !== undefined;
      if (!membro && !ehDaEquipeSemVinculo(atorDaOferta(contexto, empresaId))) {
        return falha("sem_permissao");
      }

      const administrativo = dependencias.administrativo();
      const registrado = await registrarAcessoRestrito(administrativo, {
        atorPerfilId: contexto.perfilId,
        atorEmpresaId: membro ? empresaId : null,
        tipoDoRecurso: "check_evidence",
        recursoId: evidenciaId,
        requestId: dependencias.requestId,
      });
      if (!registrado) return falha("falha");

      const assinada = await administrativo.storage
        .from(BUCKET_DAS_EVIDENCIAS)
        .createSignedUrl(data.storage_path, VALIDADE_DA_URL_DA_EVIDENCIA);
      if (assinada.error !== null) return falha("falha");
      return sucesso({
        url: assinada.data.signedUrl,
        validadeEmSegundos: VALIDADE_DA_URL_DA_EVIDENCIA,
      });
    },
  );
}
