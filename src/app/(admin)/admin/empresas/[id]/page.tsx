import type { Metadata } from "next";
import Link from "next/link";
import {
  alterarDadosDaEmpresaAcao,
  convidarMembroAcao,
  gerirMembroAcao,
  mudarStatusDaEmpresaAcao,
  trocarPapelDoMembroAcao,
} from "@/app/_acoes/empresa";
import { formatarDataHora } from "@/app/_apoio/datas";
import { membrosParaTela } from "@/app/_apoio/membros";
import { RegistroInexistente, SemPermissao } from "@/components/estados";
import { LINK } from "@/components/estilos";
import { Dados, Pagina, Secao } from "@/components/pagina";
import { id as campoId } from "@/lib/operacao/campos";
import { verificarAcesso } from "@/modules/auth/queries/acesso";
import {
  ehAdministrador,
  ehDaEquipeDaPlataforma,
} from "@/modules/auth/rules/permissoes";
import { obterEmpresa } from "@/modules/organizations/queries/empresas";
import {
  EdicaoDaEmpresa,
  StatusDaEmpresaAdministrado,
} from "@/modules/organizations/ui/empresa";
import { GestaoDeMembros } from "@/modules/organizations/ui/membros";
import {
  ROTULO_DO_STATUS_DA_EMPRESA,
  ROTULO_DO_TIPO,
} from "@/modules/organizations/ui/rotulos";

export const metadata: Metadata = {
  title: "Empresa · Administração",
};

export default async function PaginaDaEmpresaNaAdministracao({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const acesso = await verificarAcesso(
    `/admin/empresas/${encodeURIComponent(id)}`,
    ehDaEquipeDaPlataforma,
  );
  if (!acesso.liberado) return <SemPermissao />;
  const { contexto, sessao } = acesso;
  const inexistente = (
    <RegistroInexistente
      voltarPara="/admin/empresas"
      rotuloDaVolta="Voltar às empresas"
    />
  );
  if (!campoId.safeParse(id).success) return inexistente;
  const empresa = await obterEmpresa(sessao, id);
  if (empresa === null) return inexistente;

  const administrador = ehAdministrador(contexto);
  const membros = await membrosParaTela(sessao, empresa.id);

  return (
    <Pagina titulo={empresa.nome}>
      <Secao titulo="Dados da empresa">
        <Dados
          itens={[
            ["Nome", empresa.nome],
            ["Razão social", empresa.razaoSocial],
            ["CNPJ", empresa.cnpj],
            ["Tipo", ROTULO_DO_TIPO[empresa.tipo]],
            ["Status", ROTULO_DO_STATUS_DA_EMPRESA[empresa.status]],
            ["E-mail de contato", empresa.emailDeContato ?? "—"],
            ["Telefone de contato", empresa.telefoneDeContato ?? "—"],
            ["Dados de teste", empresa.dadosDeTeste ? "Sim" : "Não"],
            ["Criada em", formatarDataHora(empresa.criadaEm)],
          ]}
        />
      </Secao>

      {administrador ? (
        <>
          <Secao titulo="Status da empresa">
            <StatusDaEmpresaAdministrado
              empresaId={empresa.id}
              status={empresa.status}
              acao={mudarStatusDaEmpresaAcao}
            />
          </Secao>
          <Secao titulo="Alterar nome e contatos">
            <EdicaoDaEmpresa
              empresaId={empresa.id}
              nome={empresa.nome}
              emailDeContato={empresa.emailDeContato}
              telefoneDeContato={empresa.telefoneDeContato}
              acao={alterarDadosDaEmpresaAcao}
            />
          </Secao>
        </>
      ) : null}

      <Secao titulo="Membros">
        <GestaoDeMembros
          empresaId={empresa.id}
          membros={membros}
          podeGerir={administrador}
          perfilAtualId={contexto.perfilId}
          acoes={{
            convidar: convidarMembroAcao,
            gerir: gerirMembroAcao,
            trocarPapel: trocarPapelDoMembroAcao,
          }}
        />
      </Secao>

      {administrador ? null : (
        <p className="text-sm text-gray-700">
          Mudanças de status, dados e membros ficam com o administrador da
          plataforma.
        </p>
      )}

      <p>
        <Link href="/admin/empresas" className={LINK}>
          Voltar às empresas
        </Link>
      </p>
    </Pagina>
  );
}
