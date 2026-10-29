/**
 * Classes do Tailwind repetidas nas telas, com as cores da marca (kit v0.3,
 * `docs/marca.md`): texto em marinho, link em marinho 600 (6,0:1 sobre
 * branco), ação em âmbar com texto marinho (7,7:1). O âmbar nunca é texto
 * sobre fundo claro.
 */
export const CAMPO =
  "w-full rounded border border-neutral-400 bg-white px-3 py-2 text-base text-marinho-900 focus:border-marinho-600 focus:outline-2 focus:outline-marinho-600 aria-[invalid=true]:border-red-700";

export const BOTAO_PRINCIPAL =
  "inline-flex items-center justify-center rounded bg-amber-500 px-4 py-2 text-base font-semibold text-marinho-900 hover:bg-amber-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marinho-900 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-600";

export const BOTAO_SECUNDARIO =
  "inline-flex items-center justify-center rounded border border-marinho-900 bg-white px-3 py-1.5 text-sm font-medium text-marinho-900 hover:bg-marinho-50 disabled:cursor-not-allowed disabled:opacity-60";

export const BOTAO_DE_RISCO =
  "inline-flex items-center justify-center rounded border border-red-700 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60";

export const LINK =
  "text-marinho-600 underline visited:text-marinho-600 hover:text-marinho-800";

export const CARTAO = "rounded border border-neutral-200 bg-white p-4";
