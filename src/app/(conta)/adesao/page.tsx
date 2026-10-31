import type { Metadata } from "next";
import Link from "next/link";
import { enviarPedidoDeAdesaoAcao } from "@/app/_acoes/conta";
import { formatarDataHora } from "@/app/_apoio/datas";
import { AcessoSuspenso, Aviso, SemPermissao } from "@/components/estados";
import { LINK } from "@/components/estilos";
import { Dados, Pagina, Secao } from "@/components/pagina";
import { usuarioAtivo, verificarAcesso } from "@/modules/auth/queries/acesso";
import { obterPerfil } from "@/modules/auth/queries/perfis";
import { convitesDeFornecedoraDoUsuario } from "@/modules/membership/queries/convites";
import { listarMeusPedidos } from "@/modules/membership/queries/pedidos";
import {
  conviteParaEmpresaNova,
  convitesDoEmail,
} from "@/modules/membership/ui/convites";
import { FormularioDoPedido } from "@/modules/membership/ui/formulario-do-pedido";
import {
  pedidoAberto,
  rotuloDoStatusDoPedido,
} from "@/modules/membership/ui/rotulos";
import { ROTULO_DO_TIPO } from "@/modules/organizations/ui/rotulos";

export const metadata: Metadata = {
  title: "Pedido de adesão",
};

export default async function PaginaDaAdesao() {
  const acesso = await verificarAcesso("/adesao", usuarioAtivo);
  if (!acesso.liberado) {
    return acesso.motivo === "suspenso" ? <AcessoSuspenso /> : <SemPermissao />;
  }
  const { contexto, sessao } = acesso;
  const [pedidos, perfil] = await Promise.all([
    listarMeusPedidos(sessao, contexto.perfilId),
    obterPerfil(sessao, contexto.perfilId),
  ]);
  const aberto = pedidos.find((pedido) => pedidoAberto(pedido.status));
  // Só o convite do próprio e-mail confirmado libera o pedido de fornecedora;
  // a equipe da plataforma lê todos os convites pela RLS, e a consulta já
  // filtra pelo e-mail (o filtro da tela fica como defesa).
  const email = contexto.emailConfirmado ? (perfil?.email ?? null) : null;
  const convite = conviteParaEmpresaNova(
    convitesDoEmail(await convitesDeFornecedoraDoUsuario(sessao, email), email),
  );

  return (
    <Pagina
      titulo="Pedido de adesão"
      descricao="A empresa só acessa a plataforma depois que a administração conferir os dados e aceitar o pedido."
    >
      {aberto !== undefined ? (
        <Secao titulo="Pedido em andamento">
          <Dados
            itens={[
              ["Empresa", aberto.nomeDaEmpresa],
              ["CNPJ", aberto.cnpj],
              ["Tipo", ROTULO_DO_TIPO[aberto.tipo]],
              ["Status", rotuloDoStatusDoPedido(aberto.status)],
              ["Enviado em", formatarDataHora(aberto.enviadoEm)],
            ]}
          />
          <p className="text-sm text-neutral-700">
            Você tem um pedido em andamento. Um novo pedido só pode ser enviado
            depois da decisão.
          </p>
        </Secao>
      ) : !contexto.emailConfirmado ? (
        <Aviso tom="alerta">
          Confirme seu e-mail antes de enviar o pedido. Procure o link que
          enviamos no cadastro.
        </Aviso>
      ) : (
        <Secao titulo="Dados da empresa">
          {convite === undefined ? (
            <p className="text-neutral-700">
              A empresa entra como compradora. Empresas fornecedoras entram por
              convite da plataforma.
            </p>
          ) : (
            <Aviso>
              Você tem convite da plataforma para a empresa fornecer. O convite
              vale até {formatarDataHora(convite.venceEm)}. Escolha abaixo como
              a empresa vai atuar.
            </Aviso>
          )}
          <FormularioDoPedido
            acao={enviarPedidoDeAdesaoAcao}
            podeFornecer={convite !== undefined}
          />
        </Secao>
      )}
      <p>
        <Link href="/inicio" className={LINK}>
          Voltar ao início
        </Link>
      </p>
    </Pagina>
  );
}
