/** Moldura simples das páginas: título, seções e lista de dados. */
import type { ReactNode } from "react";
import { CARTAO } from "./estilos";

export function Pagina({
  titulo,
  descricao,
  children,
}: {
  readonly titulo: string;
  readonly descricao?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{titulo}</h1>
        {descricao === undefined ? null : (
          <div className="text-neutral-600">{descricao}</div>
        )}
      </header>
      {children}
    </div>
  );
}

export function Secao({
  titulo,
  children,
}: {
  readonly titulo: string;
  readonly children: ReactNode;
}) {
  return (
    <section className={`flex flex-col gap-3 ${CARTAO}`}>
      <h2 className="text-lg font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}

export function Dados({
  itens,
}: {
  readonly itens: readonly (readonly [string, ReactNode])[];
}) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 sm:grid-cols-[minmax(10rem,auto)_1fr] sm:gap-y-2">
      {itens.map(([rotulo, valor]) => (
        <div key={rotulo} className="contents">
          {/* No celular, o rótulo fica menor e colado ao valor, e o espaço separa os pares. */}
          <dt className="text-sm font-medium text-neutral-600 sm:text-base sm:text-marinho-900">
            {rotulo}
          </dt>
          <dd className="mb-3 break-words sm:mb-0">{valor}</dd>
        </div>
      ))}
    </dl>
  );
}
