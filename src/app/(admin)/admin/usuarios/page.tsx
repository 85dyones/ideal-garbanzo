import type { Metadata } from "next";
import {
  alterarLeituraDeAuditoriaAcao,
  concederPapelAcao,
  mudarStatusDoPerfilAcao,
  revogarPapelAcao,
} from "@/app/_acoes/usuarios";
import { formatarDataHora } from "@/app/_apoio/datas";
import { SemPermissao, Vazio } from "@/components/estados";
import { Pagina } from "@/components/pagina";
import { verificarAcesso } from "@/modules/auth/queries/acesso";
import {
  listarPapeisNaPlataforma,
  listarPerfis,
} from "@/modules/auth/queries/perfis";
import {
  ehAdministrador,
  ehDaEquipeDaPlataforma,
} from "@/modules/auth/rules/permissoes";
import {
  ROTULO_DO_PAPEL_NA_PLATAFORMA,
  ROTULO_DO_STATUS_DO_PAPEL,
  ROTULO_DO_STATUS_DO_PERFIL,
} from "@/modules/auth/ui/rotulos";
import { AcoesDoUsuario } from "@/modules/auth/ui/usuarios";

export const metadata: Metadata = {
  title: "Usuários · Administração",
};

export default async function PaginaDosUsuarios() {
  const acesso = await verificarAcesso(
    "/admin/usuarios",
    ehDaEquipeDaPlataforma,
  );
  if (!acesso.liberado) return <SemPermissao />;
  const { contexto, sessao } = acesso;
  const administrador = ehAdministrador(contexto);
  const [perfis, papeis] = await Promise.all([
    listarPerfis(sessao),
    listarPapeisNaPlataforma(sessao),
  ]);

  return (
    <Pagina
      titulo="Usuários e papéis"
      descricao={
        administrador
          ? "Mostra os 200 perfis mais recentes."
          : "Mostra os 200 perfis mais recentes. Só o administrador altera perfis e papéis; o operador vê apenas o próprio papel."
      }
    >
      {perfis.length === 0 ? (
        <Vazio>Nenhum perfil cadastrado.</Vazio>
      ) : (
        <ul className="flex flex-col divide-y divide-gray-200 rounded border border-gray-300 bg-white">
          {perfis.map((perfil) => {
            const papel = papeis.get(perfil.id);
            const papelAtivo = papel?.status === "active" ? papel.papel : null;
            const proprio = perfil.id === contexto.perfilId;
            return (
              <li
                key={perfil.id}
                className="flex flex-col gap-2 p-3"
                aria-label={perfil.email ?? perfil.nome}
              >
                <div>
                  <p className="font-medium">
                    {perfil.nome === "" ? "—" : perfil.nome}
                    {proprio ? " (você)" : ""}
                  </p>
                  <p className="text-sm text-gray-700">
                    {perfil.email ?? "—"} ·{" "}
                    {ROTULO_DO_STATUS_DO_PERFIL[perfil.status]} · desde{" "}
                    {formatarDataHora(perfil.criadoEm)}
                  </p>
                  {papel === undefined ? null : (
                    <p className="text-sm text-gray-700">
                      {ROTULO_DO_PAPEL_NA_PLATAFORMA[papel.papel]} (
                      {ROTULO_DO_STATUS_DO_PAPEL[papel.status].toLowerCase()})
                      {papel.papel === "operator" && papel.podeLerAuditoria
                        ? " · lê a auditoria"
                        : ""}
                    </p>
                  )}
                </div>
                {administrador && !proprio ? (
                  <AcoesDoUsuario
                    perfilId={perfil.id}
                    suspenso={perfil.status === "suspended"}
                    papelAtivo={papelAtivo}
                    podeLerAuditoria={papel?.podeLerAuditoria ?? false}
                    acoes={{
                      mudarStatus: mudarStatusDoPerfilAcao,
                      conceder: concederPapelAcao,
                      revogar: revogarPapelAcao,
                      leituraDeAuditoria: alterarLeituraDeAuditoriaAcao,
                    }}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Pagina>
  );
}
