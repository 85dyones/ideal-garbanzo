import type { Metadata } from "next";
import { RegistroInexistente, SemPermissao } from "@/components/estados";
import { verificarAcesso } from "@/modules/auth/queries/acesso";
import { podeVerCatalogo } from "@/modules/auth/rules/permissoes";

export const metadata: Metadata = { title: "Oferta" };

/**
 * Ficha provisória da oferta (teste 1, CT1.1 e CT1.4). A checagem vem antes
 * de qualquer leitura; o id só entra no caminho de volta do login. Sem
 * acesso, a resposta é a mesma para qualquer id. Com acesso, todo id é
 * "Registro inexistente", porque a tabela de ofertas só existe no Inc. 4.
 */
export default async function PaginaDaOferta({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const acesso = await verificarAcesso(
    `/comprador/ofertas/${encodeURIComponent(id)}`,
    podeVerCatalogo,
  );
  if (!acesso.liberado) return <SemPermissao />;
  return (
    <RegistroInexistente
      voltarPara="/comprador"
      rotuloDaVolta="Voltar ao catálogo"
    />
  );
}
