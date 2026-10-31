/**
 * Apoio das telas do convite de fornecedora (ADR-0002 §9), sem acesso a
 * dados: filtra e descreve o que as leituras de `queries/convites.ts`
 * devolvem.
 */
import type { Empresa } from "@/modules/organizations/queries/empresas";
import type { ConviteDeFornecedora } from "../queries/convites";

/**
 * Convites do próprio e-mail. A RLS mostra todos os convites à equipe da
 * plataforma; o início e a adesão mostram a cada pessoa só os dela. Sem
 * e-mail (ou sem e-mail confirmado, que o banco exige), nenhum.
 */
export function convitesDoEmail(
  convites: readonly ConviteDeFornecedora[],
  email: string | null,
): ConviteDeFornecedora[] {
  const alvo = email?.trim().toLowerCase() ?? "";
  if (alvo === "") return [];
  return convites.filter(
    (convite) => convite.email.trim().toLowerCase() === alvo,
  );
}

/**
 * Convite que libera o pedido de adesão como fornecedora: pendente, dentro
 * da validade e sem empresa. O banco usa o mais antigo; há no máximo um
 * pendente válido por e-mail e empresa.
 */
export function conviteParaEmpresaNova(
  convites: readonly ConviteDeFornecedora[],
): ConviteDeFornecedora | undefined {
  return convites
    .filter(
      (convite) =>
        convite.empresaId === null && convite.situacao === "pendente",
    )
    .sort((a, b) => Date.parse(a.convidadoEm) - Date.parse(b.convidadoEm))[0];
}

/** Empresa do convite: "Empresa nova" quando o convite não tem empresa. */
export function empresaDoConvite(
  convite: Pick<ConviteDeFornecedora, "empresaId" | "nomeDaEmpresa">,
): string {
  if (convite.empresaId === null) return "Empresa nova";
  return convite.nomeDaEmpresa ?? "Empresa sem nome disponível";
}

/**
 * Opções da seleção do convite a uma compradora: só as ativas, por nome.
 * O banco confere de novo a compradora e o e-mail do administrador dela.
 */
export function opcoesDeCompradora(
  empresas: readonly Pick<
    Empresa,
    "id" | "nome" | "cnpj" | "tipo" | "status"
  >[],
): [string, string][] {
  return empresas
    .filter(
      (empresa) => empresa.tipo === "buyer" && empresa.status === "active",
    )
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    .map((empresa) => [empresa.id, `${empresa.nome} · CNPJ ${empresa.cnpj}`]);
}
