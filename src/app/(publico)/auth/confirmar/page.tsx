import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { confirmarLinkAcao } from "@/app/_acoes/confirmacao";
import {
  lerConfirmacao,
  parametrosDaPagina,
  type PedidoDeConfirmacao,
  type TipoDeConfirmacao,
} from "@/app/_apoio/confirmacao";
import { BotaoDeEnvio } from "@/components/formulario";

export const metadata: Metadata = { title: "Confirmar" };

/** Título, explicação e botão por tipo de link; o PKCE (`code`) usa o genérico. */
const TEXTOS: Readonly<
  Record<
    TipoDeConfirmacao | "codigo",
    { titulo: string; texto: string; botao: string }
  >
> = {
  signup: {
    titulo: "Confirmar e-mail",
    texto:
      "Confirme que este e-mail é seu para ativar a conta. Em seguida, você cria sua senha.",
    botao: "Confirmar e-mail",
  },
  email: {
    titulo: "Confirmar e-mail",
    texto:
      "Confirme que este e-mail é seu para ativar a conta. Em seguida, você cria sua senha.",
    botao: "Confirmar e-mail",
  },
  invite: {
    titulo: "Aceitar convite",
    texto: "Continue para definir sua senha e entrar.",
    botao: "Continuar",
  },
  recovery: {
    titulo: "Redefinir senha",
    texto: "Continue para escolher uma nova senha.",
    botao: "Continuar",
  },
  email_change: {
    titulo: "Confirmar troca de e-mail",
    texto: "Confirme a troca do e-mail da sua conta.",
    botao: "Confirmar troca",
  },
  codigo: {
    titulo: "Confirmar acesso",
    texto: "Continue para concluir o acesso.",
    botao: "Continuar",
  },
};

function CamposDoLink({
  pedido,
}: {
  readonly pedido: Exclude<PedidoDeConfirmacao, { forma: "invalido" }>;
}) {
  return pedido.forma === "codigo" ? (
    <>
      <input type="hidden" name="code" value={pedido.codigo} />
      <input type="hidden" name="proximo" value={pedido.destino} />
    </>
  ) : (
    <>
      <input type="hidden" name="token_hash" value={pedido.tokenHash} />
      <input type="hidden" name="type" value={pedido.tipo} />
      <input type="hidden" name="proximo" value={pedido.destino} />
    </>
  );
}

/**
 * Destino dos links dos e-mails do Auth. Abrir a página não usa o token: um
 * filtro de e-mail ou a prévia de um aplicativo pode abri-la sem efeito, e só
 * o botão confirma (ADR-0002 §8, R1). Link ambíguo ou incompleto vai direto
 * para `/entrar` com o aviso fixo.
 */
export default async function PaginaDeConfirmacao({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const pedido = lerConfirmacao(parametrosDaPagina(await searchParams));
  if (pedido.forma === "invalido") redirect("/entrar?aviso=link-invalido");
  const textos = TEXTOS[pedido.forma === "codigo" ? "codigo" : pedido.tipo];
  return (
    <>
      <h1 className="text-2xl font-semibold">{textos.titulo}</h1>
      <p>{textos.texto}</p>
      <form action={confirmarLinkAcao} className="flex flex-col gap-4">
        <CamposDoLink pedido={pedido} />
        <BotaoDeEnvio>{textos.botao}</BotaoDeEnvio>
      </form>
      <p className="text-sm text-gray-700">
        Se você não pediu isto, feche esta página: nada é confirmado sem o
        clique no botão.
      </p>
    </>
  );
}
