/**
 * Leituras comuns às operações da oferta, sempre com a sessão do usuário: a
 * RLS decide o que ele vê. Oferta alheia e inexistente dão a mesma resposta,
 * "sem permissão" (CT2.10).
 */
import type { Dependencias } from "@/lib/operacao/dependencias";
import {
  falha,
  sucesso,
  traduzirErroDoBanco,
  type Resultado,
} from "@/lib/operacao/resultado";
import type { StatusDaOferta } from "../rules/transicoes";

export interface OfertaLida {
  readonly id: string;
  readonly status: StatusDaOferta;
  readonly empresaId: string;
  readonly validaAte: string | null;
}

interface LinhaDaOferta {
  id: string;
  status: StatusDaOferta;
  supplier_organization_id: string;
  valid_until: string | null;
}

export async function lerOferta(
  dependencias: Dependencias,
  ofertaId: string,
): Promise<Resultado<OfertaLida>> {
  const { data, error } = await dependencias.sessao
    .from("offers")
    .select("id, status, supplier_organization_id, valid_until")
    .eq("id", ofertaId)
    .maybeSingle()
    .overrideTypes<LinhaDaOferta, { merge: false }>();
  if (error !== null) return traduzirErroDoBanco(error);
  if (data === null) return falha("sem_permissao");
  return sucesso({
    id: data.id,
    status: data.status,
    empresaId: data.supplier_organization_id,
    validaAte: data.valid_until,
  });
}

/**
 * Valor vigente da D10 (`offer_review_required`); `null` se a leitura
 * falhar. Sem a chave, vale o padrão do banco (`private.revisao_exigida`):
 * revisão exigida.
 */
export async function revisaoExigida(
  dependencias: Dependencias,
): Promise<boolean | null> {
  const { data, error } = await dependencias.sessao
    .from("platform_settings")
    .select("value")
    .eq("key", "offer_review_required")
    .maybeSingle()
    .overrideTypes<{ value: unknown }, { merge: false }>();
  if (error !== null) return null;
  return data?.value !== false;
}
