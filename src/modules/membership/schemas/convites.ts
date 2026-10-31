/**
 * Esquemas do convite de fornecedora (ADR-0002 §9). Estritos, como os da
 * adesão: campo a mais no payload é erro (teste 4).
 */
import { z } from "zod";
import { email, id } from "@/lib/operacao/campos";

export const esquemaDoConviteDeFornecedora = z.strictObject({
  email,
  /** Compradora ativa que passa a fornecer também; sem ela, o convite é para empresa nova. */
  empresaId: id.optional(),
});

export const esquemaDoConviteDeFornecedoraEmUso = z.strictObject({
  conviteId: id,
});
