/**
 * Destino depois do login e dos links de e-mail (parâmetro `proximo`).
 *
 * Só vale caminho relativo do próprio site: começa com `/` e não com `//`
 * nem `/\`, que o navegador leria como outro domínio. Barra invertida,
 * espaço e caracteres de controle são recusados em qualquer posição, porque
 * o navegador remove ou troca esses caracteres e pode montar um `//`. Depois
 * da normalização (que resolve `..`), o caminho é conferido de novo.
 * Qualquer recusa devolve o destino padrão, sem erro.
 */
export const DESTINO_PADRAO = "/inicio";

const TAMANHO_MAXIMO = 2048;
const BASE_DE_CONFERENCIA = "http://repasse.invalid";
const CARACTERE_PROIBIDO = /[\\\s\u0000-\u001f\u007f]/u;

function comecaComOutroDominio(caminho: string): boolean {
  return caminho.startsWith("//") || caminho.startsWith("/\\");
}

export function caminhoSeguro(
  valor: unknown,
  padrao: string = DESTINO_PADRAO,
): string {
  if (typeof valor !== "string") return padrao;
  if (valor.length === 0 || valor.length > TAMANHO_MAXIMO) return padrao;
  if (!valor.startsWith("/") || comecaComOutroDominio(valor)) return padrao;
  if (CARACTERE_PROIBIDO.test(valor)) return padrao;
  let url: URL;
  try {
    url = new URL(valor, BASE_DE_CONFERENCIA);
  } catch {
    return padrao;
  }
  if (url.origin !== BASE_DE_CONFERENCIA) return padrao;
  const normalizado = `${url.pathname}${url.search}${url.hash}`;
  // "/..//x" vira "//x" depois de resolver o "..".
  if (comecaComOutroDominio(normalizado)) return padrao;
  return normalizado;
}

/** Endereço da tela de login com o destino de volta. */
export function enderecoDoLogin(caminho: string): string {
  return `/entrar?proximo=${encodeURIComponent(caminhoSeguro(caminho))}`;
}
