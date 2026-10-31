import type { Metadata } from "next";
import {
  convidarFornecedoraAcao,
  revogarConviteDeFornecedoraAcao,
} from "@/app/_acoes/convites-de-fornecedora";
import { formatarDataHora } from "@/app/_apoio/datas";
import { SemPermissao, Vazio } from "@/components/estados";
import { Pagina, Secao } from "@/components/pagina";
import { verificarAcesso } from "@/modules/auth/queries/acesso";
import {
  ehAdministrador,
  ehDaEquipeDaPlataforma,
} from "@/modules/auth/rules/permissoes";
import { listarConvitesDeFornecedora } from "@/modules/membership/queries/convites";
import {
  empresaDoConvite,
  opcoesDeCompradora,
} from "@/modules/membership/ui/convites";
import {
  FormularioDoConviteDeFornecedora,
  RevogacaoDoConvite,
} from "@/modules/membership/ui/convites-de-fornecedora";
import {
  conviteRevogavel,
  rotuloDaSituacaoDoConvite,
} from "@/modules/membership/ui/rotulos";
import { listarEmpresas } from "@/modules/organizations/queries/empresas";

export const metadata: Metadata = {
  title: "Convites de fornecedora · Administração",
};

const COMO_FUNCIONA =
  "A empresa fornecedora entra só por convite. Sem empresa, o convite libera o pedido de adesão como fornecedora; para uma compradora ativa, ele vai a um administrador dela, que aceita no início. Mostra os 200 convites mais recentes.";

/**
 * Convites de fornecedora (I1.10; ADR-0002 §9). A equipe da plataforma vê a
 * lista; só o administrador convida e revoga, e as operações recusam os
 * demais, mesmo que a tela mostre o botão.
 */
export default async function PaginaDosConvites() {
  const acesso = await verificarAcesso(
    "/admin/convites",
    ehDaEquipeDaPlataforma,
  );
  if (!acesso.liberado) return <SemPermissao />;
  const { contexto, sessao } = acesso;
  const administrador = ehAdministrador(contexto);
  const [convites, empresasAtivas] = await Promise.all([
    listarConvitesDeFornecedora(sessao),
    administrador ? listarEmpresas(sessao, "active") : Promise.resolve([]),
  ]);

  return (
    <Pagina
      titulo="Convites de fornecedora"
      descricao={
        administrador
          ? COMO_FUNCIONA
          : `${COMO_FUNCIONA} Só o administrador convida e revoga.`
      }
    >
      {administrador ? (
        <Secao titulo="Novo convite">
          <FormularioDoConviteDeFornecedora
            acao={convidarFornecedoraAcao}
            compradoras={opcoesDeCompradora(empresasAtivas)}
          />
        </Secao>
      ) : null}
      <Secao titulo="Convites">
        {convites.length === 0 ? (
          <Vazio>Nenhum convite de fornecedora.</Vazio>
        ) : (
          <ul
            aria-label="Convites de fornecedora"
            className="flex flex-col divide-y divide-neutral-200 rounded border border-neutral-300 bg-white"
          >
            {convites.map((convite) => (
              <li
                key={convite.id}
                aria-label={convite.email}
                className="flex flex-col gap-2 p-3"
              >
                <div>
                  <p className="font-medium break-words">{convite.email}</p>
                  <p className="text-sm text-neutral-700">
                    {empresaDoConvite(convite)} ·{" "}
                    <span>{rotuloDaSituacaoDoConvite(convite.situacao)}</span>
                  </p>
                  <p className="text-sm text-neutral-700">
                    Convidado em {formatarDataHora(convite.convidadoEm)} ·
                    válido até {formatarDataHora(convite.venceEm)}
                    {convite.usadoEm === null
                      ? ""
                      : ` · usado em ${formatarDataHora(convite.usadoEm)}`}
                    {convite.revogadoEm === null
                      ? ""
                      : ` · revogado em ${formatarDataHora(convite.revogadoEm)}`}
                  </p>
                </div>
                {administrador ? (
                  <RevogacaoDoConvite
                    conviteId={convite.id}
                    revogavel={conviteRevogavel(convite.situacao)}
                    acao={revogarConviteDeFornecedoraAcao}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </Pagina>
  );
}
