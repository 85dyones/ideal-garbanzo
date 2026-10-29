import type { Metadata } from "next";
import Link from "next/link";
import {
  alterarDadosDaEmpresaAcao,
  convidarMembroAcao,
  gerirMembroAcao,
  trocarPapelDoMembroAcao,
} from "@/app/_acoes/empresa";
import { membrosParaTela } from "@/app/_apoio/membros";
import {
  AcessoSuspenso,
  Aviso,
  RegistroInexistente,
  SemPermissao,
} from "@/components/estados";
import { LINK } from "@/components/estilos";
import { Dados, Pagina, Secao } from "@/components/pagina";
import {
  verificarAcesso,
  vinculoAtivoCom,
} from "@/modules/auth/queries/acesso";
import { podeGerirEmpresa } from "@/modules/auth/rules/permissoes";
import { obterEmpresa } from "@/modules/organizations/queries/empresas";
import { EdicaoDaEmpresa } from "@/modules/organizations/ui/empresa";
import { GestaoDeMembros } from "@/modules/organizations/ui/membros";
import {
  ROTULO_DO_STATUS_DA_EMPRESA,
  ROTULO_DO_TIPO,
} from "@/modules/organizations/ui/rotulos";

export const metadata: Metadata = { title: "Empresa" };

/**
 * Tela da empresa para quem tem vínculo ativo com ela. Sem vínculo ativo, a
 * resposta é "Sem permissão" para qualquer id, exista a empresa ou não.
 */
export default async function PaginaDaEmpresa({
  params,
}: {
  readonly params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  const acesso = await verificarAcesso(
    `/empresa/${encodeURIComponent(empresaId)}`,
    vinculoAtivoCom(empresaId),
  );
  if (!acesso.liberado) {
    return acesso.motivo === "suspenso" ? <AcessoSuspenso /> : <SemPermissao />;
  }
  const { contexto, sessao } = acesso;
  const empresa = await obterEmpresa(sessao, empresaId);
  if (empresa === null) {
    return (
      <RegistroInexistente
        voltarPara="/inicio"
        rotuloDaVolta="Voltar ao início"
      />
    );
  }
  const ativa = empresa.status === "active";
  const podeGerir = ativa && podeGerirEmpresa(contexto, empresaId);
  const membros = ativa ? await membrosParaTela(sessao, empresaId) : [];

  return (
    <Pagina titulo={empresa.nome}>
      {ativa ? null : (
        <Aviso tom="alerta">
          Esta empresa está{" "}
          {ROTULO_DO_STATUS_DA_EMPRESA[empresa.status].toLowerCase()}. Os dados
          internos e as ações ficam bloqueados enquanto ela não for reativada
          pela administração da plataforma.
        </Aviso>
      )}
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
          ]}
        />
      </Secao>
      {ativa && empresa.tipo !== "buyer" ? (
        <nav aria-label="Áreas da empresa">
          <Link
            href={`/empresa/${encodeURIComponent(empresa.id)}/ofertas`}
            className={LINK}
          >
            Ofertas
          </Link>
        </nav>
      ) : null}
      {podeGerir ? (
        <Secao titulo="Alterar nome e contatos">
          <EdicaoDaEmpresa
            empresaId={empresa.id}
            nome={empresa.nome}
            emailDeContato={empresa.emailDeContato}
            telefoneDeContato={empresa.telefoneDeContato}
            acao={alterarDadosDaEmpresaAcao}
          />
        </Secao>
      ) : null}
      {ativa ? (
        <Secao titulo="Membros">
          <GestaoDeMembros
            empresaId={empresa.id}
            membros={membros}
            podeGerir={podeGerir}
            perfilAtualId={contexto.perfilId}
            acoes={{
              convidar: convidarMembroAcao,
              gerir: gerirMembroAcao,
              trocarPapel: trocarPapelDoMembroAcao,
            }}
          />
        </Secao>
      ) : null}
      <p>
        <Link href="/inicio" className={LINK}>
          Voltar ao início
        </Link>
      </p>
    </Pagina>
  );
}
