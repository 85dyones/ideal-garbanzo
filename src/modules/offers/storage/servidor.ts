/**
 * Fotos e documentos da oferta no Storage (ADR-0003 §2.13; teste 6 da §7.4).
 *
 * - O envio usa a sessão do usuário: a política do bucket e o gatilho da linha
 *   decidem quem envia, com o ator verdadeiro. O arquivo vai primeiro, porque
 *   a linha exige o objeto no bucket. Se a linha falhar depois do envio, o
 *   arquivo fica sem referência (ninguém apaga no bucket) e não aparece.
 * - Foto: a URL temporária sai com a sessão de quem pede, pela política de
 *   leitura do bucket.
 * - Documento: o bucket não tem política de leitura. O servidor lê a linha com
 *   a sessão (a RLS decide quem vê), confere a permissão de novo, grava em
 *   `restricted_access_logs` e só então gera a URL com a chave secreta. Sem
 *   registro, sem URL.
 *
 * O staff não envia arquivo (Q3): o servidor exige vínculo ativo com a empresa
 * dona antes de chegar ao Storage.
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
  ehDaEquipeDaPlataforma,
  vinculoAtivo,
} from "@/modules/auth/rules/permissoes";
import { executarOperacao } from "@/modules/auth/server/operacao";
import {
  BUCKET_DAS_FOTOS,
  BUCKET_DOS_DOCUMENTOS,
  VALIDADE_DA_URL_DA_FOTO,
  VALIDADE_DA_URL_DO_DOCUMENTO,
  caminhoDoArquivo,
  conteudoConfere,
} from "./arquivos";
import {
  esquemaDaFoto,
  esquemaDaUrlDaFoto,
  esquemaDaUrlDoDocumento,
  esquemaDoDocumento,
} from "./esquemas";

interface OfertaVisivel {
  readonly id: string;
  readonly supplier_organization_id: string;
}

export interface UrlTemporaria {
  readonly url: string;
  readonly validadeEmSegundos: number;
}

/** A oferta que a sessão enxerga; oferta alheia e inexistente dão a mesma resposta. */
async function ofertaVisivel(
  dependencias: Dependencias,
  ofertaId: string,
): Promise<Resultado<OfertaVisivel>> {
  const { data, error } = await dependencias.sessao
    .from("offers")
    .select("id, supplier_organization_id")
    .eq("id", ofertaId)
    .maybeSingle()
    .overrideTypes<OfertaVisivel, { merge: false }>();
  if (error !== null) return traduzirErroDoBanco(error);
  if (data === null) return falha("sem_permissao");
  return sucesso(data);
}

const CONTEUDO_TROCADO =
  "O conteúdo do arquivo não corresponde ao tipo informado.";

