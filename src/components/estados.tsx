/**
 * Estados obrigatórios das telas (§9): carregamento, vazio, sem permissão,
 * registro inexistente e acesso suspenso. O erro fica em `erro-da-pagina`.
 *
 * "Sem permissão" não recebe nada da página: o conteúdo é o mesmo para
 * qualquer rota e qualquer id, exista o registro ou não (ADR-0002 §2.15).
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { CARTAO, LINK } from "./estilos";

export function SemPermissao() {
  return (
    <section aria-labelledby="titulo-sem-permissao" className={CARTAO}>
      <h1 id="titulo-sem-permissao" className="text-xl font-semibold">
        Sem permissão
      </h1>
      <p className="mt-2">
        Você não tem permissão para ver esta página. Se acha que deveria ter
        acesso, fale com o administrador da sua empresa ou com a administração
        da plataforma.
      </p>
      <p className="mt-4">
        <Link href="/inicio" className={LINK}>
          Voltar ao início
        </Link>
      </p>
    </section>
  );
}

export function RegistroInexistente({
  voltarPara,
  rotuloDaVolta,
}: {
  readonly voltarPara: string;
  readonly rotuloDaVolta: string;
}) {
  return (
    <section aria-labelledby="titulo-registro-inexistente" className={CARTAO}>
      <h1 id="titulo-registro-inexistente" className="text-xl font-semibold">
        Registro inexistente
      </h1>
      <p className="mt-2">O registro procurado não existe.</p>
      <p className="mt-4">
        <Link href={voltarPara} className={LINK}>
          {rotuloDaVolta}
        </Link>
      </p>
    </section>
  );
}

export function AcessoSuspenso() {
  return (
    <section aria-labelledby="titulo-acesso-suspenso" className={CARTAO}>
      <h1 id="titulo-acesso-suspenso" className="text-xl font-semibold">
        Acesso suspenso
      </h1>
      <p className="mt-2">
        Seu acesso está suspenso. Fale com a administração da plataforma.
      </p>
    </section>
  );
}

export function Vazio({ children }: { readonly children: ReactNode }) {
  return (
    <p className="rounded border border-dashed border-gray-400 p-4 text-gray-700">
      {children}
    </p>
  );
}

export function Carregando() {
  return (
    <div role="status" aria-live="polite" className="p-4 text-gray-700">
      Carregando…
    </div>
  );
}

export function Aviso({
  children,
  tom = "info",
}: {
  readonly children: ReactNode;
  readonly tom?: "info" | "alerta";
}) {
  const cores =
    tom === "alerta"
      ? "border-amber-600 bg-amber-50 text-amber-950"
      : "border-blue-700 bg-blue-50 text-blue-950";
  return <div className={`rounded border-l-4 p-3 ${cores}`}>{children}</div>;
}
