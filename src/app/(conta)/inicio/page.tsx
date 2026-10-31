import type { Metadata } from "next";
import Link from "next/link";
import { responderConviteAcao } from "@/app/_acoes/conta";
import { aceitarConviteDeFornecedoraAcao } from "@/app/_acoes/convites-de-fornecedora";
import { formatarDataHora } from "@/app/_apoio/datas";
import { AcessoSuspenso, SemPermissao, Vazio } from "@/components/estados";
import { BOTAO_PRINCIPAL, LINK } from "@/components/estilos";
import { Dados, Pagina, Secao } from "@/components/pagina";
import { usuarioAtivo, verificarAcesso } from "@/modules/auth/queries/acesso";
import { obterPerfil } from "@/modules/auth/queries/perfis";
import {
  ehDaEquipeDaPlataforma,
  podeVerCatalogo,
} from "@/modules/auth/rules/permissoes";
import { ROTULO_DO_PAPEL_NA_PLATAFORMA } from "@/modules/auth/ui/rotulos";
import { convitesDeFornecedoraDoUsuario } from "@/modules/membership/queries/convites";
import { listarMeusPedidos } from "@/modules/membership/queries/pedidos";
import {
  convitesDoEmail,
  empresaDoConvite,
} from "@/modules/membership/ui/convites";
import { ConvitesParaFornecer } from "@/modules/membership/ui/convites-de-fornecedora";
import {
  pedidoAberto,
  rotuloDoStatusDoPedido,
} from "@/modules/membership/ui/rotulos";
import { listarResumosDasEmpresas } from "@/modules/organizations/queries/empresas";
import {
  RespostaAoConvite,
  SeletorDeEmpresa,
} from "@/modules/organizations/ui/convites";
import {
  ROTULO_DO_PAPEL,
  ROTULO_DO_STATUS_DA_EMPRESA,
  ROTULO_DO_TIPO,
} from "@/modules/organizations/ui/rotulos";

export const metadata: Metadata = { title: "Início" };