/** Envia a foto ao bucket e registra a linha em `offer_media`. */
export function enviarFotoDaOferta(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<{ fotoId: string }>> {
  return executarOperacao(
    dependencias,
    esquemaDaFoto,
    entrada,
    async (dados, contexto) => {
      if (!conteudoConfere(dados.conteudo, dados.tipoDoArquivo)) {
        return falha("entrada_invalida", CONTEUDO_TROCADO);
      }
      const oferta = await ofertaVisivel(dependencias, dados.ofertaId);
      if (!oferta.ok) return oferta;
      const empresaId = oferta.dados.supplier_organization_id;
      if (vinculoAtivo(contexto, empresaId) === undefined) {
        return falha("sem_permissao");
      }
      const caminho = caminhoDoArquivo(
        empresaId,
        dados.ofertaId,
        randomUUID(),
        dados.tipoDoArquivo,
      );
      const envio = await dependencias.sessao.storage
        .from(BUCKET_DAS_FOTOS)
        .upload(caminho, dados.conteudo, {
          contentType: dados.tipoDoArquivo,
          upsert: false,
        });
      if (envio.error !== null) return falha("sem_permissao");

      const { data, error } = await comRastreio(
        dependencias.sessao
          .from("offer_media")
          .insert({
            offer_id: dados.ofertaId,
            storage_path: caminho,
            display_order: dados.ordem ?? 0,
          })
          .select("id")
          .single(),
        dependencias.requestId,
      ).overrideTypes<{ id: string }, { merge: false }>();
      if (error !== null) return traduzirErroDoBanco(error);
      return sucesso({ fotoId: data.id });
    },
  );
}

/** Envia o documento ao bucket e registra a linha em `offer_documents`, com o sha256. */
export function enviarDocumentoDaOferta(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<{ documentoId: string; sha256: string }>> {
  return executarOperacao(
    dependencias,
    esquemaDoDocumento,
    entrada,
    async (dados, contexto) => {
      if (!conteudoConfere(dados.conteudo, dados.tipoDoArquivo)) {
        return falha("entrada_invalida", CONTEUDO_TROCADO);
      }
      const oferta = await ofertaVisivel(dependencias, dados.ofertaId);
      if (!oferta.ok) return oferta;
      const empresaId = oferta.dados.supplier_organization_id;
      if (vinculoAtivo(contexto, empresaId) === undefined) {
        return falha("sem_permissao");
      }
      const caminho = caminhoDoArquivo(
        empresaId,
        dados.ofertaId,
        randomUUID(),
        dados.tipoDoArquivo,
      );
      const sha256 = createHash("sha256").update(dados.conteudo).digest("hex");
      const envio = await dependencias.sessao.storage
        .from(BUCKET_DOS_DOCUMENTOS)
        .upload(caminho, dados.conteudo, {
          contentType: dados.tipoDoArquivo,
          upsert: false,
        });
      if (envio.error !== null) return falha("sem_permissao");

      const { data, error } = await comRastreio(
        dependencias.sessao
          .from("offer_documents")
          .insert({
            offer_id: dados.ofertaId,
            kind: dados.tipo,
            storage_path: caminho,
            sha256,
            description: dados.descricao ?? null,
          })
          .select("id")
          .single(),
        dependencias.requestId,
      ).overrideTypes<{ id: string }, { merge: false }>();
      if (error !== null) return traduzirErroDoBanco(error);
      return sucesso({ documentoId: data.id, sha256 });
    },
  );
}

/** URL temporária da foto, com a sessão de quem pede. Foto removida não sai. */
export function gerarUrlDaFoto(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<UrlTemporaria>> {
  return executarOperacao(
    dependencias,
    esquemaDaUrlDaFoto,
    entrada,
    async ({ fotoId }) => {
      const { data, error } = await dependencias.sessao
        .from("offer_media")
        .select("storage_path, removed_at")
        .eq("id", fotoId)
        .maybeSingle()
        .overrideTypes<
          { storage_path: string; removed_at: string | null },
          { merge: false }
        >();
      if (error !== null) return traduzirErroDoBanco(error);
      // Sem linha visível ou com a foto removida, a mesma resposta.
      if (data?.removed_at !== null) return falha("sem_permissao");
      const assinada = await dependencias.sessao.storage
        .from(BUCKET_DAS_FOTOS)
        .createSignedUrl(data.storage_path, VALIDADE_DA_URL_DA_FOTO);
      if (assinada.error !== null) return falha("sem_permissao");
      return sucesso({
        url: assinada.data.signedUrl,
        validadeEmSegundos: VALIDADE_DA_URL_DA_FOTO,
      });
    },
  );
}

/**
 * URL temporária do documento. O acesso é registrado em
 * `restricted_access_logs` antes de a URL ser gerada; sem registro, sem URL.
 */
export function gerarUrlDoDocumento(
  dependencias: Dependencias,
  entrada: unknown,
): Promise<Resultado<UrlTemporaria>> {
  return executarOperacao(
    dependencias,
    esquemaDaUrlDoDocumento,
    entrada,
    async ({ documentoId }, contexto) => {
      const { data, error } = await dependencias.sessao
        .from("offer_documents")
        .select("storage_path, offer_id")
        .eq("id", documentoId)
        .maybeSingle()
        .overrideTypes<
          { storage_path: string; offer_id: string },
          { merge: false }
        >();
      if (error !== null) return traduzirErroDoBanco(error);
      if (data === null) return falha("sem_permissao");
      const oferta = await ofertaVisivel(dependencias, data.offer_id);
      if (!oferta.ok) return oferta;

      // Segunda camada antes da chave secreta: membro ativo da empresa dona ou staff.
      const empresaId = oferta.dados.supplier_organization_id;
      const membro = vinculoAtivo(contexto, empresaId) !== undefined;
      if (!membro && !ehDaEquipeDaPlataforma(contexto)) {
        return falha("sem_permissao");
      }

      const administrativo = dependencias.administrativo();
      const registrado = await registrarAcessoRestrito(administrativo, {
        atorPerfilId: contexto.perfilId,
        atorEmpresaId: membro ? empresaId : null,
        tipoDoRecurso: "offer_document",
        recursoId: documentoId,
        requestId: dependencias.requestId,
      });
      if (!registrado) return falha("falha");

      const assinada = await administrativo.storage
        .from(BUCKET_DOS_DOCUMENTOS)
        .createSignedUrl(data.storage_path, VALIDADE_DA_URL_DO_DOCUMENTO);
      if (assinada.error !== null) return falha("falha");
      return sucesso({
        url: assinada.data.signedUrl,
        validadeEmSegundos: VALIDADE_DA_URL_DO_DOCUMENTO,
      });
    },
  );
}
