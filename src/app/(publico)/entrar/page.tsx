import type { Metadata } from "next";
import { entrarAcao } from "@/app/_acoes/autenticacao";
import { caminhoSeguro } from "@/app/_apoio/proximo";
import { Aviso } from "@/components/estados";
import { FormularioDeEntrada } from "@/modules/auth/ui/formularios";

export const metadata: Metadata = { title: "Entrar" };

/** Avisos fixos por chave; o texto nunca vem da URL. */
const AVISOS: Readonly<Record<string, string>> = {
  "link-invalido":
    "O link é inválido ou expirou. Entre com sua senha ou peça um novo link em Recuperar acesso.",
  "cadastro-incompleto":
    "Seu e-mail foi confirmado, mas não foi possível concluir a criação da conta. Peça um link em Recuperar acesso para criar sua senha.",
};

function primeiro(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

export default async function PaginaDeEntrada({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametros = await searchParams;
  const proximo = caminhoSeguro(primeiro(parametros.proximo));
  const aviso = AVISOS[primeiro(parametros.aviso) ?? ""];
  return (
    <>
      <h1 className="text-2xl font-semibold">Entrar</h1>
      {aviso === undefined ? null : <Aviso tom="alerta">{aviso}</Aviso>}
      <FormularioDeEntrada
        acao={entrarAcao}
        proximo={proximo}
        chaveDoTurnstile={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null}
      />
    </>
  );
}
