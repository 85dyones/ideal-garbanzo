import type { Metadata } from "next";
import Link from "next/link";
import { definirNovaSenhaAcao } from "@/app/_acoes/sessao";
import { LINK } from "@/components/estilos";
import { Aviso } from "@/components/estados";
import { criarClienteDaSessao } from "@/lib/supabase/servidor";
import { FormularioDeNovaSenha } from "@/modules/auth/ui/formularios";

export const metadata: Metadata = { title: "Nova senha" };

/**
 * Chega aqui quem confirmou o link de recuperação ou de convite: o botão de
 * `/auth/confirmar` já criou a sessão. Sem sessão, o link venceu.
 */
export default async function PaginaDeNovaSenha() {
  const sessao = await criarClienteDaSessao();
  const {
    data: { user },
  } = await sessao.auth.getUser();
  return (
    <>
      <h1 className="text-2xl font-semibold">Criar nova senha</h1>
      {user === null ? (
        <Aviso tom="alerta">
          <p>O link expirou ou já foi usado.</p>
          <p className="mt-2">
            <Link href="/recuperar" className={LINK}>
              Pedir um novo link
            </Link>
          </p>
        </Aviso>
      ) : (
        <FormularioDeNovaSenha acao={definirNovaSenhaAcao} />
      )}
    </>
  );
}
