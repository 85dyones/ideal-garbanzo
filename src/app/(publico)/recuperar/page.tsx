import type { Metadata } from "next";
import { recuperarAcessoAcao } from "@/app/_acoes/autenticacao";
import { FormularioDeRecuperacao } from "@/modules/auth/ui/formularios";

export const metadata: Metadata = {
  title: "Recuperar acesso",
};

export default function PaginaDeRecuperacao() {
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Recuperar acesso</h1>
        <p className="text-neutral-700">
          Informe o e-mail da conta. Enviamos um link para você criar uma nova
          senha.
        </p>
      </div>
      <FormularioDeRecuperacao
        acao={recuperarAcessoAcao}
        chaveDoTurnstile={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null}
      />
    </>
  );
}
