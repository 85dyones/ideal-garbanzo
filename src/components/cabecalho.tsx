/**
 * Cabeçalho das áreas logadas. Os links mostrados aqui não são autorização:
 * cada página confere o acesso no servidor.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { BOTAO_SECUNDARIO, LINK } from "./estilos";

export function Cabecalho({
  logado,
  equipe,
  catalogo,
  suspenso,
  acaoDeSair,
}: {
  readonly logado: boolean;
  readonly equipe: boolean;
  readonly catalogo: boolean;
  readonly suspenso: boolean;
  readonly acaoDeSair: () => Promise<void>;
}) {
  return (
    <header className="border-b border-gray-300 bg-white">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href={logado ? "/inicio" : "/"} className="font-semibold">
          EntrePátios
        </Link>
        {logado ? (
          <nav aria-label="Navegação principal">
            <ul className="flex flex-wrap items-center gap-4 text-sm">
              <li>
                <Link href="/inicio" className={LINK}>
                  Início
                </Link>
              </li>
              {catalogo ? (
                <li>
                  <Link href="/comprador" className={LINK}>
                    Catálogo
                  </Link>
                </li>
              ) : null}
              {equipe ? (
                <li>
                  <Link href="/admin" className={LINK}>
                    Administração
                  </Link>
                </li>
              ) : null}
              <li>
                <form action={acaoDeSair}>
                  <button type="submit" className={BOTAO_SECUNDARIO}>
                    Sair
                  </button>
                </form>
              </li>
            </ul>
          </nav>
        ) : null}
      </div>
      {suspenso ? (
        <p className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-950">
          Seu acesso está suspenso. Fale com a administração da plataforma.
        </p>
      ) : null}
    </header>
  );
}

export function Conteudo({ children }: { readonly children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
      {children}
    </main>
  );
}
