/**
 * Cabeçalho das áreas logadas a partir da situação lida no banco. Não decide
 * acesso: as páginas (e os layouts que protegem uma área inteira) chamam
 * `verificarAcesso` por conta própria.
 */
import type { ReactNode } from "react";
import { Cabecalho, Conteudo } from "@/components/cabecalho";
import type { Situacao } from "@/modules/auth/queries/acesso";
import {
  ehDaEquipeDaPlataforma,
  podeVerCatalogo,
} from "@/modules/auth/rules/permissoes";
import { sairAcao } from "../_acoes/sessao";

export function MolduraLogada({
  situacao,
  children,
}: {
  readonly situacao: Situacao;
  readonly children: ReactNode;
}) {
  const ativo = situacao.tipo === "ativo" ? situacao.contexto : null;
  return (
    <>
      <Cabecalho
        logado={situacao.tipo !== "anonimo"}
        equipe={ativo !== null && ehDaEquipeDaPlataforma(ativo)}
        catalogo={ativo !== null && podeVerCatalogo(ativo)}
        suspenso={situacao.tipo === "suspenso"}
        acaoDeSair={sairAcao}
      />
      <Conteudo>{children}</Conteudo>
    </>
  );
}
