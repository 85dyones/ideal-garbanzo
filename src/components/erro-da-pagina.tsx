"use client";
/**
 * Estado de erro (§9), usado pelos `error.tsx`. Não mostra detalhe interno:
 * em produção o Next já troca a mensagem do servidor por um identificador.
 */
import { BOTAO_PRINCIPAL, CARTAO } from "./estilos";

export function ErroDaPagina({ retry }: { readonly retry: () => void }) {
  return (
    <section aria-labelledby="titulo-erro" className={CARTAO} role="alert">
      <h1 id="titulo-erro" className="text-xl font-semibold">
        Não foi possível carregar esta página
      </h1>
      <p className="mt-2">
        Ocorreu um erro ao buscar os dados. Tente de novo em alguns instantes.
      </p>
      <button
        type="button"
        className={`mt-4 ${BOTAO_PRINCIPAL}`}
        onClick={() => {
          retry();
        }}
      >
        Tentar de novo
      </button>
    </section>
  );
}
