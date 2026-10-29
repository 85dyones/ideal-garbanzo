/** Filtro por status em links (funciona sem JavaScript). */
import Link from "next/link";

function primeiro(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

/** Valor do parâmetro de busca, se estiver na lista; senão, `null`. */
export function lerFiltro<T extends string>(
  valor: string | string[] | undefined,
  permitido: (texto: unknown) => texto is T,
): T | null {
  const texto = primeiro(valor);
  return permitido(texto) ? texto : null;
}

export function FiltroPorStatus({
  caminho,
  atual,
  opcoes,
  rotuloDeTodos = "Todos",
}: {
  readonly caminho: string;
  readonly atual: string | null;
  readonly opcoes: readonly (readonly [string, string])[];
  /** "Todas" quando o substantivo é feminino (ofertas). */
  readonly rotuloDeTodos?: string;
}) {
  const todas: readonly (readonly [string | null, string])[] = [
    [null, rotuloDeTodos],
    ...opcoes,
  ];
  return (
    <nav aria-label="Filtrar por status">
      <ul className="flex flex-wrap gap-2 text-sm">
        {todas.map(([valor, rotulo]) => {
          const ativo = valor === atual;
          return (
            <li key={valor ?? "todos"}>
              <Link
                href={valor === null ? caminho : `${caminho}?status=${valor}`}
                aria-current={ativo ? "page" : undefined}
                className={`inline-block rounded border px-3 py-1 ${
                  ativo
                    ? "border-blue-800 bg-blue-800 text-white"
                    : "border-gray-400 bg-white text-gray-900"
                }`}
              >
                {rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
