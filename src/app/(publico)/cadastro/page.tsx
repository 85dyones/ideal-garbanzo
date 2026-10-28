import type { Metadata } from "next";
import { cadastrarAcao } from "@/app/_acoes/autenticacao";
import { FormularioDeCadastro } from "@/modules/auth/ui/formularios";

export const metadata: Metadata = {
  title: "Criar conta",
};

export default function PaginaDeCadastro() {
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Criar conta</h1>
        <p className="text-gray-700">
          Ter conta não dá acesso ao catálogo. Depois de confirmar o e-mail,
          você envia o pedido de adesão da sua empresa, que passa pela análise
          da plataforma.
        </p>
      </div>
      <FormularioDeCadastro
        acao={cadastrarAcao}
        chaveDoTurnstile={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null}
      />
    </>
  );
}