export default async function PaginaDeInicio() {
  const acesso = await verificarAcesso("/inicio", usuarioAtivo);
  if (!acesso.liberado) {
    return acesso.motivo === "suspenso" ? <AcessoSuspenso /> : <SemPermissao />;
  }
  const { contexto, sessao } = acesso;
  const pendentes = contexto.vinculos.filter((v) => v.status === "pending");
  const ativos = contexto.vinculos.filter((v) => v.status === "active");
  const suspensos = contexto.vinculos.filter((v) => v.status === "suspended");

  const [perfil, pedidos, empresas, convitesDeFornecedora] = await Promise.all([
    obterPerfil(sessao, contexto.perfilId),
    listarMeusPedidos(sessao, contexto.perfilId),
    listarResumosDasEmpresas(
      sessao,
      [...pendentes, ...ativos].map((v) => v.organizationId),
    ),
    convitesDeFornecedoraDoUsuario(sessao),
  ]);
  // A equipe da plataforma lê todos os convites pela RLS; aqui, só os do
  // próprio e-mail confirmado, como o banco exige para usar o convite.
  const paraFornecer = convitesDoEmail(
    convitesDeFornecedora,
    contexto.emailConfirmado ? (perfil?.email ?? null) : null,
  ).map((convite) => ({
    id: convite.id,
    empresaId: convite.empresaId,
    nomeDaEmpresa: empresaDoConvite(convite),
    venceEm: formatarDataHora(convite.venceEm),
  }));
  const nomeDa = (empresaId: string) =>
    empresas.find((empresa) => empresa.id === empresaId)?.nome ??
    "Empresa sem nome disponível";
  const minhasEmpresas = ativos
    .map((vinculo) => ({
      vinculo,
      empresa: empresas.find((e) => e.id === vinculo.organizationId),
    }))
    .filter(
      (
        item,
      ): item is typeof item & { empresa: NonNullable<typeof item.empresa> } =>
        item.empresa !== undefined,
    );
  const temPedidoAberto = pedidos.some((pedido) => pedidoAberto(pedido.status));
  const catalogo = podeVerCatalogo(contexto);

  return (
    <Pagina titulo="Início">
      <Secao titulo="Sua situação">
        <Dados
          itens={[
            ["Nome", perfil?.nome === "" ? "—" : (perfil?.nome ?? "—")],
            ["E-mail", perfil?.email ?? "—"],
            [
              "E-mail confirmado",
              contexto.emailConfirmado
                ? "Sim"
                : "Não, confira sua caixa de entrada",
            ],
            [
              "Acesso ao catálogo",
              catalogo
                ? "Sim, por empresa compradora ativa"
                : "Não. O catálogo é só para membros de empresa compradora ativa.",
            ],
            ...(contexto.papelNaPlataforma === null
              ? []
              : ([
                  [
                    "Papel na plataforma",
                    ROTULO_DO_PAPEL_NA_PLATAFORMA[contexto.papelNaPlataforma],
                  ],
                ] as const)),
          ]}
        />
        {ehDaEquipeDaPlataforma(contexto) ? (
          <p>
            <Link href="/admin" className={LINK}>
              Ir para a administração
            </Link>
          </p>
        ) : null}
      </Secao>

      <Secao titulo="Convites pendentes">
        {pendentes.length === 0 && paraFornecer.length === 0 ? (
          <Vazio>Nenhum convite pendente.</Vazio>
        ) : null}
        {pendentes.length === 0 ? null : (
          <ul className="flex flex-col gap-4">
            {pendentes.map((vinculo) => (
              <li key={vinculo.vinculoId} className="flex flex-col gap-2">
                <p>
                  <strong>{nomeDa(vinculo.organizationId)}</strong> convidou
                  você como {ROTULO_DO_PAPEL[vinculo.papel].toLowerCase()}.
                </p>
                <RespostaAoConvite
                  empresaId={vinculo.organizationId}
                  nomeDaEmpresa={nomeDa(vinculo.organizationId)}
                  acao={responderConviteAcao}
                />
              </li>
            ))}
          </ul>
        )}
        {/* Sempre na mesma posição: depois do aceite, o convite sai da lista e a mensagem fica. */}
        <ConvitesParaFornecer
          convites={paraFornecer}
          acao={aceitarConviteDeFornecedoraAcao}
        />
      </Secao>

      <Secao titulo="Suas empresas">
        {minhasEmpresas.length === 0 ? (
          <Vazio>Você ainda não participa de nenhuma empresa.</Vazio>
        ) : (
          <>
            {minhasEmpresas.length > 1 ? (
              <SeletorDeEmpresa
                empresas={minhasEmpresas.map(({ empresa }) => ({
                  id: empresa.id,
                  nome: empresa.nome,
                }))}
              />
            ) : null}
            <ul className="flex flex-col gap-2">
              {minhasEmpresas.map(({ vinculo, empresa }) => (
                <li key={vinculo.vinculoId}>
                  <Link href={`/empresa/${empresa.id}`} className={LINK}>
                    {empresa.nome}
                  </Link>{" "}
                  <span className="text-sm text-neutral-700">
                    ({ROTULO_DO_TIPO[empresa.tipo]};{" "}
                    {ROTULO_DO_PAPEL[vinculo.papel].toLowerCase()}; empresa{" "}
                    {ROTULO_DO_STATUS_DA_EMPRESA[empresa.status].toLowerCase()})
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        {suspensos.length > 0 ? (
          <p className="text-sm text-amber-900">
            Você tem {suspensos.length} vínculo
            {suspensos.length > 1 ? "s" : ""} suspenso
            {suspensos.length > 1 ? "s" : ""}. Fale com o administrador da
            empresa.
          </p>
        ) : null}
      </Secao>

      <Secao titulo="Pedidos de adesão">
        {pedidos.length === 0 ? (
          <Vazio>Você ainda não enviou pedido de adesão.</Vazio>
        ) : (
          <ul className="flex flex-col gap-3">
            {pedidos.map((pedido) => (
              <li key={pedido.id} className="flex flex-col">
                <span>
                  <strong>{pedido.nomeDaEmpresa}</strong>:{" "}
                  {rotuloDoStatusDoPedido(pedido.status)}
                </span>
                <span className="text-sm text-neutral-700">
                  Enviado em {formatarDataHora(pedido.enviadoEm)}
                  {pedido.revisadoEm === null
                    ? ""
                    : `; decidido em ${formatarDataHora(pedido.revisadoEm)}`}
                </span>
                {pedido.status === "rejected" &&
                pedido.motivoDaDecisao !== null ? (
                  <span className="text-sm">
                    Motivo: {pedido.motivoDaDecisao}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {temPedidoAberto ? null : (
          <p>
            <Link href="/adesao" className={BOTAO_PRINCIPAL}>
              Enviar pedido de adesão
            </Link>
          </p>
        )}
      </Secao>
    </Pagina>
  );
}
